// Module 2: User & Role Management — demo screen
//
// This demonstrates role selection + validation end-to-end against the
// backend's in-memory user service. It is NOT a patient/doctor/hospital
// dashboard — those are built in later modules. No wallet, encryption,
// or blockchain interaction happens here.

import { useState, useEffect, useCallback } from 'react';
import RoleSelector from './RoleSelector';
import { registerUser, fetchUsers } from '../api/backend';
import { ROLE_LABELS } from '../constants/roles';

function RoleDemo() {
  const [selectedRole, setSelectedRole] = useState('');
  const [name, setName] = useState('');
  const [users, setUsers] = useState([]);
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusType, setStatusType] = useState(null); // 'success' | 'error'
  const [loadingUsers, setLoadingUsers] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await fetchUsers();
      setUsers(data.users);
    } catch (err) {
      setStatusType('error');
      setStatusMessage(`Could not reach backend: ${err.message}`);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleRegister(e) {
    e.preventDefault();
    setStatusMessage(null);

    if (!name.trim()) {
      setStatusType('error');
      setStatusMessage('Name is required.');
      return;
    }
    if (!selectedRole) {
      setStatusType('error');
      setStatusMessage('Please select a role.');
      return;
    }

    try {
      const user = await registerUser({ name, role: selectedRole });
      setStatusType('success');
      setStatusMessage(`Registered "${user.name}" as ${ROLE_LABELS[user.role]}.`);
      setName('');
      setSelectedRole('');
      loadUsers();
    } catch (err) {
      setStatusType('error');
      setStatusMessage(err.message);
    }
  }

  return (
    <div className="role-demo">
      <h2>Module 2: User &amp; Role Management (Demo)</h2>
      <p className="role-demo-note">
        Registers a user against the in-memory backend role service only.
        No wallet linking, encryption, or blockchain interaction happens
        here — those are added in later modules. Data resets whenever the
        backend restarts.
      </p>

      <form onSubmit={handleRegister} className="role-demo-form">
        <label className="role-demo-field">
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Asha Rao"
          />
        </label>

        <RoleSelector selectedRole={selectedRole} onSelectRole={setSelectedRole} />

        <button type="submit" className="role-demo-submit">
          Register
        </button>
      </form>

      {statusMessage && (
        <p className={`role-demo-status role-demo-status-${statusType}`}>
          {statusMessage}
        </p>
      )}

      <div className="role-demo-users">
        <div className="role-demo-users-header">
          <h3>Registered Users (in-memory)</h3>
          <button type="button" onClick={loadUsers} disabled={loadingUsers}>
            {loadingUsers ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {users.length === 0 ? (
          <p className="role-demo-empty">No users registered yet.</p>
        ) : (
          <table className="role-demo-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Wallet</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{ROLE_LABELS[u.role] || u.role}</td>
                  <td>{u.walletAddress || '— not linked yet —'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default RoleDemo;
