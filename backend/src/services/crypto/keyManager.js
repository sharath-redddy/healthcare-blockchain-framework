// Module 5: AES-256 Encryption — master key handling
//
// This "master key" is used only to envelope-encrypt (wrap) each file's
// randomly generated per-file AES key — never the file content directly.
// This is the seam Module 10 (RSA/ECIES key exchange) will replace: instead
// of wrapping each file key under one master key, it will wrap a copy of
// the file key under every authorized user's public key. Nothing else in
// the encryption pipeline needs to change when that happens.
//
// The key itself is never hard-coded. It comes from the
// MASTER_ENCRYPTION_KEY environment variable (see backend/.env.example).
// If it's unset, a random key is generated for this process only — loudly
// flagged as dev-only, since anything encrypted that way becomes
// undecryptable the moment the process restarts (acceptable here since
// the record store itself is in-memory and resets on restart too).

const crypto = require('crypto');

const KEY_LENGTH_BYTES = 32; // 256 bits

let cachedMasterKey = null;

function getMasterKey() {
  if (cachedMasterKey) return cachedMasterKey;

  const envKey = process.env.MASTER_ENCRYPTION_KEY;
  if (envKey) {
    const buf = Buffer.from(envKey, 'hex');
    if (buf.length !== KEY_LENGTH_BYTES) {
      throw new Error(
        `MASTER_ENCRYPTION_KEY must be a ${KEY_LENGTH_BYTES * 2}-character hex string ` +
          `(${KEY_LENGTH_BYTES} bytes) for AES-256. Generate one with: ` +
          `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
      );
    }
    cachedMasterKey = buf;
    return cachedMasterKey;
  }

  // eslint-disable-next-line no-console
  console.warn(
    '⚠️  MASTER_ENCRYPTION_KEY not set — using an EPHEMERAL master key for this ' +
      'process only. Records encrypted this session cannot be decrypted after a ' +
      'restart. Set MASTER_ENCRYPTION_KEY in backend/.env for anything persistent ' +
      '(see .env.example).'
  );
  cachedMasterKey = crypto.randomBytes(KEY_LENGTH_BYTES);
  return cachedMasterKey;
}

// Test-only helper to force key regeneration between isolated test runs.
function _resetForTests() {
  cachedMasterKey = null;
}

module.exports = { getMasterKey, _resetForTests, KEY_LENGTH_BYTES };
