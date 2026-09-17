// Module 2: User & Role Management — unit tests
// Run with: node src/tests/roleService.test.js
// Uses only Node's built-in `assert` module — no test framework
// dependency added, per dependency-control rule.

const assert = require('assert');
const { ROLES, VALID_ROLES, isValidRole } = require('../constants/roles');
const User = require('../models/User');
const userService = require('../services/userService');

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

console.log('Running Module 2 unit tests (roles, User model, userService)...\n');

test('VALID_ROLES contains exactly PATIENT, DOCTOR, HOSPITAL_ADMIN', () => {
  assert.deepStrictEqual(
    [...VALID_ROLES].sort(),
    ['DOCTOR', 'HOSPITAL_ADMIN', 'PATIENT']
  );
});

test('isValidRole accepts every defined role', () => {
  Object.values(ROLES).forEach((role) => {
    assert.strictEqual(isValidRole(role), true, `${role} should be valid`);
  });
});

test('isValidRole rejects an unsupported role string', () => {
  assert.strictEqual(isValidRole('NURSE'), false);
});

test('isValidRole rejects non-string / empty / missing input', () => {
  assert.strictEqual(isValidRole(''), false);
  assert.strictEqual(isValidRole(null), false);
  assert.strictEqual(isValidRole(undefined), false);
  assert.strictEqual(isValidRole(123), false);
});

test('User model creates a valid PATIENT with the expected shape', () => {
  const user = new User({ name: 'Asha Rao', role: ROLES.PATIENT });
  assert.ok(user.id, 'user should have an id');
  assert.strictEqual(user.name, 'Asha Rao');
  assert.strictEqual(user.role, 'PATIENT');
  assert.strictEqual(user.walletAddress, null);
  assert.ok(user.createdAt, 'user should have createdAt');
});

test('User model rejects an invalid role', () => {
  assert.throws(() => new User({ name: 'Bad Actor', role: 'NURSE' }));
});

test('User model rejects a blank name', () => {
  assert.throws(() => new User({ name: '   ', role: ROLES.DOCTOR }));
});

test('userService.createUser stores a retrievable user', () => {
  userService.clearUsers();
  const created = userService.createUser({ name: 'Dr. Iyer', role: ROLES.DOCTOR });
  const fetched = userService.getUserById(created.id);
  assert.strictEqual(fetched.id, created.id);
  assert.strictEqual(fetched.role, 'DOCTOR');
});

test('userService.listUsers reflects all created users', () => {
  userService.clearUsers();
  userService.createUser({ name: 'Patient A', role: ROLES.PATIENT });
  userService.createUser({ name: 'Hospital A', role: ROLES.HOSPITAL_ADMIN });
  assert.strictEqual(userService.listUsers().length, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
