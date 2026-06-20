# Finance Agent Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an embedded, database-free US equity/ETF finance agent capability for Pi.

**Architecture:** Add `packages/finance` as a TypeScript workspace package with injectable fetch-based providers and no long-running service. Add a built-in Pi finance extension, plus an example wrapper, that registers finance tools and appends finance research guidance to the system prompt.

**Tech Stack:** TypeScript, Node 22 fetch, Vitest, Pi extension API, TypeBox schemas.

---

## File Structure

- Create `packages/finance/package.json`: workspace package metadata and test script.
- Create `packages/finance/tsconfig.build.json`: build config.
- Create `packages/finance/src/contracts.ts`: shared finance data types.
- Create `packages/finance/src/symbols.ts`: symbol normalization and market inference.
- Create `packages/finance/src/technical.ts`: technical snapshot calculation.
- Create `packages/finance/src/client.ts`: Yahoo/SEC fetch client and context orchestration.
- Create `packages/finance/src/index.ts`: public exports.
- Create `packages/finance/test/*.test.ts`: unit tests.
- Modify `tsconfig.json`: add path alias for `@earendil-works/pi-finance`.
- Modify `packages/coding-agent/tsconfig.examples.json`: add path alias for examples.
- Create `packages/coding-agent/src/core/finance-agent-extension.ts`: built-in Pi extension tools and system prompt.
- Create `packages/coding-agent/examples/extensions/finance-agent.ts`: example wrapper for the built-in extension.
- Modify `packages/coding-agent/src/cli/args.ts`, `packages/coding-agent/src/cli/builtin-extensions.ts`, and `packages/coding-agent/src/main.ts`: wire `--finance`.

### Task 1: Finance package skeleton and failing tests

**Files:**
- Create: `packages/finance/package.json`
- Create: `packages/finance/tsconfig.build.json`
- Create: `packages/finance/test/symbols.test.ts`
- Create: `packages/finance/test/technical.test.ts`
- Create: `packages/finance/test/client.test.ts`

- [x] **Step 1: Write failing tests**

Tests assert:

- `normalizeSymbol("brk-b")` returns `BRK-B`.
- `normalizeSymbol("spy")` returns `SPY`.
- `inferMarketCode("AAPL")` returns `US`.
- `buildTechnicalSnapshot()` computes latest close, simple returns, SMA values and trend.
- `FinanceClient.getSymbolContext("AAPL")` combines quote, history, news, technical snapshot and SEC facts with source health.
- `FinanceClient.getSymbolContext()` degrades one failed source without failing the full context.

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
cd packages/finance
node ../../node_modules/vitest/dist/cli.js --run test/symbols.test.ts test/technical.test.ts test/client.test.ts
```

Expected: fail because source modules do not exist.

### Task 2: Implement finance core

**Files:**
- Create: `packages/finance/src/contracts.ts`
- Create: `packages/finance/src/symbols.ts`
- Create: `packages/finance/src/technical.ts`
- Create: `packages/finance/src/client.ts`
- Create: `packages/finance/src/index.ts`

- [x] **Step 1: Implement minimal symbol helpers**
- [x] **Step 2: Implement technical snapshot calculation**
- [x] **Step 3: Implement fetch helpers with JSON parsing and degraded results**
- [x] **Step 4: Implement quote/history/news/sec/context/compare/brief methods**
- [x] **Step 5: Run finance tests until green**

### Task 3: Add Pi finance extension

**Files:**
- Modify: `tsconfig.json`
- Modify: `packages/coding-agent/tsconfig.examples.json`
- Create: `packages/coding-agent/src/core/finance-agent-extension.ts`
- Create: `packages/coding-agent/src/cli/builtin-extensions.ts`
- Create: `packages/coding-agent/examples/extensions/finance-agent.ts`
- Modify: `packages/coding-agent/src/cli/args.ts`
- Modify: `packages/coding-agent/src/main.ts`

- [x] **Step 1: Register finance tools with clear schemas**
- [x] **Step 2: Append system prompt finance research rules**
- [x] **Step 3: Wire built-in `--finance` CLI shortcut**
- [x] **Step 4: Type-check examples through `npm run check`**

### Task 4: Final verification

- [x] Run finance tests.
- [x] Run `npm run check`.
- [x] Report changed files and any remaining risks.
