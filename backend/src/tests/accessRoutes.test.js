// Module 9: Patient-Centric Grant/Revoke Access — integration tests
// Run with: node src/tests/accessRoutes.test.js
//
// Runs against the real HTTP server. All validation logic (patient
// exists, provider exists + has a healthcare role, wallet address
// format) is fully exercised here since it never touches the chain.
// The final on-chain step correctly returns 503 in this sandbox
// (blockchain not configured) rather than a fake success — that is the
// CORRECT behavior being verified, not a limitation being worked around.

const assert = require('assert');
const { createServer } = require('../server');
const userService = require('../services/userService');

const PORT = 4996;
const BASE_URL = `http://localhost:${PORT}`;

async function main() {
  userService.clearUsers();
  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, resolve));

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

  console.log('Running Module 9 access grant/revoke/status tests...\n');

  async function registerUser(name, role) {
    const res = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role }),
    });
    const body = await res.json();
    return body.user;
  }

  const patient = await registerUser('Asha Rao', 'PATIENT');
  const doctor = await registerUser('Dr. Iyer', 'DOCTOR');
  const hospital = await registerUser('City Hospital', 'HOSPITAL_ADMIN');
  const otherPatient = await registerUser('Other Patient', 'PATIENT');

  const PATIENT_WALLET = '0x' + '1'.repeat(40);
  const DOCTOR_WALLET = '0x' + '2'.repeat(40);

  await test('grant fails cleanly before any wallets are linked (400, clear message)', async () => {
    const res = await fetch(`${BASE_URL}/api/access/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: patient.id, providerId: doctor.id }),
    });
    const body = await res.json();
    assert.strictEqual(res.status, 400);
    assert.ok(/no valid linked wallet/i.test(body.error));
  });

  await test('linking a malformed wallet address is rejected (400)', async () => {
    const res = await fetch(`${BASE_URL}/api/users/${patient.id}/wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: 'not-a-real-address' }),
    });
    assert.strictEqual(res.status, 400);
  });

  await test('linking a well-formed wallet address succeeds (200)', async () => {
    const res = await fetch(`${BASE_URL}/api/users/${patient.id}/wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: PATIENT_WALLET }),
    });
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.user.walletAddress, PATIENT_WALLET);

    const res2 = await fetch(`${BASE_URL}/api/users/${doctor.id}/wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: DOCTOR_WALLET }),
    });
    assert.strictEqual(res2.status, 200);
  });

  await test('linking a wallet to a nonexistent user returns 404', async () => {
    const res = await fetch(`${BASE_URL}/api/users/not-a-real-user/wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: '0x' + '9'.repeat(40) }),
    });
    assert.strictEqual(res.status, 404);
  });

  await test('grant rejects a provider that is actually another PATIENT (not doctor/hospital)', async () => {
    const res = await fetch(`${BASE_URL}/api/access/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: patient.id, providerId: otherPatient.id }),
    });
    const body = await res.json();
    assert.strictEqual(res.status, 400);
    assert.ok(/not a DOCTOR or HOSPITAL_ADMIN/i.test(body.error));
  });

  await test('grant rejects a nonexistent patientId', async () => {
    const res = await fetch(`${BASE_URL}/api/access/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: 'not-real', providerId: doctor.id }),
    });
    assert.strictEqual(res.status, 400);
  });

  await test('with both wallets linked, grant correctly returns 503 (blockchain not configured) — not a fake success', async () => {
    const res = await fetch(`${BASE_URL}/api/access/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: patient.id, providerId: doctor.id }),
    });
    const body = await res.json();
    assert.strictEqual(res.status, 503);
    assert.ok(/not configured|ethers/i.test(body.error));
  });

  await test('with both wallets linked, revoke also correctly returns 503, not a fake success', async () => {
    const res = await fetch(`${BASE_URL}/api/access/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: patient.id, providerId: doctor.id }),
    });
    assert.strictEqual(res.status, 503);
  });

  await test('GET access status before any wallet is linked reports chainChecked:false, not an error', async () => {
    const res = await fetch(`${BASE_URL}/api/access/${otherPatient.id}/${hospital.id}`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.accessGranted, false);
    assert.strictEqual(body.chainChecked, false);
  });

  await test('GET access status with both wallets linked attempts the chain and reports 503 (not a fake true/false)', async () => {
    const res = await fetch(`${BASE_URL}/api/access/${patient.id}/${doctor.id}`);
    assert.strictEqual(res.status, 503);
  });

  server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
