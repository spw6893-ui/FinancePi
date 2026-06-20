import type { CryptoContextOptions } from "@earendil-works/pi-crypto";
import { CryptoClient } from "@earendil-works/pi-crypto";
import { Type } from "typebox";
import { defineTool, type ExtensionAPI } from "./extensions/types.ts";

const client = new CryptoClient();

const symbolParam = {
	symbol: Type.String({ description: "Crypto asset or Binance USDT pair, for example BTC, BTCUSDT, ETH, SOL" }),
};

const cryptoOptions = {
	interval: Type.Optional(Type.String({ description: "Binance kline interval, default 1d" })),
	limit: Type.Optional(Type.Number({ description: "Maximum kline bars, default 120", minimum: 1, maximum: 1000 })),
};

function optionsFromParams(params: { interval?: string; limit?: number }): CryptoContextOptions {
	return {
		interval: params.interval,
		limit: params.limit,
	};
}

export function cryptoTextResult(label: string, details: unknown) {
	const json = JSON.stringify(details, null, 2);
	return {
		content: [{ type: "text" as const, text: `${label} fetched.\n\n${json}` }],
		details,
	};
}

const quoteTool = defineTool({
	name: "crypto_quote",
	label: "Crypto Quote",
	description: "Fetch Binance spot 24h ticker data for a crypto asset or USDT pair.",
	promptSnippet: "Fetch Binance spot crypto quote data",
	promptGuidelines: [
		"crypto_quote provides Binance spot price, 24h change, and spot volume for crypto assets or USDT pairs.",
		"When using crypto_quote values, mention Binance source/asOf if available.",
	],
	parameters: Type.Object(symbolParam),
	async execute(_toolCallId, params) {
		return cryptoTextResult("Crypto quote", await client.getCryptoQuote(params.symbol));
	},
});

const historyTool = defineTool({
	name: "crypto_history",
	label: "Crypto History",
	description: "Fetch Binance spot kline history for a crypto asset or USDT pair.",
	promptSnippet: "Fetch Binance spot crypto kline history",
	promptGuidelines: [
		"crypto_history provides Binance spot kline history for trend, support/resistance, recent performance, or candles.",
		"When using crypto_history values, mention interval, source, and latestAt if available.",
	],
	parameters: Type.Object({
		...symbolParam,
		...cryptoOptions,
	}),
	async execute(_toolCallId, params) {
		return cryptoTextResult(
			"Crypto history",
			await client.getCryptoHistory(params.symbol, params.interval, params.limit),
		);
	},
});

const derivativesTool = defineTool({
	name: "crypto_derivatives",
	label: "Crypto Derivatives",
	description: "Fetch Binance USD-M futures funding rate and open interest for a crypto asset or USDT pair.",
	promptSnippet: "Fetch Binance futures funding and open interest",
	promptGuidelines: [
		"crypto_derivatives provides Binance USD-M futures funding rate and open interest.",
		"Do not infer crowded positioning unless funding or open-interest data is present in the tool result.",
	],
	parameters: Type.Object(symbolParam),
	async execute(_toolCallId, params) {
		return cryptoTextResult("Crypto derivatives", await client.getCryptoDerivatives(params.symbol));
	},
});

const contextTool = defineTool({
	name: "crypto_context",
	label: "Crypto Context",
	description: "Build a Binance-sourced crypto context with spot quote, kline history, funding, and open interest.",
	promptSnippet: "Build sourced Binance crypto market context",
	promptGuidelines: [
		"crypto_context bundles Binance spot quote, kline history, funding, and open interest.",
		"Use crypto_context when broad crypto context would help, but choose the response structure yourself.",
	],
	parameters: Type.Object({
		...symbolParam,
		...cryptoOptions,
	}),
	async execute(_toolCallId, params) {
		return cryptoTextResult(
			"Crypto context",
			await client.getCryptoContext(params.symbol, optionsFromParams(params)),
		);
	},
});

const cryptoPrompt = `

CRYPTO AGENT MODE:
- crypto_* tools can provide BTC, ETH, SOL, crypto, token, spot, funding, open interest, and Binance USDT pair data when useful.
- Use Binance-sourced data before making technical, leverage, or risk claims that depend on current market facts.
- When using tool data, mention source/asOf/latestAt where available.
- Let the user's question determine which tools to call and how to structure the answer; do not force a fixed template.
- Do not claim access to exchange accounts, wallets, private balances, or trade execution.
`;

export default function cryptoAgentExtension(pi: ExtensionAPI) {
	pi.registerTool(quoteTool);
	pi.registerTool(historyTool);
	pi.registerTool(derivativesTool);
	pi.registerTool(contextTool);

	pi.on("before_agent_start", (event) => ({
		systemPrompt: event.systemPrompt + cryptoPrompt,
	}));
}
