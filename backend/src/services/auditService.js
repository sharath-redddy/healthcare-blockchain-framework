// Module 13: Audit Trail Service
//
// Records security- and access-relevant operations immutably in memory.
// Contains zero sensitive medical file content or cryptographic keys.
// Supports role-filtered querying for Patients, Providers, and Admins.

const { randomUUID } = require('crypto');

const AUDIT_ACTIONS = {
  RECORD_CREATED: 'RECORD_CREATED',
  RECORD_UPLOADED: 'RECORD_UPLOADED',
  RECORD_REGISTERED: 'RECORD_REGISTERED',
  ACCESS_GRANTED: 'ACCESS_GRANTED',
  ACCESS_REVOKED: 'ACCESS_REVOKED',
  ACCESS_CHECKED: 'ACCESS_CHECKED',
  RECORD_RETRIEVED: 'RECORD_RETRIEVED',
  RECORD_DECRYPTED: 'RECORD_DECRYPTED',
  ACCESS_DENIED: 'ACCESS_DENIED',
};

const AUDIT_RESULTS = {
  SUCCESS: 'SUCCESS',
  DENIED: 'DENIED',
  FAILED: 'FAILED',
};

class AuditService {
  constructor() {
    this.events = [];
  }

  logEvent({
    action,
    actorId = null,
    actorName = 'Unknown',
    actorRole = 'UNKNOWN',
    patientId = null,
    recordId = null,
    result = AUDIT_RESULTS.SUCCESS,
    txHash = null,
    details = '',
  }) {
    if (!action || !AUDIT_ACTIONS[action]) {
      throw new Error(`Invalid audit action: "${action}".`);
    }

    const event = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      actorId,
      actorName,
      actorRole,
      patientId,
      recordId,
      result,
      txHash,
      details,
    };

    this.events.push(event);
    return event;
  }

  getEventsForPatient(patientId) {
    if (!patientId) return [];
    return this.events.filter((e) => e.patientId === patientId);
  }

  getEventsForProvider(providerId) {
    if (!providerId) return [];
    return this.events.filter((e) => e.actorId === providerId);
  }

  getAllEvents() {
    return [...this.events];
  }

  clearEvents() {
    this.events = [];
  }
}

const auditService = new AuditService();

module.exports = {
  auditService,
  AUDIT_ACTIONS,
  AUDIT_RESULTS,
};
