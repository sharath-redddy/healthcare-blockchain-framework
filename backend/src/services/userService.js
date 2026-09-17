// Module 2: User & Role Management
//
// In-memory store only. A database is NOT introduced in this module —
// it isn't required to demonstrate role modeling, validation, or the
// API/UI wiring, and adding one now would be scope creep per the
// project's dependency-control rule. If a later module (e.g. persistent
// accounts across sessions) makes a database genuinely necessary, that
// will be raised explicitly before implementing it, and this module's
// function signatures are written so the storage layer underneath can
// be swapped without touching callers (routes/tests).

const User = require('../models/User');

const usersById = new Map();

function createUser({ name, role, walletAddress }) {
  const user = new User({ name, role, walletAddress });
  usersById.set(user.id, user);
  return user;
}

function getUserById(id) {
  return usersById.get(id) || null;
}

function listUsers() {
  return Array.from(usersById.values());
}

// Module 9: links/updates a user's wallet address (format already
// validated by the caller — see routes/userRoutes.js linkWallet).
function updateWalletAddress(userId, walletAddress) {
  const user = usersById.get(userId);
  if (!user) return null;
  user.walletAddress = walletAddress;
  return user;
}

// Test-only helper for isolating test runs. Not used by production routes.
function clearUsers() {
  usersById.clear();
}

module.exports = { createUser, getUserById, listUsers, updateWalletAddress, clearUsers };
