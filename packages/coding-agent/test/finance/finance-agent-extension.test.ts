import { describe, expect, it } from "vitest";
import exampleFinanceAgentExtension from "../../examples/extensions/finance-agent.ts";
import { parseArgs } from "../../src/cli/args.ts";
import { getCliExtensionFactories } from "../../src/cli/builtin-extensions.ts";
import cryptoAgentExtension from "../../src/core/crypto-agent-extension.ts";
import coreFinanceAgentExtension from "../../src/core/finance-agent-extension.ts";
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
			cryptoAgentExtension,
			webAgentExtension,
		]);
		expect(getCliExtensionFactories(parseArgs(["--finance"]), [existingFactory])).toEqual([
			existingFactory,
			coreFinanceAgentExtension,
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
		expect(output?.systemPrompt).not.toContain("compact skill workflow");
		expect(output?.systemPrompt).not.toContain("Default output shape");
	});
});
