import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
import { defineTool, type ExtensionAPI, type ExtensionContext } from "./extensions/types.ts";

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

export async function cryptoTextResult(label: string, details: unknown, ctx?: ExtensionContext) {
	const artifact = ctx ? await writeCryptoArtifact(label, details, ctx.cwd) : undefined;
	return {
		content: [{ type: "text" as const, text: formatCryptoDetails(label, details, artifact) }],
		details,
	};
}

interface MarketArtifact {
	relativePath: string;
	rows: number;
}

function formatCryptoDetails(label: string, details: unknown, artifact?: MarketArtifact): string {
	if (isHistorySourceResult(details)) return formatHistoryResult(label, details, artifact);
	if (isDerivativesSourceResult(details)) return formatDerivativesResult(label, details, artifact);
	if (isQuoteSourceResult(details)) return formatQuoteResult(label, details, artifact);
	if (isCryptoContext(details)) return formatCryptoContext(label, details, artifact);
	return `${label} fetched. Full raw result is preserved in tool details. CSV artifact: ${formatArtifact(artifact)}.`;
}

type SourceResult<T> = {
	value: T;
	health: SourceHealth;
	degradedReason?: string;
};

function isSourceResult<T>(value: unknown): value is SourceResult<T> {
	return Boolean(value && typeof value === "object" && "value" in value && "health" in value);
}

function isHistorySourceResult(value: unknown): value is SourceResult<CryptoHistory> {
	return isSourceResult<CryptoHistory>(value) && isRecord(value.value) && Array.isArray(value.value.bars);
}

function isDerivativesSourceResult(value: unknown): value is SourceResult<CryptoDerivatives | null> {
	return (
		isSourceResult<CryptoDerivatives | null>(value) &&
		(value.value === null || (isRecord(value.value) && "fundingRate" in value.value))
	);
}

