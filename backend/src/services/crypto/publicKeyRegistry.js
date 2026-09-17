// Module 10: public keys are NOT secret — safe to store and return via
// API. Kept in its own module, completely separate from devKeyVault.js
// (which holds private keys), so nothing that touches this file can
// accidentally leak a private key.

const registry = new Map(); // userId -> publicKeyPem

function setPublicKey(userId, publicKeyPem) {
  registry.set(userId, publicKeyPem);
}

function getPublicKey(userId) {
  return registry.get(userId) || null;
}

function clearRegistry() {
  registry.clear();
}

module.exports = { setPublicKey, getPublicKey, clearRegistry };
