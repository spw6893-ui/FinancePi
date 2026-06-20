import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPromptTemplates } from "../../src/core/prompt-templates.ts";
import { loadSkills } from "../../src/core/skills.ts";

const repoRoot = resolve(__dirname, "../../../..");

describe("finance services project resources", () => {
	it("loads the migrated finance-services skill from project .pi skills", () => {
		const { skills, diagnostics } = loadSkills({
			cwd: repoRoot,
			agentDir: resolve(repoRoot, ".pi-test-agent"),
			skillPaths: [],
			includeDefaults: true,
		});

		const skill = skills.find((item) => item.name === "finance-services");
		expect(skill).toBeTruthy();
		expect(skill?.description).toContain("Anthropic");
		expect(skill?.filePath).toContain(".pi/skills/finance-services/SKILL.md");
		expect(diagnostics.filter((diagnostic) => diagnostic.type === "error")).toHaveLength(0);
	});

	it("loads Anthropic-style finance prompt commands from project .pi prompts", () => {
		const prompts = loadPromptTemplates({
			cwd: repoRoot,
			agentDir: resolve(repoRoot, ".pi-test-agent"),
			promptPaths: [],
			includeDefaults: true,
		});

		const names = prompts.map((prompt) => prompt.name);
		expect(names).toContain("sector");
		expect(names).toContain("comps");
		expect(names).toContain("competitive-analysis");
		expect(names).toContain("earnings");
		expect(names).toContain("dcf");
		expect(names).toContain("lbo");
		expect(names).toContain("3-statement-model");
		expect(names).toContain("model-update");
		expect(names).toContain("initiate");
		expect(prompts.find((prompt) => prompt.name === "sector")?.content).toContain("/skill:finance-services");
	});

	it("keeps a valid finance MCP connector manifest example", () => {
		const manifest = JSON.parse(readFileSync(resolve(repoRoot, ".pi/finance-mcp.example.json"), "utf8"));
		expect(manifest.mcpServers.factset.url).toContain("factset");
		expect(manifest.mcpServers["sp-global"].url).toContain("kensho");
		expect(manifest.mcpServers.aiera.url).toContain("aiera");
		expect(manifest.mcpServers.box.url).toContain("box.com");
	});
});
