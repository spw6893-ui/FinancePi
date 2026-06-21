import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

import { AgentSession } from "../../src/core/agent-session.ts";
import { AuthStorage } from "../../src/core/auth-storage.ts";
import financeAgentExtension from "../../src/core/finance-agent-extension.ts";
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

describe("finance memory namespace", () => {
	it("registers generic memory tools with finance namespace available", async () => {
		await withTempCwd(async (cwd) => {
			const result = await createTestExtensionsResult([{ factory: financeAgentExtension, path: "<finance>" }], cwd);
			const extension = result.extensions[0];

			expect(extension?.memoryNamespaces.map((namespace) => namespace.namespace)).toEqual(["finance"]);
			expect(extension?.tools.has("memory_list")).toBe(true);
			expect(extension?.tools.has("memory_read")).toBe(true);
			expect(extension?.tools.has("memory_search")).toBe(true);
			expect(extension?.tools.has("memory_write")).toBe(true);

			const write = extension?.tools.get("memory_write")?.definition;
			const search = extension?.tools.get("memory_search")?.definition;
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
		});
	});

	it("injects compact finance memory context from AgentSession core prompt rebuild", async () => {
		await withTempCwd(async (cwd) => {
			await mkdir(join(cwd, ".pi/memory/finance"), { recursive: true });
			await writeFile(join(cwd, ".pi/memory/finance/USER.md"), "用户偏好 crypto 使用 Binance public data。");
			const result = await createTestExtensionsResult([{ factory: financeAgentExtension, path: "<finance>" }], cwd);
			const authStorage = AuthStorage.inMemory();
			authStorage.setRuntimeApiKey("anthropic", "test-key");
			const session = new AgentSession({
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
				resourceLoader: createTestResourceLoader({ extensionsResult: result }),
				baseToolsOverride: {},
			});

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
