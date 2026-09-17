// Module 13 & Administrative Dashboard
// Enables hospital administrators to monitor system health, user registries,
// and system-wide audit logs without exposing plaintext medical data.

import { useState, useEffect, useCallback } from 'react';
import { fetchUsers, registerUser, fetchAuditLogs } from '../api/backend';
import { ROLES } from '../constants/roles';
import AuditView from './AuditView';

function AdminDashboard() {
  const [admins, setAdmins] = useState([]);
  const [selectedAdminId, setSelectedAdminId] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [systemAuditEvents, setSystemAuditEvents] = useState([]);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'users' | 'audit'
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusType, setStatusType] = useState('info');
  const [busy, setBusy] = useState(false);

  const loadAdminsAndUsers = useCallback(async () => {
    try {
      const data = await fetchUsers();
      setAllUsers(data.users || []);
      const adminList = (data.users || []).filter((u) => u.role === ROLES.HOSPITAL_ADMIN);
      setAdmins(adminList);
      if (adminList.length > 0 && !selectedAdminId) {
        setSelectedAdminId(adminList[0].id);
      }
    } catch (err) {
      setStatusType('error');
      setStatusMessage(`Error fetching users: ${err.message}`);
    }
  }, [selectedAdminId]);

  useEffect(() => {
    loadAdminsAndUsers();
  }, [loadAdminsAndUsers]);

  const loadAuditEvents = useCallback(async (adminId) => {
    if (!adminId) {
      setSystemAuditEvents([]);
      return;
    }
    try {
      const logs = await fetchAuditLogs({ adminId });
      setSystemAuditEvents(logs || []);
    } catch (err) {
      setStatusType('error');
      setStatusMessage(`Failed to fetch admin audit logs: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    loadAuditEvents(selectedAdminId);
  }, [selectedAdminId, loadAuditEvents]);

  async function handleRegisterAdmin(e) {
    e.preventDefault();
    if (!newAdminName.trim()) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      const user = await registerUser({ name: newAdminName.trim(), role: ROLES.HOSPITAL_ADMIN });
      setNewAdminName('');
      await loadAdminsAndUsers();
      setSelectedAdminId(user.id);
      setStatusType('success');
      setStatusMessage(`Hospital Admin "${user.name}" registered.`);
    } catch (err) {
      setStatusType('error');
      setStatusMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  const patientCount = allUsers.filter((u) => u.role === ROLES.PATIENT).length;
  const doctorCount = allUsers.filter((u) => u.role === ROLES.DOCTOR).length;
  const adminCount = allUsers.filter((u) => u.role === ROLES.HOSPITAL_ADMIN).length;

  return (
    <div className="portal-container">
      <div className="portal-header">
        <div>
          <h2>🏥 Hospital Administrator Portal</h2>
          <p className="portal-subtitle">
            System governance, infrastructure metrics, and comprehensive audit oversight.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className={`portal-alert alert-${statusType}`}>
          {statusType === 'error' ? '⚠️ ' : statusType === 'success' ? '✅ ' : 'ℹ️ '}
          {statusMessage}
        </div>
      )}

      {/* Admin Selector */}
      <div className="portal-card">
        <div className="portal-card-header">
          <h3>Administrator Session</h3>
        </div>
        <div className="profile-grid">
          <div>
            <label className="field-label">Active Admin Profile:</label>
            <select
              value={selectedAdminId}
              onChange={(e) => setSelectedAdminId(e.target.value)}
              className="portal-select"
            >
              <option value="">— Select Admin —</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">Register New Admin:</label>
            <form onSubmit={handleRegisterAdmin} className="inline-form">
              <input
                type="text"
                placeholder="Admin name (e.g. Chief Info Officer)"
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                className="portal-input"
              />
              <button type="submit" disabled={busy} className="portal-btn-secondary">
                Register
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="subtab-bar">
        <button
          className={`subtab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 System Overview
        </button>
        <button
          className={`subtab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          👥 User Registry ({allUsers.length})
        </button>
        <button
          className={`subtab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          📋 System Audit Trail ({systemAuditEvents.length})
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="overview-grid">
          <div className="stat-card">
            <span className="stat-icon">👥</span>
            <div className="stat-value">{allUsers.length}</div>
            <div className="stat-label">Total Registered Users</div>
            <div className="stat-sub">
              {patientCount} Patients | {doctorCount} Doctors | {adminCount} Admins
            </div>
          </div>

          <div className="stat-card">
            <span className="stat-icon">⛓️</span>
            <div className="stat-value">Layer-2</div>
            <div className="stat-label">Blockchain Infrastructure</div>
            <div className="stat-sub">Smart Contract: HealthcareRecords.sol</div>
          </div>

          <div className="stat-card">
            <span className="stat-icon">🗄️</span>
            <div className="stat-value">IPFS / Pinata</div>
            <div className="stat-label">Decentralized Storage</div>
            <div className="stat-sub">Encrypted Blobs Only (Zero Plaintext)</div>
          </div>

          <div className="stat-card">
            <span className="stat-icon">🔐</span>
            <div className="stat-value">AES + RSA</div>
            <div className="stat-label">Hybrid Cryptography</div>
            <div className="stat-sub">AES-256-GCM + RSA-OAEP Key Wrapping</div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="portal-card">
          <div className="portal-card-header">
            <h3>Registered Identities</h3>
            <p className="portal-card-sub">Role-based access identities with linked blockchain addresses.</p>
          </div>
          <div className="table-responsive">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>User ID</th>
                  <th>Linked Wallet Address</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                    </td>
                    <td>
                      <span className={`role-badge role-${u.role.toLowerCase()}`}>{u.role}</span>
                    </td>
                    <td>
                      <span className="mono-badge">{u.id.slice(0, 8)}...</span>
                    </td>
                    <td>
                      {u.walletAddress ? (
                        <span className="mono-badge">{u.walletAddress}</span>
                      ) : (
                        <span className="tx-none">Unlinked</span>
                      )}
                    </td>
                    <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <AuditView
          events={systemAuditEvents}
          title="System-Wide Operational Audit Trail"
          emptyMessage="No system audit logs found."
        />
      )}
    </div>
  );
}

export default AdminDashboard;
