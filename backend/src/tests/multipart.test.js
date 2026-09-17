// Module 4: Medical Record Upload — multipart parser unit tests
// Run with: node src/tests/multipart.test.js

const assert = require('assert');
const { parseMultipart } = require('../utils/multipart');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL - ${name}`);
    console.log(`         ${err.message}`);
    failed++;
  }
}

function buildMultipartBody(boundary, fields, filePart) {
  const CRLF = '\r\n';
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`
      )
    );
  }

  if (filePart) {
    const header = Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="${filePart.fieldName}"; filename="${filePart.filename}"${CRLF}Content-Type: ${filePart.mimeType}${CRLF}${CRLF}`
    );
    parts.push(Buffer.concat([header, filePart.buffer, Buffer.from(CRLF)]));
  }

  parts.push(Buffer.from(`--${boundary}--${CRLF}`));
  return Buffer.concat(parts);
}

console.log('Running Module 4 multipart parser unit tests...\n');

test('parses a text field correctly', () => {
  const boundary = 'TestBoundary1';
  const body = buildMultipartBody(boundary, { patientId: 'abc-123' }, null);
  const { fields, file } = parseMultipart(body, `multipart/form-data; boundary=${boundary}`);
  assert.strictEqual(fields.patientId, 'abc-123');
  assert.strictEqual(file, null);
});

test('parses a file part with correct filename and mimeType', () => {
  const boundary = 'TestBoundary2';
  const fileContent = Buffer.from('SYNTHETIC MEDICAL RECORD - not real PHI.');
  const body = buildMultipartBody(
    boundary,
    { patientId: 'patient-1' },
    { fieldName: 'file', filename: 'record.txt', mimeType: 'text/plain', buffer: fileContent }
  );
  const { fields, file } = parseMultipart(body, `multipart/form-data; boundary=${boundary}`);
  assert.strictEqual(fields.patientId, 'patient-1');
  assert.ok(file);
  assert.strictEqual(file.filename, 'record.txt');
  assert.strictEqual(file.mimeType, 'text/plain');
  assert.strictEqual(file.buffer.toString('utf8'), fileContent.toString('utf8'));
});

test('preserves binary file content exactly (all 256 byte values)', () => {
  const boundary = 'TestBoundary3';
  const binaryContent = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const body = buildMultipartBody(
    boundary,
    {},
    { fieldName: 'file', filename: 'binary.bin', mimeType: 'application/octet-stream', buffer: binaryContent }
  );
  const { file } = parseMultipart(body, `multipart/form-data; boundary=${boundary}`);
  assert.ok(file);
  assert.strictEqual(file.buffer.length, 256);
  assert.deepStrictEqual([...file.buffer], [...binaryContent]);
});

test('throws when the Content-Type header has no boundary', () => {
  assert.throws(() => parseMultipart(Buffer.from('irrelevant'), 'multipart/form-data'));
});

test('handles multiple fields plus a file together', () => {
  const boundary = 'TestBoundary4';
  const fileContent = Buffer.from('demo file content');
  const body = buildMultipartBody(
    boundary,
    { patientId: 'p1', note: 'annual checkup' },
    { fieldName: 'file', filename: 'checkup.pdf', mimeType: 'application/pdf', buffer: fileContent }
  );
  const { fields, file } = parseMultipart(body, `multipart/form-data; boundary=${boundary}`);
  assert.strictEqual(fields.patientId, 'p1');
  assert.strictEqual(fields.note, 'annual checkup');
  assert.strictEqual(file.filename, 'checkup.pdf');
  assert.strictEqual(file.buffer.toString('utf8'), 'demo file content');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
