// Module 6: IPFS Integration
//
// This module ONLY ever receives already-encrypted bytes from the
// upload pipeline (see routes/recordRoutes.js) — it has no knowledge of
// plaintext file content, by construction.
//
// Two modes, chosen automatically from environment variables:
//
//   "pinata" — uses the Pinata pinning API, exactly as named in the
//   Abstract's software requirements ("Decentralized Storage: IPFS (via
//   Pinata API)"). Activated when PINATA_JWT (or the PINATA_API_KEY +
//   PINATA_API_SECRET pair) is set in backend/.env. Uses Node's built-in
//   fetch/FormData/Blob — no additional dependency required.
//
//   "mock" — the default when no Pinata credentials are configured.
//   Makes NO network call. Stores the encrypted buffer in a local
//   folder and returns an unmistakably-fake CID (prefixed "mock-",
//   which no real IPFS CID ever starts with). This exists so the full
//   pipeline can be developed and tested end-to-end without real IPFS
//   access — it is never reported to the caller as if it were real
//   decentralized storage; every record carries an explicit
//   isMockIpfs flag derived from this mode.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MOCK_STORAGE_DIR = path.join(__dirname, '../../../storage/mock-ipfs');

function getMode() {
  const hasJwt = Boolean(process.env.PINATA_JWT);
  const hasKeyPair = Boolean(process.env.PINATA_API_KEY && process.env.PINATA_API_SECRET);
  return hasJwt || hasKeyPair ? 'pinata' : 'mock';
}

// ---------------------------------------------------------------------
// Real IPFS path (Pinata pinning API)
// ---------------------------------------------------------------------

async function uploadToPinata(encryptedBuffer, filename) {
  const url = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

  const form = new FormData();
  form.append('file', new Blob([encryptedBuffer]), `${filename}.enc`);

  const headers = process.env.PINATA_JWT
    ? { Authorization: `Bearer ${process.env.PINATA_JWT}` }
    : {
        pinata_api_key: process.env.PINATA_API_KEY,
        pinata_secret_api_key: process.env.PINATA_API_SECRET,
      };

  const res = await fetch(url, { method: 'POST', headers, body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Pinata upload failed (HTTP ${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.IpfsHash; // this IS the CID
}

async function retrieveFromPinata(cid) {
  const gatewayBase = process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs';
  const res = await fetch(`${gatewayBase}/${cid}`);
  if (!res.ok) {
    throw new Error(`Failed to retrieve CID "${cid}" from IPFS gateway (HTTP ${res.status}).`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
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

module.exports = { uploadEncryptedFile, retrieveEncryptedFile, getMode };
