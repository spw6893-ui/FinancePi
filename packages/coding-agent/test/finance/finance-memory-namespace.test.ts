import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

import { AgentSession } from "../../src/core/agent-session.ts";
import { AuthStorage } from "../../src/core/auth-storage.ts";
import financeAgentExtension from "../../src/core/finance-agent-extension.ts";
import type { MemoryManager } from "../../src/core/memory/memory-manager.ts";
import type { MemoryProvider } from "../../src/core/memory/memory-provider.ts";
import { createFinanceMemoryNamespace } from "../../src/core/memory/namespace-registry.ts";
import { ModelRegistry } from "../../src/core/model-registry.ts";
import { SessionManager } from "../../src/core/session-manager.ts";
import { SettingsManager } from "../../src/core/settings-manager.ts";
import { createTestExtensionsResult, createTestResourceLoader } from "../utilities.ts";

function getText(result: any): string {
	return result.content
		?.filter((item: any) => item.type === "text")
		.map((item: any) => item.text)
		.join("\n");
}

async function withTempCwd<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
	const cwd = await mkdtemp(join(tmpdir(), "pi-finance-memory-"));
	try {
		await mkdir(join(cwd, ".git"), { recursive: true });
		return await fn(cwd);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
}

function createMemoryTestSession(
	cwd: string,
	extensionsResult: Awaited<ReturnType<typeof createTestExtensionsResult>>,
) {
	const authStorage = AuthStorage.inMemory();
	authStorage.setRuntimeApiKey("anthropic", "test-key");
	return new AgentSession({
		agent: new Agent({
			getApiKey: () => "test-key",
			initialState: {
				model: getModel("anthropic", "claude-sonnet-4-5")!,
				systemPrompt: "base prompt",
				tools: [],
			},
		}),
		sessionManager: SessionManager.inMemory(),
		settingsManager: SettingsManager.inMemory(),
		cwd,
		modelRegistry: ModelRegistry.inMemory(authStorage),
		resourceLoader: createTestResourceLoader({ extensionsResult }),
		baseToolsOverride: {},
	});
}

