# Core Memory Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working core memory substrate for Pi with local file-backed namespaces, generic memory tools, and a Finance namespace integration.

**Architecture:** Add focused core memory modules under `packages/coding-agent/src/core/memory/`. The first implementation is local-file only, with namespace/target configs, compact prompt snapshots, safe write operations, and generic tools exposed through the Finance extension as the first consumer. Provider hooks remain typed but inactive.

**Tech Stack:** TypeScript, TypeBox tool schemas, Vitest, existing Pi extension runtime.

---

## Files

- Create: `packages/coding-agent/src/core/memory/memory-types.ts`
- Create: `packages/coding-agent/src/core/memory/memory-security.ts`
- Create: `packages/coding-agent/src/core/memory/memory-store.ts`
- Create: `packages/coding-agent/src/core/memory/memory-context.ts`
- Create: `packages/coding-agent/src/core/memory/memory-tools.ts`
- Create: `packages/coding-agent/src/core/memory/namespace-registry.ts`
- Create: `packages/coding-agent/src/core/memory/memory-provider.ts`
- Create: `packages/coding-agent/test/memory/memory-store.test.ts`
- Create: `packages/coding-agent/test/memory/memory-tools.test.ts`
- Create: `packages/coding-agent/test/finance/finance-memory-namespace.test.ts`
- Modify: `packages/coding-agent/src/core/finance-agent-extension.ts`

## Task 1: Core memory store

- [x] Add tests for namespace path resolution, add/replace/remove/batch, duplicate skip, capacity overflow, safety scan, list/read/search.
- [x] Implement `memory-types.ts`.
- [x] Implement `memory-security.ts`.
- [x] Implement `memory-store.ts`.
- [x] Run `npm --prefix packages/coding-agent exec vitest run test/memory/memory-store.test.ts`.

## Task 2: Core memory tools

- [x] Add tests that execute `memory_list`, `memory_read`, `memory_search`, and `memory_write` via tool definitions.
- [x] Implement `memory-tools.ts`.
- [x] Implement `namespace-registry.ts`.
- [x] Implement typed but inactive `memory-provider.ts`.
- [x] Run `npm --prefix packages/coding-agent exec vitest run test/memory/memory-tools.test.ts`.

## Task 3: Memory context and Finance namespace

- [x] Add finance namespace integration tests.
- [x] Implement `memory-context.ts`.
- [x] Register Finance namespace and generic memory tools in `finance-agent-extension.ts`.
- [x] Append compact Finance memory prompt block in `before_agent_start`.
- [x] Add memory guidance to the Finance prompt and market continuation text.
- [x] Run `npm --prefix packages/coding-agent exec vitest run test/finance/finance-memory-namespace.test.ts`.

## Task 4: Verification and commit

- [x] Run memory and finance focused tests.
- [x] Run `npm --prefix packages/coding-agent run build`.
- [x] Run `npm run check` if focused verification passes.
- [ ] Commit implementation.
