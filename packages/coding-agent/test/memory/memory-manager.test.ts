import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MemoryManager } from "../../src/core/memory/memory-manager.ts";
import type { MemoryProvider } from "../../src/core/memory/memory-provider.ts";
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
				"memory_session_search",
				"memory_research_report",
			]);
			expect(manager.buildSystemPromptBlock()).toContain("CORE MEMORY CONTEXT");
			expect(manager.buildSystemPromptBlock()).toContain("用户偏好免费公开数据源");
			expect(manager.getStore().list({ namespace: "finance" }).entries).toHaveLength(2);
		});
	});

	it("runs available provider lifecycle hooks through the core facade", async () => {
		await withTempCwd(async (cwd) => {
			const events: string[] = [];
			const provider: MemoryProvider = {
				name: "external",
				isAvailable: async () => true,
				initialize: async (ctx) => {
					events.push(`init:${ctx.cwd}:${ctx.namespace ?? "none"}`);
				},
				systemPromptBlock: async () => "EXTERNAL MEMORY BLOCK",
				prefetch: async (query, ctx) => {
					events.push(`prefetch:${query}:${ctx.namespace ?? "none"}`);
					return `recall:${query}`;
				},
				syncTurn: async (turn, ctx) => {
					events.push(`sync:${turn.user}->${turn.assistant}:${ctx.sessionId ?? "none"}`);
				},
				onSessionEnd: async (_messages, ctx) => {
					events.push(`end:${ctx.sessionId ?? "none"}`);
				},
				shutdown: async () => {
					events.push("shutdown");
				},
			};
			const unavailable: MemoryProvider = {
				name: "unavailable",
				isAvailable: () => false,
				initialize: async () => {
					events.push("unavailable-init");
				},
			};
			const manager = new MemoryManager({
				cwd,
				namespaces: [namespace("finance")],
				providers: [provider, unavailable],
			});

			await manager.initializeProviders({ sessionId: "s1", namespace: "finance" });
			const promptBlock = await manager.buildProviderSystemPromptBlock();
			const prefetch = await manager.prefetch("NVDA", { namespace: "finance" });
			await manager.syncTurn(
				{ user: "remember NVDA", assistant: "saved" },
				{ sessionId: "s1", namespace: "finance" },
			);
			await manager.onSessionEnd([], { sessionId: "s1", namespace: "finance" });
			await manager.shutdownProviders();

			expect(manager.getAvailableProviders().map((item) => item.name)).toEqual(["external"]);
			expect(promptBlock).toBe("EXTERNAL MEMORY BLOCK");
			expect(prefetch).toBe("recall:NVDA");
			expect(events).toEqual([
				`init:${cwd}:finance`,
				"prefetch:NVDA:finance",
				"sync:remember NVDA->saved:s1",
				"end:s1",
				"shutdown",
			]);
		});
	});
});
