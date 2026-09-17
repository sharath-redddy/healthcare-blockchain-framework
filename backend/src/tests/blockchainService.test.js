// Module 8: Layer-2 Integration — blockchain service tests
// Run with: node src/tests/blockchainService.test.js
//
// This sandbox has neither `ethers` installed nor a live RPC endpoint,
// so the live on-chain calls (addRecordOnChain, grantAccessOnChain,
// etc.) cannot be exercised here. What IS fully tested: (1) the service
// never crashes on import even without ethers/config, (2) every
// exported function fails with a clear, specific error instead of an
// unhandled exception, and (3) the pure address-format validator.

const assert = require('assert');
const { isPlausibleAddress, isBlockchainConfigured } = require('../constants/blockchain');
const blockchainService = require('../services/blockchain/blockchainService');

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
  console.log('Running Module 8 blockchain service tests (no ethers/RPC in this sandbox)...\n');

  test('isPlausibleAddress accepts a well-formed 0x address', () => {
    assert.strictEqual(isPlausibleAddress('0x' + 'a'.repeat(40)), true);
  });

  test('isPlausibleAddress rejects malformed addresses', () => {
    assert.strictEqual(isPlausibleAddress('not-an-address'), false);
    assert.strictEqual(isPlausibleAddress('0x123'), false); // too short
    assert.strictEqual(isPlausibleAddress('0x' + 'g'.repeat(40)), false); // invalid hex
    assert.strictEqual(isPlausibleAddress(''), false);
    assert.strictEqual(isPlausibleAddress(null), false);
    assert.strictEqual(isPlausibleAddress(undefined), false);
  });

  test('isBlockchainConfigured() is false with no RPC_URL/PRIVATE_KEY/CONTRACT_ADDRESS set', () => {
    assert.strictEqual(isBlockchainConfigured(), false);
  });

  await asyncTest('getContract() throws a clear, specific error rather than crashing', async () => {
    let threw = false;
    let message = '';
    try {
      blockchainService.getContract();
    } catch (err) {
      threw = true;
      message = err.message;
    }
    assert.strictEqual(threw, true);
    assert.ok(
      /ethers.*installed|Blockchain is not configured/i.test(message),
      `expected a clear config/ethers error, got: "${message}"`
    );
  });

  await asyncTest('grantAccessOnChain() rejects with a clear error, not an unhandled exception', async () => {
    let threw = false;
    try {
      await blockchainService.grantAccessOnChain('0x' + 'b'.repeat(40));
    } catch (err) {
      threw = true;
      assert.ok(err.message.length > 0);
    }
    assert.strictEqual(threw, true);
  });

  await asyncTest('hasAccessOnChain() rejects with a clear error, not an unhandled exception', async () => {
    let threw = false;
    try {
      await blockchainService.hasAccessOnChain('0x' + 'c'.repeat(40), '0x' + 'd'.repeat(40));
    } catch (err) {
      threw = true;
    }
    assert.strictEqual(threw, true);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    '\nNOTE: Live on-chain behavior (actual transactions/reads against a running ' +
      'Hardhat node or L2 testnet) is NOT exercised by these tests — this sandbox has ' +
      'neither ethers installed nor network access. See the final report for how to ' +
      'verify it locally.'
  );
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
