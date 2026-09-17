// Module 2: User & Role Management
//
// Single source of truth for supported roles. Every later module
// (patient dashboard, doctor access requests, hospital admin actions,
// smart-contract role checks, etc.) should import ROLES/isValidRole
// from here rather than redefining role strings.

const ROLES = Object.freeze({
  PATIENT: 'PATIENT',
  DOCTOR: 'DOCTOR',
  HOSPITAL_ADMIN: 'HOSPITAL_ADMIN',
});

const VALID_ROLES = Object.freeze(Object.values(ROLES));

function isValidRole(role) {
  return typeof role === 'string' && VALID_ROLES.includes(role);
}

module.exports = { ROLES, VALID_ROLES, isValidRole };
