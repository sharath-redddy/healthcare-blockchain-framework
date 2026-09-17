// Module 15: Final End-to-End Acceptance Test (Prompt Section 30)
// Run with: node src/tests/finalE2E.test.js
//
// Implements the exact 18-step patient-centric lifecycle scenario:
// Step 1: Patient logs in / registers (asha).
// Step 2: Patient uploads a medical document.
// Step 3: Backend validates it.
// Step 4: File is AES-256 encrypted.
// Step 5: Encrypted file is stored in IPFS/mock IPFS.
// Step 6: CID is registered on blockchain.
// Step 7: Patient grants doctor rao access.
// Step 8: Blockchain permission is updated.
// Step 9: Doctor requests the record.
// Step 10: Backend checks blockchain authorization.
// Step 11: Encrypted file is retrieved.
// Step 12: Doctor's cryptographic key unwraps the AES key.
// Step 13: Medical file is decrypted.
// Step 14: Doctor receives the file.
// Step 15: Audit event is generated.
// Step 16: Patient revokes doctor access.
// Step 17: Doctor attempts retrieval again.
// Step 18: Request is rejected.

const assert = require('assert');
const { ROLES } = require('../constants/roles');
const userService = require('../services/userService');
const recordService = require('../services/recordService');
const blockchainService = require('../services/blockchain/blockchainService');
const keyExchangeService = require('../services/crypto/keyExchangeService');
const publicKeyRegistry = require('../services/crypto/publicKeyRegistry');
const devKeyVault = require('../services/crypto/devKeyVault');
const { auditService, AUDIT_ACTIONS, AUDIT_RESULTS } = require('../services/auditService');
const recordRoutes = require('../routes/recordRoutes');
const accessRoutes = require('../routes/accessRoutes');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL - ${name}`);
    console.log(`         ${err.message}`);
    failed++;
  }
}

async function run() {
  console.log('Running Module 15: Final End-to-End Acceptance Scenario (Section 30)...\n');

  userService.clearUsers();
  recordService.clearRecords();
  auditService.clearEvents();
  publicKeyRegistry.clearRegistry();
  devKeyVault.clearVault();
  blockchainService.enableMockMode();

  let asha;
  let rao;
  let medicalFileContent = 'CONFIDENTIAL CLINICAL RECORD: Lab Panel 2026-09-17: Hemoglobin 14.2 g/dL, Glucose 92 mg/dL. Normal.';
  let uploadedRecord;

  await test('Step 1: Patient asha and Doctor rao register with linked wallets', async () => {
    asha = userService.createUser({ name: 'asha', role: ROLES.PATIENT });
    const ashaWallet = '0x1111111111111111111111111111111111111111';
    userService.updateWalletAddress(asha.id, ashaWallet);

    rao = userService.createUser({ name: 'rao', role: ROLES.DOCTOR });
    const raoWallet = '0x2222222222222222222222222222222222222222';
    userService.updateWalletAddress(rao.id, raoWallet);

    // Doctor initializes RSA keypair
    const raoKeys = keyExchangeService.generateKeyPair();
    publicKeyRegistry.setPublicKey(rao.id, raoKeys.publicKey);
    devKeyVault.storePrivateKey(rao.id, raoKeys.privateKey);

    assert.ok(asha.id);
    assert.ok(rao.id);
    assert.strictEqual(asha.role, 'PATIENT');
    assert.strictEqual(rao.role, 'DOCTOR');
  });

  await test('Steps 2-6: Patient uploads document -> validation -> AES-256 -> IPFS -> CID on blockchain', async () => {
    const fileBuffer = Buffer.from(medicalFileContent, 'utf8');

    const res = await recordRoutes.uploadRecord({
      patientId: asha.id,
      filename: 'lab-panel.txt',
      mimeType: 'text/plain',
      fileBuffer,
    });

    assert.strictEqual(res.statusCode, 201);
    uploadedRecord = res.body.record;

    assert.ok(uploadedRecord.id);
    assert.strictEqual(uploadedRecord.originalFilename, 'lab-panel.txt');
    assert.ok(uploadedRecord.cid);
    assert.ok(uploadedRecord.txHash, 'CID must be registered on blockchain with a transaction hash');

    // Confirm that the file in IPFS storage is NOT plaintext
    const encRes = await recordRoutes.getEncryptedFileForDownload(uploadedRecord.id);
    assert.strictEqual(encRes.statusCode, 200);
    assert.strictEqual(encRes.buffer.includes(fileBuffer), false, 'IPFS payload must be encrypted, not plaintext');
  });

  await test('Steps 7-8: Patient asha grants doctor rao access -> blockchain permission updated', async () => {
    const grantRes = await accessRoutes.grantAccess({
      patientId: asha.id,
      providerId: rao.id,
    });

    assert.strictEqual(grantRes.statusCode, 200);
    assert.strictEqual(grantRes.body.accessGranted, true);
    assert.ok(grantRes.body.txHash);

    // Verify blockchain permission reflects grant
    const statusRes = await accessRoutes.getAccessStatus({
      patientId: asha.id,
      providerId: rao.id,
    });
    assert.strictEqual(statusRes.statusCode, 200);
    assert.strictEqual(statusRes.body.accessGranted, true);
  });

  await test('Steps 9-15: Doctor requests record -> blockchain auth check -> IPFS fetch -> RSA unwraps AES -> decrypt -> audit logged', async () => {
    const retRes = await recordRoutes.retrieveDecryptedRecord({
      recordId: uploadedRecord.id,
      requesterId: rao.id,
    });

    assert.strictEqual(retRes.statusCode, 200);
    assert.strictEqual(retRes.isBinary, true);
    assert.strictEqual(retRes.filename, 'lab-panel.txt');
    assert.strictEqual(retRes.mimeType, 'text/plain');

    // Doctor receives exact original plaintext
    assert.strictEqual(retRes.buffer.toString('utf8'), medicalFileContent);

    // Verify audit logs
    const auditLogs = auditService.getAllEvents();
    assert.ok(
      auditLogs.some(
        (e) => e.action === AUDIT_ACTIONS.RECORD_RETRIEVED && e.actorId === rao.id && e.result === AUDIT_RESULTS.SUCCESS
      )
    );
    assert.ok(
      auditLogs.some(
        (e) => e.action === AUDIT_ACTIONS.RECORD_DECRYPTED && e.actorId === rao.id && e.result === AUDIT_RESULTS.SUCCESS
      )
    );
  });

  await test('Steps 16-18: Patient asha revokes doctor rao access -> Doctor attempts retrieval again -> Rejected', async () => {
    const revokeRes = await accessRoutes.revokeAccess({
      patientId: asha.id,
      providerId: rao.id,
    });
    assert.strictEqual(revokeRes.statusCode, 200);
    assert.strictEqual(revokeRes.body.accessGranted, false);

    // Doctor rao attempts retrieval again
    const deniedRes = await recordRoutes.retrieveDecryptedRecord({
      recordId: uploadedRecord.id,
      requesterId: rao.id,
    });

    // Must be rejected with 403 Forbidden
    assert.strictEqual(deniedRes.statusCode, 403);
    assert.ok(deniedRes.body.error.includes('Access denied'));

    // Verify ACCESS_DENIED audit log
    const deniedEvent = auditService
      .getAllEvents()
      .find((e) => e.action === AUDIT_ACTIONS.ACCESS_DENIED && e.actorId === rao.id);
    assert.ok(deniedEvent, 'Access denied event must be recorded in the audit trail');
    assert.strictEqual(deniedEvent.result, AUDIT_RESULTS.DENIED);
  });

  blockchainService.disableMockMode();

  console.log(`\nEnd-to-End Acceptance: ${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

run();
