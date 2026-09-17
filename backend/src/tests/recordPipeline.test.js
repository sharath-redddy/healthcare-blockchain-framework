// Modules 3-6 — full record pipeline integration test
// Run with: node src/tests/recordPipeline.test.js
//
// Starts the real server and drives it with Node's built-in fetch +
// FormData + Blob — the same client-side mechanism the actual React
// frontend uses (frontend/src/api/backend.js). This proves the real
// wire format works, not just the internal functions in isolation.

const assert = require('assert');
const { createServer } = require('../server');
const userService = require('../services/userService');
const recordService = require('../services/recordService');
const aesService = require('../services/crypto/aesService');

const PORT = 4998; // dedicated test port
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

  console.log('Running Modules 3-6 full pipeline integration tests...\n');

  // ---- Set up a PATIENT and a DOCTOR via the existing Module 2 API ----
  const patientRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Asha Rao', role: 'PATIENT' }),
  });
  const { user: patient } = await patientRes.json();

  const doctorRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Dr. Iyer', role: 'DOCTOR' }),
  });
  const { user: doctor } = await doctorRes.json();

  const SYNTHETIC_CONTENT =
    'SYNTHETIC MEDICAL RECORD — not real PHI — Module 3-6 pipeline test file.';
  const plaintextBuffer = Buffer.from(SYNTHETIC_CONTENT, 'utf8');

  let uploadedRecord = null;

  await test('POST /api/records/upload accepts a valid PATIENT upload and returns metadata without key material', async () => {
    const form = new FormData();
    form.append('patientId', patient.id);
    form.append('file', new Blob([plaintextBuffer], { type: 'text/plain' }), 'synthetic-record.txt');

    const res = await fetch(`${BASE_URL}/api/records/upload`, { method: 'POST', body: form });
    const body = await res.json();

    assert.strictEqual(res.status, 201, `expected 201, got ${res.status}: ${JSON.stringify(body)}`);
    assert.ok(body.record.id);
    assert.strictEqual(body.record.patientId, patient.id);
    assert.strictEqual(body.record.originalFilename, 'synthetic-record.txt');
    assert.strictEqual(body.record.mimeType, 'text/plain');
    assert.strictEqual(body.record.sizeBytes, plaintextBuffer.length);
    assert.ok(body.record.cid, 'expected a CID to be returned');
    assert.strictEqual(body.record.isMockIpfs, true, 'expected mock IPFS mode in this sandbox (no Pinata creds)');
    assert.strictEqual(body.record.wrappedFileKey, undefined, 'wrappedFileKey must NEVER be exposed via the API');

    uploadedRecord = body.record;
  });

  await test('uploading with a non-existent patientId is rejected (400)', async () => {
    const form = new FormData();
    form.append('patientId', 'not-a-real-user-id');
    form.append('file', new Blob([plaintextBuffer], { type: 'text/plain' }), 'x.txt');

    const res = await fetch(`${BASE_URL}/api/records/upload`, { method: 'POST', body: form });
    assert.strictEqual(res.status, 400);
  });

  await test('uploading as a DOCTOR (not a PATIENT) is rejected (400)', async () => {
    const form = new FormData();
    form.append('patientId', doctor.id);
    form.append('file', new Blob([plaintextBuffer], { type: 'text/plain' }), 'x.txt');

    const res = await fetch(`${BASE_URL}/api/records/upload`, { method: 'POST', body: form });
    const body = await res.json();
    assert.strictEqual(res.status, 400);
    assert.ok(/not a PATIENT/i.test(body.error));
  });

  await test('uploading with no file part is rejected (400)', async () => {
    const form = new FormData();
    form.append('patientId', patient.id);

    const res = await fetch(`${BASE_URL}/api/records/upload`, { method: 'POST', body: form });
    assert.strictEqual(res.status, 400);
  });

  await test('uploading an unsupported file type is rejected (400)', async () => {
    const form = new FormData();
    form.append('patientId', patient.id);
    form.append(
      'file',
      new Blob([Buffer.from('MZ\x90\x00fake-exe-bytes')], { type: 'application/x-msdownload' }),
      'malware.exe'
    );

    const res = await fetch(`${BASE_URL}/api/records/upload`, { method: 'POST', body: form });
    const body = await res.json();
    assert.strictEqual(res.status, 400);
    assert.ok(/Unsupported file type/i.test(body.error));
  });

  await test('GET /api/records?patientId=... lists only that patient\'s records', async () => {
    const res = await fetch(`${BASE_URL}/api/records?patientId=${patient.id}`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.records.length, 1);
    assert.strictEqual(body.records[0].id, uploadedRecord.id);
  });

  await test('GET /api/records/:id/encrypted-file returns bytes that are NOT the plaintext', async () => {
    const res = await fetch(`${BASE_URL}/api/records/${uploadedRecord.id}/encrypted-file`);
    assert.strictEqual(res.status, 200);
    const arrayBuffer = await res.arrayBuffer();
    const downloadedEncrypted = Buffer.from(arrayBuffer);

    // The core Module 6 guarantee: what's retrievable via the CID must
    // NOT equal the plaintext that was uploaded.
    assert.notStrictEqual(downloadedEncrypted.toString('utf8'), SYNTHETIC_CONTENT);
    assert.ok(
      !downloadedEncrypted.includes(Buffer.from(SYNTHETIC_CONTENT, 'utf8')),
      'the synthetic plaintext marker must not appear anywhere in the encrypted bytes'
    );

    // Whitebox check (legitimate here — testing our own backend, not
    // simulating an external attacker): decrypt using the record's
    // server-side-only wrappedFileKey and confirm it restores the
    // EXACT original plaintext. This proves the full round trip:
    // plaintext -> AES-256 encrypt -> IPFS(mock) -> retrieve -> decrypt -> original.
    const internalRecord = recordService.getRecordById(uploadedRecord.id);
    const decrypted = aesService.decryptMedicalFile(downloadedEncrypted, internalRecord.wrappedFileKey);
    assert.strictEqual(decrypted.toString('utf8'), SYNTHETIC_CONTENT);
  });

  await test('downloading the encrypted file for a non-existent record returns 404', async () => {
    const res = await fetch(`${BASE_URL}/api/records/not-a-real-record-id/encrypted-file`);
    assert.strictEqual(res.status, 404);
  });

  server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
