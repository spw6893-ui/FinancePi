import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildMemorySystemPromptBlock } from "../../src/core/memory/memory-context.ts";
import { MemoryStore } from "../../src/core/memory/memory-store.ts";
import type { MemoryNamespaceConfig } from "../../src/core/memory/memory-types.ts";

function namespace(): MemoryNamespaceConfig {
	return {
		namespace: "finance",
		root: ".pi/memory/finance",
		description: "Finance memory",
		targets: [
			{
				target: "user",
				layer: "user",
				file: "USER.md",
				charLimit: 500,
				injectPolicy: "always",
				description: "User memory",
			},
			{
				target: "research",
				layer: "domain",
				file: "RESEARCH.md",
				charLimit: 500,
				injectPolicy: "search_only",
				description: "Research memory",
			},
		],
		promptGuidelines: ["Use namespace=finance for finance memory."],
	};
}

async function withTempCwd<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
	const cwd = await mkdtemp(join(tmpdir(), "pi-memory-context-"));
	try {
		await mkdir(join(cwd, ".pi/memory/finance"), { recursive: true });
		return await fn(cwd);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
}

describe("buildMemorySystemPromptBlock", () => {
	it("injects configured snapshot targets and omits search-only targets", async () => {
		await withTempCwd(async (cwd) => {
			const config = namespace();
			await writeFile(join(cwd, ".pi/memory/finance/USER.md"), "用户偏好免费公开数据源。");
			await writeFile(join(cwd, ".pi/memory/finance/RESEARCH.md"), "symbol=NVDA | old research note");

			const block = buildMemorySystemPromptBlock(new MemoryStore({ cwd, namespaces: [config] }), [config]);

			expect(block).toContain("CORE MEMORY CONTEXT");
			expect(block).toContain("Use namespace=finance");
			expect(block).toContain("finance/user");
			expect(block).toContain("用户偏好免费公开数据源");
			expect(block).not.toContain("old research note");
		});
	});
});
