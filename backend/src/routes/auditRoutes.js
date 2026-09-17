// Module 13: Audit Trail Routes
//
// Exposes audit logs with role-based filtering:
// - Patients see activity for their records
// - Providers see their own access activity
// - Admins see system-wide logs (strictly metadata, zero medical content)

const { auditService } = require('../services/auditService');
const userService = require('../services/userService');
const { ROLES } = require('../constants/roles');

function getAuditLogs({ patientId, providerId, adminId }) {
  if (adminId) {
    const admin = userService.getUserById(adminId);
    if (!admin) {
      return { statusCode: 404, body: { error: `No user found with id "${adminId}".` } };
    }
    if (admin.role !== ROLES.HOSPITAL_ADMIN) {
      return { statusCode: 403, body: { error: `User "${adminId}" is not a HOSPITAL_ADMIN.` } };
    }
    return { statusCode: 200, body: { events: auditService.getAllEvents() } };
  }

  if (patientId) {
    const patient = userService.getUserById(patientId);
    if (!patient) {
      return { statusCode: 404, body: { error: `No user found with id "${patientId}".` } };
    }
    if (patient.role !== ROLES.PATIENT) {
      return { statusCode: 403, body: { error: `User "${patientId}" is not a PATIENT.` } };
    }
    return { statusCode: 200, body: { events: auditService.getEventsForPatient(patientId) } };
  }

  if (providerId) {
    const provider = userService.getUserById(providerId);
    if (!provider) {
      return { statusCode: 404, body: { error: `No user found with id "${providerId}".` } };
    }
    if (provider.role !== ROLES.DOCTOR && provider.role !== ROLES.HOSPITAL_ADMIN) {
      return { statusCode: 403, body: { error: `User "${providerId}" is not a DOCTOR or HOSPITAL_ADMIN.` } };
    }
    return { statusCode: 200, body: { events: auditService.getEventsForProvider(providerId) } };
  }

  return {
    statusCode: 400,
    body: { error: 'One of patientId, providerId, or adminId query parameter is required.' },
  };
}

module.exports = { getAuditLogs };
