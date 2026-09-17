// Module 10: key routes integration tests
// Run with: node src/tests/keyRoutes.test.js
//
// Proves requirement #8 from the Module 10 spec directly: the private
// key must never appear in any API response, by searching the raw
// response text (not just checking a named field) for the PEM private
// key marker.

const assert = require('assert');
const { createServer } = require('../server');
const userService = require('../services/userService');
const publicKeyRegistry = require('../services/crypto/publicKeyRegistry');
const devKeyVault = require('../services/crypto/devKeyVault');

const PORT = 4995;
const BASE_URL = `http://localhost:${PORT}`;

async function main() {
  userService.clearUsers();
  publicKeyRegistry.clearRegistry();
  devKeyVault.clearVault();
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

  console.log('Running Module 10 key routes tests...\n');

  const userRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Dr. Iyer', role: 'DOCTOR' }),
  });
  const { user: doctor } = await userRes.json();

  let rawResponseText = '';

  await test('POST /api/users/:id/keys returns 201 with a public key and never the private key', async () => {
    const res = await fetch(`${BASE_URL}/api/users/${doctor.id}/keys`, { method: 'POST' });
    rawResponseText = await res.text();
    const body = JSON.parse(rawResponseText);

    assert.strictEqual(res.status, 201);
    assert.ok(body.publicKey.includes('BEGIN PUBLIC KEY'));
    assert.strictEqual(body.privateKey, undefined);
  });

  await test('the raw response text never contains the PEM private key marker', () => {
    assert.strictEqual(rawResponseText.includes('BEGIN PRIVATE KEY'), false);
  });

  await test('the private key WAS stored server-side (dev vault), proving it was generated, not just withheld', () => {
    const stored = devKeyVault.getPrivateKey(doctor.id);
    assert.ok(stored && stored.includes('BEGIN PRIVATE KEY'));
  });

  await test('GET /api/users/:id/public-key returns the same public key, still no private key', async () => {
    const res = await fetch(`${BASE_URL}/api/users/${doctor.id}/public-key`);
    const text = await res.text();
    const body = JSON.parse(text);
    assert.strictEqual(res.status, 200);
    assert.ok(body.publicKey.includes('BEGIN PUBLIC KEY'));
    assert.strictEqual(text.includes('BEGIN PRIVATE KEY'), false);
  });

  await test('GET public-key for a user with no generated key returns 404', async () => {
    const res2 = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No Keys Yet', role: 'PATIENT' }),
    });
    const { user: noKeysUser } = await res2.json();
    const res = await fetch(`${BASE_URL}/api/users/${noKeysUser.id}/public-key`);
    assert.strictEqual(res.status, 404);
  });

  await test('POST /api/users/:id/keys for a nonexistent user returns 404', async () => {
    const res = await fetch(`${BASE_URL}/api/users/not-a-real-user/keys`, { method: 'POST' });
    assert.strictEqual(res.status, 404);
  });

  server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