describe("finance memory namespace", () => {
	it("registers generic memory tools with finance namespace available", async () => {
		await withTempCwd(async (cwd) => {
			const result = await createTestExtensionsResult([{ factory: financeAgentExtension, path: "<finance>" }], cwd);
			const extension = result.extensions[0];

			expect(extension?.memoryNamespaces.map((namespace) => namespace.namespace)).toEqual(["finance"]);
			expect(extension?.tools.has("memory_list")).toBe(false);
			expect(extension?.tools.has("memory_read")).toBe(false);
			expect(extension?.tools.has("memory_search")).toBe(false);
			expect(extension?.tools.has("memory_write")).toBe(false);

			const session = createMemoryTestSession(cwd, result);
			const write = session.getToolDefinition("memory_write");
			const search = session.getToolDefinition("memory_search");
			const writeResult = await write?.execute(
				"write",
				{
					namespace: "finance",
					target: "watchlist",
					action: "add",
					content: "symbol=NVDA | asOf=2026-06-21 | 用户关注 AI infrastructure。",
				},
				undefined,
				undefined,
				{ cwd } as never,
			);
			const searchResult = await search?.execute(
				"search",
				{ namespace: "finance", query: "NVDA" },
				undefined,
				undefined,
				{ cwd } as never,
			);

			expect(getText(writeResult)).toContain("memory_write: success");
			expect(getText(searchResult)).toContain(".pi/memory/finance/WATCHLIST.md:1");
			session.dispose();
		});
	});

	it("injects compact finance memory context from AgentSession core prompt rebuild", async () => {
		await withTempCwd(async (cwd) => {
			await mkdir(join(cwd, ".pi/memory/finance"), { recursive: true });
			await writeFile(join(cwd, ".pi/memory/finance/USER.md"), "用户偏好 crypto 使用 Binance public data。");
			const result = await createTestExtensionsResult([{ factory: financeAgentExtension, path: "<finance>" }], cwd);
			const session = createMemoryTestSession(cwd, result);

			try {
				expect(session.systemPrompt).toContain("CORE MEMORY CONTEXT");
				expect(session.systemPrompt).toContain("用户偏好 crypto 使用 Binance public data");
				expect(session.systemPrompt).toContain("Use namespace=finance");
				expect(session.systemPrompt).toContain("memory_search");
			} finally {
				session.dispose();
			}
		});
	});

	it("exposes memory tools from core when an extension only registers a namespace", async () => {
		await withTempCwd(async (cwd) => {
			const result = await createTestExtensionsResult(
				[
					{
						path: "<memory-only>",
						factory: (pi) => {
							pi.registerMemoryNamespace(createFinanceMemoryNamespace());
						},
					},
				],
				cwd,
			);
			const session = createMemoryTestSession(cwd, result);

			try {
				const allToolNames = session.getAllTools().map((tool) => tool.name);
				expect(allToolNames).toContain("memory_list");
				expect(allToolNames).toContain("memory_read");
				expect(allToolNames).toContain("memory_search");
				expect(allToolNames).toContain("memory_write");
				expect(allToolNames).toContain("memory_session_search");
				expect(session.getActiveToolNames()).toEqual([
					"memory_list",
					"memory_read",
					"memory_search",
					"memory_write",
					"memory_session_search",
				]);
				expect(session.systemPrompt).toContain("- memory_search: Search persistent memory");
				expect(session.systemPrompt).toContain("- memory_session_search: Search prior project session memory");
				expect(session.systemPrompt).toContain("CORE MEMORY CONTEXT");
			} finally {
				session.dispose();
			}
		});
	});

	it("collects extension-registered memory providers into AgentSession memory manager", async () => {
		await withTempCwd(async (cwd) => {
			const provider: MemoryProvider = {
				name: "external-memory",
				isAvailable: () => true,
				initialize: async () => {},
				prefetch: async (query) => `provider:${query}`,
			};
			const result = await createTestExtensionsResult(
				[
					{
						path: "<memory-provider>",
						factory: (pi) => {
							pi.registerMemoryNamespace(createFinanceMemoryNamespace());
							pi.registerMemoryProvider(provider);
						},
					},
				],
				cwd,
			);
			const session = createMemoryTestSession(cwd, result);

			try {
				const manager = (session as unknown as { _getMemoryManager: () => MemoryManager })._getMemoryManager();
				await manager.initializeProviders({ namespace: "finance" });

				expect(result.extensions[0]?.memoryProviders.map((item) => item.name)).toEqual(["external-memory"]);
				expect(manager.getAvailableProviders().map((item) => item.name)).toEqual(["external-memory"]);
				expect(await manager.prefetch("NVDA", { namespace: "finance" })).toBe("provider:NVDA");
			} finally {
				session.dispose();
			}
		});
	});

	it("initializes and shuts down extension memory providers with AgentSession lifecycle", async () => {
		await withTempCwd(async (cwd) => {
			const events: string[] = [];
			const provider: MemoryProvider = {
				name: "lifecycle-memory",
				isAvailable: () => true,
				initialize: async (ctx) => {
					events.push(`init:${ctx.sessionId ?? "none"}`);
				},
				systemPromptBlock: async () => "PROVIDER MEMORY CONTEXT",
				shutdown: async () => {
					events.push("shutdown");
				},
			};
			const result = await createTestExtensionsResult(
				[
					{
						path: "<memory-provider-lifecycle>",
						factory: (pi) => {
							pi.registerMemoryNamespace(createFinanceMemoryNamespace());
							pi.registerMemoryProvider(provider);
						},
					},
				],
				cwd,
			);
			const session = createMemoryTestSession(cwd, result);

			await session.bindExtensions({});
			expect(events).toEqual([`init:${session.sessionId}`]);
			expect(session.systemPrompt).toContain("PROVIDER MEMORY CONTEXT");

			session.dispose();
			expect(events).toEqual([`init:${session.sessionId}`, "shutdown"]);
		});
	});

	it("keeps finance before_agent_start focused on finance prompt only", async () => {
		await withTempCwd(async (cwd) => {
			const result = await createTestExtensionsResult([{ factory: financeAgentExtension, path: "<finance>" }], cwd);
			const handler = result.extensions[0]?.handlers.get("before_agent_start")?.[0];

			const output = (await handler?.(
				{
					type: "before_agent_start",
					prompt: "analyze BTC",
					systemPrompt: "base prompt with core memory already applied",
					systemPromptOptions: {} as never,
				},
				{ cwd } as never,
			)) as { systemPrompt?: string } | undefined;

			expect(output?.systemPrompt).toContain("FINANCE AGENT MODE");
			expect(output?.systemPrompt).not.toContain("CORE MEMORY CONTEXT");
		});
	});
});
