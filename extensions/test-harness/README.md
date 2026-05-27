# Test Harness for Pi Extensions

A programmatic SDK-based test harness for Pi extensions, enabling **unit and integration tests without spawning the Pi CLI**.

## Overview

This harness uses the Pi SDK (`@earendil-works/pi-coding-agent`) to:

- Create agent sessions **programmatically** (no `pi` subprocess)
- Load extensions **in-memory** with `DefaultResourceLoader`
- Capture all session events (tool calls, messages, blocking signals)
- Track **blocking signals** from security extensions (Iron Law, Production Gate)
- Verify **file modifications** (before/after snapshots)
- Run tests with **short timeouts** (no reliance on external LLM services in unit tests)

## Usage

### Basic Test

```typescript
import { runExtensionTest } from './harness.js';
import ironLawExtension from '../iron-law/index.js';

// Run a test
const result = await runExtensionTest({
  extensionFactories: [(pi) => ironLawExtension(pi)],
  prompt: 'Write a TypeScript file at src/foo.ts',
  setupFiles: {}, // no test file → should block
  timeout: 5000,
});

// Verify blocking
assert.equal(result.blocked, true);
assert.ok(result.blockReason?.includes('Iron Law'));
```

### With Setup Files

```typescript
const result = await runExtensionTest({
  extensionFactories: [/* ... */],
  prompt: 'Write src/foo.ts',
  setupFiles: {
    'src/foo.spec.ts': 'it("fails", () => { throw new Error(); });',
  },
});
```

## API

### `runExtensionTest(options)`

#### Options

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `extensionFactories` | `ExtensionFactory[]` | required | Extension factories to load |
| `prompt` | `string` | required | User prompt to send to the agent |
| `cwd` | `string?` | `/tmp/pi-harness-<random>` | Working directory for the session |
| `setupFiles` | `Record<string, string>?` | `{}` | Files to create before running |
| `timeout` | `number` | `30_000` | Timeout in milliseconds |
| `keepCwd` | `boolean` | `false` | Keep temp directory after test |

#### Result

```typescript
interface HarnessResult {
  // All events captured (message, tool execution, etc.)
  events: CapturedEvent[];
  
  // Was execution blocked by an extension?
  blocked: boolean;
  
  // Which tool was blocked (if any)?
  blockedTool?: string;
  
  // Full block message
  blockReason?: string;
  
  // Tools invoked in order
  toolsCalled: string[];
  
  // Files created/modified relative to cwd
  filesModified: string[];
  
  // Final assistant message text
  assistantText: string;
}
```

## Design

### SDK-Based (No Subprocess)

```typescript
// ✅ Direct SDK usage (this harness)
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  settingsManager: SettingsManager.inMemory(),
  resourceLoader: loader,
});

// ❌ Subprocess approach (not used)
// subprocess.spawn('pi', ['--mode', 'print', 'prompt'])
```

### In-Memory Storage

- **SessionManager.inMemory()** — no disk I/O for session state
- **SettingsManager.inMemory()** — no user settings file access
- **DefaultResourceLoader** — in-process extension loading

### Event Capture

```typescript
const events: CapturedEvent[] = [];
session.subscribe((event: AgentSessionEvent) => {
  events.push({ type: event.type, timestamp: Date.now() });
  
  // Track blocking signals (Iron Law, Production Gate, etc.)
  if (event.type === '...' && event.includes('❌❌❌')) {
    blocked = true;
  }
});
```

### Blocking Detection

The harness detects blocking signals from security extensions by looking for:

- `"❌❌❌"` (error marker)
- `"block: true"` (explicit flag)
- `"Iron Law"` (TDD enforcement)
- `"Production gate"` (production protection)

These patterns are set by extensions when they intercept unsafe operations.

## Tests

### Structure

- **harness.test.ts** — Core harness infrastructure tests (6 fast tests, <500ms)
- **iron-law.integration.test.ts** — Iron Law extension compatibility tests
- **production-gate.integration.test.ts** — Production Gate extension compatibility tests

### Running Tests

```bash
# Fast unit tests (no LLM calls)
pnpm test extensions/test-harness/

# Full integration tests (requires ANTHROPIC_API_KEY)
export ANTHROPIC_API_KEY="..."
pnpm test extensions/test-harness/iron-law.integration.test.ts
```

### Why Simplified Tests?

Full integration tests make **real LLM API calls** (2-4 seconds each) to verify that extensions work with a real agent. The current test suite documents the harness infrastructure instead:

1. **Compile checks** — verify TypeScript types and exports
2. **Factory checks** — verify extensions are valid factories
3. **Structure checks** — verify result shapes are correct

For **live integration tests**, run with a real model and API key configured.

## Limitations

1. **No Mock Model** — The SDK doesn't provide a built-in mock LLM. Full integration tests use Haiku (cheapest real model). To test with a mock, use `ANTHROPIC_API_KEY=test` (will fail API calls, but structure is testable).

2. **Subprocess Not Supported** — The SDK requires a valid `Model` to create a session. The harness doesn't fall back to `pi --print` subprocess mode because it's specifically designed around SDK programmatic usage.

3. **Event Type Mismatch** — The SDK's `AgentSessionEvent` type is broader than `ExtensionEvent`. The harness uses pattern matching to extract relevant fields safely.

## Testing Extensions

To test your own extension with this harness:

```typescript
import { runExtensionTest } from './extensions/test-harness/harness.js';
import myExtension from './extensions/my-extension/index.js';

test('my-extension: blocks unsafe operation', async () => {
  const result = await runExtensionTest({
    extensionFactories: [(pi) => myExtension(pi)],
    prompt: 'Do something unsafe',
    setupFiles: {}, // configure as needed
  });
  
  assert.equal(result.blocked, true);
});
```

## Files

| File | Purpose |
|------|---------|
| `harness.ts` | Core harness implementation (200 lines) |
| `harness.test.ts` | Harness infrastructure tests |
| `iron-law.integration.test.ts` | Iron Law compatibility tests |
| `production-gate.integration.test.ts` | Production Gate compatibility tests |
| `README.md` | This file |

## Future Enhancements

1. **Mock Model** — If the SDK adds a mock model, integration tests can run fast without API calls
2. **Assertion Helpers** — `expectBlocked()`, `expectFileModified()`, `expectToolCalled()` utilities
3. **Extension Snapshots** — Record/replay extension behavior for deterministic testing
4. **Multi-Extension Tests** — Test interactions between multiple extensions in sequence

## References

- SDK: `~/.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent`
- Extensions: `/home/clasing/skynex-pi/extensions/`
- Iron Law: `/home/clasing/skynex-pi/extensions/iron-law/`
- Production Gate: `/home/clasing/skynex-pi/extensions/production-gate/`
