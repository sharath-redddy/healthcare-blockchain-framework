// Module 5: AES-256 Encryption — unit tests
// Run with: node src/tests/aesService.test.js

const assert = require('assert');
const {
  generateFileKey,
  encryptBuffer,
  decryptBuffer,
  wrapFileKey,
  unwrapFileKey,
  encryptMedicalFile,
  decryptMedicalFile,
} = require('../services/crypto/aesService');

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

console.log('Running Module 5 AES-256 encryption unit tests...\n');

test('generateFileKey produces a 32-byte (256-bit) key', () => {
  const key = generateFileKey();
  assert.strictEqual(key.length, 32);
});

test('encrypted output differs from plaintext input', () => {
  const key = generateFileKey();
  const plaintext = Buffer.from('SYNTHETIC MEDICAL RECORD — not real PHI — test file contents.');
  const { ciphertext } = encryptBuffer(plaintext, key);
  assert.notStrictEqual(ciphertext.toString('hex'), plaintext.toString('hex'));
});

test('decryption with the correct key restores the exact original plaintext', () => {
  const key = generateFileKey();
  const plaintext = Buffer.from('Patient: Asha Rao (synthetic). Diagnosis: test data only.');
  const { iv, authTag, ciphertext } = encryptBuffer(plaintext, key);
  const decrypted = decryptBuffer({ iv, authTag, ciphertext }, key);
  assert.strictEqual(decrypted.toString('utf8'), plaintext.toString('utf8'));
});

test('decryption with an incorrect key throws (GCM auth tag check fails)', () => {
  const key = generateFileKey();
  const wrongKey = generateFileKey();
  const plaintext = Buffer.from('Sensitive synthetic data that must not decrypt with the wrong key.');
  const { iv, authTag, ciphertext } = encryptBuffer(plaintext, key);
  assert.throws(() => decryptBuffer({ iv, authTag, ciphertext }, wrongKey));
});

test('two encryptions of the same plaintext produce different ciphertext (random IV)', () => {
  const key = generateFileKey();
  const plaintext = Buffer.from('Repeat me');
  const a = encryptBuffer(plaintext, key);
  const b = encryptBuffer(plaintext, key);
  assert.notStrictEqual(a.ciphertext.toString('hex'), b.ciphertext.toString('hex'));
});

test('wrapFileKey / unwrapFileKey round-trips a file key under the master key', () => {
  const fileKey = generateFileKey();
  const wrapped = wrapFileKey(fileKey);
  const unwrapped = unwrapFileKey(wrapped);
  assert.strictEqual(unwrapped.toString('hex'), fileKey.toString('hex'));
});

test('encryptMedicalFile -> decryptMedicalFile round-trips a synthetic file exactly', () => {
  const original = Buffer.from('SYNTHETIC MEDICAL RECORD - not real PHI - full pipeline test.');
  const { encryptedPayload, wrappedFileKey } = encryptMedicalFile(original);
  assert.notStrictEqual(encryptedPayload.toString('hex'), original.toString('hex'));
  const decrypted = decryptMedicalFile(encryptedPayload, wrappedFileKey);
  assert.strictEqual(decrypted.toString('utf8'), original.toString('utf8'));
});

test('decryptMedicalFile fails when the wrappedFileKey is tampered with', () => {
  const original = Buffer.from('Another synthetic record.');
  const { encryptedPayload, wrappedFileKey } = encryptMedicalFile(original);
  const tampered = Buffer.from(wrappedFileKey, 'base64');
  tampered[0] ^= 0xff; // flip a bit
  assert.throws(() => decryptMedicalFile(encryptedPayload, tampered.toString('base64')));
});

test('decryptMedicalFile fails when the encrypted payload is tampered with', () => {
  const original = Buffer.from('Yet another synthetic record.');
  const { encryptedPayload, wrappedFileKey } = encryptMedicalFile(original);
  const tampered = Buffer.from(encryptedPayload);
  tampered[tampered.length - 1] ^= 0xff; // flip last byte of ciphertext
  assert.throws(() => decryptMedicalFile(tampered, wrappedFileKey));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
