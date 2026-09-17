// Module 6: IPFS Integration — unit tests
// Run with: node src/tests/ipfsService.test.js
//
// This sandbox has no network access, so only the MOCK path is
// exercised here. See docs/module-log.md for what this does and does
// not prove about the real Pinata path.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { uploadEncryptedFile, retrieveEncryptedFile, getMode } = require('../services/ipfs/ipfsService');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL - ${name}`);
    console.log(`         ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  PASS - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL - ${name}`);
    console.log(`         ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('Running Module 6 IPFS service unit tests (mock path — no network in this sandbox)...\n');

  test('getMode() reports "mock" when no Pinata env vars are set', () => {
    assert.strictEqual(getMode(), 'mock');
  });

  await asyncTest('uploadEncryptedFile returns an unmistakably-fake CID in mock mode', async () => {
    const encrypted = Buffer.from('ciphertext-looking-bytes-not-real-encryption-here');
    const { cid, mode } = await uploadEncryptedFile(encrypted, 'test-record');
    assert.strictEqual(mode, 'mock');
    assert.ok(cid.startsWith('mock-'), `expected CID to start with "mock-", got "${cid}"`);
  });

  await asyncTest('retrieveEncryptedFile returns the exact bytes that were uploaded', async () => {
    const encrypted = Buffer.from('another-synthetic-ciphertext-blob-0123456789');
    const { cid, mode } = await uploadEncryptedFile(encrypted, 'test-record-2');
    const retrieved = await retrieveEncryptedFile(cid, mode);
    assert.strictEqual(retrieved.toString('hex'), encrypted.toString('hex'));
  });

  await asyncTest('retrieveEncryptedFile throws for a CID that was never uploaded', async () => {
    let threw = false;
    try {
      await retrieveEncryptedFile('mock-nonexistent-cid-0000', 'mock');
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, true);
  });

  await asyncTest('the file stored on disk for a given CID contains only the encrypted bytes given to it', () => {
    const marker = 'PLAINTEXT_MARKER_SHOULD_NEVER_APPEAR_UNENCRYPTED';
    const encryptedLooking = Buffer.from(`scrambled-${marker}-scrambled`); // simulate: this is what "encrypted" bytes look like here
    return uploadEncryptedFile(encryptedLooking, 'marker-test').then(({ cid }) => {
      const storedPath = path.join(__dirname, '../../storage/mock-ipfs', `${cid}.bin`);
      const onDisk = fs.readFileSync(storedPath);
      // What's on disk must be byte-for-byte what we handed to uploadEncryptedFile
      // (i.e. ipfsService never re-derives or substitutes content) — the actual
      // "plaintext never reaches this module" guarantee is proven separately in
      // recordPipeline.test.js, where the real AES ciphertext is what arrives here.
      assert.strictEqual(onDisk.toString('utf8'), encryptedLooking.toString('utf8'));
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    '\nNOTE: The "pinata" code path (uploadToPinata/retrieveFromPinata in ' +
      'ipfsService.js) is NOT exercised by these tests — this sandbox has no ' +
      'network access. It is syntax-checked and logically mirrors the mock path, ' +
      'but has not been run against the real Pinata API. See the final report ' +
      'for how to verify it with real credentials.'
  );
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
