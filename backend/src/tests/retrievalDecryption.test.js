// Module 12: Record Retrieval and Decryption — integration tests
// Run with: node src/tests/retrievalDecryption.test.js

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
  console.log('Running Module 12 retrieval and decryption tests...\n');

  userService.clearUsers();
  recordService.clearRecords();
  auditService.clearEvents();
  publicKeyRegistry.clearRegistry();
  devKeyVault.clearVault();
  blockchainService.disableMockMode();

  const patient = userService.createUser({ name: 'Asha', role: ROLES.PATIENT });
  const pWallet = '0x1111111111111111111111111111111111111111';
  userService.updateWalletAddress(patient.id, pWallet);

  const doctor = userService.createUser({ name: 'Dr. Rao', role: ROLES.DOCTOR });
  const dWallet = '0x2222222222222222222222222222222222222222';
  userService.updateWalletAddress(doctor.id, dWallet);

  const otherDoctor = userService.createUser({ name: 'Dr. Stranger', role: ROLES.DOCTOR });
  const sWallet = '0x3333333333333333333333333333333333333333';
  userService.updateWalletAddress(otherDoctor.id, sWallet);

  const originalContent = 'CONFIDENTIAL CLINICAL NOTES: Patient exhibits normal recovery. 100% stable.';
  const fileBuffer = Buffer.from(originalContent, 'utf8');

  const uploadRes = await recordRoutes.uploadRecord({
    patientId: patient.id,
    filename: 'clinical-notes.txt',
    mimeType: 'text/plain',
    fileBuffer,
  });
  assert.strictEqual(uploadRes.statusCode, 201);
  const recordId = uploadRes.body.record.id;

  await test('patient can retrieve and decrypt their own record (byte-identical)', async () => {
    const res = await recordRoutes.retrieveDecryptedRecord({ recordId, requesterId: patient.id });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.isBinary, true);
    assert.strictEqual(res.filename, 'clinical-notes.txt');
    assert.strictEqual(res.mimeType, 'text/plain');
    assert.strictEqual(res.buffer.toString('utf8'), originalContent);
  });

  await test('doctor without blockchain permission is rejected (403)', async () => {
    blockchainService.enableMockMode();
    blockchainService.setMockAccess(pWallet, dWallet, false);

    const res = await recordRoutes.retrieveDecryptedRecord({ recordId, requesterId: doctor.id });
    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.body.error.includes('Access denied'));

    // Verify ACCESS_DENIED audit log
    const deniedEvents = auditService.getEventsForPatient(patient.id).filter(
      (e) => e.action === AUDIT_ACTIONS.ACCESS_DENIED
    );
    assert.ok(deniedEvents.length > 0);
  });

  await test('authorized doctor can retrieve and decrypt via RSA-OAEP key exchange', async () => {
    // Generate RSA key pair for doctor
    const docKeys = keyExchangeService.generateKeyPair();
    publicKeyRegistry.setPublicKey(doctor.id, docKeys.publicKey);
    devKeyVault.storePrivateKey(doctor.id, docKeys.privateKey);

    // Grant access on blockchain
    blockchainService.setMockAccess(pWallet, dWallet, true);

    const res = await recordRoutes.retrieveDecryptedRecord({ recordId, requesterId: doctor.id });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.isBinary, true);
    assert.strictEqual(res.filename, 'clinical-notes.txt');
    assert.strictEqual(res.buffer.toString('utf8'), originalContent);

    // Verify audit logs
    const events = auditService.getAllEvents();
    assert.ok(events.some((e) => e.action === AUDIT_ACTIONS.RECORD_RETRIEVED && e.result === AUDIT_RESULTS.SUCCESS));
    assert.ok(events.some((e) => e.action === AUDIT_ACTIONS.RECORD_DECRYPTED && e.result === AUDIT_RESULTS.SUCCESS));
  });

  await test('revoked doctor cannot retrieve or decrypt (403)', async () => {
    // Revoke access
    blockchainService.setMockAccess(pWallet, dWallet, false);

    const res = await recordRoutes.retrieveDecryptedRecord({ recordId, requesterId: doctor.id });
    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.body.error.includes('Access denied'));
  });

  await test('unrelated third party is rejected (403)', async () => {
    const res = await recordRoutes.retrieveDecryptedRecord({ recordId, requesterId: otherDoctor.id });
    assert.strictEqual(res.statusCode, 403);
  });

  await test('nonexistent record returns 404', async () => {
    const res = await recordRoutes.retrieveDecryptedRecord({
      recordId: 'nonexistent-record-uuid',
      requesterId: patient.id,
    });
    assert.strictEqual(res.statusCode, 404);
  });

  blockchainService.disableMockMode();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

run();
