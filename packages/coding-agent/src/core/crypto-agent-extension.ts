import type {
	CryptoContext,
	CryptoContextOptions,
	CryptoDerivatives,
	CryptoHistory,
	CryptoQuote,
	SourceHealth,
} from "@earendil-works/pi-crypto";
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
	return {
		content: [{ type: "text" as const, text: formatCryptoDetails(label, details) }],
		details,
	};
}

function formatCryptoDetails(label: string, details: unknown): string {
	if (isSourceResult<CryptoQuote | null>(details)) return formatQuoteResult(label, details);
	if (isSourceResult<CryptoHistory>(details)) return formatHistoryResult(label, details);
	if (isSourceResult<CryptoDerivatives | null>(details)) return formatDerivativesResult(label, details);
	if (isCryptoContext(details)) return formatCryptoContext(label, details);
	return `${label} fetched. Full raw result is preserved in tool details.`;
}

type SourceResult<T> = {
	value: T;
	health: SourceHealth;
	degradedReason?: string;
};

function isSourceResult<T>(value: unknown): value is SourceResult<T> {
	return Boolean(value && typeof value === "object" && "value" in value && "health" in value);
}

function isCryptoContext(value: unknown): value is CryptoContext {
	return Boolean(
		value &&
			typeof value === "object" &&
			"binanceSymbol" in value &&
			"sourceHealth" in value &&
			"derivatives" in value,
	);
}

function formatQuoteResult(label: string, result: SourceResult<CryptoQuote | null>): string {
	return [
		`${label} fetched. Compact Binance data summary follows; full raw result is preserved in tool details, not repeated here.`,
		formatHealth(result.health),
		result.degradedReason ? `degradedReason=${result.degradedReason}` : undefined,
		result.value
			? `quote: symbol=${result.value.binanceSymbol}, lastPrice=${formatValue(result.value.lastPrice)}, changePercent24h=${formatValue(result.value.changePercent24h)}, baseVolume24h=${formatValue(result.value.baseVolume24h)}, quoteVolume24h=${formatValue(result.value.quoteVolume24h)}, asOf=${result.value.asOf}, source=${result.value.source}`
			: "quote: unavailable",
	]
		.filter(Boolean)
		.join("\n");
}

function formatHistoryResult(label: string, result: SourceResult<CryptoHistory>): string {
	const bars = result.value.bars.slice(-10);
	return [
		`${label} fetched. Compact Binance kline summary follows; full raw result is preserved in tool details, not repeated here.`,
		formatHealth(result.health),
		`history: symbol=${result.value.binanceSymbol}, interval=${result.value.interval}, source=${result.value.source}, latestAt=${formatValue(result.value.latestAt)}, totalBars=${result.value.bars.length}, shownBars=${bars.length}`,
		"",
		"bars_csv:",
		"openTime,closeTime,open,high,low,close,volume,quoteVolume",
		...bars.map((bar) =>
			csvRow([bar.openTime, bar.closeTime, bar.open, bar.high, bar.low, bar.close, bar.volume, bar.quoteVolume]),
		),
	].join("\n");
}

function formatDerivativesResult(label: string, result: SourceResult<CryptoDerivatives | null>): string {
	return [
		`${label} fetched. Compact Binance futures summary follows; full raw result is preserved in tool details, not repeated here.`,
		formatHealth(result.health),
		result.degradedReason ? `degradedReason=${result.degradedReason}` : undefined,
		result.value
			? `derivatives: symbol=${result.value.binanceSymbol}, fundingRate=${formatValue(result.value.fundingRate)}, fundingTime=${formatValue(result.value.fundingTime)}, openInterest=${formatValue(result.value.openInterest)}, openInterestTime=${formatValue(result.value.openInterestTime)}, source=${result.value.source}`
			: "derivatives: unavailable",
	]
		.filter(Boolean)
		.join("\n");
}

function formatCryptoContext(label: string, context: CryptoContext): string {
	const bars = context.history.bars.slice(-10);
	return [
		`${label} fetched. Compact Binance market data summary follows; full raw result is preserved in tool details, not repeated here.`,
		`asset=${context.asset}, symbol=${context.binanceSymbol}, quoteAsset=${context.quoteAsset}, asOf=${context.asOf}`,
		formatDegraded(context.degradedReasons),
		"",
		"source_health_csv:",
		"source,status,latestAt,degradedReason",
		...context.sourceHealth.map((health) =>
			csvRow([health.source, health.status, health.latestAt, health.degradedReason]),
		),
		"",
		`quote: lastPrice=${formatValue(context.quote?.lastPrice)}, changePercent24h=${formatValue(context.quote?.changePercent24h)}, baseVolume24h=${formatValue(context.quote?.baseVolume24h)}, quoteVolume24h=${formatValue(context.quote?.quoteVolume24h)}, source=${formatValue(context.quote?.source)}, asOf=${formatValue(context.quote?.asOf)}`,
		context.derivatives
			? `derivatives: fundingRate=${formatValue(context.derivatives.fundingRate)}, fundingTime=${formatValue(context.derivatives.fundingTime)}, openInterest=${formatValue(context.derivatives.openInterest)}, openInterestTime=${formatValue(context.derivatives.openInterestTime)}, source=${context.derivatives.source}`
			: "derivatives: unavailable",
		"",
		`bars_csv_last_${bars.length}:`,
		"openTime,closeTime,open,high,low,close,volume,quoteVolume",
		...bars.map((bar) =>
			csvRow([bar.openTime, bar.closeTime, bar.open, bar.high, bar.low, bar.close, bar.volume, bar.quoteVolume]),
		),
	].join("\n");
}

function formatHealth(health: SourceHealth): string {
	return `health: source=${health.source}, status=${health.status}, latestAt=${formatValue(health.latestAt)}, degradedReason=${formatValue(health.degradedReason)}`;
}

function formatDegraded(reasons: string[]): string {
	return reasons.length > 0 ? `degradedReasons=${reasons.join("|")}` : "degradedReasons=none";
}

function formatValue(value: unknown): string {
	if (value === null || value === undefined || value === "") return "NA";
	if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NA";
	return String(value);
}

function csvRow(values: unknown[]): string {
	return values.map(csvCell).join(",");
}

function csvCell(value: unknown): string {
	const text = formatValue(value);
	if (!/[",\n]/.test(text)) return text;
	return `"${text.replaceAll('"', '""')}"`;
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
