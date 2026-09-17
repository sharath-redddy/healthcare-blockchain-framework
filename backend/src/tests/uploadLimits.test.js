// Module 4 — oversized upload rejection test
// Run with: node src/tests/uploadLimits.test.js
//
// Sets a small MAX_UPLOAD_SIZE_BYTES BEFORE requiring any backend module
// (constants are read at module-load time), so this test is fast and
// deterministic instead of needing a real multi-megabyte file.

process.env.MAX_UPLOAD_SIZE_BYTES = '1024'; // 1 KB limit, just for this test run

const assert = require('assert');
const { createServer } = require('../server');
const userService = require('../services/userService');
const recordService = require('../services/recordService');

const PORT = 4997;
const BASE_URL = `http://localhost:${PORT}`;

async function main() {
  userService.clearUsers();
  recordService.clearRecords();
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

  console.log('Running Module 4 upload size-limit test (limit set to 1024 bytes for this run)...\n');

  const patientRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Size Limit Tester', role: 'PATIENT' }),
  });
  const { user: patient } = await patientRes.json();

  await test('a file under the limit is accepted', async () => {
    const smallFile = Buffer.alloc(500, 'a'); // 500 bytes, under 1024
    const form = new FormData();
    form.append('patientId', patient.id);
    form.append('file', new Blob([smallFile], { type: 'text/plain' }), 'small.txt');

    const res = await fetch(`${BASE_URL}/api/records/upload`, { method: 'POST', body: form });
    assert.strictEqual(res.status, 201, `expected 201, got ${res.status}`);
  });

  await test('a file over the limit is rejected with 400', async () => {
    const bigFile = Buffer.alloc(5000, 'b'); // 5000 bytes, over the 1024-byte limit
    const form = new FormData();
    form.append('patientId', patient.id);
    form.append('file', new Blob([bigFile], { type: 'text/plain' }), 'big.txt');

    const res = await fetch(`${BASE_URL}/api/records/upload`, { method: 'POST', body: form });
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`);
  });

  server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
