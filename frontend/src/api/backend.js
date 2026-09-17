// Module 2: User & Role Management
// Module 4/6: Medical Record Upload & Listing
// Module 9: Access Control & Wallet Linking
// Module 10: Asymmetric Keys
// Module 11: Provider Accessible Records
// Module 12: Record Retrieval & Decryption
// Module 13: Audit Trail

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export async function fetchRoles() {
  const res = await fetch(`${API_BASE_URL}/api/roles`);
  if (!res.ok) throw new Error('Failed to fetch roles from backend.');
  return res.json();
}

export async function registerUser({ name, role }) {
  const res = await fetch(`${API_BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, role }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to register user.');
  }
  return body.user;
}

export async function fetchUsers() {
  const res = await fetch(`${API_BASE_URL}/api/users`);
  if (!res.ok) throw new Error('Failed to fetch users from backend.');
  return res.json();
}

// ---------------------------------------------------------------------
// Modules 4/6: medical record upload + metadata listing
// ---------------------------------------------------------------------

export async function uploadRecord({ patientId, file }) {
  const formData = new FormData();
  formData.append('patientId', patientId);
  formData.append('file', file);

  const res = await fetch(`${API_BASE_URL}/api/records/upload`, {
    method: 'POST',
    body: formData,
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to upload record.');
  }
  return body.record;
}

export async function fetchRecordsForPatient(patientId) {
  const res = await fetch(`${API_BASE_URL}/api/records?patientId=${encodeURIComponent(patientId)}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to fetch records.');
  }
  return body.records;
}

export function encryptedFileDownloadUrl(recordId) {
  return `${API_BASE_URL}/api/records/${recordId}/encrypted-file`;
}

// ---------------------------------------------------------------------
// Module 9: patient-centric grant/revoke access + wallet linking
// ---------------------------------------------------------------------

export async function linkWallet({ userId, walletAddress }) {
  const res = await fetch(`${API_BASE_URL}/api/users/${userId}/wallet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to link wallet address.');
  }
  return body.user;
}

export async function grantAccess({ patientId, providerId }) {
  const res = await fetch(`${API_BASE_URL}/api/access/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patientId, providerId }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to grant access.');
  }
  return body;
}

export async function revokeAccess({ patientId, providerId }) {
  const res = await fetch(`${API_BASE_URL}/api/access/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patientId, providerId }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to revoke access.');
  }
  return body;
}

export async function fetchAccessStatus({ patientId, providerId }) {
  const res = await fetch(`${API_BASE_URL}/api/access/${patientId}/${providerId}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to fetch access status.');
  }
  return body;
}

// ---------------------------------------------------------------------
// Module 10: RSA Key Pair generation & Public Key lookup
// ---------------------------------------------------------------------

export async function generateKeysForUser(userId) {
  const res = await fetch(`${API_BASE_URL}/api/users/${userId}/keys`, {
    method: 'POST',
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to generate keys for user.');
  }
  return body;
}

export async function fetchUserPublicKey(userId) {
  const res = await fetch(`${API_BASE_URL}/api/users/${userId}/public-key`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to fetch public key.');
  }
  return body;
}

// ---------------------------------------------------------------------
// Module 11: Provider Accessible Records
// ---------------------------------------------------------------------

export async function fetchAccessibleRecords({ providerId }) {
  const res = await fetch(`${API_BASE_URL}/api/provider/accessible-records?providerId=${encodeURIComponent(providerId)}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to fetch accessible records.');
  }
  return body;
}

// ---------------------------------------------------------------------
// Module 12: Authorized Record Retrieval and Decryption
// ---------------------------------------------------------------------

export function decryptedFileDownloadUrl(recordId, requesterId) {
  return `${API_BASE_URL}/api/records/${recordId}/retrieve?requesterId=${encodeURIComponent(requesterId)}`;
}

export async function downloadDecryptedRecord({ recordId, requesterId, defaultFilename = 'medical-record' }) {
  const url = decryptedFileDownloadUrl(recordId, requesterId);
  const res = await fetch(url);
  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || `Failed to retrieve decrypted record (HTTP ${res.status}).`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition');
  let filename = defaultFilename;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) filename = decodeURIComponent(match[1]);
  }

  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
  return { filename, sizeBytes: blob.size };
}

// ---------------------------------------------------------------------
// Module 13: Audit Trail
// ---------------------------------------------------------------------

export async function fetchAuditLogs({ patientId, providerId, adminId }) {
  const params = new URLSearchParams();
  if (patientId) params.append('patientId', patientId);
  if (providerId) params.append('providerId', providerId);
  if (adminId) params.append('adminId', adminId);

  const res = await fetch(`${API_BASE_URL}/api/audit?${params.toString()}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to fetch audit logs.');
  }
  return body.events;
}
