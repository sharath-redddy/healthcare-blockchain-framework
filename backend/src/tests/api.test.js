// Module 2: User & Role Management — API integration tests
// Run with: node src/tests/api.test.js
// Starts the real server on a dedicated test port and calls it with
// Node's built-in fetch (Node 18+) — no supertest/jest dependency added.

const assert = require('assert');
const { createServer } = require('../server');
const userService = require('../services/userService');

const PORT = 4999; // dedicated test port, distinct from the dev server's default 4000
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

  console.log('Running Module 2 API integration tests...\n');

  await test('GET /api/roles returns the three supported roles', async () => {
    const res = await fetch(`${BASE_URL}/api/roles`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      [...body.roles].sort(),
      ['DOCTOR', 'HOSPITAL_ADMIN', 'PATIENT']
    );
  });

  await test('POST /api/users with a valid role returns 201 and the created user', async () => {
    const res = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Asha Rao', role: 'PATIENT' }),
    });
    const body = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(body.user.role, 'PATIENT');
    assert.strictEqual(body.user.name, 'Asha Rao');
    assert.strictEqual(body.user.walletAddress, null);
  });

  await test('POST /api/users with an invalid role returns 400', async () => {
    const res = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Someone', role: 'NURSE' }),
    });
    const body = await res.json();
    assert.strictEqual(res.status, 400);
    assert.ok(body.error, 'expected an error message');
  });

  await test('POST /api/users with a missing name returns 400', async () => {
    const res = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'DOCTOR' }),
    });
    assert.strictEqual(res.status, 400);
  });

  await test('GET /api/users reflects only the previously accepted user', async () => {
    const res = await fetch(`${BASE_URL}/api/users`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.users.length, 1);
    assert.strictEqual(body.users[0].role, 'PATIENT');
  });

  server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
