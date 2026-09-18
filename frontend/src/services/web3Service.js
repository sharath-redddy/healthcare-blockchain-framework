/**
 * frontend/src/services/web3Service.js
 *
 * Centralized Web3 / MetaMask service for the MedChain L2 frontend.
 *
 * Responsibilities:
 *   1. Detect and connect to MetaMask (window.ethereum)
 *   2. Verify the user is on the correct network (VITE_CHAIN_ID)
 *      and prompt a network switch if needed
 *   3. Signed-challenge authentication:
 *      - Request nonce from backend (/api/auth/challenge)
 *      - Request MetaMask personal_sign
 *      - Send signature to backend (/api/auth/verify)
 *      - Return verified wallet address
 *   4. Smart contract interactions (write operations via MetaMask):
 *      - addRecord(cid)        → on-chain record registration
 *      - grantAccess(address)  → patient grants doctor access
 *      - revokeAccess(address) → patient revokes doctor access
 *      - registerRole(role)    → register user role on-chain
 *   5. Smart contract reads (via read-only provider):
 *      - hasAccess(patient, provider)
 *
 * Design notes:
 * - Never requests or stores private keys or seed phrases.
 * - All write calls go through MetaMask — the user signs every tx.
 * - getAuthenticatedWallet() is the ONLY way to get a trusted wallet
 *   address; it always performs the full challenge-response flow.
 * - Falls back gracefully when MetaMask is not installed.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const EXPECTED_CHAIN_ID = import.meta.env.VITE_CHAIN_ID
  ? parseInt(import.meta.env.VITE_CHAIN_ID, 10)
  : 31337; // default: Hardhat local

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || null;

// Minimal ABI — only the functions the frontend needs to call/read
const HEALTHCARE_ABI = [
  'function addRecord(string calldata cid) returns (uint256)',
  'function grantAccess(address provider)',
  'function revokeAccess(address provider)',
  'function hasAccess(address patient, address provider) view returns (bool)',
  'function registerPatient()',
  'function registerDoctor()',
  'function registerHospital()',
  'event RecordAdded(uint256 indexed recordId, address indexed patient, string cid)',
  'event AccessGranted(address indexed patient, address indexed provider)',
  'event AccessRevoked(address indexed patient, address indexed provider)',
];

// -----------------------------------------------------------------------
// MetaMask detection
// -----------------------------------------------------------------------

export function isMetaMaskInstalled() {
  return Boolean(window.ethereum && window.ethereum.isMetaMask);
}

/**
 * Returns the current connected accounts from MetaMask (without prompting).
 * Returns [] if MetaMask is not connected or not installed.
 */
export async function getConnectedAccounts() {
  if (!isMetaMaskInstalled()) return [];
  try {
    return await window.ethereum.request({ method: 'eth_accounts' });
  } catch {
    return [];
  }
}

/**
 * Requests the user to connect MetaMask accounts (prompts the popup).
 * Returns the first connected account address (lowercased), or throws.
 */
export async function connectWallet() {
  if (!isMetaMaskInstalled()) {
    throw new Error(
      'MetaMask is not installed. Install the MetaMask browser extension to continue.'
    );
  }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned from MetaMask. Did you reject the connection?');
  }
  return accounts[0].toLowerCase();
}

// -----------------------------------------------------------------------
// Network management
// -----------------------------------------------------------------------

export async function getCurrentChainId() {
  if (!isMetaMaskInstalled()) return null;
  const hexId = await window.ethereum.request({ method: 'eth_chainId' });
  return parseInt(hexId, 16);
}

/**
 * Checks if MetaMask is on the expected chain (VITE_CHAIN_ID).
 * If not, prompts MetaMask to switch. Throws if user rejects or switch fails.
 */
export async function ensureCorrectNetwork() {
  const chainId = await getCurrentChainId();
  if (chainId === EXPECTED_CHAIN_ID) return; // already correct

  const hexChainId = `0x${EXPECTED_CHAIN_ID.toString(16)}`;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }],
    });
  } catch (err) {
    // Error code 4902 = chain not added to MetaMask yet
    if (err.code === 4902) {
      throw new Error(
        `Network with chain ID ${EXPECTED_CHAIN_ID} is not configured in MetaMask. ` +
          'Add the network manually or configure VITE_CHAIN_ID in frontend/.env.'
      );
    }
    throw new Error(`Failed to switch MetaMask to chain ID ${EXPECTED_CHAIN_ID}: ${err.message}`);
  }
}

// -----------------------------------------------------------------------
// Signed-challenge authentication
// -----------------------------------------------------------------------

/**
 * Performs the full signed-challenge authentication flow:
 *   1. Ensures MetaMask is connected (prompts if needed)
 *   2. Requests nonce/challenge from backend
 *   3. Asks MetaMask to sign the challenge message
 *   4. Sends signature to backend for verification
 *   5. Returns the backend-verified wallet address
 *
 * This is the ONLY correct way to get a trusted wallet address for
 * use in backend operations. Never trust a wallet address that has
 * not gone through this flow for security-sensitive operations.
 *
 * @returns {Promise<string>} Verified wallet address (checksummed)
 */
