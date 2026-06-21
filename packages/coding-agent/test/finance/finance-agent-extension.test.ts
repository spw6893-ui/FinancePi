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
});
