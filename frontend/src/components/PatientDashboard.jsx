// Module 3, 4, 5, 6, 9, 12, 13: Enhanced Patient Portal
// Full patient-centric workflow:
// - Identity & wallet management
// - AES-256 encrypted medical record uploads to IPFS
// - Patient-controlled access granting & revoking for doctors
// - Decrypted download of their own records
// - Immutable audit trail viewing

import { useState, useEffect, useCallback } from 'react';
import {
  fetchUsers,
  registerUser,
  linkWallet,
  uploadRecord,
  fetchRecordsForPatient,
  encryptedFileDownloadUrl,
  downloadDecryptedRecord,
  grantAccess,
  revokeAccess,
  fetchAccessStatus,
  fetchAuditLogs,
} from '../api/backend';
import { ROLES } from '../constants/roles';
import AuditView from './AuditView';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function PatientDashboard({ connectedWallet }) {
  const [patients, setPatients] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [newPatientName, setNewPatientName] = useState('');
  const [walletInput, setWalletInput] = useState('');
  const [records, setRecords] = useState([]);
  const [file, setFile] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);

  // Access management sub-state
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [accessStatus, setAccessStatus] = useState(null);

  const [activeTab, setActiveTab] = useState('records'); // 'records' | 'upload' | 'access' | 'audit'
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusType, setStatusType] = useState('info');
  const [busy, setBusy] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const data = await fetchUsers();
      const pts = (data.users || []).filter((u) => u.role === ROLES.PATIENT);
      const prvs = (data.users || []).filter((u) => u.role === ROLES.DOCTOR || u.role === ROLES.HOSPITAL_ADMIN);
      setPatients(pts);
      setProviders(prvs);
      if (pts.length > 0 && !selectedPatientId) {
        setSelectedPatientId(pts[0].id);
      }
    } catch (err) {
      setStatusType('error');
      setStatusMessage(`Failed to reach backend: ${err.message}`);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  const loadPatientData = useCallback(async (patientId) => {
    if (!patientId) {
      setRecords([]);
      setAuditEvents([]);
      return;
    }
    try {
      // 1. Records
      const recs = await fetchRecordsForPatient(patientId);
      setRecords(recs || []);

      // 2. Audit logs
      try {
        const logs = await fetchAuditLogs({ patientId });
        setAuditEvents(logs || []);
      } catch {
        setAuditEvents([]);
      }
    } catch (err) {
      setStatusType('error');
      setStatusMessage(err.message);
    }
  }, []);

  useEffect(() => {
    loadPatientData(selectedPatientId);
  }, [selectedPatientId, loadPatientData]);

  const checkAccessStatus = useCallback(async () => {
    if (!selectedPatientId || !selectedProviderId) {
      setAccessStatus(null);
      return;
    }
    try {
      const status = await fetchAccessStatus({ patientId: selectedPatientId, providerId: selectedProviderId });
      setAccessStatus(status);
    } catch (err) {
      setAccessStatus(null);
      setStatusType('error');
      setStatusMessage(err.message);
    }
  }, [selectedPatientId, selectedProviderId]);

  useEffect(() => {
    checkAccessStatus();
  }, [checkAccessStatus]);

  async function handleRegisterPatient(e) {
    e.preventDefault();
    if (!newPatientName.trim()) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      const user = await registerUser({ name: newPatientName.trim(), role: ROLES.PATIENT });
      setNewPatientName('');
      await loadUsers();
      setSelectedPatientId(user.id);
      setStatusType('success');
      setStatusMessage(`Registered patient "${user.name}".`);
    } catch (err) {
      setStatusType('error');
      setStatusMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLinkWallet(addrToLink) {
    const targetAddr = addrToLink || walletInput.trim();
    if (!selectedPatientId) {
      setStatusType('error');
      setStatusMessage('Select a patient first.');
      return;
    }
    if (!targetAddr) {
      setStatusType('error');
      setStatusMessage('Enter a valid wallet address.');
      return;
    }
    setBusy(true);
    setStatusMessage(null);
    try {
      await linkWallet({ userId: selectedPatientId, walletAddress: targetAddr });
      setStatusType('success');
      setStatusMessage('Wallet linked to patient profile.');
      setWalletInput('');
      await loadUsers();
      await loadPatientData(selectedPatientId);
    } catch (err) {
      setStatusType('error');
      setStatusMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!selectedPatientId) {
      setStatusType('error');
      setStatusMessage('Please select a patient first.');
      return;
    }
    if (!file) {
      setStatusType('error');
      setStatusMessage('Please select a medical file to upload.');
      return;
    }

    setBusy(true);
    setStatusMessage(null);
    try {
      const record = await uploadRecord({ patientId: selectedPatientId, file });
      setStatusType('success');
      setStatusMessage(
        `Uploaded "${record.originalFilename}" — AES-256 encrypted and stored in ${record.isMockIpfs ? 'local mock IPFS storage' : 'IPFS'} (CID: ${record.cid}).`
      );
      setFile(null);
      await loadPatientData(selectedPatientId);
      setActiveTab('records');
    } catch (err) {
      setStatusType('error');
      setStatusMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGrant() {
    setBusy(true);
    setStatusMessage(null);
    try {
      const res = await grantAccess({ patientId: selectedPatientId, providerId: selectedProviderId });
      setStatusType('success');
      setStatusMessage(`Access granted on-chain (tx: ${res.txHash}). Doctor can now retrieve encrypted records.`);
      await checkAccessStatus();
      await loadPatientData(selectedPatientId);
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
      const res = await revokeAccess({ patientId: selectedPatientId, providerId: selectedProviderId });
      setStatusType('success');
      setStatusMessage(`Access revoked on-chain (tx: ${res.txHash}). Doctor can no longer retrieve records.`);
      await checkAccessStatus();
      await loadPatientData(selectedPatientId);
    } catch (err) {
      setStatusType('error');
      setStatusMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadDecrypted(rec) {
    setBusy(true);
    setStatusMessage(null);
    try {
      const res = await downloadDecryptedRecord({
        recordId: rec.id,
        requesterId: selectedPatientId,
        defaultFilename: rec.originalFilename,
      });
      setStatusType('success');
      setStatusMessage(`Decrypted & downloaded "${res.filename}" (${res.sizeBytes} bytes).`);
      await loadPatientData(selectedPatientId);
    } catch (err) {
      setStatusType('error');
      setStatusMessage(`Decryption failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-container">
      <div className="portal-header">
        <div>
          <h2>👤 Patient Healthcare Portal</h2>
          <p className="portal-subtitle">
            Complete sovereignty over your medical records, encryption keys, and healthcare provider access.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className={`portal-alert alert-${statusType}`}>
          {statusType === 'error' ? '⚠️ ' : statusType === 'success' ? '✅ ' : 'ℹ️ '}
          {statusMessage}
        </div>
      )}

      {/* Patient Profile & Wallet Selector */}
      <div className="portal-card">
        <div className="portal-card-header">
          <h3>1. Patient Identity & Blockchain Wallet</h3>
        </div>
        <div className="profile-grid">
          <div>
            <label className="field-label">Active Patient Profile:</label>
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="portal-select"
            >
              <option value="">— Select Patient —</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.walletAddress ? `(${p.walletAddress.slice(0, 8)}...)` : '(No wallet)'}
                </option>
              ))}
            </select>

            <form onSubmit={handleRegisterPatient} className="inline-form" style={{ marginTop: '1rem' }}>
              <input
                type="text"
                placeholder="Register new patient (e.g. asha)"
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                className="portal-input"
              />
              <button type="submit" disabled={busy} className="portal-btn-secondary">
                Register
              </button>
            </form>
          </div>

          <div className="key-management-box">
            <h4>Blockchain Wallet Address</h4>
            <p className="box-note">
              <strong>Linked Wallet:</strong>{' '}
              {selectedPatient?.walletAddress ? (
                <span className="mono-badge">{selectedPatient.walletAddress}</span>
              ) : (
                <span className="warning-badge">No wallet linked</span>
              )}
            </p>

            {connectedWallet && selectedPatient && selectedPatient.walletAddress !== connectedWallet && (
              <button
                className="portal-btn-accent"
                onClick={() => handleLinkWallet(connectedWallet)}
                disabled={busy}
                style={{ marginBottom: '0.75rem' }}
              >
                🦊 Link Connected MetaMask ({connectedWallet.slice(0, 6)}...{connectedWallet.slice(-4)})
              </button>
            )}

            {!selectedPatient?.walletAddress && (
              <div className="inline-form">
                <input
                  type="text"
                  placeholder="0x... enter wallet address"
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  className="portal-input"
                />
                <button
                  type="button"
                  onClick={() => handleLinkWallet(walletInput)}
                  disabled={busy}
                  className="portal-btn-primary"
                >
                  Link
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Subtab Navigation */}
      <div className="subtab-bar">
        <button
          className={`subtab-btn ${activeTab === 'records' ? 'active' : ''}`}
          onClick={() => setActiveTab('records')}
        >
          📁 My Medical Records ({records.length})
        </button>
        <button
          className={`subtab-btn ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          ⬆️ Upload New Record
        </button>
        <button
          className={`subtab-btn ${activeTab === 'access' ? 'active' : ''}`}
          onClick={() => setActiveTab('access')}
        >
          🔐 Access Control & Permissions
        </button>
        <button
          className={`subtab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          📋 Audit Trail History ({auditEvents.length})
        </button>
      </div>

      {/* 1. Records Tab */}
      {activeTab === 'records' && (
        <div className="portal-card">
          <div className="portal-card-header">
            <h3>Medical Records Stored Off-Chain</h3>
            <p className="portal-card-sub">
              Encrypted with AES-256 before upload. Plaintext never leaves your session.
            </p>
          </div>

          {!selectedPatientId ? (
            <p className="empty-notice">Select a patient above to view records.</p>
          ) : records.length === 0 ? (
            <div className="empty-notice">
              <p>No medical records uploaded yet.</p>
              <button className="portal-btn-primary" onClick={() => setActiveTab('upload')}>
                Upload your first record
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>IPFS Storage (CID)</th>
                    <th>On-Chain Tx</th>
                    <th>Uploaded</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.originalFilename}</strong>
                      </td>
                      <td>
                        <span className="mime-badge">{r.mimeType}</span>
                      </td>
                      <td>{formatSize(r.sizeBytes)}</td>
                      <td>
                        <span className="mono-badge" title={r.cid}>
                          {r.cid.slice(0, 14)}...
                        </span>
                        <span className="storage-tag">{r.isMockIpfs ? 'Local IPFS' : 'Pinata IPFS'}</span>
                      </td>
                      <td>
                        {r.txHash ? (
                          <span className="tx-hash-badge" title={r.txHash}>
                            {r.txHash.slice(0, 8)}...
                          </span>
                        ) : (
                          <span className="tx-none">—</span>
                        )}
                      </td>
                      <td>{new Date(r.uploadedAt).toLocaleDateString()}</td>
                      <td className="action-buttons-cell">
                        <button
                          className="portal-btn-primary action-decrypt-btn"
                          onClick={() => handleDownloadDecrypted(r)}
                          disabled={busy}
                        >
                          🔓 Decrypt & View
                        </button>
                        <a
                          href={encryptedFileDownloadUrl(r.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="portal-link-secondary"
                        >
                          📦 Raw Encrypted File
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 2. Upload Tab */}
      {activeTab === 'upload' && (
        <div className="portal-card">
          <div className="portal-card-header">
            <h3>Upload & Encrypt Medical File</h3>
            <p className="portal-card-sub">
              Files are AES-256 encrypted using an ephemeral file key, pinned to IPFS, and registered on Layer-2 blockchain.
            </p>
          </div>

          <form onSubmit={handleUpload} className="upload-box-form">
            <div className="file-drop-zone">
              <span className="drop-icon">📄</span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt"
                onChange={(e) => setFile(e.target.files[0] || null)}
                className="file-input-hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="file-input-label">
                {file ? file.name : 'Click to select a medical file'}
              </label>
              <p className="file-formats-hint">Supported: PDF, PNG, JPEG, TXT (Synthetic/demo data only)</p>
            </div>

            <button type="submit" disabled={busy || !file} className="portal-btn-primary upload-submit-btn">
              {busy ? '🔒 Encrypting & Pinning to IPFS...' : '🔒 Encrypt & Upload to IPFS'}
            </button>
          </form>
        </div>
      )}

      {/* 3. Access Management Tab */}
      {activeTab === 'access' && (
        <div className="portal-card">
          <div className="portal-card-header">
            <h3>Smart Contract Access Control</h3>
            <p className="portal-card-sub">
              Grant or revoke permission for specific doctors on the Layer-2 blockchain.
            </p>
          </div>

          <div className="access-management-box">
            <label className="field-label">Select Healthcare Provider / Doctor:</label>
            <select
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(e.target.value)}
              className="portal-select"
            >
              <option value="">— Select Doctor / Hospital —</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role}) {p.walletAddress ? `[${p.walletAddress.slice(0, 8)}...]` : '[No Wallet]'}
                </option>
              ))}
            </select>

            {selectedProviderId && (
              <div className="access-status-indicator">
                <strong>Current On-Chain Status: </strong>
                {accessStatus?.accessGranted ? (
                  <span className="success-badge">✅ Access Granted</span>
                ) : (
                  <span className="warning-badge">⛔ Access Denied / Not Granted</span>
                )}

                <div className="access-btn-row" style={{ marginTop: '1.25rem' }}>
                  <button
                    className="portal-btn-primary"
                    onClick={handleGrant}
                    disabled={busy || accessStatus?.accessGranted}
                  >
                    Grant Doctor Access
                  </button>
                  <button
                    className="portal-btn-danger"
                    onClick={handleRevoke}
                    disabled={busy || !accessStatus?.accessGranted}
                  >
                    Revoke Doctor Access
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Audit Tab */}
      {activeTab === 'audit' && (
        <AuditView
          events={auditEvents}
          title="My Personal Healthcare Audit Trail"
          emptyMessage="No access or upload activity logged for your records yet."
        />
      )}
    </div>
  );
}

export default PatientDashboard;
