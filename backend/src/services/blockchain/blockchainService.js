// Module 8: Layer-2 Integration — backend blockchain service
//
// Clean abstraction over the HealthcareRecords contract for the rest of
// the backend (routes never touch ethers directly). `ethers` is
// required lazily in a try/catch (not at module load) so this file can
// always be safely imported — even before `npm install` has added
// ethers, and even when no RPC/contract is configured — without taking
// down unrelated routes/modules. Every exported function throws a
// clear, specific error instead of crashing the process when
// blockchain access isn't currently available; callers (accessRoutes)
// turn that into a 503, not a server crash.
//
// PROTOTYPE NOTE — read before assuming this is production-ready:
// real user-signed MetaMask transactions are not wired up yet (the
// Abstract frames that as "eventually", and it's out of scope for
// Modules 7-10). For now this service signs transactions with a single
// server-side relay wallet (PRIVATE_KEY env var) on behalf of API
// calls, AFTER the API layer (accessRoutes.js) has already verified the
// caller-identified patient/provider against our own user records. This
// means on-chain msg.sender for grant/revoke calls is currently the
// relay wallet, not the patient's own wallet. This is a deliberate,
// documented simplification for this prototype phase — not real
// per-user key custody. See docs/architecture.md.

const {
  RPC_URL,
  PRIVATE_KEY,
  CONTRACT_ADDRESS,
  HEALTHCARE_RECORDS_ABI,
  isBlockchainConfigured,
} = require('../../constants/blockchain');

let ethers;
try {
  // eslint-disable-next-line global-require
  ethers = require('ethers');
} catch {
  ethers = null; // not installed yet — see backend/package.json
}

let cachedProvider = null;
let cachedWallet = null;
let cachedContract = null;

let mockModeEnabled = process.env.ENABLE_MOCK_BLOCKCHAIN === 'true';
const mockAccess = new Map(); // "patientAddr:providerAddr" -> boolean
const mockRecords = new Map(); // recordId -> { id, patient, cid, timestamp }
let mockRecordCounter = 0;

function enableMockMode() {
  mockModeEnabled = true;
}

function disableMockMode() {
  mockModeEnabled = false;
  mockAccess.clear();
  mockRecords.clear();
  mockRecordCounter = 0;
}

function isMockMode() {
  return mockModeEnabled;
}

function setMockAccess(patientAddress, providerAddress, granted) {
  const key = `${patientAddress.toLowerCase()}:${providerAddress.toLowerCase()}`;
  mockAccess.set(key, Boolean(granted));
}

function assertReady() {
  if (mockModeEnabled) return;
  if (!ethers) {
    throw new Error(
      "Blockchain features require 'ethers' to be installed. Run 'npm install' in backend/."
    );
  }
  if (!isBlockchainConfigured()) {
    throw new Error(
      'Blockchain is not configured. Set RPC_URL, PRIVATE_KEY, and CONTRACT_ADDRESS in ' +
        'backend/.env (run `npx hardhat node` locally and deploy the contract, or point at an ' +
        'L2 testnet). See .env.example and docs/architecture.md.'
    );
  }
}

function getProvider() {
  assertReady();
  if (!cachedProvider) {
    cachedProvider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return cachedProvider;
}

function getRelayWallet() {
  assertReady();
  if (!cachedWallet) {
    cachedWallet = new ethers.Wallet(PRIVATE_KEY, getProvider());
  }
  return cachedWallet;
}

function getContract() {
  assertReady();
  if (!cachedContract) {
    cachedContract = new ethers.Contract(CONTRACT_ADDRESS, HEALTHCARE_RECORDS_ABI, getRelayWallet());
  }
  return cachedContract;
}

async function addRecordOnChain(cid, patientAddress = '0x0000000000000000000000000000000000000001') {
  if (mockModeEnabled) {
    mockRecordCounter++;
    const recordId = mockRecordCounter;
    mockRecords.set(recordId, {
      id: recordId,
      patient: patientAddress,
      cid,
      timestamp: Math.floor(Date.now() / 1000),
    });
    return { txHash: `0xmock-tx-record-${recordId}-${Date.now().toString(16)}`, recordId };
  }
  const contract = getContract();
  const tx = await contract.addRecord(cid);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

async function grantAccessOnChain(providerAddress, patientAddress = null) {
  if (mockModeEnabled) {
    if (patientAddress) {
      setMockAccess(patientAddress, providerAddress, true);
    }
    return { txHash: `0xmock-tx-grant-${Date.now().toString(16)}` };
  }
  const contract = getContract();
  const tx = await contract.grantAccess(providerAddress);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

async function revokeAccessOnChain(providerAddress, patientAddress = null) {
  if (mockModeEnabled) {
    if (patientAddress) {
      setMockAccess(patientAddress, providerAddress, false);
    }
    return { txHash: `0xmock-tx-revoke-${Date.now().toString(16)}` };
  }
  const contract = getContract();
  const tx = await contract.revokeAccess(providerAddress);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

async function hasAccessOnChain(patientAddress, providerAddress) {
  if (mockModeEnabled) {
    const key = `${patientAddress.toLowerCase()}:${providerAddress.toLowerCase()}`;
    return mockAccess.get(key) === true;
  }
  const contract = getContract();
  return contract.hasAccess(patientAddress, providerAddress);
}

async function getRoleOnChain(address) {
  if (mockModeEnabled) return 1;
  const contract = getContract();
  const role = await contract.getRole(address);
  return Number(role); // 0 None, 1 Patient, 2 Doctor, 3 Hospital
}

async function getRecordOnChain(recordId) {
  if (mockModeEnabled) {
    const r = mockRecords.get(Number(recordId));
    if (!r) throw new Error('Record does not exist');
    return r;
  }
  const contract = getContract();
  const [id, patient, cid, timestamp] = await contract.getRecord(recordId);
  return { id: Number(id), patient, cid, timestamp: Number(timestamp) };
}

async function getPatientRecordIdsOnChain(patientAddress) {
  if (mockModeEnabled) {
    const ids = [];
    mockRecords.forEach((r, id) => {
      if (r.patient.toLowerCase() === patientAddress.toLowerCase()) {
        ids.push(id);
      }
    });
    return ids;
  }
  const contract = getContract();
  const ids = await contract.getPatientRecordIds(patientAddress);
  return ids.map((n) => Number(n));
}

// Test-only: lets isolated test scenarios force fresh provider/wallet/contract instances.
function _resetForTests() {
  cachedProvider = null;
  cachedWallet = null;
  cachedContract = null;
  disableMockMode();
}

module.exports = {
  isBlockchainConfigured,
  getProvider,
  getContract,
  addRecordOnChain,
  grantAccessOnChain,
  revokeAccessOnChain,
  hasAccessOnChain,
  getRoleOnChain,
  getRecordOnChain,
  getPatientRecordIdsOnChain,
  enableMockMode,
  disableMockMode,
  isMockMode,
  setMockAccess,
  _resetForTests,
};
