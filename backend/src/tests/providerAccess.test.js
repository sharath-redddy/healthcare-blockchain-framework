// Module 11: Provider Access — unit & integration tests
// Run with: node src/tests/providerAccess.test.js

const assert = require('assert');
const { ROLES } = require('../constants/roles');
const userService = require('../services/userService');
const recordService = require('../services/recordService');
const blockchainService = require('../services/blockchain/blockchainService');
const { auditService } = require('../services/auditService');
const providerRoutes = require('../routes/providerRoutes');

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
  console.log('Running Module 11 provider access tests...\n');

  userService.clearUsers();
  recordService.clearRecords();
  auditService.clearEvents();
  blockchainService.disableMockMode();

  await test('GET accessible records without providerId returns 400', async () => {
    const res = await providerRoutes.getAccessibleRecords({});
    assert.strictEqual(res.statusCode, 400);
  });

  await test('GET accessible records with nonexistent providerId returns 404', async () => {
    const res = await providerRoutes.getAccessibleRecords({ providerId: 'nonexistent-id' });
    assert.strictEqual(res.statusCode, 404);
  });

  await test('GET accessible records as a PATIENT returns 403 (only DOCTOR/HOSPITAL_ADMIN)', async () => {
    const patient = userService.createUser({ name: 'Asha Patient', role: ROLES.PATIENT });
    const res = await providerRoutes.getAccessibleRecords({ providerId: patient.id });
    assert.strictEqual(res.statusCode, 403);
  });

  await test('GET accessible records for provider without linked wallet returns empty list with notice', async () => {
    const doctor = userService.createUser({ name: 'Dr. Rao', role: ROLES.DOCTOR });
    const res = await providerRoutes.getAccessibleRecords({ providerId: doctor.id });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.records, []);
    assert.ok(res.body.message.includes('No wallet linked'));
  });

  await test('GET accessible records attempts blockchain when wallet linked (503 if unconfigured)', async () => {
    const doctor = userService.createUser({ name: 'Dr. Rao 2', role: ROLES.DOCTOR });
    userService.updateWalletAddress(doctor.id, '0x2222222222222222222222222222222222222222');
    const patient = userService.createUser({ name: 'Patient 2', role: ROLES.PATIENT });
    userService.updateWalletAddress(patient.id, '0x1111111111111111111111111111111111111111');

    const res = await providerRoutes.getAccessibleRecords({ providerId: doctor.id });
    assert.strictEqual(res.statusCode, 503);
  });

  await test('in mock blockchain mode, returns records only when permission is granted', async () => {
    blockchainService.enableMockMode();

    const patient = userService.createUser({ name: 'Patient 3', role: ROLES.PATIENT });
    const pWallet = '0x3333333333333333333333333333333333333333';
    userService.updateWalletAddress(patient.id, pWallet);

    const doctor = userService.createUser({ name: 'Dr. Rao 3', role: ROLES.DOCTOR });
    const dWallet = '0x4444444444444444444444444444444444444444';
    userService.updateWalletAddress(doctor.id, dWallet);

    const rec = recordService.createRecord({
      patientId: patient.id,
      originalFilename: 'blood-test.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      cid: 'mock-cid-blood-test',
      ipfsMode: 'mock',
      wrappedFileKey: 'dummy-key',
    });

    // Not yet granted
    let res = await providerRoutes.getAccessibleRecords({ providerId: doctor.id });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.records.length, 0);

    // Grant access
    blockchainService.setMockAccess(pWallet, dWallet, true);

    res = await providerRoutes.getAccessibleRecords({ providerId: doctor.id });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.records.length, 1);
    assert.strictEqual(res.body.records[0].id, rec.id);
    assert.strictEqual(res.body.records[0].originalFilename, 'blood-test.pdf');
    assert.strictEqual(res.body.records[0].patientName, 'Patient 3');

    // Revoke access
    blockchainService.setMockAccess(pWallet, dWallet, false);
    res = await providerRoutes.getAccessibleRecords({ providerId: doctor.id });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.records.length, 0);

    blockchainService.disableMockMode();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

run();
