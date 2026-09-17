// Module 10: dev-only key generation + public key retrieval endpoints.
// Private keys NEVER appear in any returned body here — see
// services/crypto/devKeyVault.js for why a server-side vault exists at
// all in this prototype phase.

const userService = require('../services/userService');
const keyExchangeService = require('../services/crypto/keyExchangeService');
const publicKeyRegistry = require('../services/crypto/publicKeyRegistry');
const devKeyVault = require('../services/crypto/devKeyVault');

function generateKeysForUser(userId) {
  const user = userService.getUserById(userId);
  if (!user) {
    return { statusCode: 404, body: { error: `No user found with id "${userId}".` } };
  }

  const { publicKey, privateKey } = keyExchangeService.generateKeyPair();
  publicKeyRegistry.setPublicKey(userId, publicKey);
  devKeyVault.storePrivateKey(userId, privateKey); // server-side only — dev convenience, see devKeyVault.js

  return {
    statusCode: 201,
    body: {
      userId,
      publicKey,
      note:
        'Private key generated and held server-side for local development only — ' +
        'not production-grade key custody. See docs/architecture.md (Module 10).',
    },
  };
}

function getPublicKeyForUser(userId) {
  const publicKey = publicKeyRegistry.getPublicKey(userId);
  if (!publicKey) {
    return { statusCode: 404, body: { error: `No public key registered for user "${userId}".` } };
  }
  return { statusCode: 200, body: { userId, publicKey } };
}

module.exports = { generateKeysForUser, getPublicKeyForUser };
