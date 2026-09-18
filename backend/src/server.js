// Module 2: User & Role Management
// Module 4/5/6: Medical Record Upload + AES-256 Encryption + IPFS
// Module 9: Access Control
// Module 10: Key Exchange
// Module 11: Provider Access
// Module 12: Record Retrieval & Decryption
// Module 13: Audit Trail
// Module 14: Security Hardening

const http = require('http');
const { URL } = require('url');
const userRoutes = require('./routes/userRoutes');
const recordRoutes = require('./routes/recordRoutes');
const accessRoutes = require('./routes/accessRoutes');
const keyRoutes = require('./routes/keyRoutes');
const providerRoutes = require('./routes/providerRoutes');
const auditRoutes = require('./routes/auditRoutes');
const { parseMultipart } = require('./utils/multipart');
const { MAX_UPLOAD_SIZE_BYTES, MULTIPART_BODY_OVERHEAD_BYTES } = require('./constants/fileValidation');

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
}

function sendJson(res, { statusCode, body }) {
  setCorsHeaders(res);
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) return;
      total += chunk.length;
      if (total > maxBytes) {
        aborted = true;
        req.destroy();
        reject(new Error(`Request body exceeds maximum allowed size of ${maxBytes} bytes.`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!aborted) resolve(Buffer.concat(chunks));
    });

    req.on('error', (err) => {
      if (!aborted) reject(err);
    });
  });
}

function sendBinary(res, { statusCode, filename, buffer, mimeType }) {
  setCorsHeaders(res);
  res.writeHead(statusCode, {
    'Content-Type': mimeType || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    'Content-Length': buffer.length,
  });
  res.end(buffer);
}

function createServer() {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      setCorsHeaders(res);
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;

    try {
      // ---- MetaMask Wallet Authentication (signed-challenge flow) ----
      if (req.method === 'POST' && pathname === '/api/auth/challenge') {
        const payload = await readJsonBody(req);
        return sendJson(res, userRoutes.generateChallenge(payload));
      }

      if (req.method === 'POST' && pathname === '/api/auth/verify') {
        const payload = await readJsonBody(req);
        return sendJson(res, await userRoutes.verifySignature(payload));
      }

      // ---- Module 2: User & Role Management ----
      if (req.method === 'GET' && pathname === '/api/roles') {
        return sendJson(res, userRoutes.listRoles());
      }

      if (req.method === 'POST' && pathname === '/api/users') {
        const payload = await readJsonBody(req);
        return sendJson(res, userRoutes.createUser(payload));
      }

      if (req.method === 'GET' && pathname === '/api/users') {
        return sendJson(res, userRoutes.listUsers());
      }

      // ---- Module 4/5/6: medical record upload / list / verification download ----
      if (req.method === 'POST' && pathname === '/api/records/upload') {
        const rawBody = await readRawBody(req, MAX_UPLOAD_SIZE_BYTES + MULTIPART_BODY_OVERHEAD_BYTES);
        const { fields, file } = parseMultipart(rawBody, req.headers['content-type']);
        const result = await recordRoutes.uploadRecord({
          patientId: fields.patientId,
          filename: file ? file.filename : null,
          mimeType: file ? file.mimeType : null,
          fileBuffer: file ? file.buffer : null,
        });
        return sendJson(res, result);
      }

      if (req.method === 'GET' && pathname === '/api/records') {
        const patientId = url.searchParams.get('patientId');
        return sendJson(res, recordRoutes.listRecordsByPatient(patientId));
      }

      const encryptedFileMatch = pathname.match(/^\/api\/records\/([^/]+)\/encrypted-file$/);
      if (req.method === 'GET' && encryptedFileMatch) {
        const result = await recordRoutes.getEncryptedFileForDownload(encryptedFileMatch[1]);
        if (result.isBinary) {
          return sendBinary(res, result);
        }
        return sendJson(res, result);
      }

      // ---- Module 12: authorized record retrieval & decryption ----
      const decryptedFileMatch = pathname.match(/^\/api\/records\/([^/]+)\/retrieve$/);
      if (req.method === 'GET' && decryptedFileMatch) {
        const requesterId = url.searchParams.get('requesterId');
        const result = await recordRoutes.retrieveDecryptedRecord({
          recordId: decryptedFileMatch[1],
          requesterId,
        });
        if (result.isBinary) {
          return sendBinary(res, result);
        }
        return sendJson(res, result);
      }

      // ---- Module 11: provider accessible records ----
      if (req.method === 'GET' && pathname === '/api/provider/accessible-records') {
        const providerId = url.searchParams.get('providerId');
        return sendJson(res, await providerRoutes.getAccessibleRecords({ providerId }));
      }

      // ---- Module 9: patient-centric grant/revoke access ----
      if (req.method === 'POST' && pathname === '/api/access/grant') {
        const payload = await readJsonBody(req);
        return sendJson(res, await accessRoutes.grantAccess(payload));
      }

      if (req.method === 'POST' && pathname === '/api/access/revoke') {
        const payload = await readJsonBody(req);
        return sendJson(res, await accessRoutes.revokeAccess(payload));
      }

      const accessStatusMatch = pathname.match(/^\/api\/access\/([^/]+)\/([^/]+)$/);
      if (req.method === 'GET' && accessStatusMatch) {
        const result = await accessRoutes.getAccessStatus({
          patientId: accessStatusMatch[1],
          providerId: accessStatusMatch[2],
        });
        return sendJson(res, result);
      }

      // ---- Module 9: link a wallet address onto an existing user ----
      const walletLinkMatch = pathname.match(/^\/api\/users\/([^/]+)\/wallet$/);
      if (req.method === 'POST' && walletLinkMatch) {
        const payload = await readJsonBody(req);
        return sendJson(res, userRoutes.linkWallet(walletLinkMatch[1], payload.walletAddress));
      }

      // ---- Module 10: dev key generation + public key lookup ----
      const keyGenMatch = pathname.match(/^\/api\/users\/([^/]+)\/keys$/);
      if (req.method === 'POST' && keyGenMatch) {
        return sendJson(res, keyRoutes.generateKeysForUser(keyGenMatch[1]));
      }

      const publicKeyMatch = pathname.match(/^\/api\/users\/([^/]+)\/public-key$/);
      if (req.method === 'GET' && publicKeyMatch) {
        return sendJson(res, keyRoutes.getPublicKeyForUser(publicKeyMatch[1]));
      }

      // ---- Module 13: audit trail query ----
      if (req.method === 'GET' && pathname === '/api/audit') {
        const patientId = url.searchParams.get('patientId');
        const providerId = url.searchParams.get('providerId');
        const adminId = url.searchParams.get('adminId');
        return sendJson(res, auditRoutes.getAuditLogs({ patientId, providerId, adminId }));
      }

      return sendJson(res, { statusCode: 404, body: { error: 'Not found' } });
    } catch (err) {
      return sendJson(res, { statusCode: 400, body: { error: err.message || 'Bad request' } });
    }
  });
}

module.exports = { createServer };
