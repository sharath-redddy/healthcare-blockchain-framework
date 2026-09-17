# System Architecture

This document reflects what is **actually implemented**, updated as each module is completed. Source of truth for design intent: the Project Abstract.

## Layers

### 1. Frontend Layer — `frontend/`
React.js (Vite) + MetaMask. User interface for Patients, Doctors, and Hospital/Admins. Handles wallet connection, record upload UI, access management, permission control, doctor retrieval & decryption view, and admin audit trail explorer.
**Status:** Fully implemented across all 4 role portals (Patient, Doctor, Admin, Roles) with full responsive styling, dark-mode-first aesthetic, glassmorphism, and live API client integrations. Production build verified with Vite.

### 2. Application / Backend Layer — `backend/`
Node.js. Mediates between frontend and blockchain/IPFS; hosts encryption logic and API endpoints.
**Status:** Zero-dependency core routing via Node.js built-in `http` module. Complete REST API for roles, users, wallet linking, medical record upload, AES-256 envelope encryption, IPFS storage (with Pinata + local mock fallback), blockchain access control relay, RSA-OAEP asymmetric key exchange, authorized provider retrieval & decryption, audit trail logging, and production HTTP security headers.

### 3. Blockchain Layer — `blockchain/`
Solidity smart contracts deployed to an Ethereum Layer-2 network (Polygon or Arbitrum). Handles:
- Patient-controlled access grants/revocations
- Permission verification (`hasAccess`)
- CID/file references (not the files themselves)
- Immutable audit log entries (`AccessGranted`, `AccessRevoked`, `RecordAdded`)
**Status:** `HealthcareRecords.sol` implemented (Module 7) and compiled. Configured for local Hardhat and Polygon Amoy testnet (Module 8). Ethers.js v6 abstraction in backend (`blockchainService.js`) with automatic mock fallback mode for offline/sandbox testing and zero fake successes.

### 4. Storage Layer — IPFS
Off-chain storage for **AES-256 encrypted** medical files. Only the resulting CID is referenced on-chain.
**Status:** Implemented (Module 6) with two modes — real Pinata pinning API (used when `PINATA_JWT` or `PINATA_API_KEY`+`PINATA_API_SECRET` is configured) and a local mock storage fallback (`backend/storage/mock-ipfs/`). Every record carries `isMockIpfs` so the two are never conflated. Plaintext is never written to disk or sent unencrypted to IPFS.

### 5. Security Layer
- **AES-256-GCM** — authenticated symmetric encryption for medical documents. Random 32-byte key per file.
- **RSA-OAEP (SHA-256)** — secure asymmetric exchange of AES file keys for authorized providers.
**Status:** Fully implemented and integrated into upload and authorized retrieval pipelines. Envelope encryption wraps file keys under master key; provider retrieval re-wraps the AES key using the provider's RSA-2048 public key, decrypted securely using their private key. Verified against tampering and key substitution.

### 6. Audit Layer
Tamper-evident logging of all security and access-relevant events (upload, grant, revoke, decryption/access).
**Status:** Fully implemented. Contract emits on-chain events (`AccessGranted`, `AccessRevoked`, `RecordAdded`); backend audit service (`auditService.js`) logs all lifecycle actions with role-scoped querying (`/api/audit/patient/:id` for patient privacy and `/api/audit/all` restricted to `HOSPITAL_ADMIN`). Plaintext contents and private keys are never logged.

## Role Model (added Module 2)

Defined once in `backend/src/constants/roles.js` (and mirrored in `frontend/src/constants/roles.js`) so every later module references the same three values instead of redefining role strings:

| Role constant | Meaning | Can do (this module) | Cannot do (by design) |
|---|---|---|---|
| `PATIENT` | Record owner | Register with this role | N/A yet — upload/grant/revoke arrive in later modules |
| `DOCTOR` | Requests access | Register with this role | Cannot self-grant access to any record |
| `HOSPITAL_ADMIN` | Administrative role | Register with this role | Cannot override patient-controlled permissions |

The `User` model (`backend/src/models/User.js`) validates `role` against this list at construction time and rejects anything else. `walletAddress` exists on the model now but stays `null` until wallet linking is implemented — this is intentional so later modules can attach a wallet to an existing user record without changing the shape of `User`.

