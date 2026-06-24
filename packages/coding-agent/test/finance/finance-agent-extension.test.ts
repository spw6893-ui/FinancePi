import { describe, expect, it } from "vitest";
import exampleFinanceAgentExtension from "../../examples/extensions/finance-agent.ts";
import { parseArgs } from "../../src/cli/args.ts";
import { getCliExtensionFactories } from "../../src/cli/builtin-extensions.ts";
import cryptoAgentExtension from "../../src/core/crypto-agent-extension.ts";
import coreFinanceAgentExtension from "../../src/core/finance-agent-extension.ts";
import financeWorkflowExtension from "../../src/core/finance-workflow-extension.ts";
import webAgentExtension from "../../src/core/web-agent-extension.ts";
import { createTestExtensionsResult } from "../utilities.ts";

describe("finance agent extension", () => {
	it("registers finance tools and prompt guidance as an inline extension", async () => {
		const result = await createTestExtensionsResult([
			{ factory: exampleFinanceAgentExtension, path: "<finance-agent>" },
		]);
		const extension = result.extensions[0];

		expect(extension?.tools.has("finance_symbol_context")).toBe(true);
		expect(extension?.tools.has("finance_compare_symbols")).toBe(true);
		expect(extension?.tools.has("finance_market_brief")).toBe(true);
		expect(extension?.tools.has("finance_list_resources")).toBe(true);
		expect(extension?.tools.has("finance_read_resource")).toBe(true);
		expect(extension?.tools.has("finance_search_resources")).toBe(true);
		expect(extension?.tools.has("finance_mcp_servers")).toBe(true);
		expect(extension?.tools.has("finance_mcp_list_tools")).toBe(true);
		expect(extension?.tools.has("finance_mcp_call_tool")).toBe(true);
		expect(extension?.handlers.has("before_agent_start")).toBe(true);
	});

	it("wires the built-in extension factory behind --finance", () => {
		const existingFactory = () => {};

		expect(getCliExtensionFactories(parseArgs([]), [existingFactory])).toEqual([
			existingFactory,
			coreFinanceAgentExtension,
			financeWorkflowExtension,
			cryptoAgentExtension,
			webAgentExtension,
		]);
		expect(getCliExtensionFactories(parseArgs(["--finance"]), [existingFactory])).toEqual([
			existingFactory,
			coreFinanceAgentExtension,
			financeWorkflowExtension,
			cryptoAgentExtension,
			webAgentExtension,
		]);
	});

	it("guides finance mode to expand research without imposing a fixed template", async () => {
		const result = await createTestExtensionsResult([
			{ factory: coreFinanceAgentExtension, path: "<finance-agent>" },
		]);
		const handler = result.extensions[0]?.handlers.get("before_agent_start")?.[0];

		const output = (await handler?.(
			{
				type: "before_agent_start",
				prompt: "analyze NVDA",
				systemPrompt: "base prompt",
				systemPromptOptions: {} as never,
			},
			{ cwd: process.cwd() } as never,
		)) as { systemPrompt?: string } | undefined;

		expect(output?.systemPrompt).toContain(
			"For finance work, default to a full research answer rather than a brief answer.",
		);
		expect(output?.systemPrompt).toContain(
			"Only be brief when the user explicitly asks for a quick take, short answer, one-liner, or no details.",
		);
		expect(output?.systemPrompt).toContain(
			"Do not force a fixed answer template; choose the natural structure for the question.",
		);
		expect(output?.systemPrompt).toContain("company data is the center of the analysis");
		expect(output?.systemPrompt).toContain("Treat technical analysis as a small auxiliary check");
		expect(output?.systemPrompt).toContain("build an internal causal model before answering");
		expect(output?.systemPrompt).toContain("A useful finance answer must make judgment calls");
		expect(output?.systemPrompt).toContain("why the obvious view may be wrong");
		expect(output?.systemPrompt).toContain("which variables dominate the outcome");
		expect(output?.systemPrompt).toContain("what evidence would change the conclusion");
		expect(output?.systemPrompt).toContain("Do not turn technical levels into the thesis");
		expect(output?.systemPrompt).toContain("When finance_symbol_context returns companyData/fundamentals");
		expect(output?.systemPrompt).toContain("do attribution analysis, not just data retrieval");
		expect(output?.systemPrompt).toContain("If no definitive headline explains a move");
		expect(output?.systemPrompt).toContain(
			"When the user asks how to invest in a stock, ETF, leveraged ETF, crypto asset, or strategy",
		);
		expect(output?.systemPrompt).toContain("For on-chain tokens");
		expect(output?.systemPrompt).toContain("wallet and flow data as a forensic lens");
		expect(output?.systemPrompt).toContain("confirmed sellout lower bounds");
		expect(output?.systemPrompt).toContain("Distinguish current balances, transferred throughput");
		expect(output?.systemPrompt).toContain("For leveraged ETFs such as SOXL or TQQQ");
		expect(output?.systemPrompt).toContain("/skill:finance-superpowers");
		expect(output?.systemPrompt).not.toContain("compact skill workflow");
		expect(output?.systemPrompt).not.toContain("Default output shape");
	});
});
