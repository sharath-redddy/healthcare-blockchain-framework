import { useState } from 'react';

function AuditView({ events = [], title = 'Audit Trail History', emptyMessage = 'No audit events recorded yet.' }) {
  const [filterAction, setFilterAction] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const actions = ['ALL', ...new Set(events.map((e) => e.action))];

  const filtered = events.filter((e) => {
    if (filterAction !== 'ALL' && e.action !== filterAction) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchActor = (e.actorName || '').toLowerCase().includes(q);
      const matchDetails = (e.details || '').toLowerCase().includes(q);
      const matchTx = (e.txHash || '').toLowerCase().includes(q);
      const matchAction = (e.action || '').toLowerCase().includes(q);
      return matchActor || matchDetails || matchTx || matchAction;
    }
    return true;
  });

  return (
    <div className="audit-view-card">
      <div className="audit-view-header">
        <div>
          <h3>📋 {title}</h3>
          <p className="audit-view-sub">
            Immutable audit record of all cryptographic, storage, and access events.
          </p>
        </div>
        <div className="audit-controls">
          <input
            type="text"
            placeholder="Search audit trail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="audit-search-input"
          />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="audit-filter-select"
          >
            {actions.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="audit-empty-state">
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Result</th>
                <th>Details</th>
                <th>Transaction Reference</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td className="audit-time">{new Date(e.timestamp).toLocaleString()}</td>
                  <td>
                    <span className={`audit-badge action-${e.action.toLowerCase()}`}>
                      {e.action}
                    </span>
                  </td>
                  <td>
                    <strong>{e.actorName || 'System'}</strong>
                    <span className="role-tag">{e.actorRole}</span>
                  </td>
                  <td>
                    <span className={`audit-result-tag result-${e.result.toLowerCase()}`}>
                      {e.result}
                    </span>
                  </td>
                  <td className="audit-details-cell">{e.details}</td>
                  <td className="audit-tx-cell">
                    {e.txHash ? (
                      <span className="tx-hash-badge" title={e.txHash}>
                        {e.txHash.slice(0, 10)}...{e.txHash.slice(-6)}
                      </span>
                    ) : (
                      <span className="tx-none">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AuditView;
