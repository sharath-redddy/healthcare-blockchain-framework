// Module 5: AES-256 Encryption
//
// Every medical file gets its own randomly generated AES-256 key
// ("file key"). The file is encrypted with AES-256-GCM under that key.
// The file key itself is then "wrapped" (encrypted) under the server's
// master key so it can be stored safely in record metadata — never in
// plaintext, never sent to the frontend, never sent to IPFS.
//
// GCM is used (not plain CBC) because it provides authenticated
// encryption: tampering or using the wrong key causes decryption to
// throw rather than silently returning garbage.

const crypto = require('crypto');
const { getMasterKey } = require('./keyManager');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV, recommended size for GCM
const AUTH_TAG_LENGTH = 16;

function generateFileKey() {
  return crypto.randomBytes(32); // AES-256 = 32-byte key
}

function encryptBuffer(plainBuffer, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv, authTag, ciphertext };
}

function decryptBuffer({ iv, authTag, ciphertext }, key) {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  // Throws if the key is wrong or the data was tampered with (GCM auth check).
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ---- Envelope helpers: wrap/unwrap a file key under the master key. ----
// This is the exact seam Module 10 will replace with RSA/ECIES wrapping.

function wrapFileKey(fileKey) {
  const masterKey = getMasterKey();
  const { iv, authTag, ciphertext } = encryptBuffer(fileKey, masterKey);
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

function unwrapFileKey(wrappedKeyBase64) {
  const masterKey = getMasterKey();
  const raw = Buffer.from(wrappedKeyBase64, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  return decryptBuffer({ iv, authTag, ciphertext }, masterKey);
}

// ---- Top-level pipeline functions used by the upload/retrieval flow. ----

/**
 * Encrypts a plaintext medical file. Returns:
 *  - encryptedPayload: self-contained buffer (iv + authTag + ciphertext)
 *    that is safe to send to IPFS.
 *  - wrappedFileKey: base64 string, stored server-side only in record
 *    metadata — never sent to IPFS or the frontend.
 */
function encryptMedicalFile(plainBuffer) {
  const fileKey = generateFileKey();
  const { iv, authTag, ciphertext } = encryptBuffer(plainBuffer, fileKey);
  const wrappedFileKey = wrapFileKey(fileKey);
  const encryptedPayload = Buffer.concat([iv, authTag, ciphertext]);
  return { encryptedPayload, wrappedFileKey };
}

/**
 * Reverses encryptMedicalFile: given the encrypted payload retrieved
 * from IPFS/mock storage and the record's wrappedFileKey, restores the
 * original plaintext bytes. Throws if the key is wrong or data was
 * tampered with.
 */
function decryptMedicalFile(encryptedPayload, wrappedFileKey) {
  const iv = encryptedPayload.subarray(0, IV_LENGTH);
  const authTag = encryptedPayload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encryptedPayload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const fileKey = unwrapFileKey(wrappedFileKey);
  return decryptBuffer({ iv, authTag, ciphertext }, fileKey);
}

module.exports = {
  generateFileKey,
  encryptBuffer,
  decryptBuffer,
  wrapFileKey,
  unwrapFileKey,
  encryptMedicalFile,
  decryptMedicalFile,
};
