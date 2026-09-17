// Module 9: Patient-Centric Grant/Revoke Access
//
// Lets a patient link a wallet address, pick a registered doctor or
// hospital, and grant/revoke that provider's access — with status read
// straight from the backend's /api/access/:patient/:provider endpoint,
// which itself reads from the chain (not a separate fake permission
// store). Built on top of Module 2's existing user list without
// modifying RoleDemo/PatientDashboard.

import { useState, useEffect, useCallback } from 'react';
import {
  fetchUsers,
  linkWallet,
  grantAccess,
  revokeAccess,
  fetchAccessStatus,
} from '../api/backend';
import { ROLES } from '../constants/roles';

function AccessManagement() {
  const [patients, setPatients] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [walletInput, setWalletInput] = useState('');
  const [accessStatus, setAccessStatus] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusType, setStatusType] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const data = await fetchUsers();
      setPatients(data.users.filter((u) => u.role === ROLES.PATIENT));
      setProviders(data.users.filter((u) => u.role === ROLES.DOCTOR || u.role === ROLES.HOSPITAL_ADMIN));
    } catch (err) {
      setStatusType('error');
      setStatusMessage(`Could not reach backend: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const selectedProvider = providers.find((p) => p.id === selectedProviderId);

  const checkStatus = useCallback(async () => {
    if (!selectedPatientId || !selectedProviderId) {
      setAccessStatus(null);
      return;
    }
    try {
      const status = await fetchAccessStatus({ patientId: selectedPatientId, providerId: selectedProviderId });
      setAccessStatus(status);
    } catch (err) {
      // A 503 (blockchain not configured/reachable) surfaces here as a
      // thrown error — shown as status text rather than a silent guess.
      setAccessStatus(null);
      setStatusType('error');
      setStatusMessage(err.message);
    }
  }, [selectedPatientId, selectedProviderId]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  async function handleLinkWallet(e) {
    e.preventDefault();
    if (!selectedPatientId) {
      setStatusType('error');
      setStatusMessage('Select a patient first.');
      return;
    }
    try {
      await linkWallet({ userId: selectedPatientId, walletAddress: walletInput.trim() });
      setStatusType('success');
      setStatusMessage('Wallet linked.');
      setWalletInput('');
      await loadUsers();
    } catch (err) {
      setStatusType('error');
      setStatusMessage(err.message);
    }
  }

  async function handleGrant() {
    setBusy(true);
    setStatusMessage(null);
    try {
      const result = await grantAccess({ patientId: selectedPatientId, providerId: selectedProviderId });
      setStatusType('success');
      setStatusMessage(`Access granted (tx: ${result.txHash}).`);
      await checkStatus();
    } catch (err) {
      setStatusType('error');
      setStatusMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    setBusy(true);
    setStatusMessage(null);
    try {
      const result = await revokeAccess({ patientId: selectedPatientId, providerId: selectedProviderId });
      setStatusType('success');
      setStatusMessage(`Access revoked (tx: ${result.txHash}).`);
      await checkStatus();
    } catch (err) {
      setStatusType('error');
      setStatusMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="access-management">
      <h2>Access Management (Module 9)</h2>
      <p className="access-management-note">
        Grant/revoke is enforced on-chain via the HealthcareRecords smart contract —
        this reads and writes real contract state, not a separate frontend-only
        permission list. Requires a locally running Hardhat node (or configured L2
        testnet) with the contract deployed; otherwise actions below will show a
        clear "blockchain not configured" error rather than pretending to succeed.
      </p>

      <section className="access-select">
        <h3>1. Choose patient and provider</h3>
        <div className="access-select-row">
          <select value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)}>
            <option value="">— select a patient —</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.walletAddress ? '' : ' (no wallet linked)'}
              </option>
            ))}
          </select>

          <select value={selectedProviderId} onChange={(e) => setSelectedProviderId(e.target.value)}>
            <option value="">— select a doctor/hospital —</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.role === ROLES.DOCTOR ? 'Doctor' : 'Hospital Admin'})
                {p.walletAddress ? '' : ' (no wallet linked)'}
              </option>
            ))}
          </select>
        </div>

        <form onSubmit={handleLinkWallet} className="wallet-link-form">
          <input
            type="text"
            value={walletInput}
            onChange={(e) => setWalletInput(e.target.value)}
            placeholder="Link a wallet to the selected patient (0x...)"
          />
          <button type="submit">Link Wallet</button>
        </form>
        <p className="access-hint">
          Doctors/hospitals need a linked wallet too — register them and link a
          wallet the same way from the Role Registration section above (each
          registered user can have a wallet address attached).
        </p>
      </section>

      <section className="access-actions">
        <h3>2. Access status</h3>
        {!selectedPatient || !selectedProvider ? (
          <p className="access-empty">Select both a patient and a provider to check/manage access.</p>
        ) : (
          <>
            <p className="access-status-line">
              <strong>{selectedPatient.name}</strong> →{' '}
              <strong>{selectedProvider.name}</strong>:{' '}
              {accessStatus
                ? accessStatus.accessGranted
                  ? '✅ Access granted'
                  : accessStatus.chainChecked
                    ? '⛔ Access not granted'
                    : '— not yet checked on-chain (link both wallets first)'
                : '—'}
            </p>
            <div className="access-buttons">
              <button type="button" onClick={handleGrant} disabled={busy}>
                Grant Access
              </button>
              <button type="button" onClick={handleRevoke} disabled={busy}>
                Revoke Access
              </button>
            </div>
          </>
        )}
      </section>

      {statusMessage && (
        <p className={`access-management-status access-management-status-${statusType}`}>
          {statusMessage}
        </p>
      )}
    </div>
  );
}

export default AccessManagement;
