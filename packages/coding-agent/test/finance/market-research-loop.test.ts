import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../test-harness.ts";

function textOf(content: (TextContent | ImageContent)[] | string): string {
	if (typeof content === "string") return content;
	return content
		.filter((part): part is TextContent => part.type === "text")
		.map((part) => part.text)
		.join("");
}

describe("market research continuation loop", () => {
	let harness: Harness;

	afterEach(() => {
		harness?.cleanup();
	});

	it("continues after a market data tool result with artifact and degraded data", async () => {
		const marketTool: AgentTool = {
			name: "finance_symbol_context",
			label: "Finance Symbol Context",
			description: "Fetch finance context",
			parameters: Type.Object({ symbol: Type.String() }),
			execute: async () => ({
				content: [
					{
						type: "text",
						text: [
							"Finance symbol context fetched. Artifact: .pi/artifacts/market-data/nvda.csv (csv, rows=136).",
							"summary: symbol=NVDA, market=US, asOf=2026-06-20T16:29:32.529Z, degraded=quote_http_401|sec_facts_http_403",
							"coverage: quote=no, historyBars=124, newsItems=8, technical=yes, fundamentals=no",
						].join("\n"),
					},
				],
				details: {
					symbol: "NVDA",
					market: "US",
					asOf: "2026-06-20T16:29:32.529Z",
					degradedReasons: ["quote_http_401", "sec_facts_http_403"],
				},
			}),
		};

		harness = createHarness({
			responses: [
				{ toolCalls: [{ name: "finance_symbol_context", args: { symbol: "NVDA" } }] },
				"我会先检查 artifact 和缺口，再决定是否需要补充搜索。",
			],
			tools: [marketTool],
			baseToolsOverride: { finance_symbol_context: marketTool },
		});

		await harness.session.prompt("分析 NVDA 现在能不能买");

		expect(harness.faux.callCount).toBe(2);
		const secondContext = harness.faux.contexts[1];
		const injected = secondContext.messages.find(
			(message) =>
				message.role === "user" &&
				Array.isArray(message.content) &&
				textOf(message.content).includes("Market research continuation"),
		);
		expect(injected).toBeDefined();
		expect(textOf(injected!.content as (TextContent | ImageContent)[])).toContain(
			".pi/artifacts/market-data/nvda.csv",
		);
		expect(textOf(injected!.content as (TextContent | ImageContent)[])).toContain("quote_http_401");
		expect(textOf(injected!.content as (TextContent | ImageContent)[])).toContain(
			"Do not answer yet only because a market tool returned",
		);
		expect(textOf(injected!.content as (TextContent | ImageContent)[])).toContain(
			"premarket, after-hours, or sudden move questions",
		);
		expect(textOf(injected!.content as (TextContent | ImageContent)[])).toContain("ranked explanation");
	});

	it("does not continue for non-market tool results", async () => {
		const echoTool: AgentTool = {
			name: "echo",
			label: "Echo",
			description: "Echo back",
			parameters: Type.Object({ text: Type.String() }),
			execute: async () => ({ content: [{ type: "text", text: "echoed" }], details: {} }),
		};

		harness = createHarness({
			responses: [{ toolCalls: [{ name: "echo", args: { text: "hi" } }] }, "done"],
			tools: [echoTool],
			baseToolsOverride: { echo: echoTool },
		});

		await harness.session.prompt("use echo");

		expect(harness.faux.callCount).toBe(2);
		const secondContext = harness.faux.contexts[1];
		const injected = secondContext.messages.find(
			(message) =>
				message.role === "user" &&
				Array.isArray(message.content) &&
				textOf(message.content).includes("Market research continuation"),
		);
		expect(injected).toBeUndefined();
	});
});
