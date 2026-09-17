// Module 8: Layer-2 Integration — blockchain connection config
//
// Read once from env (backend/.env). None of these are secrets that get
// returned via any API response. PRIVATE_KEY is a server-side relay
// wallet used only for this prototype phase (see blockchainService.js
// header comment) — never exposed via API, never logged.

const RPC_URL = process.env.RPC_URL || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const CHAIN_ID = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : undefined;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';

// Hand-authored to match blockchain/contracts/HealthcareRecords.sol
// exactly. Kept here (not read from blockchain/artifacts/*) so the
// backend stays self-contained and doesn't depend on the sibling
// blockchain/ project's build output existing at backend runtime.
const HEALTHCARE_RECORDS_ABI = [
  'function registerPatient() external',
  'function registerDoctor() external',
  'function registerHospital() external',
  'function addRecord(string cid) external returns (uint256 recordId)',
  'function getRecord(uint256 recordId) external view returns (uint256 id, address patient, string cid, uint256 timestamp)',
  'function getPatientRecordIds(address patient) external view returns (uint256[])',
  'function grantAccess(address provider) external',
  'function revokeAccess(address provider) external',
  'function hasAccess(address patient, address provider) external view returns (bool)',
  'function getRole(address account) external view returns (uint8)',
  'function isRegistered(address account) external view returns (bool)',
  'function recordCount() external view returns (uint256)',
  'event PatientRegistered(address indexed patient)',
  'event DoctorRegistered(address indexed doctor)',
  'event HospitalRegistered(address indexed hospital)',
  'event RecordAdded(uint256 indexed recordId, address indexed patient, string cid, uint256 timestamp)',
  'event AccessGranted(address indexed patient, address indexed provider)',
  'event AccessRevoked(address indexed patient, address indexed provider)',
];

// Basic Ethereum address FORMAT check (0x + 40 hex chars) — deliberately
// not full EIP-55 checksum validation, since that needs keccak256 which
// requires ethers. This is a cheap first-line rejection used by the API
// layer before any chain call is attempted (and works even when ethers
// isn't installed). ethers.isAddress() does the fuller check at actual
// call time inside blockchainService.
function isPlausibleAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isBlockchainConfigured() {
  return Boolean(RPC_URL && PRIVATE_KEY && CONTRACT_ADDRESS);
}

module.exports = {
  RPC_URL,
  PRIVATE_KEY,
  CHAIN_ID,
  CONTRACT_ADDRESS,
  HEALTHCARE_RECORDS_ABI,
  isPlausibleAddress,
  isBlockchainConfigured,
};
