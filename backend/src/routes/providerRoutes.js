// Module 11: Provider Access Routes
//
// Enables registered DOCTOR or HOSPITAL_ADMIN providers to discover and
// inspect records for which they have been granted access.
// Enforces server-side identity, role, and blockchain access checks.

const userService = require('../services/userService');
const recordService = require('../services/recordService');
const { ROLES } = require('../constants/roles');
const blockchainService = require('../services/blockchain/blockchainService');
const { auditService, AUDIT_ACTIONS, AUDIT_RESULTS } = require('../services/auditService');

async function getAccessibleRecords({ providerId }) {
  if (!providerId) {
    return { statusCode: 400, body: { error: 'providerId query parameter is required.' } };
  }

  const provider = userService.getUserById(providerId);
  if (!provider) {
    return { statusCode: 404, body: { error: `No user found with id "${providerId}".` } };
  }

  if (provider.role !== ROLES.DOCTOR && provider.role !== ROLES.HOSPITAL_ADMIN) {
    return {
      statusCode: 403,
      body: { error: `User "${providerId}" is not a DOCTOR or HOSPITAL_ADMIN.` },
    };
  }

  if (!provider.walletAddress) {
    return {
      statusCode: 200,
      body: {
        providerId,
        records: [],
        message: 'No wallet linked for this provider. Link a wallet to query blockchain permissions.',
      },
    };
  }

  // Find all patients who have linked wallets and have granted access on-chain
  const allUsers = userService.listUsers();
  const patients = allUsers.filter((u) => u.role === ROLES.PATIENT && u.walletAddress);

  const accessibleRecords = [];

  for (const patient of patients) {
    try {
      const hasAccess = await blockchainService.hasAccessOnChain(
        patient.walletAddress,
        provider.walletAddress
      );

      auditService.logEvent({
        action: AUDIT_ACTIONS.ACCESS_CHECKED,
        actorId: provider.id,
        actorName: provider.name,
        actorRole: provider.role,
        patientId: patient.id,
        result: hasAccess ? AUDIT_RESULTS.SUCCESS : AUDIT_RESULTS.DENIED,
        details: `Access check on-chain for patient ${patient.name} (${patient.id}): ${hasAccess}`,
      });

      if (hasAccess) {
        const patientRecords = recordService.listRecordsByPatient(patient.id);
        patientRecords.forEach((rec) => {
          const pub = rec.toPublicMetadata();
          pub.patientName = patient.name;
          pub.patientWalletAddress = patient.walletAddress;
          accessibleRecords.push(pub);
        });
      }
    } catch (err) {
      // If blockchain is not configured/reachable, propagate error so we don't silently hide or fake permissions
      return {
        statusCode: 503,
        body: {
          error: `Blockchain check failed: ${err.message}`,
        },
      };
    }
  }

  return {
    statusCode: 200,
    body: {
      providerId,
      records: accessibleRecords,
    },
  };
}

module.exports = { getAccessibleRecords };
