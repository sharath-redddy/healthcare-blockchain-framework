// Module 10 — LOCAL DEVELOPMENT / PROTOTYPE ONLY.
//
// Stores generated private keys in-memory, server-side, purely for
// prototype/demo convenience (so a simulated "doctor" has some private
// key to unwrap a key with, without a real client-side wallet/key
// manager existing yet). This is explicitly NOT production-grade key
// custody: in a real system the keypair would be generated in the
// recipient's own browser/device and the private key would never touch
// the server at all. That infrastructure does not exist yet in this
// project — documented here rather than pretended away (see
// docs/architecture.md, Module 10 section).
//
// Nothing in this file is ever imported by code that builds an API
// response body — routes/keyRoutes.js only calls this to store a key
// immediately after generation, never to read-and-return one.

const vault = new Map(); // userId -> privateKeyPem

function storePrivateKey(userId, privateKeyPem) {
  vault.set(userId, privateKeyPem);
}

function getPrivateKey(userId) {
  return vault.get(userId) || null;
}

function clearVault() {
  vault.clear();
}

module.exports = { storePrivateKey, getPrivateKey, clearVault };
