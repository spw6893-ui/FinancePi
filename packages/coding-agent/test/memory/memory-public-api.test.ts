import { describe, expect, it } from "vitest";
import type { MemoryNamespaceConfig } from "../../src/index.ts";
import { createFinanceMemoryNamespace, MemoryManager } from "../../src/index.ts";

describe("memory public API", () => {
	it("exports namespace types and helpers for external extensions", () => {
		const namespace: MemoryNamespaceConfig = createFinanceMemoryNamespace();
		const manager = new MemoryManager({ cwd: process.cwd(), namespaces: [namespace] });

		expect(namespace.namespace).toBe("finance");
		expect(manager.getNamespaces().map((item) => item.namespace)).toEqual(["finance"]);
	});
});
