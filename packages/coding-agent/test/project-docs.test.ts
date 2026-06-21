import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createListProjectDocsTool,
	createReadProjectDocTool,
	createSearchProjectDocsTool,
} from "../src/core/tools/project-docs.ts";

function getTextOutput(result: any): string {
	return (
		result.content
			?.filter((c: any) => c.type === "text")
			.map((c: any) => c.text)
			.join("\n") || ""
	);
}

describe("project doc tools", () => {
	let rootDir: string;
	let cwd: string;
	let listTool: ReturnType<typeof createListProjectDocsTool>;
	let readTool: ReturnType<typeof createReadProjectDocTool>;
	let searchTool: ReturnType<typeof createSearchProjectDocsTool>;

	beforeEach(() => {
		rootDir = join(tmpdir(), `coding-agent-project-docs-${Date.now()}`);
		mkdirSync(join(rootDir, ".git"), { recursive: true });
		mkdirSync(join(rootDir, "docs"), { recursive: true });
		mkdirSync(join(rootDir, "src"), { recursive: true });
		mkdirSync(join(rootDir, "nested", "child"), { recursive: true });
		cwd = join(rootDir, "nested", "child");

		writeFileSync(join(rootDir, "README.md"), "# Root title\nroot overview\n");
		writeFileSync(join(rootDir, "docs", "guide.md"), "# Guide\nfirst line\nneedle line\nlast line\n");
		writeFileSync(join(rootDir, "src", "code.ts"), "const x = 1;\n");

		listTool = createListProjectDocsTool(cwd);
		readTool = createReadProjectDocTool(cwd);
		searchTool = createSearchProjectDocsTool(cwd);
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	it("lists project docs without code files", async () => {
		const result = await listTool.execute("project-docs-list", {});
		const output = getTextOutput(result);

		expect(output).toContain("README.md");
		expect(output).toContain("docs/guide.md");
		expect(output).not.toContain("src/code.ts");
	});

	it("reads a project doc with offset and limit", async () => {
		const result = await readTool.execute("project-docs-read", {
			path: "docs/guide.md",
			offset: 2,
			limit: 1,
		});

		expect(getTextOutput(result)).toContain("first line");
		expect(getTextOutput(result)).not.toContain("needle line");
	});

	it("searches project docs with context", async () => {
		const result = await searchTool.execute("project-docs-search", {
			query: "needle",
			context: 1,
		});

		const output = getTextOutput(result);
		expect(output).toContain("docs/guide.md:3: needle line");
		expect(output).toContain("docs/guide.md-2- first line");
		expect(output).toContain("docs/guide.md-4- last line");
	});

	it("rejects paths outside the project root", async () => {
		const outsidePath = join(rootDir, "..", "outside.md");
		writeFileSync(outsidePath, "outside");

		await expect(readTool.execute("project-docs-read-outside", { path: outsidePath })).rejects.toThrow(
			/project root|outside the project/i,
		);
		expect(existsSync(outsidePath)).toBe(true);
	});
});
