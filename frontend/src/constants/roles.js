// Module 2: User & Role Management
//
// Mirrors backend/src/constants/roles.js. Kept as a local constant here
// (rather than fetched from the API on every render) to keep the UI
// simple for this module. The role demo below also calls GET /api/roles
// once on load, so the two are cross-checked at runtime.

export const ROLES = Object.freeze({
  PATIENT: 'PATIENT',
  DOCTOR: 'DOCTOR',
  HOSPITAL_ADMIN: 'HOSPITAL_ADMIN',
});

export const ROLE_LABELS = Object.freeze({
  PATIENT: 'Patient',
  DOCTOR: 'Doctor',
  HOSPITAL_ADMIN: 'Hospital / Administrator',
});

export const VALID_ROLES = Object.freeze(Object.values(ROLES));