## Key Management (Module 5 master-key envelope; Module 10 adds RSA-OAEP)

Each medical file gets its own randomly generated AES-256 "file key" (`aesService.generateFileKey()`). The file is encrypted with that key using AES-256-**GCM** (authenticated — wrong key or tampered data causes decryption to throw, not silently corrupt). The file key itself is then "wrapped" (encrypted) under a server-side master key and stored in the record's metadata as `wrappedFileKey` — never in plaintext, never sent to the frontend, never sent to IPFS. **This part is unchanged since Module 5** and still backs every record uploaded through the live pipeline.

**Module 10** adds `keyExchangeService.js`: RSA-OAEP (SHA-256) wrap/unwrap of an arbitrary AES key for one recipient's public key, using Node's built-in `crypto` (no new dependency). This is proven end-to-end in `keyExchangeService.test.js` (file → AES encrypt → AES key → RSA-OAEP wrap → unwrap → AES decrypt → original file). **It does not yet replace** the master-key wrapping in the live upload pipeline — that remains a deliberate next step for when authorized doctor/hospital record retrieval is built (Module 12), at which point `wrapFileKey`/`unwrapFileKey` in `aesService.js` would be swapped for per-recipient RSA wrapping without needing to touch `encryptMedicalFile`/`decryptMedicalFile` themselves.

Private keys generated via `POST /api/users/:id/keys` are held in `devKeyVault.js`, explicitly documented as **local-development-only**, not production key custody — a real system would generate keys client-side, which doesn't exist yet in this project. Public keys (not secret) live in `publicKeyRegistry.js` and are freely returned via `GET /api/users/:id/public-key`.

The master key itself comes from `MASTER_ENCRYPTION_KEY` (backend/.env, 64-char hex). If unset, an ephemeral key is generated per process with a loud console warning — acceptable for now since the record store is in-memory and resets on restart too, but not suitable beyond a single dev session.

## Data Flow

```
Patient (via Patient Interface)
  → Select Medical Record
  → Backend Upload Endpoint (validates patient/role/filetype/size)
  → AES-256-GCM Encryption (random per-file key, wrapped under master key)
  → Encrypted File
  → IPFS (Pinata) or local mock storage — automatic based on env config
  → CID / File Reference
  → Record Metadata (stored in-memory; returned to Patient Interface)
```

**Implemented through Module 6** (upload → encrypt → store → CID → metadata display).

```
Patient
  → Access Management UI (link wallet, select doctor/hospital)
  → POST /api/access/grant or /revoke (backend validates patient/provider/role/wallet first)
  → blockchainService relays the transaction (server-side relay wallet — see Module 8 note)
  → HealthcareRecords.sol grantAccess()/revokeAccess()
  → AccessGranted / AccessRevoked event
  → GET /api/access/:patient/:provider reads hasAccess() directly from the chain
```

**Implemented across all layers (Modules 9, 11, 12, 13, 14, 15):** Record CIDs are referenced on-chain, permissions are checked prior to retrieval, and all operations generate immutable audit records.

## Access Flow (Doctor / Hospital Retrieval & Decryption — Fully Implemented)

```
Doctor / Hospital
  → Request Accessible Records (/api/provider/records?providerId=...)
  → Backend checks provider role & queries Smart Contract hasAccess(patient, provider)
  → Filtered list of authorized patient records returned
  → Doctor requests decrypted record (/api/records/:id/decrypt?requesterId=...)
  → Smart Contract Permission Verified on-chain
  → Encrypted File retrieved from IPFS (Pinata / Local Storage)
  → AES File Key unwrapped via Master Key
  → File Key re-wrapped with Doctor's RSA-2048 Public Key via RSA-OAEP
  → Key unwrapped with Doctor's Private Key
  → AES-256-GCM Decrypts File with Auth Tag Verification
  → RECORD_ACCESSED Event Emitted to Audit Trail
  → Authorized Doctor views / downloads byte-identical plaintext file
```

## Deviations from the IEEE Base Paper (intentional, per Abstract)

| Aspect | Base Paper | This Project (per Abstract) |
|---|---|---|
| Layer-2 network | zkSync | Polygon / Arbitrum |
| Storage provider mentioned | Generic IPFS/cloud | IPFS via Pinata API |

No other deviations currently exist. This table will be updated only if a genuine conflict arises during implementation.
