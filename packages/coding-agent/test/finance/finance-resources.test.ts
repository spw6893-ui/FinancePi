import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import financeAgentExtension from "../../src/core/finance-agent-extension.ts";
import { createTestExtensionsResult } from "../utilities.ts";

function getTextOutput(result: any): string {
	return (
		result.content
			?.filter((item: any) => item.type === "text")
			.map((item: any) => item.text)
			.join("\n") || ""
	);
}

async function getFinanceResourceTools(cwd: string) {
	const result = await createTestExtensionsResult([{ factory: financeAgentExtension, path: "<finance>" }], cwd);
	const extension = result.extensions[0];
	return {
		list: extension?.tools.get("finance_list_resources")?.definition,
		read: extension?.tools.get("finance_read_resource")?.definition,
		search: extension?.tools.get("finance_search_resources")?.definition,
	};
}

describe("finance resource tools", () => {
	it("lists finance artifacts and project docs without exposing source files", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-finance-resources-"));
		try {
			await mkdir(join(cwd, ".git"), { recursive: true });
			await mkdir(join(cwd, ".pi", "artifacts", "market-data"), { recursive: true });
			await mkdir(join(cwd, "docs"), { recursive: true });
			await mkdir(join(cwd, "src"), { recursive: true });
			await writeFile(join(cwd, ".pi", "artifacts", "market-data", "nvda.csv"), "symbol,price\nNVDA,123\n");
			await writeFile(join(cwd, "AGENTS.md"), "# Finance policy\nUse sourced data.\n");
			await writeFile(join(cwd, "docs", "finance.md"), "# Finance docs\nDCF assumptions.\n");
			await writeFile(join(cwd, "src", "app.ts"), "const secret = 'not-doc';\n");

			const tools = await getFinanceResourceTools(cwd);
			const result = await tools.list?.execute("list", {}, undefined, undefined, { cwd } as never);
			const text = getTextOutput(result);

			expect(text).toContain("finance_resources listed");
			expect(text).toContain("artifact | .pi/artifacts/market-data/nvda.csv");
			expect(text).toContain("project_doc | AGENTS.md");
			expect(text).toContain("project_doc | docs/finance.md");
			expect(text).not.toContain("src/app.ts");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("reads a finance resource with offset and limit", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-finance-read-resource-"));
		try {
			await mkdir(join(cwd, ".git"), { recursive: true });
			await mkdir(join(cwd, "docs"), { recursive: true });
			await writeFile(join(cwd, "docs", "finance.md"), "# Header\nline one\nline two\nline three\n");

			const tools = await getFinanceResourceTools(cwd);
			const result = await tools.read?.execute(
				"read",
				{ path: "docs/finance.md", offset: 2, limit: 1 },
				undefined,
				undefined,
				{ cwd } as never,
			);
			const text = getTextOutput(result);

			expect(text).toContain("finance_resource read: docs/finance.md");
			expect(text).toContain("line one");
			expect(text).not.toContain("line two");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("searches artifacts and docs with context", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-finance-search-resources-"));
		try {
			await mkdir(join(cwd, ".git"), { recursive: true });
			await mkdir(join(cwd, ".pi", "artifacts", "market-data"), { recursive: true });
			await mkdir(join(cwd, "docs"), { recursive: true });
			await writeFile(join(cwd, ".pi", "artifacts", "market-data", "btc.csv"), "symbol,close\nBTCUSDT,64000\n");
			await writeFile(join(cwd, "docs", "crypto.md"), "before\nBTC thesis\nafter\n");

			const tools = await getFinanceResourceTools(cwd);
			const result = await tools.search?.execute("search", { query: "BTC", context: 1 }, undefined, undefined, {
				cwd,
			} as never);
			const text = getTextOutput(result);

			expect(text).toContain(".pi/artifacts/market-data/btc.csv:2: BTCUSDT,64000");
			expect(text).toContain("docs/crypto.md:2: BTC thesis");
			expect(text).toContain("docs/crypto.md-1- before");
			expect(text).toContain("docs/crypto.md-3- after");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("rejects resource reads outside the project root", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-finance-resource-scope-"));
		const outside = join(tmpdir(), `outside-${Date.now()}.md`);
		try {
			await mkdir(join(cwd, ".git"), { recursive: true });
			await writeFile(outside, "outside\n");

			const tools = await getFinanceResourceTools(cwd);
			await expect(
				tools.read?.execute("read", { path: outside }, undefined, undefined, { cwd } as never),
			).rejects.toThrow(/outside the project root/i);
			expect(await readFile(outside, "utf8")).toBe("outside\n");
		} finally {
			await rm(cwd, { recursive: true, force: true });
			await rm(outside, { force: true });
		}
	});
});
