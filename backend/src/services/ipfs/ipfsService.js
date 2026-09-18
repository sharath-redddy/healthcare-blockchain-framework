// Module 6: IPFS Integration
//
// This module ONLY ever receives already-encrypted bytes from the
// upload pipeline (see routes/recordRoutes.js) — it has no knowledge of
// plaintext file content, by construction.
//
// Two modes, chosen explicitly from IPFS_PROVIDER env var or by
// presence of Pinata credentials:
//
//   "pinata" — uses the Pinata pinning API, exactly as named in the
//   Abstract's software requirements ("Decentralized Storage: IPFS (via
//   Pinata API)"). Activated when IPFS_PROVIDER=pinata OR when
//   PINATA_JWT (or the PINATA_API_KEY + PINATA_API_SECRET pair) is set
//   in backend/.env. Uses Node's built-in fetch/FormData/Blob.
//   - Upload uses a 30-second AbortController timeout.
//   - Retrieval uses a 15-second AbortController timeout.
//   - Returned CIDs are validated (CIDv0: Qm... or CIDv1: bafy...).
//
//   "mock" — the default when no Pinata credentials are configured.
//   Makes NO network call. Stores the encrypted buffer in a local
//   folder and returns an unmistakably-fake CID (prefixed "mock-",
//   which no real IPFS CID ever starts with). This exists so the full
//   pipeline can be developed and tested end-to-end without real IPFS
//   access — it is never reported to the caller as if it were real
//   decentralized storage; every record carries an explicit
//   isMockIpfs flag derived from this mode.
//
// IMPORTANT: Setting IPFS_PROVIDER=pinata without valid Pinata
// credentials throws an explicit configuration error rather than
// silently falling back to mock. Explicit is better than implicit.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MOCK_STORAGE_DIR = path.join(__dirname, '../../../storage/mock-ipfs');

// Timeout constants
const PINATA_UPLOAD_TIMEOUT_MS = 30_000;   // 30 seconds for upload
const PINATA_RETRIEVE_TIMEOUT_MS = 15_000; // 15 seconds for retrieval

/**
 * Validates an IPFS CID string.
 * Accepts CIDv0 (Qm... 46 base58 chars) and CIDv1 (bafy... base32 encoded).
 */
function isValidCid(cid) {
  if (!cid || typeof cid !== 'string') return false;
  // CIDv0: starts with 'Qm' and is 46 base58 characters
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) return true;
  // CIDv1: starts with 'ba' and is at least 59 base32 chars (bafy...)
  if (/^ba[a-z2-7]{57,}$/.test(cid)) return true;
  // CIDv1 base58: starts with 'z' (multibase prefix)
  if (/^z[1-9A-HJ-NP-Za-km-z]{46,}$/.test(cid)) return true;
  return false;
}

/**
 * Determines the active IPFS provider mode.
 *
 * Priority:
 * 1. IPFS_PROVIDER=pinata  → explicit pinata mode (will fail if no credentials)
 * 2. IPFS_PROVIDER=mock    → explicit mock mode
 * 3. PINATA_JWT set        → inferred pinata mode
 * 4. PINATA_API_KEY+SECRET → inferred pinata mode
 * 5. (default)             → mock mode
 *
 * Returns: 'pinata' | 'mock'
 */
function getMode() {
  const explicit = (process.env.IPFS_PROVIDER || '').toLowerCase().trim();
  if (explicit === 'pinata') return 'pinata';
  if (explicit === 'mock') return 'mock';

  const hasJwt = Boolean(process.env.PINATA_JWT);
  const hasKeyPair = Boolean(process.env.PINATA_API_KEY && process.env.PINATA_API_SECRET);
  return hasJwt || hasKeyPair ? 'pinata' : 'mock';
}

/**
 * Validates that Pinata credentials are actually present when pinata mode is selected.
 * Throws an explicit error rather than silently failing at request time.
 */
function assertPinataCredentials() {
  const hasJwt = Boolean(process.env.PINATA_JWT);
  const hasKeyPair = Boolean(process.env.PINATA_API_KEY && process.env.PINATA_API_SECRET);
  if (!hasJwt && !hasKeyPair) {
    throw new Error(
      'IPFS provider is set to "pinata" but no credentials are configured. ' +
        'Set PINATA_JWT (recommended) or both PINATA_API_KEY and PINATA_API_SECRET ' +
        'in backend/.env. To use local mock storage instead, set IPFS_PROVIDER=mock ' +
        'or leave all Pinata env vars unset.'
    );
  }
}

// ---------------------------------------------------------------------
// Real IPFS path (Pinata pinning API)
// ---------------------------------------------------------------------

