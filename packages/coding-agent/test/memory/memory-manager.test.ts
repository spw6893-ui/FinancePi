import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MemoryManager } from "../../src/core/memory/memory-manager.ts";
import type { MemoryNamespaceConfig } from "../../src/core/memory/memory-types.ts";

function namespace(name = "finance"): MemoryNamespaceConfig {
	return {
		namespace: name,
		root: `.pi/memory/${name}`,
		description: `${name} memory`,
		targets: [
			{
				target: "user",
				layer: "user",
				file: "USER.md",
				charLimit: 1800,
				injectPolicy: "always",
				description: "User memory",
			},
			{
				target: "research",
				layer: "domain",
				file: "RESEARCH.md",
				charLimit: 8000,
				injectPolicy: "search_only",
				description: "Research memory",
			},
		],
		promptGuidelines: [`Use namespace=${name}.`],
	};
}

async function withTempCwd<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
	const cwd = await mkdtemp(join(tmpdir(), "pi-memory-manager-"));
	try {
		await mkdir(join(cwd, ".git"), { recursive: true });
		return await fn(cwd);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
}

describe("MemoryManager", () => {
	it("deduplicates namespaces and builds tools plus prompt context from one core facade", async () => {
		await withTempCwd(async (cwd) => {
			await mkdir(join(cwd, ".pi/memory/finance"), { recursive: true });
			await writeFile(join(cwd, ".pi/memory/finance/USER.md"), "用户偏好免费公开数据源。");

			const manager = new MemoryManager({
				cwd,
				namespaces: [namespace("finance"), namespace("finance")],
			});

			expect(manager.getNamespaces().map((item) => item.namespace)).toEqual(["finance"]);
			expect(manager.hasNamespaces()).toBe(true);
			expect(manager.createTools().map((tool) => tool.name)).toEqual([
				"memory_list",
				"memory_read",
				"memory_search",
				"memory_write",
			]);
			expect(manager.buildSystemPromptBlock()).toContain("CORE MEMORY CONTEXT");
			expect(manager.buildSystemPromptBlock()).toContain("用户偏好免费公开数据源");
			expect(manager.getStore().list({ namespace: "finance" }).entries).toHaveLength(2);
		});
	});
});
