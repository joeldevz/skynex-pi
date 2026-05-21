---
name: tdd-discipline
description: Strict TDD enforcement — RED, GREEN, REFACTOR cycle. Tests first, code after. Iron-law extension enforces this at write time.
---

# TDD Discipline

> "Code without a failing test is speculation. Tests without failing first are
> tautological. Discipline is what turns speculation into engineering."

## When to Use

Load BEFORE writing any production code. Especially:
- New function or module being created
- Bug fix (the bug needs a failing test BEFORE the fix)
- Refactor that should preserve behavior (tests prove preservation)

DO NOT use for:
- Pure documentation changes (no code → no test)
- Pure config changes (env vars, package.json scripts)
- Generated code (migrations, codegen artifacts)

## Compact Rules

1. NEVER write production code before a failing test exists
2. NEVER skip the RED phase (test must fail at least once with current code missing)
3. NEVER write more code than needed to pass the current test
4. NEVER batch test creation — one test, one cycle
5. After GREEN, ALWAYS run the full suite to catch regressions
6. Tests must test BEHAVIOR (inputs → outputs), not implementation details
7. Each test name describes the contract: "Given X, when Y, then Z"
8. Tests must be independent — no shared mutable state
9. If iron-law blocks a write, that's the signal to write the test first
10. Refactor only with GREEN tests — never refactor with broken tests

## The Three-Phase Cycle

### Phase 1: RED — Write the failing test

```typescript
test("Given empty cart, when checkout is called, then it throws EmptyCartError", () => {
  const cart = new Cart();
  assert.throws(() => cart.checkout(), EmptyCartError);
});
```

Run the test. **It MUST fail** (the function doesn't exist yet).

### Phase 2: GREEN — Write just enough code to pass

```typescript
class Cart {
  checkout() {
    if (this.items.length === 0) throw new EmptyCartError();
    // ... bare minimum
  }
}
```

Run the test. **It MUST pass.** Stop writing code immediately.

### Phase 3: REFACTOR — Improve without changing behavior

Clean up, extract, rename. The test still passes. If a test breaks during refactor, you changed behavior — that's a new RED phase.

## Iron-Law Integration

The `iron-law` extension enforces TDD at the runtime level:

- Blocks `write` / `edit` on source files if no corresponding `.test.*` file shows a failing test
- Override with `/iron-law:override "<path>"` if you have a legitimate reason
- Shows status with `/iron-law:status`

If iron-law blocks you, your workflow is wrong: write the test first.

## Anti-Patterns (do NOT do)

| Anti-pattern | Why it fails |
|--------------|--------------|
| Writing tests after code | Tests rationalize the code, don't drive it |
| Writing 5 tests then 5 implementations | Loses the RED→GREEN feedback per test |
| Skipping RED because "it would obviously fail" | Often it doesn't — bug in test runner config |
| Tests that test implementation (private methods) | Refactoring breaks tests for no reason |
| Tests with shared mutable state | Order-dependent failures, hard to debug |
| "I'll add tests later" | Later never comes |
| `.test.ts` files for pure TypeScript types | Type erasure makes them tautological (see coder.md guidance) |

## Test Naming Convention

Format: "Given <context>, when <action>, then <outcome>"

Examples:
- ✅ "Given empty cart, when checkout is called, then it throws EmptyCartError"
- ✅ "Given valid email, when isValidEmail is called, then it returns true"
- ❌ "test checkout 1" (no context, no expectation)
- ❌ "checkout works" (vague)

## Triangulation

When uncertain how to generalize, write a SECOND failing test that constrains the implementation:

```typescript
// Test 1
test("isValidEmail('user@domain.com') returns true", () => { ... });

// Implementation: return true; (passes!)

// Test 2 (triangulation)
test("isValidEmail('not-an-email') returns false", () => { ... });

// Now implementation must actually validate
```

Triangulation forces real implementation, prevents `return true` cheating.

## Refactor Triggers

REFACTOR when you see:
- Duplicate code (DRY)
- Magic numbers (extract constants)
- Long methods (extract functions)
- Unclear names (rename)
- Comments explaining "what" (extract to function name)

Each refactor: tests stay GREEN. If they break, revert and try smaller.

## Workflow

```
1. Pick the next acceptance criterion from PLAN.md
2. Write ONE failing test for that criterion (RED)
3. Run tests — confirm it fails for the right reason
4. Write minimum code to pass (GREEN)
5. Run tests — confirm pass + no regressions in other tests
6. Refactor if needed — tests stay GREEN
7. Commit (code + test together, per work-unit-commits)
8. Next criterion → repeat
```

## Connection to Other Skills

- **iron-law extension**: enforces this at runtime
- **work-unit-commits**: each cycle (RED→GREEN→REFACTOR) is one commit
- **verification-before-completion**: tests must be GREEN before claiming done
- **coder**: applies these rules during build phase

## Neurox Integration

- **Save patterns**: `neurox_save(observation_type="pattern", tags=["tdd", "<project>"])` for project-specific test conventions
- **Recall**: `neurox_recall(query="tdd conventions <project>")` at the start of any new feature
