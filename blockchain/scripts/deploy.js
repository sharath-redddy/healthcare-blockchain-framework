// Module 8: deploy HealthcareRecords to whichever network Hardhat is
// pointed at (local in-process network by default, or the L2 testnet
// configured via blockchain/.env + --network flag).
//
// Usage:
//   npx hardhat run scripts/deploy.js                       # local
//   npx hardhat run scripts/deploy.js --network polygonAmoy  # L2 testnet

const hre = require('hardhat');

async function main() {
  const Factory = await hre.ethers.getContractFactory('HealthcareRecords');
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('HealthcareRecords deployed to:', address);
  console.log('Set this as CONTRACT_ADDRESS in backend/.env to use it from the backend.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
