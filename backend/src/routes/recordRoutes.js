// Module 4 / 5 / 6 / 12: Medical Record Upload + AES-256 Encryption + IPFS + Retrieval/Decryption
//
// Full pipeline:
// Upload:   validate -> AES-256 encrypt -> upload to IPFS -> register on-chain -> store metadata -> audit
// Retrieval: check identity/role -> blockchain hasAccess() check -> retrieve from IPFS -> RSA-OAEP unwrap AES key -> AES decrypt -> stream binary

const { ALLOWED_MIME_TYPES, MAX_UPLOAD_SIZE_BYTES } = require('../constants/fileValidation');
const { ROLES } = require('../constants/roles');
const userService = require('../services/userService');
const recordService = require('../services/recordService');
const aesService = require('../services/crypto/aesService');
const ipfsService = require('../services/ipfs/ipfsService');
const blockchainService = require('../services/blockchain/blockchainService');
const keyExchangeService = require('../services/crypto/keyExchangeService');
const publicKeyRegistry = require('../services/crypto/publicKeyRegistry');
const devKeyVault = require('../services/crypto/devKeyVault');
const { auditService, AUDIT_ACTIONS, AUDIT_RESULTS } = require('../services/auditService');

function validateUploadInput({ patientId, filename, mimeType, fileBuffer }) {
  if (!patientId) return 'patientId is required.';

  const patient = userService.getUserById(patientId);
  if (!patient) return `No user found with id "${patientId}".`;
  if (patient.role !== ROLES.PATIENT) {
    return `User "${patientId}" is not a PATIENT — only patients can upload their own records.`;
  }

  if (!filename) return 'A file with a filename is required.';
  if (!fileBuffer || fileBuffer.length === 0) return 'Uploaded file is empty.';

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return `Unsupported file type "${mimeType}". Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`;
  }

  if (fileBuffer.length > MAX_UPLOAD_SIZE_BYTES) {
    return `File too large (${fileBuffer.length} bytes). Max allowed: ${MAX_UPLOAD_SIZE_BYTES} bytes.`;
  }

  return null;
}

async function uploadRecord({ patientId, filename, mimeType, fileBuffer }) {
  const validationError = validateUploadInput({ patientId, filename, mimeType, fileBuffer });
  if (validationError) {
    return { statusCode: 400, body: { error: validationError } };
  }

  const patient = userService.getUserById(patientId);

  // ---- Module 5: AES-256 encryption happens here ----
  const { encryptedPayload, wrappedFileKey } = aesService.encryptMedicalFile(fileBuffer);

  // ---- Module 6: only encrypted payload sent to IPFS ----
  const { cid, mode } = await ipfsService.uploadEncryptedFile(encryptedPayload, filename);

  // Optional on-chain record registration
  let txHash = null;
  let onChainRecordId = null;
  if (patient.walletAddress) {
    try {
      const reg = await blockchainService.addRecordOnChain(cid, patient.walletAddress);
      if (reg && reg.txHash) {
        txHash = reg.txHash;
        onChainRecordId = reg.recordId || null;
      }
    } catch {
      // Graceful fallback if blockchain is unconfigured
    }
  }

  const record = recordService.createRecord({
    patientId,
    originalFilename: filename,
    mimeType,
    sizeBytes: fileBuffer.length,
    cid,
    ipfsMode: mode,
    wrappedFileKey,
    txHash,
    onChainRecordId,
  });

  auditService.logEvent({
    action: AUDIT_ACTIONS.RECORD_CREATED,
    actorId: patient.id,
    actorName: patient.name,
    actorRole: patient.role,
    patientId: patient.id,
    recordId: record.id,
    result: AUDIT_RESULTS.SUCCESS,
    details: `Medical record created (${record.originalFilename}, ${record.mimeType})`,
  });

  auditService.logEvent({
    action: AUDIT_ACTIONS.RECORD_UPLOADED,
    actorId: patient.id,
    actorName: patient.name,
    actorRole: patient.role,
    patientId: patient.id,
    recordId: record.id,
    result: AUDIT_RESULTS.SUCCESS,
    txHash,
    details: `Encrypted payload stored in ${mode} IPFS (CID: ${cid})`,
  });

  if (txHash) {
    auditService.logEvent({
      action: AUDIT_ACTIONS.RECORD_REGISTERED,
      actorId: patient.id,
      actorName: patient.name,
      actorRole: patient.role,
      patientId: patient.id,
      recordId: record.id,
      result: AUDIT_RESULTS.SUCCESS,
      txHash,
      details: `Record registered on Layer-2 blockchain (tx: ${txHash})`,
    });
  }

  return { statusCode: 201, body: { record: record.toPublicMetadata() } };
}

