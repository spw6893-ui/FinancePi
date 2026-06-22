import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
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
				"memory_index_search",
				"memory_write_policy",
				"memory_compact",
				"memory_session_search",
				"memory_suggest_promotions",
				"memory_promote_session",
				"memory_research_report",
				"memory_audit",
				"memory_provider_audit",
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

	it("automatically passes the single active namespace to provider lifecycle hooks", async () => {
		await withTempCwd(async (cwd) => {
			const namespaces: string[] = [];
			const provider: MemoryProvider = {
				name: "single-namespace-provider",
				isAvailable: () => true,
				initialize: async (ctx) => {
					namespaces.push(`init:${ctx.namespace ?? "none"}`);
				},
				prefetch: async (_query, ctx) => {
					namespaces.push(`prefetch:${ctx.namespace ?? "none"}`);
					return "";
				},
				syncTurn: async (_turn, ctx) => {
					namespaces.push(`sync:${ctx.namespace ?? "none"}`);
				},
				onSessionEnd: async (_messages, ctx) => {
					namespaces.push(`end:${ctx.namespace ?? "none"}`);
				},
			};
			const manager = new MemoryManager({
				cwd,
				namespaces: [namespace("finance")],
				providers: [provider],
			});

			await manager.initializeProviders({ sessionId: "s1" });
			await manager.prefetch("NVDA");
			await manager.syncTurn({ user: "u", assistant: "a" });
			await manager.onSessionEnd([]);

			expect(namespaces).toEqual(["init:finance", "prefetch:finance", "sync:finance", "end:finance"]);
		});
	});

	it("isolates failing providers from available provider lifecycle hooks", async () => {
		await withTempCwd(async (cwd) => {
			const events: string[] = [];
			const failingInit: MemoryProvider = {
				name: "failing-init",
				isAvailable: () => true,
				initialize: async () => {
					throw new Error("init failed");
				},
			};
			const failingRuntime: MemoryProvider = {
				name: "failing-runtime",
				isAvailable: () => true,
				initialize: async () => {
					events.push("bad-init-called");
				},
				systemPromptBlock: async () => {
					throw new Error("prompt failed");
				},
				prefetch: async () => {
					throw new Error("prefetch failed");
				},
				syncTurn: async () => {
					throw new Error("sync failed");
				},
				onSessionEnd: async () => {
					throw new Error("end failed");
				},
				shutdown: async () => {
					throw new Error("shutdown failed");
				},
			};
			const healthy: MemoryProvider = {
				name: "healthy",
				isAvailable: () => true,
				initialize: async () => {
					events.push("healthy-init");
				},
				systemPromptBlock: async () => "HEALTHY MEMORY",
				prefetch: async (query) => `healthy:${query}`,
				syncTurn: async () => {
					events.push("healthy-sync");
				},
				onSessionEnd: async () => {
					events.push("healthy-end");
				},
				shutdown: async () => {
					events.push("healthy-shutdown");
				},
			};
			const manager = new MemoryManager({
				cwd,
				namespaces: [namespace("finance")],
				providers: [failingInit, failingRuntime, healthy],
			});

			await expect(manager.initializeProviders({ sessionId: "s1" })).resolves.toBeUndefined();
			await expect(manager.buildProviderSystemPromptBlock()).resolves.toBe("HEALTHY MEMORY");
			await expect(manager.prefetch("NVDA")).resolves.toBe("healthy:NVDA");
			await expect(manager.syncTurn({ user: "u", assistant: "a" })).resolves.toBeUndefined();
			await expect(manager.onSessionEnd([], { sessionId: "s1" })).resolves.toBeUndefined();
			await expect(manager.shutdownProviders()).resolves.toBeUndefined();

			expect(manager.getAvailableProviders().map((provider) => provider.name)).toEqual([
				"failing-runtime",
				"healthy",
			]);
			expect(events).toEqual(["bad-init-called", "healthy-init", "healthy-sync", "healthy-end", "healthy-shutdown"]);
			expect(
				manager.getProviderErrors().map((error) => `${error.provider}:${error.phase}:${error.message}`),
			).toEqual([
				"failing-init:initialize:init failed",
				"failing-runtime:systemPromptBlock:prompt failed",
				"failing-runtime:prefetch:prefetch failed",
				"failing-runtime:syncTurn:sync failed",
				"failing-runtime:onSessionEnd:end failed",
				"failing-runtime:shutdown:shutdown failed",
			]);
		});
	});

	it("audits configured providers, available providers, and provider errors", async () => {
		await withTempCwd(async (cwd) => {
			const failing: MemoryProvider = {
				name: "failing",
				isAvailable: () => true,
				initialize: async () => {
					throw new Error("init failed");
				},
			};
			const healthy: MemoryProvider = {
				name: "healthy",
				isAvailable: () => true,
				initialize: async () => {},
			};
			const unavailable: MemoryProvider = {
				name: "unavailable",
				isAvailable: () => false,
				initialize: async () => {},
			};
			const manager = new MemoryManager({
				cwd,
				namespaces: [namespace("finance")],
				providers: [failing, healthy, unavailable],
			});

			await manager.initializeProviders();
			const tool = manager.createTools().find((item) => item.name === "memory_provider_audit");
			const result = await tool?.execute("provider-audit", {}, undefined, undefined, { cwd } as never);
			const output = result?.content
				?.filter((item) => item.type === "text")
				.map((item) => item.text)
				.join("\n");

			expect(output).toContain("memory_provider_audit: configured=3 available=1 errors=1");
			expect(output).toContain("configured=failing,healthy,unavailable");
			expect(output).toContain("available=healthy");
			expect(output).toContain("error provider=failing phase=initialize message=init failed");
		});
	});

	it("does not duplicate provider tool registration errors across repeated tool creation", async () => {
		await withTempCwd(async (cwd) => {
			const provider: MemoryProvider = {
				name: "colliding",
				isAvailable: () => true,
				initialize: async () => {},
				getToolDefinitions: () => [
					{
						name: "memory_write",
						description: "Provider collision.",
						parameters: Type.Object({}),
					},
				],
			};
			const manager = new MemoryManager({
				cwd,
				namespaces: [namespace("finance")],
				providers: [provider],
			});

			await manager.initializeProviders();
			manager.createProviderTools();
			manager.createProviderTools();

			expect(manager.getProviderErrors()).toEqual([
				{
					provider: "colliding",
					phase: "toolRegistration",
					message: "tool name conflicts with core memory tool: memory_write",
				},
			]);
		});
	});

	it("skips duplicate tool names from later memory providers", async () => {
		await withTempCwd(async (cwd) => {
			const first: MemoryProvider = {
				name: "first",
				isAvailable: () => true,
				initialize: async () => {},
				getToolDefinitions: () => [
					{
						name: "memory_external_lookup",
						description: "First provider lookup.",
						parameters: Type.Object({}),
					},
				],
			};
			const second: MemoryProvider = {
				name: "second",
				isAvailable: () => true,
				initialize: async () => {},
				getToolDefinitions: () => [
					{
						name: "memory_external_lookup",
						description: "Second provider duplicate lookup.",
						parameters: Type.Object({}),
					},
				],
			};
			const manager = new MemoryManager({
				cwd,
				namespaces: [namespace("finance")],
				providers: [first, second],
			});

			await manager.initializeProviders();
			const tools = manager.createProviderTools();

			expect(tools.map((tool) => tool.name)).toEqual(["memory_external_lookup"]);
			expect(manager.getProviderErrors()).toEqual([
				{
					provider: "second",
					phase: "toolRegistration",
					message: "tool name conflicts with another memory provider tool: memory_external_lookup",
				},
			]);
		});
	});

	it("passes project and namespace context into provider-owned memory tools", async () => {
		await withTempCwd(async (cwd) => {
			let toolContext = "";
			const provider: MemoryProvider = {
				name: "contextual-provider",
				isAvailable: () => true,
				initialize: async () => {},
				getToolDefinitions: () => [
					{
						name: "memory_external_context",
						description: "Read provider tool context.",
						parameters: Type.Object({}),
					},
				],
				handleToolCall: async (_toolName, _args, ctx) => {
					toolContext = `${ctx.cwd}:${ctx.namespace ?? "none"}:${ctx.sessionId ?? "none"}`;
					return toolContext;
				},
			};
			const manager = new MemoryManager({
				cwd,
				namespaces: [namespace("finance")],
				providers: [provider],
			});

			await manager.initializeProviders({ sessionId: "s1", namespace: "finance" });
			const tool = manager.createProviderTools().find((item) => item.name === "memory_external_context");
			const result = await tool?.execute("context", {}, undefined, undefined, {
				cwd,
				sessionManager: { getSessionId: () => "s1" },
			} as never);
			const output = result?.content
				?.filter((item) => item.type === "text")
				.map((item) => item.text)
				.join("\n");

			expect(toolContext).toBe(`${cwd}:finance:s1`);
			expect(output).toContain(`${cwd}:finance:s1`);
		});
	});
});
