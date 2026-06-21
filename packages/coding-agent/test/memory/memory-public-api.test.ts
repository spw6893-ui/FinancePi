import { describe, expect, it } from "vitest";
import type { MemoryNamespaceConfig, MemoryProvider } from "../../src/index.ts";
import { createFinanceMemoryNamespace, MemoryManager } from "../../src/index.ts";

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
});