function isQuoteSourceResult(value: unknown): value is SourceResult<CryptoQuote | null> {
	return (
		isSourceResult<CryptoQuote | null>(value) &&
		(value.value === null || (isRecord(value.value) && "lastPrice" in value.value))
	);
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

function formatQuoteResult(label: string, result: SourceResult<CryptoQuote | null>, artifact?: MarketArtifact): string {
	return [
		`${label} fetched. Compact Binance data summary follows. CSV artifact: ${formatArtifact(artifact)}.`,
		formatHealth(result.health),
		result.degradedReason ? `degradedReason=${result.degradedReason}` : undefined,
		result.value
			? `quote: symbol=${result.value.binanceSymbol}, lastPrice=${formatValue(result.value.lastPrice)}, changePercent24h=${formatValue(result.value.changePercent24h)}, baseVolume24h=${formatValue(result.value.baseVolume24h)}, quoteVolume24h=${formatValue(result.value.quoteVolume24h)}, asOf=${result.value.asOf}, source=${result.value.source}`
			: "quote: unavailable",
	]
		.filter(Boolean)
		.join("\n");
}

function formatHistoryResult(label: string, result: SourceResult<CryptoHistory>, artifact?: MarketArtifact): string {
	const bars = result.value.bars.slice(-10);
	return [
		`${label} fetched. Compact Binance kline summary follows. Full CSV artifact: ${formatArtifact(artifact)}.`,
		formatHealth(result.health),
		`history: symbol=${result.value.binanceSymbol}, interval=${result.value.interval}, source=${result.value.source}, latestAt=${formatValue(result.value.latestAt)}, totalBars=${result.value.bars.length}, artifactRows=${formatValue(artifact?.rows)}, latestClose=${formatValue(bars.at(-1)?.close)}`,
	].join("\n");
}

function formatDerivativesResult(
	label: string,
	result: SourceResult<CryptoDerivatives | null>,
	artifact?: MarketArtifact,
): string {
	return [
		`${label} fetched. Compact Binance futures summary follows. CSV artifact: ${formatArtifact(artifact)}.`,
		formatHealth(result.health),
		result.degradedReason ? `degradedReason=${result.degradedReason}` : undefined,
		result.value
			? `derivatives: symbol=${result.value.binanceSymbol}, fundingRate=${formatValue(result.value.fundingRate)}, fundingTime=${formatValue(result.value.fundingTime)}, openInterest=${formatValue(result.value.openInterest)}, openInterestTime=${formatValue(result.value.openInterestTime)}, source=${result.value.source}`
			: "derivatives: unavailable",
	]
		.filter(Boolean)
		.join("\n");
}

function formatCryptoContext(label: string, context: CryptoContext, artifact?: MarketArtifact): string {
	return [
		`${label} fetched. Compact Binance market data summary follows. Full CSV artifact: ${formatArtifact(artifact)}.`,
		`asset=${context.asset}, symbol=${context.binanceSymbol}, quoteAsset=${context.quoteAsset}, asOf=${context.asOf}`,
		formatDegraded(context.degradedReasons),
		`sourceHealth=${context.sourceHealth.map((health) => `${health.source}:${health.status}${health.degradedReason ? `:${health.degradedReason}` : ""}`).join(" | ")}`,
		`quote: lastPrice=${formatValue(context.quote?.lastPrice)}, changePercent24h=${formatValue(context.quote?.changePercent24h)}, baseVolume24h=${formatValue(context.quote?.baseVolume24h)}, quoteVolume24h=${formatValue(context.quote?.quoteVolume24h)}, source=${formatValue(context.quote?.source)}, asOf=${formatValue(context.quote?.asOf)}`,
		context.derivatives
			? `derivatives: fundingRate=${formatValue(context.derivatives.fundingRate)}, fundingTime=${formatValue(context.derivatives.fundingTime)}, openInterest=${formatValue(context.derivatives.openInterest)}, openInterestTime=${formatValue(context.derivatives.openInterestTime)}, source=${context.derivatives.source}`
			: "derivatives: unavailable",
		`artifactRows=${formatValue(artifact?.rows)}, historyBars=${context.history.bars.length}`,
	].join("\n");
}

async function writeCryptoArtifact(label: string, details: unknown, cwd: string): Promise<MarketArtifact | undefined> {
	const lines = cryptoArtifactLines(details);
	if (!lines) return undefined;
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const relativePath = `.pi/artifacts/market-data/${stamp}-${slugify(label)}.csv`;
	const dir = join(cwd, ".pi", "artifacts", "market-data");
	await mkdir(dir, { recursive: true });
	await writeFile(join(cwd, relativePath), lines.join("\n"), "utf8");
	return { relativePath, rows: Math.max(0, lines.length - 1) };
}

function cryptoArtifactLines(details: unknown): string[] | undefined {
	if (isHistorySourceResult(details)) {
		return [
			"openTime,closeTime,open,high,low,close,volume,quoteVolume",
			...details.value.bars.map((bar) =>
				csvRow([bar.openTime, bar.closeTime, bar.open, bar.high, bar.low, bar.close, bar.volume, bar.quoteVolume]),
			),
		];
	}
	if (isQuoteSourceResult(details)) {
		const quote = details.value;
		return [
			"symbol,lastPrice,changePercent24h,baseVolume24h,quoteVolume24h,asOf,source,status,degradedReason",
			csvRow([
				quote?.binanceSymbol,
				quote?.lastPrice,
				quote?.changePercent24h,
				quote?.baseVolume24h,
				quote?.quoteVolume24h,
				quote?.asOf,
				quote?.source,
				details.health.status,
				details.degradedReason,
			]),
		];
	}
	if (isDerivativesSourceResult(details)) {
		const derivatives = details.value;
		return [
			"symbol,fundingRate,fundingTime,openInterest,openInterestTime,source,status,degradedReason",
			csvRow([
				derivatives?.binanceSymbol,
				derivatives?.fundingRate,
				derivatives?.fundingTime,
				derivatives?.openInterest,
				derivatives?.openInterestTime,
				derivatives?.source,
				details.health.status,
				details.degradedReason,
			]),
		];
	}
	if (isCryptoContext(details)) return cryptoContextArtifactLines(details);
	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object");
}

function cryptoContextArtifactLines(context: CryptoContext): string[] {
	return [
		"section,openTime,closeTime,open,high,low,close,volume,quoteVolume,source,status,latestAt,degradedReason",
		...context.sourceHealth.map((health) =>
			csvRow([
				"source_health",
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				health.source,
				health.status,
				health.latestAt,
				health.degradedReason,
			]),
		),
		...context.history.bars.map((bar) =>
			csvRow([
				"bar",
				bar.openTime,
				bar.closeTime,
				bar.open,
				bar.high,
				bar.low,
				bar.close,
				bar.volume,
				bar.quoteVolume,
			]),
		),
	];
}

function formatHealth(health: SourceHealth): string {
	return `health: source=${health.source}, status=${health.status}, latestAt=${formatValue(health.latestAt)}, degradedReason=${formatValue(health.degradedReason)}`;
}

function formatDegraded(reasons: string[]): string {
	return reasons.length > 0 ? `degradedReasons=${reasons.join("|")}` : "degradedReasons=none";
}

function formatArtifact(artifact: MarketArtifact | undefined): string {
	return artifact ? `${artifact.relativePath} (csv, rows=${artifact.rows})` : "not written";
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

function slugify(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "market-data"
	);
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
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		return cryptoTextResult("Crypto quote", await client.getCryptoQuote(params.symbol), ctx);
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
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		return cryptoTextResult(
			"Crypto history",
			await client.getCryptoHistory(params.symbol, params.interval, params.limit),
			ctx,
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
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		return cryptoTextResult("Crypto derivatives", await client.getCryptoDerivatives(params.symbol), ctx);
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
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		return cryptoTextResult(
			"Crypto context",
			await client.getCryptoContext(params.symbol, optionsFromParams(params)),
			ctx,
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