export async function getAuthenticatedWallet() {
  const address = await connectWallet();
  await ensureCorrectNetwork();

  // Step 1: Get challenge from backend
  const challengeRes = await fetch(`${API_BASE_URL}/api/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: address }),
  });

  if (!challengeRes.ok) {
    const err = await challengeRes.json().catch(() => ({}));
    throw new Error(err.error || `Failed to get auth challenge (HTTP ${challengeRes.status}).`);
  }

  const { message } = await challengeRes.json();

  // Step 2: MetaMask signs the challenge (personal_sign)
  // personal_sign is the safest signing method — it prepends EIP-191 prefix
  // "\x19Ethereum Signed Message:\n" to prevent hash collision attacks.
  let signature;
  try {
    signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, address],
    });
  } catch (err) {
    if (err.code === 4001) {
      throw new Error('Authentication cancelled: you rejected the MetaMask signature request.');
    }
    throw new Error(`MetaMask signing failed: ${err.message}`);
  }

  // Step 3: Verify signature with backend
  const verifyRes = await fetch(`${API_BASE_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: address, signature }),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    throw new Error(err.error || `Signature verification failed (HTTP ${verifyRes.status}).`);
  }

  const { walletAddress: verifiedAddress } = await verifyRes.json();
  return verifiedAddress;
}

// -----------------------------------------------------------------------
// Ethers.js contract helpers (dynamic import — ethers is NOT in package.json
// yet; we load it from a CDN-compatible ESM build or from npm after install)
// -----------------------------------------------------------------------

/**
 * Returns an ethers BrowserProvider + Signer connected to MetaMask.
 * Requires ethers v6 to be installed: npm install ethers in frontend/.
 */
async function getSigner() {
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is required to sign transactions.');
  }
  // Dynamic import so the rest of web3Service works even without ethers
  const { ethers } = await import('ethers');
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
}

/**
 * Returns an ethers Contract instance connected to the MetaMask signer.
 * All calls through this instance will prompt MetaMask for approval.
 */
async function getSignerContract() {
  if (!CONTRACT_ADDRESS) {
    throw new Error(
      'Smart contract address is not configured. ' +
        'Set VITE_CONTRACT_ADDRESS in frontend/.env.'
    );
  }
  const signer = await getSigner();
  const { ethers } = await import('ethers');
  return new ethers.Contract(CONTRACT_ADDRESS, HEALTHCARE_ABI, signer);
}

/**
 * Returns a read-only contract instance (no MetaMask prompt needed).
 */
async function getReadonlyContract() {
  if (!CONTRACT_ADDRESS) {
    throw new Error('VITE_CONTRACT_ADDRESS is not configured in frontend/.env.');
  }
  const { ethers } = await import('ethers');
  const rpcUrl = import.meta.env.VITE_RPC_URL;
  const provider = rpcUrl
    ? new ethers.JsonRpcProvider(rpcUrl)
    : new ethers.BrowserProvider(window.ethereum);
  return new ethers.Contract(CONTRACT_ADDRESS, HEALTHCARE_ABI, provider);
}

// -----------------------------------------------------------------------
// Smart Contract Write Operations (all require MetaMask signature)
// -----------------------------------------------------------------------

/**
 * Stage 2 of the 2-stage upload flow.
 * Calls HealthcareRecords.addRecord(cid) via MetaMask.
 * Patient must have been authenticated via getAuthenticatedWallet() first.
 *
 * @param {string} cid - The IPFS CID returned from Stage 1 (backend upload)
 * @returns {{ txHash: string, recordId: string }} Transaction hash and on-chain record ID
 */
export async function addRecordOnChain(cid) {
  if (!cid || typeof cid !== 'string') {
    throw new Error('addRecordOnChain requires a valid CID string.');
  }
  const contract = await getSignerContract();
  const tx = await contract.addRecord(cid);
  const receipt = await tx.wait();

  // Extract recordId from RecordAdded event
  let recordId = null;
  const { ethers } = await import('ethers');
  const iface = new ethers.Interface(HEALTHCARE_ABI);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === 'RecordAdded') {
        recordId = parsed.args.recordId.toString();
        break;
      }
    } catch {
      // ignore non-matching logs
    }
  }

  return { txHash: receipt.hash, recordId };
}

/**
 * Calls HealthcareRecords.grantAccess(providerAddress) via MetaMask.
 * @param {string} providerAddress - The doctor's wallet address
 */
export async function grantAccessOnChain(providerAddress) {
  const contract = await getSignerContract();
  const tx = await contract.grantAccess(providerAddress);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

/**
 * Calls HealthcareRecords.revokeAccess(providerAddress) via MetaMask.
 * @param {string} providerAddress - The doctor's wallet address
 */
export async function revokeAccessOnChain(providerAddress) {
  const contract = await getSignerContract();
  const tx = await contract.revokeAccess(providerAddress);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

/**
 * Registers the caller's wallet as a Patient/Doctor/Hospital on-chain.
 * @param {'patient'|'doctor'|'hospital'} role
 */
export async function registerRoleOnChain(role) {
  const contract = await getSignerContract();
  let tx;
  if (role === 'patient') tx = await contract.registerPatient();
  else if (role === 'doctor') tx = await contract.registerDoctor();
  else if (role === 'hospital') tx = await contract.registerHospital();
  else throw new Error(`Unknown role: ${role}`);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

// -----------------------------------------------------------------------
// Smart Contract Read Operations
// -----------------------------------------------------------------------

/**
 * Checks on-chain whether a provider has access to a patient's records.
 * Uses a read-only provider (no MetaMask popup needed).
 */
export async function checkAccessOnChain(patientAddress, providerAddress) {
  try {
    const contract = await getReadonlyContract();
    return await contract.hasAccess(patientAddress, providerAddress);
  } catch {
    // If contract is not deployed / RPC unavailable, fall back gracefully
    return null;
  }
}