function listRecordsByPatient(patientId) {
  if (!patientId) {
    return { statusCode: 400, body: { error: 'patientId query parameter is required.' } };
  }
  const patient = userService.getUserById(patientId);
  if (!patient) {
    return { statusCode: 404, body: { error: `No user found with id "${patientId}".` } };
  }

  const records = recordService.listRecordsByPatient(patientId).map((r) => r.toPublicMetadata());
  return { statusCode: 200, body: { records } };
}

async function getEncryptedFileForDownload(recordId) {
  const record = recordService.getRecordById(recordId);
  if (!record) {
    return { statusCode: 404, body: { error: `No record found with id "${recordId}".` } };
  }

  const encryptedBuffer = await ipfsService.retrieveEncryptedFile(record.cid, record.ipfsMode);
  return {
    statusCode: 200,
    isBinary: true,
    filename: `${record.originalFilename}.enc`,
    buffer: encryptedBuffer,
  };
}

/**
 * Module 12: Authorized record retrieval and decryption.
 * - Enforces identity and role verification
 * - Enforces blockchain hasAccess() authorization for providers
 * - Retrieves encrypted file from IPFS
 * - Performs RSA-OAEP key unwrapping for providers
 * - Decrypts file using recovered AES-256 key
 * - Returns original plaintext bytes with appropriate MIME type
 * - Logs audit trail events
 */
