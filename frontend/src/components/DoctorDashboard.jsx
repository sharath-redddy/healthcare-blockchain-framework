// Module 11 & 12: Doctor / Provider Dashboard
// Lets a doctor select their identity, link a wallet, initialize an RSA key pair,
// query records they have been granted access to on-chain, and decrypt & retrieve them.

import { useState, useEffect, useCallback } from 'react';
import {
  fetchUsers,
  registerUser,
  linkWallet,
  generateKeysForUser,
  fetchUserPublicKey,
  fetchAccessibleRecords,
  downloadDecryptedRecord,
  fetchAuditLogs,
} from '../api/backend';
import { ROLES } from '../constants/roles';
import AuditView from './AuditView';

function DoctorDashboard({ connectedWallet }) {
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [newDoctorName, setNewDoctorName] = useState('');
  const [walletInput, setWalletInput] = useState('');
  const [publicKey, setPublicKey] = useState(null);
  const [accessibleRecords, setAccessibleRecords] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusType, setStatusType] = useState('info'); // 'success' | 'error' | 'info'
  const [busy, setBusy] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('records'); // 'records' | 'audit'

  const loadDoctors = useCallback(async () => {
    try {
      const data = await fetchUsers();
      const docs = data.users.filter((u) => u.role === ROLES.DOCTOR);
      setDoctors(docs);
      if (docs.length > 0 && !selectedDoctorId) {
        setSelectedDoctorId(docs[0].id);
      }
    } catch (err) {
      setStatusType('error');
      setStatusMessage(`Error loading doctors: ${err.message}`);
    }
  }, [selectedDoctorId]);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);

  const loadDoctorData = useCallback(async (docId) => {
    if (!docId) {
      setAccessibleRecords([]);
      setPublicKey(null);
      setAuditEvents([]);
      return;
    }

    try {
      // 1. Fetch public key
      try {
        const keyData = await fetchUserPublicKey(docId);
        setPublicKey(keyData.publicKey);
      } catch {
        setPublicKey(null);
      }

      // 2. Fetch accessible records
      try {
        const recordsData = await fetchAccessibleRecords({ providerId: docId });
        setAccessibleRecords(recordsData.records || []);
      } catch (err) {
        setAccessibleRecords([]);
        setStatusType('error');
        setStatusMessage(`Accessible records query failed: ${err.message}`);
      }

      // 3. Fetch audit logs for this provider
      try {
        const logs = await fetchAuditLogs({ providerId: docId });
        setAuditEvents(logs);
      } catch {
        setAuditEvents([]);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadDoctorData(selectedDoctorId);
  }, [selectedDoctorId, loadDoctorData]);

  async function handleRegisterDoctor(e) {
    e.preventDefault();
    if (!newDoctorName.trim()) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      const user = await registerUser({ name: newDoctorName.trim(), role: ROLES.DOCTOR });
      setNewDoctorName('');
      await loadDoctors();
      setSelectedDoctorId(user.id);
      setStatusType('success');
      setStatusMessage(`Doctor profile "${user.name}" registered successfully.`);
    } catch (err) {
      setStatusType('error');
      setStatusMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLinkWallet(addressToLink) {
    const targetAddr = addressToLink || walletInput.trim();
    if (!selectedDoctorId) {
      setStatusType('error');
      setStatusMessage('Please select a doctor profile first.');
      return;
    }
    if (!targetAddr) {
      setStatusType('error');
      setStatusMessage('Please enter a wallet address.');
      return;
    }

    setBusy(true);
    setStatusMessage(null);
    try {
      await linkWallet({ userId: selectedDoctorId, walletAddress: targetAddr });
      setStatusType('success');
      setStatusMessage(`Linked wallet ${targetAddr} to doctor profile.`);
      setWalletInput('');
      await loadDoctors();
      await loadDoctorData(selectedDoctorId);
    } catch (err) {
      setStatusType('error');
      setStatusMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateKeys() {
    if (!selectedDoctorId) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      const keyData = await generateKeysForUser(selectedDoctorId);
      setPublicKey(keyData.publicKey);
      setStatusType('success');
      setStatusMessage('RSA-OAEP 2048-bit key pair generated successfully.');
      await loadDoctorData(selectedDoctorId);
    } catch (err) {
      setStatusType('error');
      setStatusMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDecryptAndDownload(record) {
    setBusy(true);
    setStatusMessage(null);
    try {
      const result = await downloadDecryptedRecord({
        recordId: record.id,
        requesterId: selectedDoctorId,
        defaultFilename: record.originalFilename,
      });
      setStatusType('success');
      setStatusMessage(
        `Successfully decrypted and downloaded "${result.filename}" (${result.sizeBytes} bytes) using RSA-OAEP key unwrapping.`
      );
      await loadDoctorData(selectedDoctorId);
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
          <h2>🩺 Doctor & Healthcare Provider Portal</h2>
          <p className="portal-subtitle">
            Access authorized patient medical records via Layer-2 smart contract permission verification.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className={`portal-alert alert-${statusType}`}>
          {statusType === 'error' ? '⚠️ ' : statusType === 'success' ? '✅ ' : 'ℹ️ '}
          {statusMessage}
        </div>
      )}

      {/* Profile & Wallet Card */}
      <div className="portal-card">
        <div className="portal-card-header">
          <h3>1. Provider Identity & Cryptographic Keys</h3>
        </div>
        <div className="profile-grid">
          <div>
            <label className="field-label">Select Active Doctor Profile:</label>
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="portal-select"
            >
              <option value="">— Select Doctor —</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.walletAddress ? `(${d.walletAddress.slice(0, 8)}...)` : '(No wallet)'}
                </option>
              ))}
            </select>

            <form onSubmit={handleRegisterDoctor} className="inline-form" style={{ marginTop: '1rem' }}>
              <input
                type="text"
                placeholder="Register new doctor (e.g. Dr. Rao)"
                value={newDoctorName}
                onChange={(e) => setNewDoctorName(e.target.value)}
                className="portal-input"
              />
              <button type="submit" disabled={busy} className="portal-btn-secondary">
                Register Doctor
              </button>
            </form>
          </div>

          <div className="key-management-box">
            <h4>Wallet & RSA Encryption Key</h4>
            <p className="box-note">
              <strong>Linked Wallet:</strong>{' '}
              {selectedDoctor?.walletAddress ? (
                <span className="mono-badge">{selectedDoctor.walletAddress}</span>
              ) : (
                <span className="warning-badge">No wallet linked</span>
              )}
            </p>

            {connectedWallet && selectedDoctor && selectedDoctor.walletAddress !== connectedWallet && (
              <button
                className="portal-btn-accent"
                onClick={() => handleLinkWallet(connectedWallet)}
                disabled={busy}
                style={{ marginBottom: '0.75rem' }}
              >
                🦊 Link Connected MetaMask ({connectedWallet.slice(0, 6)}...{connectedWallet.slice(-4)})
              </button>
            )}

            {!selectedDoctor?.walletAddress && (
              <div className="inline-form">
                <input
                  type="text"
                  placeholder="0x... manual wallet address"
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

            <div style={{ marginTop: '1rem' }}>
              <strong>RSA-OAEP 2048-bit Key Status: </strong>
              {publicKey ? (
                <span className="success-badge">Ready for Envelope Decryption</span>
              ) : (
                <span className="warning-badge">Not Generated</span>
              )}
              <button
                type="button"
                onClick={handleGenerateKeys}
                disabled={busy || !selectedDoctorId}
                className="portal-btn-secondary"
                style={{ marginLeft: '1rem' }}
              >
                {publicKey ? '🔄 Re-generate Keys' : '🔑 Generate RSA Keypair'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="subtab-bar">
        <button
          className={`subtab-btn ${activeSubTab === 'records' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('records')}
        >
          📂 Authorized Records ({accessibleRecords.length})
        </button>
        <button
          className={`subtab-btn ${activeSubTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('audit')}
        >
          📋 My Access Audit Trail ({auditEvents.length})
        </button>
        <button
          className="subtab-btn refresh-btn"
          onClick={() => loadDoctorData(selectedDoctorId)}
          disabled={busy}
        >
          🔄 Refresh Permissions
        </button>
      </div>

      {/* Main Content Area */}
      {activeSubTab === 'records' ? (
        <div className="portal-card">
          <div className="portal-card-header">
            <h3>2. Accessible Patient Healthcare Records</h3>
            <p className="portal-card-sub">
              Access is verified server-side against smart contract permission mapping. Unauthorized attempts are rejected and logged.
            </p>
          </div>

          {!selectedDoctorId ? (
            <p className="empty-notice">Select a doctor profile above to view authorized records.</p>
          ) : accessibleRecords.length === 0 ? (
            <div className="empty-notice">
              <p>No medical records currently accessible.</p>
              <span className="hint-text">
                Patients must grant access to your linked wallet address on the blockchain to enable record retrieval.
              </span>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Patient Name</th>
                    <th>Document</th>
                    <th>MIME Type</th>
                    <th>IPFS Storage CID</th>
                    <th>Uploaded</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accessibleRecords.map((rec) => (
                    <tr key={rec.id}>
                      <td>
                        <strong>{rec.patientName}</strong>
                      </td>
                      <td>{rec.originalFilename}</td>
                      <td>
                        <span className="mime-badge">{rec.mimeType}</span>
                      </td>
                      <td>
                        <span className="mono-badge" title={rec.cid}>
                          {rec.cid.slice(0, 16)}...
                        </span>
                      </td>
                      <td>{new Date(rec.uploadedAt).toLocaleDateString()}</td>
                      <td>
                        <button
                          className="portal-btn-primary action-decrypt-btn"
                          onClick={() => handleDecryptAndDownload(rec)}
                          disabled={busy}
                        >
                          🔓 Decrypt & Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <AuditView
          events={auditEvents}
          title="Doctor Access Audit Trail"
          emptyMessage="No access events logged for this doctor yet."
        />
      )}
    </div>
  );
}

export default DoctorDashboard;
