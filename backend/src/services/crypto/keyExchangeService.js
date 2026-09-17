// Module 10: RSA/ECIES Key Exchange
//
// RSA-OAEP (SHA-256) chosen over a hand-rolled ECIES construction:
// Node's built-in crypto module has first-class, well-audited RSA-OAEP
// support (publicEncrypt/privateDecrypt) and no built-in elliptic-curve
// IES primitives without adding a dependency. This satisfies the
// project's "prefer RSA-OAEP" guidance and avoids inventing custom
// cryptography — zero new dependencies.
//
// This wraps/unwraps arbitrary AES keys (e.g. the per-file key from
// aesService.generateFileKey()) for one recipient's RSA public key. It
// does NOT replace Module 5's existing master-key envelope encryption
// used by the live upload pipeline — that is untouched and still fully
// backward compatible. This is a new, independently tested capability,
// ready to be wired into per-recipient key delivery when authorized
// doctor/hospital record retrieval is built in a later module.

const crypto = require('crypto');

const RSA_MODULUS_LENGTH = 2048;
const OAEP_HASH = 'sha256';

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: RSA_MODULUS_LENGTH,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

function wrapAesKey(aesKeyBuffer, recipientPublicKeyPem) {
  return crypto
    .publicEncrypt(
      {
        key: recipientPublicKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: OAEP_HASH,
      },
      aesKeyBuffer
    )
    .toString('base64');
}

function unwrapAesKey(wrappedKeyBase64, recipientPrivateKeyPem) {
  const wrapped = Buffer.from(wrappedKeyBase64, 'base64');
  // Throws (tamper/wrong-key detection) if padding/decryption fails.
  return crypto.privateDecrypt(
    {
      key: recipientPrivateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: OAEP_HASH,
    },
    wrapped
  );
}

module.exports = { generateKeyPair, wrapAesKey, unwrapAesKey, RSA_MODULUS_LENGTH, OAEP_HASH };