async function retrieveDecryptedRecord({ recordId, requesterId }) {
  if (!recordId) {
    return { statusCode: 400, body: { error: 'recordId is required.' } };
  }
  if (!requesterId) {
    return { statusCode: 400, body: { error: 'requesterId query parameter or field is required.' } };
  }

  const record = recordService.getRecordById(recordId);
  if (!record) {
    return { statusCode: 404, body: { error: `No record found with id "${recordId}".` } };
  }

  const requester = userService.getUserById(requesterId);
  if (!requester) {
    return { statusCode: 404, body: { error: `No user found with id "${requesterId}".` } };
  }

  const patient = userService.getUserById(record.patientId);

  // Authorization check
  const isOwnerPatient = requester.id === record.patientId && requester.role === ROLES.PATIENT;
  const isProvider = requester.role === ROLES.DOCTOR || requester.role === ROLES.HOSPITAL_ADMIN;

  if (!isOwnerPatient && !isProvider) {
    auditService.logEvent({
      action: AUDIT_ACTIONS.ACCESS_DENIED,
      actorId: requester.id,
      actorName: requester.name,
      actorRole: requester.role,
      patientId: record.patientId,
      recordId: record.id,
      result: AUDIT_RESULTS.DENIED,
      details: `Denied: User ${requester.name} is not authorized to access record ${record.id}`,
    });
    return {
      statusCode: 403,
      body: { error: 'Access denied: caller is not authorized to access this record.' },
    };
  }

  if (isProvider) {
    if (!patient || !patient.walletAddress || !requester.walletAddress) {
      auditService.logEvent({
        action: AUDIT_ACTIONS.ACCESS_DENIED,
        actorId: requester.id,
        actorName: requester.name,
        actorRole: requester.role,
        patientId: record.patientId,
        recordId: record.id,
        result: AUDIT_RESULTS.DENIED,
        details: 'Denied: Wallets not linked for on-chain permission verification',
      });
      return {
        statusCode: 403,
        body: { error: 'Access denied: Both patient and provider must have linked wallets for on-chain authorization.' },
      };
    }

    try {
      const hasAccess = await blockchainService.hasAccessOnChain(patient.walletAddress, requester.walletAddress);
      if (!hasAccess) {
        auditService.logEvent({
          action: AUDIT_ACTIONS.ACCESS_DENIED,
          actorId: requester.id,
          actorName: requester.name,
          actorRole: requester.role,
          patientId: record.patientId,
          recordId: record.id,
          result: AUDIT_RESULTS.DENIED,
          details: `Denied: On-chain access permission not granted for ${requester.role} ${requester.name}`,
        });
        return {
          statusCode: 403,
          body: { error: 'Access denied: On-chain authorization check failed.' },
        };
      }
    } catch (err) {
      return {
        statusCode: 503,
        body: { error: `Access verification failed: ${err.message}` },
      };
    }
  }

  // Retrieve encrypted payload from IPFS
  const encryptedBuffer = await ipfsService.retrieveEncryptedFile(record.cid, record.ipfsMode);

  // Decryption & RSA-OAEP Key Unwrapping
  let decryptedBytes;
  try {
    if (isOwnerPatient) {
      decryptedBytes = aesService.decryptMedicalFile(encryptedBuffer, record.wrappedFileKey);
    } else {
      const rawFileKey = aesService.unwrapFileKey(record.wrappedFileKey);

      let providerPublicKey = publicKeyRegistry.getPublicKey(requester.id);
      let providerPrivateKey = devKeyVault.getPrivateKey(requester.id);

      if (!providerPublicKey || !providerPrivateKey) {
        const keyPair = keyExchangeService.generateKeyPair();
        publicKeyRegistry.setPublicKey(requester.id, keyPair.publicKey);
        devKeyVault.storePrivateKey(requester.id, keyPair.privateKey);
        providerPublicKey = keyPair.publicKey;
        providerPrivateKey = keyPair.privateKey;
      }

      const wrappedForProvider = keyExchangeService.wrapAesKey(rawFileKey, providerPublicKey);
      const recoveredFileKey = keyExchangeService.unwrapAesKey(wrappedForProvider, providerPrivateKey);

      const iv = encryptedBuffer.subarray(0, 12);
      const authTag = encryptedBuffer.subarray(12, 28);
      const ciphertext = encryptedBuffer.subarray(28);
      decryptedBytes = aesService.decryptBuffer({ iv, authTag, ciphertext }, recoveredFileKey);
    }
  } catch (decryptionErr) {
    auditService.logEvent({
      action: AUDIT_ACTIONS.RECORD_RETRIEVED,
      actorId: requester.id,
      actorName: requester.name,
      actorRole: requester.role,
      patientId: record.patientId,
      recordId: record.id,
      result: AUDIT_RESULTS.FAILED,
      details: `Decryption error: ${decryptionErr.message}`,
    });
    return {
      statusCode: 500,
      body: { error: `Failed to decrypt medical record: ${decryptionErr.message}` },
    };
  }

  auditService.logEvent({
    action: AUDIT_ACTIONS.RECORD_RETRIEVED,
    actorId: requester.id,
    actorName: requester.name,
    actorRole: requester.role,
    patientId: record.patientId,
    recordId: record.id,
    result: AUDIT_RESULTS.SUCCESS,
    details: `Encrypted file retrieved from ${record.ipfsMode} IPFS (CID: ${record.cid})`,
  });

  auditService.logEvent({
    action: AUDIT_ACTIONS.RECORD_DECRYPTED,
    actorId: requester.id,
    actorName: requester.name,
    actorRole: requester.role,
    patientId: record.patientId,
    recordId: record.id,
    result: AUDIT_RESULTS.SUCCESS,
    details: `Medical record decrypted (${record.originalFilename})`,
  });

  return {
    statusCode: 200,
    isBinary: true,
    mimeType: record.mimeType,
    filename: record.originalFilename,
    buffer: decryptedBytes,
  };
}

module.exports = {
  uploadRecord,
  listRecordsByPatient,
  getEncryptedFileForDownload,
  retrieveDecryptedRecord,
};
