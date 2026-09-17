// Unified Backend Test Runner for Healthcare Blockchain Framework
// Executes all module test suites sequentially and outputs a summary.

const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

const testDir = __dirname;
const testFiles = [
  'roleService.test.js',
  'api.test.js',
  'multipart.test.js',
  'uploadLimits.test.js',
  'aesService.test.js',
  'ipfsService.test.js',
  'recordPipeline.test.js',
  'blockchainService.test.js',
  'accessRoutes.test.js',
  'keyExchangeService.test.js',
  'keyRoutes.test.js',
  'providerAccess.test.js',
  'retrievalDecryption.test.js',
  'auditTrail.test.js',
  'securityHardening.test.js',
  'finalE2E.test.js',
];

console.log('================================================================');
console.log(' Healthcare Blockchain Framework — Backend Test Suite');
console.log(` Running ${testFiles.length} test suites`);
console.log('================================================================\n');

let suitesPassed = 0;
let suitesFailed = 0;

function runSuite(index) {
  if (index >= testFiles.length) {
    console.log('\n================================================================');
    console.log(` Test Suites Summary: ${suitesPassed} passed, ${suitesFailed} failed of ${testFiles.length} total.`);
    console.log('================================================================');
    process.exit(suitesFailed > 0 ? 1 : 0);
    return;
  }

  const file = testFiles[index];
  console.log(`>>> [${index + 1}/${testFiles.length}] ${file}`);

  const child = fork(path.join(testDir, file), [], { stdio: 'inherit' });

  child.on('exit', (code) => {
    if (code === 0) {
      suitesPassed++;
    } else {
      suitesFailed++;
      console.error(`❌ Suite failed: ${file} (exit code ${code})`);
    }
    console.log('');
    runSuite(index + 1);
  });
}

runSuite(0);
