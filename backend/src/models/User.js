// Module 2: User & Role Management
//
// Minimal user data structure. Intentionally has NO authentication,
// password, or session logic — that is out of scope for this module.
// walletAddress is reserved as nullable so Module 7+ (MetaMask / wallet
// linking) can attach a wallet to an existing user without changing
// this shape.

const { randomUUID } = require('crypto');
const { isValidRole } = require('../constants/roles');

class User {
  constructor({ name, role, walletAddress = null }) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('User "name" is required and must be a non-empty string.');
    }
    if (!isValidRole(role)) {
      throw new Error(
        `Invalid role "${role}". Must be one of: PATIENT, DOCTOR, HOSPITAL_ADMIN.`
      );
    }

    this.id = randomUUID();
    this.name = name.trim();
    this.role = role;
    this.walletAddress = walletAddress; // not linked yet — reserved for a later module
    this.createdAt = new Date().toISOString();
  }
}

module.exports = User;
