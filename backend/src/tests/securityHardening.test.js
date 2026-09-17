// Module 14: Security Hardening — security & integrity tests
// Run with: node src/tests/securityHardening.test.js

const assert = require('assert');
const { ROLES } = require('../constants/roles');
const userService = require('../services/userService');
const recordService = require('../services/recordService');
const ipfsService = require('../services/ipfs/ipfsService');
const aesService = require('../services/crypto/aesService');
const keyExchangeService = require('../services/crypto/keyExchangeService');
const recordRoutes = require('../routes/recordRoutes');
const { createServer } = require('../server');

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
  console.log('Running Module 14 security hardening tests...\n');

  userService.clearUsers();
  recordService.clearRecords();

  await test('path traversal attempt in IPFS CID retrieval is blocked', async () => {
    assert.rejects(async () => {
      await ipfsService.retrieveEncryptedFile('../../package.json', 'mock');
    }, /Invalid or unsafe CID format/);

    assert.rejects(async () => {
      await ipfsService.retrieveEncryptedFile('..\\..\\server.js', 'mock');
    }, /Invalid or unsafe CID format/);
  });

  await test('AES-GCM rejects tampered ciphertext during medical decryption', () => {
    const plain = Buffer.from('Sensitive Health Information');
    const { encryptedPayload, wrappedFileKey } = aesService.encryptMedicalFile(plain);

    // Tamper with one byte in the ciphertext portion
    const tampered = Buffer.from(encryptedPayload);
    tampered[tampered.length - 1] ^= 0x55;

    assert.throws(() => {
      aesService.decryptMedicalFile(tampered, wrappedFileKey);
    });
  });

  await test('RSA-OAEP rejects tampered wrapped AES keys', () => {
    const keys = keyExchangeService.generateKeyPair();
    const fileKey = aesService.generateFileKey();
    const wrapped = keyExchangeService.wrapAesKey(fileKey, keys.publicKey);

    const tamperedBuf = Buffer.from(wrapped, 'base64');
    tamperedBuf[10] ^= 0xff;
    const tamperedBase64 = tamperedBuf.toString('base64');

    assert.throws(() => {
      keyExchangeService.unwrapAesKey(tamperedBase64, keys.privateKey);
    });
  });

  await test('IDOR: user cannot retrieve records of another patient without provider authorization', async () => {
    const patientA = userService.createUser({ name: 'Alice', role: ROLES.PATIENT });
    const patientB = userService.createUser({ name: 'Bob', role: ROLES.PATIENT });

    const uploadRes = await recordRoutes.uploadRecord({
      patientId: patientA.id,
      filename: 'alice-mri.pdf',
      mimeType: 'application/pdf',
      fileBuffer: Buffer.from('MRI results', 'utf8'),
    });
    const recordId = uploadRes.body.record.id;

    // Bob attempts to retrieve Alice's record
    const res = await recordRoutes.retrieveDecryptedRecord({
      recordId,
      requesterId: patientB.id,
    });
    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.body.error.includes('Access denied'));
  });

  await test('role enforcement: non-patients cannot upload records', async () => {
    const doctor = userService.createUser({ name: 'Dr. Smith', role: ROLES.DOCTOR });
    const res = await recordRoutes.uploadRecord({
      patientId: doctor.id,
      filename: 'doc-file.pdf',
      mimeType: 'application/pdf',
      fileBuffer: Buffer.from('file data', 'utf8'),
    });
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error.includes('not a PATIENT'));
  });

  await test('HTTP response headers include security headers', async () => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/roles`);
      assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
      assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

run();
