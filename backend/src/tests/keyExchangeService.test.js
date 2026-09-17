// Module 10: RSA/ECIES Key Exchange — unit tests
// Run with: node src/tests/keyExchangeService.test.js

const assert = require('assert');
const {
  generateKeyPair,
  wrapAesKey,
  unwrapAesKey,
} = require('../services/crypto/keyExchangeService');
const { generateFileKey, encryptBuffer, decryptBuffer } = require('../services/crypto/aesService');

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

console.log('Running Module 10 RSA-OAEP key exchange tests...\n');

test('generateKeyPair produces distinct PEM-formatted public/private keys', () => {
  const { publicKey, privateKey } = generateKeyPair();
  assert.ok(publicKey.includes('BEGIN PUBLIC KEY'));
  assert.ok(privateKey.includes('BEGIN PRIVATE KEY'));
  const second = generateKeyPair();
  assert.notStrictEqual(publicKey, second.publicKey);
});

test('public/private keys generated together are consistent (wrap with public, unwrap with matching private)', () => {
  const { publicKey, privateKey } = generateKeyPair();
  const aesKey = generateFileKey();
  const wrapped = wrapAesKey(aesKey, publicKey);
  const unwrapped = unwrapAesKey(wrapped, privateKey);
  assert.strictEqual(unwrapped.toString('hex'), aesKey.toString('hex'));
});

test('wrapAesKey produces output that does not contain the raw AES key bytes', () => {
  const { publicKey } = generateKeyPair();
  const aesKey = generateFileKey();
  const wrapped = wrapAesKey(aesKey, publicKey);
  const wrappedBuffer = Buffer.from(wrapped, 'base64');
  assert.strictEqual(wrappedBuffer.includes(aesKey), false);
});

test('the correct recipient successfully recovers the AES key', () => {
  const recipient = generateKeyPair();
  const aesKey = generateFileKey();
  const wrapped = wrapAesKey(aesKey, recipient.publicKey);
  const recovered = unwrapAesKey(wrapped, recipient.privateKey);
  assert.strictEqual(recovered.toString('hex'), aesKey.toString('hex'));
});

test('unwrapping with the WRONG private key fails', () => {
  const recipient = generateKeyPair();
  const attacker = generateKeyPair();
  const aesKey = generateFileKey();
  const wrapped = wrapAesKey(aesKey, recipient.publicKey);
  assert.throws(() => unwrapAesKey(wrapped, attacker.privateKey));
});

test('unwrapping a TAMPERED wrapped key fails', () => {
  const recipient = generateKeyPair();
  const aesKey = generateFileKey();
  const wrapped = wrapAesKey(aesKey, recipient.publicKey);
  const tamperedBuffer = Buffer.from(wrapped, 'base64');
  tamperedBuffer[0] ^= 0xff;
  assert.throws(() => unwrapAesKey(tamperedBuffer.toString('base64'), recipient.privateKey));
});

test('COMPLETE flow: file -> AES encrypt -> AES key -> RSA-OAEP wrap -> unwrap -> AES decrypt -> original file', () => {
  const originalFile = Buffer.from(
    'SYNTHETIC MEDICAL RECORD — not real PHI — Module 10 key exchange test.'
  );
  const doctor = generateKeyPair(); // the authorized recipient's keypair

  // Module 5's existing AES machinery, reused as-is (not modified):
  const fileKey = generateFileKey();
  const { iv, authTag, ciphertext } = encryptBuffer(originalFile, fileKey);

  // Module 10: wrap the AES file key for this specific recipient.
  const wrappedForDoctor = wrapAesKey(fileKey, doctor.publicKey);

  // "Off-chain" storage/transmission boundary — wrappedForDoctor is what
  // would be stored/sent; the raw fileKey is not.
  assert.notStrictEqual(wrappedForDoctor, fileKey.toString('base64'));

  // Recipient side: unwrap with their own private key, then AES-decrypt.
  const recoveredFileKey = unwrapAesKey(wrappedForDoctor, doctor.privateKey);
  const decryptedFile = decryptBuffer({ iv, authTag, ciphertext }, recoveredFileKey);

  assert.strictEqual(decryptedFile.toString('utf8'), originalFile.toString('utf8'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
