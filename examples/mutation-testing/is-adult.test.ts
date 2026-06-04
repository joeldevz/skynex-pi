import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdult } from './is-adult.ts';

// WEAK test suite on purpose.
// It gives 100% line + branch coverage of `isAdult`, yet it never pins the
// boundary at exactly 18. Plain `npm test` is GREEN, so the gap is invisible
// today. Mutation testing (Stryker) will expose it: the mutant `>=` -> `>`
// survives because no test distinguishes 18 from 19.

test('an adult (25) is allowed', () => {
  assert.equal(isAdult(25), true);
});

test('a child (5) is not allowed', () => {
  assert.equal(isAdult(5), false);
});

// Boundary assertion: this is what was missing. Pinning exactly 18 kills the
// `>=` -> `>` mutant that survived before.
test('exactly 18 is an adult (boundary)', () => {
  assert.equal(isAdult(18), true);
});
