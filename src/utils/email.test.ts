import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidEmail } from "./email.js";

test("isValidEmail accepts common valid email addresses", () => {
  assert.equal(isValidEmail("user@example.com"), true);
  assert.equal(isValidEmail("first.last+tag@sub.example.co.uk"), true);
  assert.equal(isValidEmail("user_name-123@example-domain.io"), true);
});

test("isValidEmail rejects malformed email addresses", () => {
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("plain-address"), false);
  assert.equal(isValidEmail("missing-at.example.com"), false);
  assert.equal(isValidEmail("missing-domain@"), false);
  assert.equal(isValidEmail("@missing-local.com"), false);
  assert.equal(isValidEmail("user@example"), false);
  assert.equal(isValidEmail("user@.com"), false);
  assert.equal(isValidEmail("user@example..com"), false);
  assert.equal(isValidEmail("user name@example.com"), false);
  assert.equal(isValidEmail(" user@example.com"), false);
  assert.equal(isValidEmail("user@example.com "), false);
});
