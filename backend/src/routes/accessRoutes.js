// Module 9: Patient-Centric Grant/Revoke Access
//
// All validation (patient exists, provider exists, provider has a real
// healthcare role, wallet addresses are well-formed) happens against
// OUR OWN user records (userService) — never trusting a role string the
// client might supply alongside the request. Only after that passes do
// we attempt the on-chain call via blockchainService. Access status is
// read directly from the chain (or reported as "not yet linked" if
// wallets aren't set) — there is no separate in-memory permission store
// pretending to be the source of truth.

const userService = require('../services/userService');
const { ROLES } = require('../constants/roles');
const { isPlausibleAddress } = require('../constants/blockchain');
const blockchainService = require('../services/blockchain/blockchainService');
const { auditService, AUDIT_ACTIONS, AUDIT_RESULTS } = require('../services/auditService');

function resolvePatient(patientId) {
  const patient = userService.getUserById(patientId);
  if (!patient) return { error: `No user found with id "${patientId}".` };
  if (patient.role !== ROLES.PATIENT) {
    return { error: `User "${patientId}" is not a PATIENT.` };
  }
  return { patient };
}

function resolveProvider(providerId) {
  const provider = userService.getUserById(providerId);
  if (!provider) return { error: `No user found with id "${providerId}".` };
  if (provider.role !== ROLES.DOCTOR && provider.role !== ROLES.HOSPITAL_ADMIN) {
    return { error: `User "${providerId}" is not a DOCTOR or HOSPITAL_ADMIN.` };
  }
  return { provider };
}

function validateGrantRevokeInput({ patientId, providerId }) {
  if (!patientId) return 'patientId is required.';
  if (!providerId) return 'providerId is required.';

  const { patient, error: patientError } = resolvePatient(patientId);
  if (patientError) return patientError;

  const { provider, error: providerError } = resolveProvider(providerId);
  if (providerError) return providerError;

  if (!patient.walletAddress || !isPlausibleAddress(patient.walletAddress)) {
    return `Patient "${patientId}" has no valid linked wallet address. Link one first via POST /api/users/${patientId}/wallet.`;
  }
  if (!provider.walletAddress || !isPlausibleAddress(provider.walletAddress)) {
    return `Provider "${providerId}" has no valid linked wallet address. Link one first via POST /api/users/${providerId}/wallet.`;
  }

  return null;
}

async function grantAccess({ patientId, providerId }) {
  const validationError = validateGrantRevokeInput({ patientId, providerId });
  if (validationError) {
    return { statusCode: 400, body: { error: validationError } };
  }

  const patient = userService.getUserById(patientId);
  const provider = userService.getUserById(providerId);

  try {
    const { txHash } = await blockchainService.grantAccessOnChain(
      provider.walletAddress,
      patient.walletAddress
    );
    auditService.logEvent({
      action: AUDIT_ACTIONS.ACCESS_GRANTED,
      actorId: patient.id,
      actorName: patient.name,
      actorRole: patient.role,
      patientId: patient.id,
      result: AUDIT_RESULTS.SUCCESS,
      txHash,
      details: `Granted access to ${provider.role.toLowerCase()} ${provider.name} (${provider.id})`,
    });
    return { statusCode: 200, body: { patientId, providerId, accessGranted: true, txHash } };
  } catch (err) {
    // Blockchain unavailable/unconfigured — a clear 503, never a fake success.
    auditService.logEvent({
      action: AUDIT_ACTIONS.ACCESS_GRANTED,
      actorId: patient.id,
      actorName: patient.name,
      actorRole: patient.role,
      patientId: patient.id,
      result: AUDIT_RESULTS.FAILED,
      details: `Failed to grant access on-chain: ${err.message}`,
    });
    return { statusCode: 503, body: { error: err.message } };
  }
}

async function revokeAccess({ patientId, providerId }) {
  const validationError = validateGrantRevokeInput({ patientId, providerId });
  if (validationError) {
    return { statusCode: 400, body: { error: validationError } };
  }

  const patient = userService.getUserById(patientId);
  const provider = userService.getUserById(providerId);

  try {
    const { txHash } = await blockchainService.revokeAccessOnChain(
      provider.walletAddress,
      patient.walletAddress
    );
    auditService.logEvent({
      action: AUDIT_ACTIONS.ACCESS_REVOKED,
      actorId: patient.id,
      actorName: patient.name,
      actorRole: patient.role,
      patientId: patient.id,
      result: AUDIT_RESULTS.SUCCESS,
      txHash,
      details: `Revoked access from ${provider.role.toLowerCase()} ${provider.name} (${provider.id})`,
    });
    return { statusCode: 200, body: { patientId, providerId, accessGranted: false, txHash } };
  } catch (err) {
    auditService.logEvent({
      action: AUDIT_ACTIONS.ACCESS_REVOKED,
      actorId: patient.id,
      actorName: patient.name,
      actorRole: patient.role,
      patientId: patient.id,
      result: AUDIT_RESULTS.FAILED,
      details: `Failed to revoke access on-chain: ${err.message}`,
    });
    return { statusCode: 503, body: { error: err.message } };
  }
}

async function getAccessStatus({ patientId, providerId }) {
  if (!patientId || !providerId) {
    return { statusCode: 400, body: { error: 'patientId and providerId are both required.' } };
  }

  const { patient, error: patientError } = resolvePatient(patientId);
  if (patientError) return { statusCode: 404, body: { error: patientError } };

  const { provider, error: providerError } = resolveProvider(providerId);
  if (providerError) return { statusCode: 404, body: { error: providerError } };

  if (!patient.walletAddress || !provider.walletAddress) {
    // Normal pre-linking state, not an error: nothing on-chain to check yet.
    return {
      statusCode: 200,
      body: { patientId, providerId, accessGranted: false, chainChecked: false },
    };
  }

  try {
    const granted = await blockchainService.hasAccessOnChain(patient.walletAddress, provider.walletAddress);
    return {
      statusCode: 200,
      body: { patientId, providerId, accessGranted: granted, chainChecked: true },
    };
  } catch (err) {
    return { statusCode: 503, body: { error: err.message } };
  }
}

module.exports = { grantAccess, revokeAccess, getAccessStatus };
