// Module 8: Layer-2 Integration
//
// Loads blockchain/.env if present using Node's built-in process.loadEnvFile
// (Node 20.12+/21.7+ — no dotenv dependency needed). Local Hardhat network
// works with zero configuration; the L2 testnet network only appears in
// `networks` when RPC_URL + PRIVATE_KEY are actually set, so running
// `npx hardhat test`/`compile` never requires real credentials.

const path = require('path');

try {
  process.loadEnvFile(path.resolve(__dirname, '.env'));
} catch {
  // No blockchain/.env present (or Node < 20.12) — fine, local network
  // still works fully unconfigured. See .env.example.
}

require('@nomicfoundation/hardhat-toolbox');

const RPC_URL = process.env.RPC_URL || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const CHAIN_ID = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : undefined;

const l2Network =
  RPC_URL && PRIVATE_KEY
    ? {
        polygonAmoy: {
          // Named for Polygon Amoy per the Abstract's default choice, but
          // this slot works for any EVM L2 testnet (e.g. Arbitrum Sepolia)
          // — just point RPC_URL/CHAIN_ID at that network instead.
          url: RPC_URL,
          accounts: [PRIVATE_KEY],
          ...(CHAIN_ID ? { chainId: CHAIN_ID } : {}),
        },
      }
    : {};

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: '0.8.24', // matches Abstract's "Solidity (v0.8.x)" requirement
  paths: {
    sources: './contracts',
    tests: './test',
    scripts: './scripts',
  },
  networks: {
    hardhat: {}, // local, ephemeral, in-process — used by `npx hardhat test`
    ...l2Network,
  },
};
