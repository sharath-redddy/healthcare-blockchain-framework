# A Patient-Centric Blockchain-Based Framework with Layer-2 Integration for Secure and Scalable Healthcare Data Management

[![Test Suite](https://img.shields.io/badge/tests-16%20passed%20%7C%200%20failed-emerald.svg)](./backend/src/tests/runAll.js)
[![Vite Build](https://img.shields.io/badge/vite-production%20ready-cyan.svg)](./frontend)
[![Solidity](https://img.shields.io/badge/solidity-0.8.24-violet.svg)](./blockchain/contracts/HealthcareRecords.sol)
[![Encryption](https://img.shields.io/badge/crypto-AES--256--GCM%20%2B%20RSA--OAEP-blue.svg)](./backend/src/services/crypto)

A research-grade full-stack decentralized healthcare framework empowering patients with sovereign ownership and fine-grained access control over their electronic health records (EHR). Encrypted medical records are stored off-chain in decentralized IPFS storage, while Ethereum Layer-2 (Polygon / Arbitrum) smart contracts orchestrate access grants, revocations, and immutable audit logs with high throughput and near-zero gas costs.

> **Source of Truth:** Design decisions conform strictly to the **Project Abstract**. The IEEE base paper (*Tarannum & Abidin, ISACC 2025*) serves as a conceptual reference; where it differs (e.g. zkSync vs. Polygon/Arbitrum), the Abstract specifications prevail.

---

## 🏛️ System Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │               React + Vite UI                │
                    │   Patient Portal │ Doctor Portal │ Admin     │
                    └──────────────────────┬───────────────────────┘
                                           │ HTTP / REST
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │             Node.js Backend Layer            │
                    │  • Auth & RBAC      • AES-256-GCM Encryption │
                    │  • Multipart Parser • RSA-OAEP Key Exchange  │
                    │  • Audit Logging    • Blockchain Relay (Ethers)
                    └──────────────┬────────────────┬──────────────┘
                                   │                │
            CID & Metadata Only   │                │ Encrypted Ciphertext
                                   ▼                ▼
     ┌────────────────────────────────────┐   ┌───────────────────────────┐
     │      Layer-2 Smart Contract        │   │    Decentralized IPFS     │
     │     (Polygon Amoy / Arbitrum)      │   │  (Pinata Cloud / Local)   │
     │ • HealthcareRecords.sol            │   │                           │
     │ • Access Matrix & Permissions      │   │ • AES-256 encrypted blobs │
     │ • Immutable Event Logs             │   │ • Zero plaintext exposure │
     └────────────────────────────────────┘   └───────────────────────────┘
```

---

## 🚀 Key Features by Module

| Module | Component | Description | Status |
|---|---|---|---|
| **Module 1** | Foundation | Monorepo structure, environment configs, zero-dependency backend core | ✅ Verified |
| **Module 2** | User & Role Management | `PATIENT`, `DOCTOR`, `HOSPITAL_ADMIN` role enforcement and in-memory store | ✅ Verified |
| **Module 3** | Patient Dashboard | Document upload portal, record timeline, active credentials | ✅ Verified |
| **Module 4** | Medical Record Upload | Native zero-dependency streaming binary multipart parser, MIME & size checks | ✅ Verified |
| **Module 5** | AES-256-GCM Encryption | Authenticated symmetric envelope encryption; random 32-byte key per document | ✅ Verified |
| **Module 6** | IPFS Integration | Pinata API integration with automated local mock storage fallback | ✅ Verified |
| **Module 7** | Smart Contracts | `HealthcareRecords.sol` managing role registry, CID indexing, and access events | ✅ Verified |
| **Module 8** | Layer-2 Integration | Polygon Amoy & local Hardhat network deployment pipelines via Ethers.js v6 | ✅ Verified |
| **Module 9** | Access Control Engine | Patient-controlled grant/revoke workflows with real on-chain enforcement | ✅ Verified |
| **Module 10** | Asymmetric Key Exchange | RSA-OAEP (2048-bit, SHA-256) per-provider AES key re-encryption | ✅ Verified |
| **Module 11** | Doctor / Provider Access | Provider portal, authorized patient record queries, permission verification | ✅ Verified |
| **Module 12** | Retrieval & Decryption | On-chain authorization check, IPFS fetch, RSA unwrapping, AES-GCM decryption | ✅ Verified |
| **Module 13** | Audit Trail & Admin | Tamper-evident event stream (`RECORD_CREATED`, `ACCESS_GRANTED`, etc.) | ✅ Verified |
| **Module 14** | Security Hardening | IDOR defense, path traversal guards, ciphertext tampering checks, security headers | ✅ Verified |
| **Module 15** | End-to-End System Tests | Master 18-step integration scenario covering patient, doctor, and chain flows | ✅ Verified |
| **Module 16** | Premium UI/UX | Dark-mode-first glassmorphism design system (Inter + JetBrains Mono) | ✅ Verified |
| **Module 17** | Research Documentation | Comprehensive architecture guides, logs, and verification runbooks | ✅ Verified |

---

## ⚙️ Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React 18, Vite 5 | Fast HMR, responsive SPA, custom modern CSS design system |
| **Backend** | Node.js (Built-in `http`, `crypto`) | Zero runtime dependency overhead for core routing & crypto |
| **Blockchain** | Solidity 0.8.24, Hardhat, Ethers.js v6 | EVM Layer-2 compatibility (Polygon Amoy / Arbitrum Sepolia) |
| **Decentralized Storage** | IPFS (Pinata SDK / Local Mock) | Off-chain storage for medical data; CIDs stored on-chain |
| **Symmetric Encryption**| AES-256-GCM | Authenticated encryption preventing ciphertext tampering |
| **Asymmetric Key Wrap** | RSA-OAEP (SHA-256, 2048-bit) | Secure delivery of document AES keys to authorized providers |
| **Audit Layer** | Smart Contract Events + Backend Audit Service | Dual-layer auditing (on-chain immutable logs + queryable events) |

---

## 🛠️ Quickstart & Local Setup

### 1. Prerequisites
- **Node.js** v18+ (Node 20+ recommended)
- **npm** v9+
- Modern Web Browser (MetaMask extension optional for live on-chain tests)

### 2. Clone & Inspect Workspace
```powershell
cd healthcare-blockchain-framework4
```

### 3. Backend Setup & Test Suite
The backend is completely self-contained and requires no external packages to run all unit and integration tests:
```powershell
cd backend
npm test
```
*Expected Output:*
```
================================================================
 Test Suites Summary: 16 passed, 0 failed of 16 total.
================================================================
```

To start the backend API server:
```powershell
npm start
# Server listens on http://localhost:4000
```

### 4. Frontend Setup & Build
```powershell
cd frontend
npm install
npm run build     # Verifies production asset bundling
npm run dev       # Starts Vite development server at http://localhost:5173
```

### 5. Blockchain Layer (Optional for Live L2 Testing)
The framework includes automatic mock fallbacks (`ENABLE_MOCK_BLOCKCHAIN=true`), so live nodes are not required for development or demonstration. To connect a live local Ethereum/L2 node:
```powershell
cd blockchain
npx hardhat node                                              # Terminal 1
npx hardhat run scripts/deploy.js --network localhost         # Terminal 2
```
Update `backend/.env` with the deployed contract address:
```ini
CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
RPC_URL=http://127.0.0.1:8545
```

---

## 🔐 Security & Privacy Guarantees

1. **Zero Plaintext at Rest**: Medical records are encrypted in-memory before being dispatched to storage. Neither IPFS nor the backend local disk ever stores unencrypted clinical files.
2. **Patient Data Sovereignty**: Access permissions are checked against the smart contract state `hasAccess(patient, provider)`. Doctors and hospital administrators cannot bypass this gate.
3. **Authenticated Encryption**: AES-256-GCM uses a unique 12-byte IV and 16-byte authentication tag for every file. Any alteration of stored ciphertext immediately aborts decryption.
4. **Key Segregation**: AES document keys are envelope-wrapped. When sharing with an authorized physician, the key is securely wrapped with the doctor's RSA-2048 public key and decrypted only by the doctor's private key.
5. **No Key Leaks in Audit Logs**: The audit service captures action metadata (actor ID, target ID, event type, timestamp) but rigorously scrubs document payloads, passwords, and private keys.

---

## 🧪 Comprehensive Test Coverage (16 Suites)

All 16 test suites run via `node src/tests/runAll.js`:
- `roleService.test.js` — Role definitions and validation.
- `api.test.js` — HTTP server routes and error handling.
- `multipart.test.js` — Binary-safe streaming multipart parser.
- `uploadLimits.test.js` — File size boundaries (5 MB max) and rejection logic.
- `aesService.test.js` — AES-256-GCM encryption, decryption, authentication tag verification.
- `ipfsService.test.js` — IPFS pinning, CID hashing, mock filesystem storage.
- `recordPipeline.test.js` — Upload → encrypt → store → retrieve round-trip.
- `blockchainService.test.js` — Ethers.js abstraction, address validation, error reporting.
- `accessRoutes.test.js` — Access grant, revocation, and status endpoints.
- `keyExchangeService.test.js` — RSA-OAEP keypair generation, key wrapping/unwrapping.
- `keyRoutes.test.js` — Asymmetric key generation and public key registry.
- `providerAccess.test.js` — Doctor access filtering based on active grants.
- `retrievalDecryption.test.js` — End-to-end authorized decryption flow.
- `auditTrail.test.js` — Tamper-evident logging and role-scoped log access.
- `securityHardening.test.js` — Path traversal, IDOR, tampering, security headers.
- `finalE2E.test.js` — Master 18-step full system acceptance test.

---

## 📄 License & Academic Attribution
This project was developed for research in decentralized healthcare data architectures based on the project abstract:
*“A Patient-Centric Blockchain-Based Framework with Layer-2 Integration for Secure and Scalable Healthcare Data Management.”*
