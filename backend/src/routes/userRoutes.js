// Module 2: User & Role Management
//
// These handlers are transport-agnostic on purpose: each takes already-
// parsed input and returns a plain { statusCode, body } result. server.js
// is the only file that knows about Node's raw req/res objects. This
// means swapping the raw http module for Express later (if a future
// module's routing needs outgrow it) will not require rewriting this
// business logic — only server.js's wiring changes.
//
// MetaMask Signed-Challenge Authentication (Module 9 upgrade):
// Wallet identity is never trusted from the frontend as a plain string.
// The flow is:
//   1. Frontend calls POST /api/auth/challenge with { walletAddress }
//   2. Backend generates a cryptographically random nonce, stores it
//      with a 5-minute TTL, returns { message } to sign
//   3. Frontend requests MetaMask signature: personal_sign(message, address)
//   4. Frontend calls POST /api/auth/verify with { walletAddress, signature }
//   5. Backend recovers signer from (message, signature) via ethers
//   6. If recovered address === walletAddress → authentication succeeds
//      Returns { authenticated: true, walletAddress }
// This is the ONLY mechanism for trusting a wallet address in the backend.

const { VALID_ROLES, isValidRole } = require('../constants/roles');
const { isPlausibleAddress } = require('../constants/blockchain');
const userService = require('../services/userService');
const crypto = require('crypto');

// --------------------------------------------------------------------
// In-memory nonce store  (walletAddress.toLowerCase() → { nonce, expiresAt })
// TTL = 5 minutes. Only ONE active challenge per wallet at a time.
// --------------------------------------------------------------------
const challengeStore = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function pruneExpiredChallenges() {
  const now = Date.now();
  for (const [key, value] of challengeStore.entries()) {
    if (now > value.expiresAt) challengeStore.delete(key);
  }
}

/**
 * POST /api/auth/challenge
 * Body: { walletAddress: "0x..." }
 * Returns: { message: "Sign this message to authenticate with MedChain L2:\n\n..." }
 *
 * The returned message is the exact string MetaMask will present to the
 * user for signing. It embeds the nonce and a human-readable prefix so
 * users can read what they are signing.
 */
function generateChallenge({ walletAddress } = {}) {
  if (!walletAddress || !isPlausibleAddress(walletAddress)) {
    return {
      statusCode: 400,
      body: { error: `"${walletAddress}" is not a valid wallet address (expected 0x + 40 hex chars).` },
    };
  }

  pruneExpiredChallenges();

  const nonce = crypto.randomBytes(16).toString('hex'); // 32-char hex nonce
  const key = walletAddress.toLowerCase();
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;

  challengeStore.set(key, { nonce, expiresAt });

  // Human-readable message — MetaMask displays this verbatim to the user
  const message =
    `Sign this message to authenticate with MedChain L2.\n\n` +
    `Wallet: ${walletAddress}\n` +
    `Nonce: ${nonce}\n` +
    `Expires: ${new Date(expiresAt).toISOString()}\n\n` +
    `This request will NOT trigger any blockchain transaction or gas fee.`;

  return { statusCode: 200, body: { message, nonce, expiresAt } };
}

/**
 * POST /api/auth/verify
 * Body: { walletAddress: "0x...", signature: "0x..." }
 * Returns: { authenticated: true, walletAddress } or 401 error
 *
 * Uses ethers.js to recover the signer address from the signed message.
 * The challenge nonce is consumed (deleted) after a single use to
 * prevent replay attacks.
 */
async function verifySignature({ walletAddress, signature } = {}) {
  if (!walletAddress || !isPlausibleAddress(walletAddress)) {
    return {
      statusCode: 400,
      body: { error: `"${walletAddress}" is not a valid wallet address.` },
    };
  }
  if (!signature || typeof signature !== 'string' || !signature.startsWith('0x')) {
    return { statusCode: 400, body: { error: 'signature must be a 0x-prefixed hex string.' } };
  }

  pruneExpiredChallenges();

  const key = walletAddress.toLowerCase();
  const stored = challengeStore.get(key);

  if (!stored) {
    return {
      statusCode: 401,
      body: {
        error:
          'No active challenge found for this wallet address. ' +
          'Request a new challenge via POST /api/auth/challenge first.',
      },
    };
  }

  if (Date.now() > stored.expiresAt) {
    challengeStore.delete(key);
    return {
      statusCode: 401,
      body: { error: 'Challenge has expired. Request a new challenge.' },
    };
  }

  // Re-construct the exact message the frontend should have signed
  const message =
    `Sign this message to authenticate with MedChain L2.\n\n` +
    `Wallet: ${walletAddress}\n` +
    `Nonce: ${stored.nonce}\n` +
    `Expires: ${new Date(stored.expiresAt).toISOString()}\n\n` +
    `This request will NOT trigger any blockchain transaction or gas fee.`;

  // Attempt ethers signature recovery
  let ethers;
  try {
    // eslint-disable-next-line global-require
    ethers = require('ethers');
  } catch {
    // ethers not installed — fall back to a mock check in test environments
    // This should never happen in production.
    return {
      statusCode: 503,
      body: {
        error:
          "ethers.js is required for signature verification. Run 'npm install' in backend/.",
      },
    };
  }

  let recoveredAddress;
  try {
    recoveredAddress = ethers.verifyMessage(message, signature);
  } catch (err) {
    return { statusCode: 401, body: { error: `Signature verification failed: ${err.message}` } };
  }

  if (recoveredAddress.toLowerCase() !== key) {
    return {
      statusCode: 401,
      body: {
        error:
          `Signature verification failed: recovered address ${recoveredAddress} ` +
          `does not match claimed address ${walletAddress}.`,
      },
    };
  }

  // Consume the nonce — single use only
  challengeStore.delete(key);

  return {
    statusCode: 200,
    body: { authenticated: true, walletAddress: recoveredAddress },
  };
}

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

module.exports = { listRoles, createUser, listUsers, linkWallet, generateChallenge, verifySignature };

