// Module 4 / Module 6: Medical Record metadata
//
// Represents metadata about an uploaded, encrypted medical file. The
// plaintext file itself is never held by this model — only a reference
// (CID) to the encrypted blob in IPFS/mock storage, plus the wrapped
// per-file AES key needed to decrypt it later. wrappedFileKey is kept
// server-side only; toPublicMetadata() deliberately excludes it so it
// can never leak via the API.

const { randomUUID } = require('crypto');

class MedicalRecord {
  constructor({
    patientId,
    originalFilename,
    mimeType,
    sizeBytes,
    cid,
    ipfsMode, // 'pinata' | 'mock'
    wrappedFileKey,
  }) {
    if (!patientId) throw new Error('MedicalRecord requires a patientId.');
    if (!cid) throw new Error('MedicalRecord requires a cid.');
    if (!wrappedFileKey) throw new Error('MedicalRecord requires a wrappedFileKey.');

    this.id = randomUUID();
    this.patientId = patientId;
    this.originalFilename = originalFilename;
    this.mimeType = mimeType;
    this.sizeBytes = sizeBytes;
    this.cid = cid;
    this.ipfsMode = ipfsMode;
    this.wrappedFileKey = wrappedFileKey; // NEVER exposed via toPublicMetadata()
    this.txHash = arguments[0].txHash || null;
    this.onChainRecordId = arguments[0].onChainRecordId || null;
    this.uploadedAt = new Date().toISOString();
  }

  // Metadata safe to return via the API — excludes wrappedFileKey.
  toPublicMetadata() {
    return {
      id: this.id,
      patientId: this.patientId,
      originalFilename: this.originalFilename,
      mimeType: this.mimeType,
      sizeBytes: this.sizeBytes,
      cid: this.cid,
      isMockIpfs: this.ipfsMode === 'mock',
      txHash: this.txHash,
      onChainRecordId: this.onChainRecordId,
      uploadedAt: this.uploadedAt,
    };
  }
}

module.exports = MedicalRecord;
