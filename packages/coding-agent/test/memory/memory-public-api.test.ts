import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionManager } from "../../src/core/session-manager.ts";
import type { MemoryNamespaceConfig, MemoryProvider, MemorySessionSearchOptions } from "../../src/index.ts";
import { createFinanceMemoryNamespace, MemoryManager, searchSessionMemory } from "../../src/index.ts";

async function withTempCwd<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
	const cwd = await mkdtemp(join(tmpdir(), "pi-memory-public-api-"));
	try {
		await mkdir(join(cwd, ".git"), { recursive: true });
		return await fn(cwd);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
}

describe("memory public API", () => {
	it("exports namespace types and helpers for external extensions", () => {
		const namespace: MemoryNamespaceConfig = createFinanceMemoryNamespace();
		const manager = new MemoryManager({ cwd: process.cwd(), namespaces: [namespace] });

		expect(namespace.namespace).toBe("finance");
		expect(manager.getNamespaces().map((item) => item.namespace)).toEqual(["finance"]);
	});

	it("exposes ranked persistent memory search results through the store", async () => {
		await withTempCwd(async (cwd) => {
			const namespace: MemoryNamespaceConfig = {
				namespace: "finance",
				root: ".pi/memory/finance",
				description: "Finance memory",
				targets: [
					{
						target: "research",
						layer: "domain",
						file: "RESEARCH.md",
						charLimit: 1000,
						injectPolicy: "search_only",
						description: "Research memory",
					},
				],
			};
			const manager = new MemoryManager({ cwd, namespaces: [namespace] });
			await manager.getStore().write({
				namespace: "finance",
				target: "research",
				action: "add",
				content: "symbol=NVDA | asOf=2026-06-21 | Blackwell capex margin thesis.",
			});

			const result = await manager.getStore().search({ namespace: "finance", query: "NVDA capex" });

			expect(result.matches[0].score).toBeGreaterThan(0);
			expect(result.matches[0].snippet).toContain("NVDA");
		});
	});

	it("exports provider lifecycle types for external memory adapters", async () => {
		const provider: MemoryProvider = {
			name: "test-memory-provider",
			isAvailable: () => true,
			initialize: async () => {},
			prefetch: async (query) => `prefetched:${query}`,
		};

		expect(provider.name).toBe("test-memory-provider");
		expect(await provider.prefetch?.("NVDA", { cwd: process.cwd(), namespace: "finance" })).toBe("prefetched:NVDA");
	});

	it("exports session memory search helper for local recall adapters", async () => {
		await withTempCwd(async (cwd) => {
			const sessionDir = join(cwd, ".pi/agent/sessions");
			await mkdir(sessionDir, { recursive: true });
			const session = SessionManager.create(cwd, sessionDir);
			session.appendMessage({ role: "user", content: "NVDA Blackwell capex recall", timestamp: 1 });
			session.appendMessage({
				role: "assistant",
				content: [{ type: "text", text: "NVDA capex response" }],
				api: "responses",
				provider: "openai",
				model: "gpt-5.5",
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: 2,
			});
			const options: MemorySessionSearchOptions = {
				cwd,
				query: "NVDA capex",
				limit: 1,
				sessionDir,
			};

			const result = await searchSessionMemory(options);

			expect(Array.isArray(result.matches)).toBe(true);
			expect(result.matches[0].score).toBeGreaterThan(0);
			expect(result.matches[0].snippet).toContain("NVDA");
		});
	});
});
