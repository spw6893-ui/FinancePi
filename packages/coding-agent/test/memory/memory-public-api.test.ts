import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MemoryNamespaceConfig, MemoryProvider, MemorySessionSearchOptions } from "../../src/index.ts";
import { createFinanceMemoryNamespace, MemoryManager, searchSessionMemory } from "../../src/index.ts";

async function withTempCwd<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
	const cwd = await mkdtemp(join(tmpdir(), "pi-memory-public-api-"));
	try {
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
			const options: MemorySessionSearchOptions = {
				cwd,
				query: "unlikely-session-query",
				limit: 1,
				sessionDir: join(cwd, ".pi/agent/sessions"),
			};

			const result = await searchSessionMemory(options);

			expect(Array.isArray(result.matches)).toBe(true);
		});
	});
});