async function uploadToPinata(encryptedBuffer, filename) {
  assertPinataCredentials();

  const url = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PINATA_UPLOAD_TIMEOUT_MS);

  try {
    const form = new FormData();
    form.append('file', new Blob([encryptedBuffer]), `${filename}.enc`);
    form.append('pinataMetadata', JSON.stringify({ name: `healthcare-${filename}.enc` }));

    const headers = process.env.PINATA_JWT
      ? { Authorization: `Bearer ${process.env.PINATA_JWT}` }
      : {
          pinata_api_key: process.env.PINATA_API_KEY,
          pinata_secret_api_key: process.env.PINATA_API_SECRET,
        };

    const res = await fetch(url, { method: 'POST', headers, body: form, signal: controller.signal });

    if (!res.ok) {
      const status = res.status;
      let hint = '';
      if (status === 401) hint = ' Check your PINATA_JWT or API key credentials.';
      if (status === 413) hint = ' File exceeds Pinata size limit.';
      if (status === 429) hint = ' Pinata rate limit exceeded — retry later.';
      throw new Error(`Pinata upload failed (HTTP ${status}).${hint}`);
    }

    const data = await res.json();
    const cid = data.IpfsHash;

    if (!isValidCid(cid)) {
      throw new Error(
        `Pinata returned an unexpected CID format: "${cid}". ` +
          'Expected a valid CIDv0 (Qm...) or CIDv1 (bafy...) string.'
      );
    }

    return cid;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        `Pinata upload timed out after ${PINATA_UPLOAD_TIMEOUT_MS / 1000}s. ` +
          'Check your network connection or try again later.'
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function retrieveFromPinata(cid) {
  if (!isValidCid(cid)) {
    throw new Error(
      `Cannot retrieve from Pinata: "${cid}" is not a valid IPFS CID. ` +
        'Expected CIDv0 (Qm...) or CIDv1 (bafy...) format.'
    );
  }

  // Strip trailing slash to avoid double-slash in URL
  const gatewayBase = (process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs').replace(/\/$/, '');
  const url = `${gatewayBase}/${cid}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PINATA_RETRIEVE_TIMEOUT_MS);

  try {
    const headers = {};
    // Dedicated Pinata gateways (*.mypinata.cloud) require JWT for access
    if (process.env.PINATA_JWT && gatewayBase.includes('mypinata.cloud')) {
      headers.Authorization = `Bearer ${process.env.PINATA_JWT}`;
    }

    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) {
      throw new Error(
        `Failed to retrieve CID "${cid}" from IPFS gateway (HTTP ${res.status}). ` +
          'The file may not be pinned or the gateway may be temporarily unavailable.'
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        `IPFS gateway retrieval timed out after ${PINATA_RETRIEVE_TIMEOUT_MS / 1000}s for CID "${cid}". ` +
          'Check your PINATA_GATEWAY_URL and network connection.'
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------
// Mock path (local, clearly labeled, used when no Pinata credentials
// are configured — e.g. this development sandbox, which also has no
// network access to reach any real IPFS service)
// ---------------------------------------------------------------------

function ensureMockDir() {
  if (!fs.existsSync(MOCK_STORAGE_DIR)) {
    fs.mkdirSync(MOCK_STORAGE_DIR, { recursive: true });
  }
}

function mockCidFor(buffer) {
  // Content-addressed, like real IPFS, but the "mock-" prefix makes it
  // impossible to mistake for a real CID (real CIDs start with "Qm",
  // "bafy", etc. — never "mock-").
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  return `mock-${hash}`;
}

function uploadToMock(encryptedBuffer) {
  ensureMockDir();
  const cid = mockCidFor(encryptedBuffer);
  const filePath = path.join(MOCK_STORAGE_DIR, `${cid}.bin`);
  fs.writeFileSync(filePath, encryptedBuffer);
  return cid;
}

function retrieveFromMock(cid) {
  if (!cid || typeof cid !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(cid)) {
    throw new Error(`Invalid or unsafe CID format: "${cid}".`);
  }
  const filePath = path.join(MOCK_STORAGE_DIR, `${cid}.bin`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`No mock-IPFS entry found for CID "${cid}".`);
  }
  return fs.readFileSync(filePath);
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Uploads an already-encrypted buffer. Returns { cid, mode } where mode
 * is 'pinata' or 'mock'. Never accepts or inspects plaintext.
 */
async function uploadEncryptedFile(encryptedBuffer, filename) {
  const mode = getMode();

  if (mode === 'pinata') {
    const cid = await uploadToPinata(encryptedBuffer, filename);
    return { cid, mode };
  }

  // eslint-disable-next-line no-console
  console.warn(
    '⚠️  IPFS MOCK MODE — no PINATA_JWT / PINATA_API_KEY+PINATA_API_SECRET set in ' +
      'backend/.env. Storing the encrypted file locally instead of on real IPFS. ' +
      'This is intentionally NOT reported as a real IPFS upload — see docs/architecture.md.'
  );
  const cid = uploadToMock(encryptedBuffer);
  return { cid, mode };
}

/**
 * Retrieves the encrypted buffer previously stored under `cid`. `mode`
 * must be the mode the record was originally uploaded with (stored on
 * the record itself), so retrieval is always consistent with how the
 * record was written, independent of the server's *current* env config.
 */
async function retrieveEncryptedFile(cid, mode) {
  if (mode === 'pinata') {
    return retrieveFromPinata(cid);
  }
  return retrieveFromMock(cid);
}

module.exports = { uploadEncryptedFile, retrieveEncryptedFile, getMode, isValidCid };
