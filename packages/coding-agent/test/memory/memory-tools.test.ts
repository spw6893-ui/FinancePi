import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createMemoryTools } from "../../src/core/memory/memory-tools.ts";
import type { MemoryNamespaceConfig } from "../../src/core/memory/memory-types.ts";

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
			expect(text(result)).toContain(".pi/memory/finance/RESEARCH.md:2: NVDA thesis");
			expect(text(result)).toContain(".pi/memory/finance/RESEARCH.md-3- after");
		});
	});
});
