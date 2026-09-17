// Module 4 / Module 6: Record metadata service
//
// In-memory store only, same pattern as userService.js from Module 2.
// No database is introduced — not required to demonstrate the upload
// -> encrypt -> IPFS -> metadata pipeline for this prototype phase.
// Function signatures are written so a persistent store could replace
// the Map below later without callers (routes/tests) changing.

const MedicalRecord = require('../models/Record');

const recordsById = new Map();

function createRecord(data) {
  const record = new MedicalRecord(data);
  recordsById.set(record.id, record);
  return record;
}

function getRecordById(id) {
  return recordsById.get(id) || null;
}

function listRecordsByPatient(patientId) {
  return Array.from(recordsById.values()).filter((r) => r.patientId === patientId);
}

// Test-only helper for isolating test runs. Not used by production routes.
function clearRecords() {
  recordsById.clear();
}

module.exports = { createRecord, getRecordById, listRecordsByPatient, clearRecords };
