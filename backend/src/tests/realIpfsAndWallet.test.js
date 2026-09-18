/**
 * realIpfsAndWallet.test.js
 *
 * Tests for the upgraded IPFS service and wallet authentication endpoints.
 * Focuses on:
 *   - CID format validation (isValidCid)
 *   - IPFS mode selection (IPFS_PROVIDER env, credential detection)
 *   - Explicit Pinata credential assertion (no silent fallback)
 *   - AbortController timeout simulation
 *   - Wallet challenge generation (nonce format, TTL, single-use)
 *   - Wallet signature verification flow
 *
 * All network calls are intercepted via process.env manipulation and
 * global fetch mocking — no real Pinata/IPFS calls are made.
 */

'use strict';

const assert = require('assert');

// ── helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2705 ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \u274c ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function suite(name) {
  console.log(`\n\ud83d\udccb ${name}`);
}

// ── All tests run inside an async IIFE (CommonJS + async/await compatible) ───
(async () => {


suite('isValidCid — CID format validation');

{
  // We need a fresh require because the module uses process.env at load time
  // Use isolated require to avoid cache issues with env-dependent getMode()
  const { isValidCid } = require('../services/ipfs/ipfsService');

  await test('accepts valid CIDv0 (Qm...)', async () => {
    const qm = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
    assert.strictEqual(isValidCid(qm), true, `Expected true for: ${qm}`);
  });

  await test('accepts valid CIDv1 (bafy...)', async () => {
    const bafy = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
    assert.strictEqual(isValidCid(bafy), true, `Expected true for: ${bafy}`);
  });

  await test('rejects mock- prefix CID', async () => {
    assert.strictEqual(isValidCid('mock-abc123'), false);
  });

  await test('rejects empty string', async () => {
    assert.strictEqual(isValidCid(''), false);
  });

  await test('rejects null', async () => {
    assert.strictEqual(isValidCid(null), false);
  });

  await test('rejects random short string', async () => {
    assert.strictEqual(isValidCid('abc123'), false);
  });

  await test('rejects string with spaces', async () => {
    assert.strictEqual(isValidCid('Qm abc'), false);
  });
}

// ── IPFS Mode Selection Tests ─────────────────────────────────────────────────

suite('getMode() — IPFS provider selection');

{
  const savedEnv = {
    IPFS_PROVIDER: process.env.IPFS_PROVIDER,
    PINATA_JWT: process.env.PINATA_JWT,
    PINATA_API_KEY: process.env.PINATA_API_KEY,
    PINATA_API_SECRET: process.env.PINATA_API_SECRET,
  };

  function resetEnv() {
    delete process.env.IPFS_PROVIDER;
    delete process.env.PINATA_JWT;
    delete process.env.PINATA_API_KEY;
    delete process.env.PINATA_API_SECRET;
    // Clear require cache so getMode() re-reads env
    delete require.cache[require.resolve('../services/ipfs/ipfsService')];
  }

  function restoreEnv() {
    Object.entries(savedEnv).forEach(([k, v]) => {
      if (v !== undefined) process.env[k] = v;
      else delete process.env[k];
    });
    delete require.cache[require.resolve('../services/ipfs/ipfsService')];
  }

  await test('defaults to mock when no credentials set', async () => {
    resetEnv();
    const { getMode } = require('../services/ipfs/ipfsService');
    assert.strictEqual(getMode(), 'mock');
    restoreEnv();
  });

  await test('returns pinata when PINATA_JWT is set', async () => {
    resetEnv();
    process.env.PINATA_JWT = 'test-jwt-token';
    const { getMode } = require('../services/ipfs/ipfsService');
    assert.strictEqual(getMode(), 'pinata');
    restoreEnv();
  });

  await test('returns pinata when PINATA_API_KEY+SECRET are set', async () => {
    resetEnv();
    process.env.PINATA_API_KEY = 'key123';
    process.env.PINATA_API_SECRET = 'secret456';
    const { getMode } = require('../services/ipfs/ipfsService');
    assert.strictEqual(getMode(), 'pinata');
    restoreEnv();
  });

  await test('IPFS_PROVIDER=pinata overrides credential detection', async () => {
    resetEnv();
    process.env.IPFS_PROVIDER = 'pinata';
    // No credentials set — mode should still be 'pinata' (will throw at upload time)
    const { getMode } = require('../services/ipfs/ipfsService');
    assert.strictEqual(getMode(), 'pinata');
    restoreEnv();
  });

  await test('IPFS_PROVIDER=mock forces mock even if credentials present', async () => {
    resetEnv();
    process.env.IPFS_PROVIDER = 'mock';
    process.env.PINATA_JWT = 'some-jwt';
    const { getMode } = require('../services/ipfs/ipfsService');
    assert.strictEqual(getMode(), 'mock');
    restoreEnv();
  });

  await test('IPFS_PROVIDER=PINATA (uppercase) still works', async () => {
    resetEnv();
    process.env.IPFS_PROVIDER = 'PINATA';
    const { getMode } = require('../services/ipfs/ipfsService');
    assert.strictEqual(getMode(), 'pinata');
    restoreEnv();
  });
}

// ── Pinata Upload: No Silent Fallback ────────────────────────────────────────

suite('uploadEncryptedFile — no silent fallback when pinata mode + no credentials');

{
  const savedEnv = {
    IPFS_PROVIDER: process.env.IPFS_PROVIDER,
    PINATA_JWT: process.env.PINATA_JWT,
  };

  await test('throws explicit error when IPFS_PROVIDER=pinata but no credentials', async () => {
    delete process.env.PINATA_JWT;
    delete process.env.PINATA_API_KEY;
    delete process.env.PINATA_API_SECRET;
    process.env.IPFS_PROVIDER = 'pinata';
    delete require.cache[require.resolve('../services/ipfs/ipfsService')];
    const { uploadEncryptedFile } = require('../services/ipfs/ipfsService');

    let threw = false;
    try {
      await uploadEncryptedFile(Buffer.from('test'), 'test.pdf');
    } catch (err) {
      threw = true;
      assert.ok(
        err.message.includes('no credentials are configured'),
        `Expected credential error, got: ${err.message}`
      );
    }
    assert.ok(threw, 'Expected uploadEncryptedFile to throw when pinata+no-credentials');

    // Restore
    if (savedEnv.PINATA_JWT) process.env.PINATA_JWT = savedEnv.PINATA_JWT;
    else delete process.env.PINATA_JWT;
    if (savedEnv.IPFS_PROVIDER) process.env.IPFS_PROVIDER = savedEnv.IPFS_PROVIDER;
    else delete process.env.IPFS_PROVIDER;
    delete require.cache[require.resolve('../services/ipfs/ipfsService')];
  });
}

// ── Pinata Upload Timeout ─────────────────────────────────────────────────────

suite('uploadToPinata — AbortController timeout');

{
  await test('throws timeout error when fetch takes too long', async () => {
    // Mock global fetch to simulate a hanging request
    const originalFetch = global.fetch;
    global.fetch = () => new Promise((_, reject) => {
      // Simulate the AbortError that fetch throws on controller.abort()
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      // Reject immediately to simulate the abort
      setTimeout(() => reject(err), 5);
    });

    delete process.env.IPFS_PROVIDER;
    process.env.PINATA_JWT = 'mock-jwt';
    delete require.cache[require.resolve('../services/ipfs/ipfsService')];
    const { uploadEncryptedFile } = require('../services/ipfs/ipfsService');

    let errorMsg = '';
    try {
      await uploadEncryptedFile(Buffer.from('data'), 'test.pdf');
    } catch (err) {
      errorMsg = err.message;
    }

    assert.ok(
      errorMsg.includes('timed out') || errorMsg.includes('AbortError') || errorMsg.includes('aborted'),
      `Expected timeout/abort error, got: "${errorMsg}"`
    );

    // Restore
    global.fetch = originalFetch;
    delete process.env.PINATA_JWT;
    delete require.cache[require.resolve('../services/ipfs/ipfsService')];
  });
}

// ── Wallet Challenge Tests ────────────────────────────────────────────────────

suite('generateChallenge — nonce generation');

{
  const userRoutes = require('../routes/userRoutes');

  await test('returns 200 with message, nonce, and expiresAt for valid address', async () => {
    const result = userRoutes.generateChallenge({
      walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    });
    assert.strictEqual(result.statusCode, 200);
    assert.ok(result.body.message, 'message should be present');
    assert.ok(result.body.nonce, 'nonce should be present');
    assert.ok(result.body.expiresAt > Date.now(), 'expiresAt should be in the future');
    assert.ok(
      result.body.message.includes('MedChain L2'),
      'message should contain MedChain L2'
    );
    assert.ok(
      result.body.message.includes(result.body.nonce),
      'message should embed the nonce'
    );
  });

  await test('returns 400 for invalid wallet address', async () => {
    const result = userRoutes.generateChallenge({ walletAddress: 'not-an-address' });
    assert.strictEqual(result.statusCode, 400);
    assert.ok(result.body.error);
  });

  await test('returns 400 for missing wallet address', async () => {
    const result = userRoutes.generateChallenge({});
    assert.strictEqual(result.statusCode, 400);
  });

  await test('nonce is 32-char hex (16 random bytes)', async () => {
    const result = userRoutes.generateChallenge({
      walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    });
    assert.match(result.body.nonce, /^[0-9a-f]{32}$/, 'nonce should be 32 hex chars');
  });

  await test('successive calls generate different nonces', async () => {
    const addr = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    const r1 = userRoutes.generateChallenge({ walletAddress: addr });
    const r2 = userRoutes.generateChallenge({ walletAddress: addr });
    assert.notStrictEqual(r1.body.nonce, r2.body.nonce, 'nonces should differ across calls');
  });

  await test('expiresAt is approximately 5 minutes in the future', async () => {
    const result = userRoutes.generateChallenge({
      walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    });
    const diffMs = result.body.expiresAt - Date.now();
    const fiveMins = 5 * 60 * 1000;
    assert.ok(diffMs > fiveMins - 1000, 'expiresAt should be ~5 min from now');
    assert.ok(diffMs < fiveMins + 1000, 'expiresAt should not be more than 5 min + 1s');
  });
}

// ── Wallet Verify Tests ───────────────────────────────────────────────────────

suite('verifySignature — challenge-response validation');

{
  const userRoutes = require('../routes/userRoutes');

  await test('returns 401 when no challenge was issued for address', async () => {
    const result = await userRoutes.verifySignature({
      walletAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      signature: '0x' + 'ab'.repeat(65),
    });
    assert.strictEqual(result.statusCode, 401);
    assert.ok(result.body.error.includes('No active challenge'));
  });

  await test('returns 400 for invalid wallet address', async () => {
    const result = await userRoutes.verifySignature({
      walletAddress: 'bad-address',
      signature: '0xabc',
    });
    assert.strictEqual(result.statusCode, 400);
  });

  await test('returns 400 for missing/invalid signature', async () => {
    const result = await userRoutes.verifySignature({
      walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      signature: 'not-a-0x-sig',
    });
    assert.strictEqual(result.statusCode, 400);
    assert.ok(result.body.error.includes('signature'));
  });

  await test('full challenge-verify cycle succeeds with real ethers signing', async () => {
    let ethers;
    try {
      ethers = require('ethers');
    } catch {
      console.log('     ℹ️  Skipping ethers signing test — ethers not installed');
      return;
    }

    // Create a deterministic test wallet
    const wallet = ethers.Wallet.createRandom();
    const address = wallet.address;

    // Step 1: Generate challenge
    const challengeResult = userRoutes.generateChallenge({ walletAddress: address });
    assert.strictEqual(challengeResult.statusCode, 200);
    const { message } = challengeResult.body;

    // Step 2: Sign challenge with ethers (simulates MetaMask personal_sign)
    const signature = await wallet.signMessage(message);

    // Step 3: Verify
    const verifyResult = await userRoutes.verifySignature({ walletAddress: address, signature });
    assert.strictEqual(verifyResult.statusCode, 200, `Expected 200, got: ${JSON.stringify(verifyResult.body)}`);
    assert.strictEqual(verifyResult.body.authenticated, true);
    assert.strictEqual(verifyResult.body.walletAddress.toLowerCase(), address.toLowerCase());
  });

  await test('nonce is consumed after successful verification (replay protection)', async () => {
    let ethers;
    try {
      ethers = require('ethers');
    } catch {
      console.log('     ℹ️  Skipping replay test — ethers not installed');
      return;
    }

    const wallet = ethers.Wallet.createRandom();
    const address = wallet.address;

    // Generate + sign + verify once
    const challengeResult = userRoutes.generateChallenge({ walletAddress: address });
    const signature = await wallet.signMessage(challengeResult.body.message);
    await userRoutes.verifySignature({ walletAddress: address, signature });

    // Trying to verify again with the same signature should now fail
    const replayResult = await userRoutes.verifySignature({ walletAddress: address, signature });
    assert.strictEqual(
      replayResult.statusCode,
      401,
      'Second verify attempt should be rejected (nonce consumed)'
    );
    assert.ok(
      replayResult.body.error.includes('No active challenge') ||
        replayResult.body.error.includes('expired'),
      `Expected replay rejection, got: ${replayResult.body.error}`
    );
  });

  await test('wrong signer returns 401', async () => {
    let ethers;
    try {
      ethers = require('ethers');
    } catch {
      console.log('     ℹ️  Skipping wrong-signer test — ethers not installed');
      return;
    }

    const wallet = ethers.Wallet.createRandom();
    const attacker = ethers.Wallet.createRandom();
    const address = wallet.address;

    // Generate challenge for wallet
    const challengeResult = userRoutes.generateChallenge({ walletAddress: address });
    // Sign with ATTACKER'S key but claim wallet's address
    const attackerSig = await attacker.signMessage(challengeResult.body.message);

    const verifyResult = await userRoutes.verifySignature({
      walletAddress: address,
      signature: attackerSig,
    });
    assert.strictEqual(verifyResult.statusCode, 401, 'Wrong signer should be rejected');
    assert.ok(
      verifyResult.body.error.includes('does not match') ||
        verifyResult.body.error.includes('failed'),
      `Expected mismatch error, got: ${verifyResult.body.error}`
    );
  });
}

// ── Mock IPFS round-trip ──────────────────────────────────────────────────────

suite('Mock IPFS round-trip');

{
  await test('upload and retrieve encrypted buffer in mock mode', async () => {
    delete process.env.IPFS_PROVIDER;
    delete process.env.PINATA_JWT;
    delete process.env.PINATA_API_KEY;
    delete process.env.PINATA_API_SECRET;
    delete require.cache[require.resolve('../services/ipfs/ipfsService')];

    const { uploadEncryptedFile, retrieveEncryptedFile, getMode } = require('../services/ipfs/ipfsService');
    assert.strictEqual(getMode(), 'mock');

    const original = Buffer.from('encrypted-payload-for-round-trip-test');
    const { cid, mode } = await uploadEncryptedFile(original, 'roundtrip.test');
    assert.strictEqual(mode, 'mock');
    assert.ok(cid.startsWith('mock-'), `CID should start with 'mock-', got: ${cid}`);

    const retrieved = await retrieveEncryptedFile(cid, 'mock');
    assert.ok(Buffer.isBuffer(retrieved));
    assert.ok(retrieved.equals(original), 'Retrieved buffer should match original');
  });

  await test('retrieveEncryptedFile rejects invalid CID (path traversal attempt)', async () => {
    delete require.cache[require.resolve('../services/ipfs/ipfsService')];
    const { retrieveEncryptedFile } = require('../services/ipfs/ipfsService');

    let threw = false;
    try {
      await retrieveEncryptedFile('../../etc/passwd', 'mock');
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('Invalid') || err.message.includes('unsafe'));
    }
    assert.ok(threw, 'Should throw for path traversal CID');
  });
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll IPFS + Wallet auth tests passed!');
}

})().catch((err) => {
  console.error('Unexpected test runner error:', err);
  process.exit(1);
});
