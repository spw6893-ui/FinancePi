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

	it("loads the finance-superpowers skill with value-investing research safeguards", () => {
		const { skills, diagnostics } = loadSkills({
			cwd: repoRoot,
			agentDir: resolve(repoRoot, ".pi-test-agent"),
			skillPaths: [],
			includeDefaults: true,
		});

		const skill = skills.find((item) => item.name === "finance-superpowers");
		const skillContent = skill ? readFileSync(skill.filePath, "utf8") : "";
		expect(skill).toBeTruthy();
		expect(skill?.filePath).toContain(".pi/skills/finance-superpowers/SKILL.md");
		expect(skillContent).toContain("信息丰富度");
		expect(skillContent).toContain("AI分析置信度");
		expect(skillContent).toContain("投资确定性");
		expect(skillContent).toContain("四大师");
		expect(skillContent).toContain("段永平");
		expect(skillContent).toContain("巴菲特");
		expect(skillContent).toContain("芒格");
		expect(skillContent).toContain("李录");
		expect(skillContent).toContain("镜子测试");
		expect(skillContent).toContain("快速否决");
		expect(skillContent).toContain("反向DCF");
		expect(skillContent).toContain("三情景估值");
		expect(skillContent).toContain("small-cap commercialization");
		expect(skillContent).toContain("industry value chain");
		expect(skillContent).toContain("options positioning");
		expect(skillContent).toContain("put-call ratio");
		expect(skillContent).toContain("gamma exposure");
		expect(skillContent).toContain("call wall");
		expect(skillContent).toContain("put wall");
		expect(skillContent).toContain("upstream suppliers");
		expect(skillContent).toContain("downstream customers");
		expect(skillContent).toContain("system integrators");
		expect(skillContent).toContain("value capture");
		expect(skillContent).toContain("procurement cycle");
		expect(skillContent).toContain("competitive substitutes");
		expect(skillContent).toContain("bargaining power");
		expect(skillContent).toContain("cash runway");
		expect(skillContent).toContain("order quality");
		expect(skillContent).toContain("gross margin ramp");
		expect(skillContent).toContain("dilution risk");
		expect(skillContent).toContain("commercialization milestones");
		expect(diagnostics.filter((diagnostic) => diagnostic.type === "error")).toHaveLength(0);
	});

	it("loads the institutional-holdings skill for 13F and ownership analysis", () => {
		const { skills, diagnostics } = loadSkills({
			cwd: repoRoot,
			agentDir: resolve(repoRoot, ".pi-test-agent"),
			skillPaths: [],
			includeDefaults: true,
		});

		const skill = skills.find((item) => item.name === "institutional-holdings");
		const skillContent = skill ? readFileSync(skill.filePath, "utf8") : "";
		expect(skill).toBeTruthy();
		expect(skill?.filePath).toContain(".pi/skills/institutional-holdings/SKILL.md");
		expect(skillContent).toContain("13F");
		expect(skillContent).toContain("13D");
		expect(skillContent).toContain("13G");
		expect(skillContent).toContain("NPORT");
		expect(skillContent).toContain("滞后");
		expect(skillContent).toContain("put/call");
		expect(skillContent).toContain("投资经理");
		expect(skillContent).toContain("被动ETF");
		expect(skillContent).toContain("信号强度");
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

	it("keeps a generic finance MCP connector manifest example without paid provider endpoints", () => {
		const manifest = JSON.parse(readFileSync(resolve(repoRoot, ".pi/finance-mcp.example.json"), "utf8"));
		expect(manifest.mcpServers["local-finance"].url).toContain("localhost");
		expect(manifest.mcpServers["custom-provider"].headers.Authorization).toContain("CUSTOM_FINANCE_MCP_TOKEN");
		expect(Object.keys(manifest.mcpServers).sort()).toEqual(["custom-provider", "local-finance"]);
	});
});
