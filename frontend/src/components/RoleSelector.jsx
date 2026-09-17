// Module 2: User & Role Management
//
// Pure presentational component: displays the three supported roles as
// selectable options. Has no knowledge of backend calls, dashboards, or
// wallet linking — those belong to later modules.

import { ROLE_LABELS, VALID_ROLES } from '../constants/roles';

function RoleSelector({ selectedRole, onSelectRole }) {
  return (
    <div className="role-selector">
      <p className="role-selector-label">Select a role:</p>
      <div className="role-selector-options">
        {VALID_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            className={
              'role-option' + (selectedRole === role ? ' role-option-active' : '')
            }
            onClick={() => onSelectRole(role)}
          >
            {ROLE_LABELS[role]}
          </button>
        ))}
      </div>
    </div>
  );
}

export default RoleSelector;
