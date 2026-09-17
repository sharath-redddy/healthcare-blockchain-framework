// Module 2: User & Role Management
//
// These handlers are transport-agnostic on purpose: each takes already-
// parsed input and returns a plain { statusCode, body } result. server.js
// is the only file that knows about Node's raw req/res objects. This
// means swapping the raw http module for Express later (if a future
// module's routing needs outgrow it) will not require rewriting this
// business logic — only server.js's wiring changes.

const { VALID_ROLES, isValidRole } = require('../constants/roles');
const { isPlausibleAddress } = require('../constants/blockchain');
const userService = require('../services/userService');

function listRoles() {
  return { statusCode: 200, body: { roles: VALID_ROLES } };
}

function createUser(payload = {}) {
  const { name, role, walletAddress } = payload;

  if (!isValidRole(role)) {
    return {
      statusCode: 400,
      body: {
        error: `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`,
      },
    };
  }

  // Module 9: walletAddress was already an accepted (nullable) field
  // since Module 2 — only now validated, and only when actually
  // supplied, so omitting it remains fully backward compatible.
  if (walletAddress && !isPlausibleAddress(walletAddress)) {
    return {
      statusCode: 400,
      body: { error: `"${walletAddress}" is not a valid wallet address (expected 0x + 40 hex characters).` },
    };
  }

  try {
    const user = userService.createUser({ name, role, walletAddress });
    return { statusCode: 201, body: { user } };
  } catch (err) {
    // Catches model-level validation (e.g. missing/blank name)
    return { statusCode: 400, body: { error: err.message } };
  }
}

function listUsers() {
  return { statusCode: 200, body: { users: userService.listUsers() } };
}

// Module 9: links (or updates) a wallet address on an already-registered
// user — needed because Module 2 registration predates any wallet UI.
function linkWallet(userId, walletAddress) {
  if (!isPlausibleAddress(walletAddress)) {
    return {
      statusCode: 400,
      body: { error: `"${walletAddress}" is not a valid wallet address (expected 0x + 40 hex characters).` },
    };
  }

  const user = userService.updateWalletAddress(userId, walletAddress);
  if (!user) {
    return { statusCode: 404, body: { error: `No user found with id "${userId}".` } };
  }

  return { statusCode: 200, body: { user } };
}

module.exports = { listRoles, createUser, listUsers, linkWallet };
