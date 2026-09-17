// Module 13: Audit Trail — unit & route tests
// Run with: node src/tests/auditTrail.test.js

const assert = require('assert');
const { ROLES } = require('../constants/roles');
const userService = require('../services/userService');
const recordService = require('../services/recordService');
const blockchainService = require('../services/blockchain/blockchainService');
const { auditService, AUDIT_ACTIONS, AUDIT_RESULTS } = require('../services/auditService');
const auditRoutes = require('../routes/auditRoutes');
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
  console.log('Running Module 13 audit trail tests...\n');

  userService.clearUsers();
  recordService.clearRecords();
  auditService.clearEvents();
  blockchainService.enableMockMode();

  const patient = userService.createUser({ name: 'Asha Audit', role: ROLES.PATIENT });
  const pWallet = '0x1111111111111111111111111111111111111111';
  userService.updateWalletAddress(patient.id, pWallet);

  const doctor = userService.createUser({ name: 'Dr. Rao Audit', role: ROLES.DOCTOR });
  const dWallet = '0x2222222222222222222222222222222222222222';
  userService.updateWalletAddress(doctor.id, dWallet);

  const admin = userService.createUser({ name: 'Hospital SuperAdmin', role: ROLES.HOSPITAL_ADMIN });

  await test('uploading a record generates RECORD_CREATED and RECORD_UPLOADED events', async () => {
    const uploadRes = await recordRoutes.uploadRecord({
      patientId: patient.id,
      filename: 'audit-test.txt',
      mimeType: 'text/plain',
      fileBuffer: Buffer.from('audit secret content', 'utf8'),
    });
    assert.strictEqual(uploadRes.statusCode, 201);

    const events = auditService.getEventsForPatient(patient.id);
    assert.ok(events.some((e) => e.action === AUDIT_ACTIONS.RECORD_CREATED));
    assert.ok(events.some((e) => e.action === AUDIT_ACTIONS.RECORD_UPLOADED));
  });

  await test('granting and revoking access generates ACCESS_GRANTED and ACCESS_REVOKED events', async () => {
    await accessRoutes.grantAccess({ patientId: patient.id, providerId: doctor.id });
    await accessRoutes.revokeAccess({ patientId: patient.id, providerId: doctor.id });

    const events = auditService.getEventsForPatient(patient.id);
    assert.ok(events.some((e) => e.action === AUDIT_ACTIONS.ACCESS_GRANTED));
    assert.ok(events.some((e) => e.action === AUDIT_ACTIONS.ACCESS_REVOKED));
  });

  await test('audit logs NEVER contain the plaintext file contents or private keys', () => {
    const all = auditService.getAllEvents();
    const serialized = JSON.stringify(all);
    assert.strictEqual(serialized.includes('audit secret content'), false);
    assert.strictEqual(serialized.includes('PRIVATE KEY'), false);
    assert.strictEqual(serialized.includes('BEGIN RSA'), false);
  });

  await test('patient audit route returns only events concerning that patient', () => {
    const res = auditRoutes.getAuditLogs({ patientId: patient.id });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.events));
    assert.ok(res.body.events.every((e) => e.patientId === patient.id || e.actorId === patient.id));
  });

  await test('admin audit route returns all system events', () => {
    const res = auditRoutes.getAuditLogs({ adminId: admin.id });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.events.length, auditService.getAllEvents().length);
  });

  await test('calling admin audit route with a non-admin role returns 403', () => {
    const res = auditRoutes.getAuditLogs({ adminId: patient.id });
    assert.strictEqual(res.statusCode, 403);
  });

  blockchainService.disableMockMode();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

run();
