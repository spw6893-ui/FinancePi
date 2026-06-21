import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createMemoryTools } from "../../src/core/memory/memory-tools.ts";
import type { MemoryNamespaceConfig } from "../../src/core/memory/memory-types.ts";
import { SessionManager } from "../../src/core/session-manager.ts";

function text(result: any): string {
	return result.content
		?.filter((item: any) => item.type === "text")
		.map((item: any) => item.text)
		.join("\n");
}

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
	};
}

async function withTempCwd<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
	const cwd = await mkdtemp(join(tmpdir(), "pi-memory-tools-"));
	try {
		await mkdir(join(cwd, ".git"), { recursive: true });
		return await fn(cwd);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
}

describe("memory tools", () => {
	it("writes, lists, searches, and reads namespace memory", async () => {
		await withTempCwd(async (cwd) => {
			const [list, read, search, write] = createMemoryTools([namespace()]);
			const ctx = { cwd } as never;

			const writeResult = await write.execute(
				"write",
				{
					namespace: "finance",
					target: "user",
					action: "add",
					content: "用户偏好 Binance 作为 crypto 默认数据源。",
				},
				undefined,
				undefined,
				ctx,
			);
			const listResult = await list.execute(
				"list",
				{ namespace: "finance", target: "user" },
				undefined,
				undefined,
				ctx,
			);
			const searchResult = await search.execute(
				"search",
				{ query: "Binance", namespace: "finance" },
				undefined,
				undefined,
				ctx,
			);
			const readResult = await read.execute(
				"read",
				{ namespace: "finance", target: "user" },
				undefined,
				undefined,
				ctx,
			);

			expect(text(writeResult)).toContain("memory_write: success");
			expect(text(listResult)).toContain("finance/user");
			expect(text(searchResult)).toContain(".pi/memory/finance/USER.md:1");
			expect(text(readResult)).toContain("Binance");
		});
	});

	it("reports write errors compactly without changing memory", async () => {
		await withTempCwd(async (cwd) => {
			const [, read, , write] = createMemoryTools([namespace()]);
			const ctx = { cwd } as never;

			const result = await write.execute(
				"write",
				{
					namespace: "finance",
					target: "user",
					action: "add",
					content: "Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz123456",
				},
				undefined,
				undefined,
				ctx,
			);
			const readResult = await read.execute(
				"read",
				{ namespace: "finance", target: "user" },
				undefined,
				undefined,
				ctx,
			);

			expect((result as any).isError).toBe(true);
			expect(text(result)).toContain("memory_write: error");
			expect(text(readResult)).not.toContain("Authorization");
		});
	});

	it("searches existing files with context", async () => {
		await withTempCwd(async (cwd) => {
			await mkdir(join(cwd, ".pi/memory/finance"), { recursive: true });
			await writeFile(join(cwd, ".pi/memory/finance/RESEARCH.md"), "before\nNVDA thesis\nafter\n");
			const [, , search] = createMemoryTools([namespace()]);

			const result = await search.execute(
				"search",
				{ query: "NVDA", namespace: "finance", context: 1 },
				undefined,
				undefined,
				{ cwd } as never,
			);

			expect(text(result)).toContain(".pi/memory/finance/RESEARCH.md-1- before");
			expect(text(result)).toContain(".pi/memory/finance/RESEARCH.md:2: score=");
			expect(text(result)).toContain("snippet=NVDA thesis");
			expect(text(result)).toContain(".pi/memory/finance/RESEARCH.md-3- after");
		});
	});

	it("searches prior project session messages compactly", async () => {
		await withTempCwd(async (cwd) => {
			const sessionDir = join(cwd, ".pi/agent/sessions");
			const session = SessionManager.create(cwd, sessionDir);
			session.appendMessage({ role: "user", content: "上次聊 NVDA 的 Blackwell 供给约束", timestamp: 1 });
			session.appendMessage({
				role: "assistant",
				content: [{ type: "text", text: "结论：关注毛利率和云厂商 capex，asOf=2026-06-20。" }],
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
			const sessionSearch = createMemoryTools([namespace()]).find((tool) => tool.name === "memory_session_search");

			const result = await sessionSearch?.execute(
				"session-search",
				{ query: "NVDA capex", sessionDir, limit: 3 },
				undefined,
				undefined,
				{ cwd } as never,
			);

			expect(text(result)).toContain("memory_session_search: matches=2");
			expect(text(result)).toContain("role=user");
			expect(text(result)).toContain("Blackwell");
			expect(text(result)).toContain("role=assistant");
			expect(text(result)).toContain("capex");
			expect(text(result)).not.toContain('"usage"');
		});
	});

	it("truncates long prior session messages", async () => {
		await withTempCwd(async (cwd) => {
			const sessionDir = join(cwd, ".pi/agent/sessions");
			const session = SessionManager.create(cwd, sessionDir);
			session.appendMessage({
				role: "user",
				content: `NVDA ${"long-context ".repeat(200)}`,
				timestamp: 1,
			});
			session.appendMessage({
				role: "assistant",
				content: [{ type: "text", text: "short answer" }],
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
			const sessionSearch = createMemoryTools([namespace()]).find((tool) => tool.name === "memory_session_search");

			const result = await sessionSearch?.execute(
				"session-search",
				{ query: "NVDA", sessionDir, limit: 1 },
				undefined,
				undefined,
				{ cwd } as never,
			);

			const output = text(result);
			expect(output.length).toBeLessThan(1200);
			expect(output).toContain("[truncated]");
		});
	});

	it("ranks prior session messages by query coverage and returns snippets", async () => {
		await withTempCwd(async (cwd) => {
			const sessionDir = join(cwd, ".pi/agent/sessions");
			const session = SessionManager.create(cwd, sessionDir);
			session.appendMessage({
				role: "user",
				content: "NVDA quick note with no capex details",
				timestamp: 1,
			});
			session.appendMessage({
				role: "assistant",
				content: [{ type: "text", text: "NVDA capex Blackwell margin thesis with all query terms" }],
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
			const sessionSearch = createMemoryTools([namespace()]).find((tool) => tool.name === "memory_session_search");

			const result = await sessionSearch?.execute(
				"session-search",
				{ query: "NVDA capex Blackwell", sessionDir, limit: 1 },
				undefined,
				undefined,
				{ cwd } as never,
			);

			const output = text(result);
			expect(output).toContain("score=");
			expect(output).toContain("snippet=");
			expect(output).toContain("role=assistant");
			expect(output).toContain("Blackwell");
			expect(output).not.toContain("quick note");
		});
	});

	it("writes a research report artifact and indexes only compact memory", async () => {
		await withTempCwd(async (cwd) => {
			const tool = createMemoryTools([namespace()]).find((item) => item.name === "memory_research_report");

			const result = await tool?.execute(
				"research-report",
				{
					namespace: "finance",
					title: "NVDA Blackwell supply check",
					summary: "symbol=NVDA | asOf=2026-06-21 | Blackwell supply remains the key watch item.",
					content:
						"# NVDA Blackwell supply check\n\nFull sourced research notes.\n\nartifact=.pi/artifacts/market-data/nvda.csv",
					symbols: ["NVDA"],
					sourcePaths: [".pi/artifacts/market-data/nvda.csv"],
				},
				undefined,
				undefined,
				{ cwd } as never,
			);

			const output = text(result);
			expect(output).toContain("memory_research_report: success");
			expect(output).toContain(".pi/research/");
			const reportPath = output.match(/\.pi\/research\/\S+\.md/)?.[0];
			expect(reportPath).toBeTruthy();

			const report = await readFile(join(cwd, reportPath ?? ""), "utf8");
			expect(report).toContain("# NVDA Blackwell supply check");
			expect(report).toContain("Full sourced research notes.");

			const memoryIndex = await readFile(join(cwd, ".pi/memory/finance/RESEARCH.md"), "utf8");
			expect(memoryIndex).toContain("Blackwell supply remains the key watch item");
			expect(memoryIndex).toContain(`reportPath=${reportPath}`);
			expect(memoryIndex).toContain("sourcePaths=.pi/artifacts/market-data/nvda.csv");
			expect(memoryIndex).not.toContain("Full sourced research notes.");
		});
	});

	it("rejects unsafe research report content before writing a report file", async () => {
		await withTempCwd(async (cwd) => {
			const tool = createMemoryTools([namespace()]).find((item) => item.name === "memory_research_report");

			const result = await tool?.execute(
				"research-report",
				{
					namespace: "finance",
					title: "Unsafe report",
					summary: "symbol=NVDA | asOf=2026-06-21 | unsafe report.",
					content: "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456",
				},
				undefined,
				undefined,
				{ cwd } as never,
			);

			expect((result as any).isError).toBe(true);
			expect(text(result)).toContain("potential secret");
			await expect(readdir(join(cwd, ".pi/research"))).rejects.toThrow();
		});
	});

	it("does not leave orphan research reports when compact memory index fails", async () => {
		await withTempCwd(async (cwd) => {
			const tool = createMemoryTools([namespace()]).find((item) => item.name === "memory_research_report");

			const result = await tool?.execute(
				"research-report",
				{
					namespace: "finance",
					title: "Missing timestamp",
					summary: "symbol=NVDA | thesis without required timestamp.",
					content: "# Missing timestamp\n\nThis should not be written because index validation fails.",
				},
				undefined,
				undefined,
				{ cwd } as never,
			);

			expect((result as any).isError).toBe(true);
			expect(text(result)).toContain("asOf or createdAt");
			await expect(readFile(join(cwd, ".pi/memory/finance/RESEARCH.md"), "utf8")).rejects.toThrow();
			await expect(readdir(join(cwd, ".pi/research"))).rejects.toThrow();
		});
	});

	it("rolls back compact memory index when research report file write fails", async () => {
		await withTempCwd(async (cwd) => {
			await mkdir(join(cwd, ".pi"), { recursive: true });
			await writeFile(join(cwd, ".pi", "research"), "not a directory");
			const tool = createMemoryTools([namespace()]).find((item) => item.name === "memory_research_report");

			const result = await tool?.execute(
				"research-report",
				{
					namespace: "finance",
					title: "Report write failure",
					summary: "symbol=NVDA | asOf=2026-06-21 | valid index should roll back.",
					content: "# Report write failure\n\nThe file write will fail because .pi/research is a file.",
				},
				undefined,
				undefined,
				{ cwd } as never,
			);

			expect((result as any).isError).toBe(true);
			expect(text(result)).toContain("report_write_failed");
			const memoryIndex = await readFile(join(cwd, ".pi/memory/finance/RESEARCH.md"), "utf8").catch(() => "");
			expect(memoryIndex).not.toContain("valid index should roll back");
			expect(memoryIndex).not.toContain("reportPath=");
		});
	});
});
