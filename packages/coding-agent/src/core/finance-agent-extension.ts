import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	CompareSymbolsResult,
	Fundamentals,
	History,
	MarketBrief,
	NewsResult,
	Quote,
	SourceHealth,
	SymbolContext,
	SymbolContextOptions,
	TechnicalSnapshot,
} from "@earendil-works/pi-finance";
import { buildTechnicalSnapshot, FinanceClient } from "@earendil-works/pi-finance";
import { Type } from "typebox";
import { defineTool, type ExtensionAPI, type ExtensionContext } from "./extensions/types.ts";

const client = new FinanceClient();

const symbolParam = {
	symbol: Type.String({ description: "US equity or ETF ticker, for example AAPL, MSFT, SPY, BRK-B" }),
};

const contextOptions = {
	newsLimit: Type.Optional(
		Type.Number({ description: "Maximum news items to fetch, default 10", minimum: 1, maximum: 50 }),
	),
	historyRange: Type.Optional(Type.String({ description: "Yahoo chart range, for example 1mo, 3mo, 6mo, 1y" })),
	historyInterval: Type.Optional(Type.String({ description: "Yahoo chart interval, for example 1d, 1wk" })),
};

function optionsFromParams(params: {
	newsLimit?: number;
	historyRange?: string;
	historyInterval?: string;
}): SymbolContextOptions {
	return {
		newsLimit: params.newsLimit,
		historyRange: params.historyRange,
		historyInterval: params.historyInterval,
	};
}

export async function financeTextResult(label: string, details: unknown, ctx?: ExtensionContext) {
	const artifact = ctx ? await writeFinanceArtifact(label, details, ctx.cwd) : undefined;
	return {
		content: [{ type: "text" as const, text: formatFinanceDetails(label, details, artifact) }],
		details,
	};
}

interface MarketArtifact {
	relativePath: string;
	rows: number;
}

function formatFinanceDetails(label: string, details: unknown, artifact?: MarketArtifact): string {
	if (isHistorySourceResult(details)) return formatHistoryResult(label, details, artifact);
	if (isNewsSourceResult(details)) return formatNewsResult(label, details, artifact);
	if (isFundamentalsSourceResult(details)) return formatFundamentalsResult(label, details, artifact);
	if (isQuoteSourceResult(details)) return formatQuoteResult(label, details, artifact);
	if (isTechnicalDetails(details)) return formatTechnicalDetails(label, details, artifact);
	if (isSymbolContext(details)) return formatSymbolContext(label, details, artifact);
	if (isCompareSymbolsResult(details) || isMarketBrief(details)) {
		const contexts = details.contexts.slice(0, 10);
		return [
			`${label} fetched. Artifact: ${formatArtifact(artifact)}.`,
			`summary: asOf=${details.asOf}, symbols=${contexts.map((context) => context.symbol).join(",")}, degraded=${formatDegradedShort(details.degradedReasons)}`,
			`symbols=${contexts.map((context) => context.symbol).join(",")}`,
		].join("\n");
	}
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

function isHistorySourceResult(value: unknown): value is SourceResult<History> {
	return isSourceResult<History>(value) && isRecord(value.value) && Array.isArray(value.value.bars);
}

function isNewsSourceResult(value: unknown): value is SourceResult<NewsResult> {
	return isSourceResult<NewsResult>(value) && isRecord(value.value) && Array.isArray(value.value.items);
}

function isFundamentalsSourceResult(value: unknown): value is SourceResult<Fundamentals | null> {
	return (
		isSourceResult<Fundamentals | null>(value) &&
		(value.value === null || (isRecord(value.value) && "facts" in value.value))
	);
}

function isQuoteSourceResult(value: unknown): value is SourceResult<Quote | null> {
	return (
		isSourceResult<Quote | null>(value) && (value.value === null || (isRecord(value.value) && "price" in value.value))
	);
}

function isSymbolContext(value: unknown): value is SymbolContext {
	return Boolean(
		value &&
			typeof value === "object" &&
			"symbol" in value &&
			"sourceHealth" in value &&
			"technicalSnapshot" in value,
	);
}

function isCompareSymbolsResult(value: unknown): value is CompareSymbolsResult {
	return Boolean(value && typeof value === "object" && "contexts" in value && "symbols" in value);
}

function isMarketBrief(value: unknown): value is MarketBrief {
	return isCompareSymbolsResult(value);
}

function isTechnicalDetails(value: unknown): value is {
	historyHealth: SourceHealth;
	technicalSnapshot: TechnicalSnapshot | null;
	degradedReasons: string[];
} {
	return Boolean(value && typeof value === "object" && "technicalSnapshot" in value && "historyHealth" in value);
}

function formatQuoteResult(label: string, result: SourceResult<Quote | null>, artifact?: MarketArtifact): string {
	return [
		`${label} fetched. Artifact: ${formatArtifact(artifact)}.`,
		`summary: ${formatHealthShort(result.health)}${result.degradedReason ? `, degraded=${result.degradedReason}` : ""}`,
		result.value
			? `quote: symbol=${result.value.symbol}, price=${formatValue(result.value.price)}, asOf=${result.value.asOf}, source=${result.value.source}`
			: "quote: unavailable",
	]
		.filter(Boolean)
		.join("\n");
}

function formatHistoryResult(label: string, result: SourceResult<History>, artifact?: MarketArtifact): string {
	const bars = result.value.bars.slice(-10);
	return [
		`${label} fetched. Artifact: ${formatArtifact(artifact)}.`,
		`summary: ${formatHealthShort(result.health)}, symbol=${result.value.symbol}, bars=${result.value.bars.length}, latestClose=${formatValue(bars.at(-1)?.close)}`,
	].join("\n");
}

function formatNewsResult(label: string, result: SourceResult<NewsResult>, artifact?: MarketArtifact): string {
	return [
		`${label} fetched. Artifact: ${formatArtifact(artifact)}.`,
		`summary: ${formatHealthShort(result.health)}, symbol=${result.value.symbol}, items=${result.value.items.length}, latestAt=${formatValue(result.value.latestAt)}`,
	].join("\n");
}

function formatFundamentalsResult(
	label: string,
	result: SourceResult<Fundamentals | null>,
	artifact?: MarketArtifact,
): string {
	const facts = result.value?.facts;
	return [
		`${label} fetched. Artifact: ${formatArtifact(artifact)}.`,
		`summary: ${formatHealthShort(result.health)}${result.degradedReason ? `, degraded=${result.degradedReason}` : ""}`,
		result.value
			? `company: symbol=${result.value.symbol}, companyName=${formatValue(result.value.companyName)}, cik=${formatValue(result.value.cik)}, asOf=${result.value.asOf}, source=${result.value.source}`
			: "company: unavailable",
		facts?.revenue ? `revenue: ${formatFact(facts.revenue)}` : undefined,
		facts?.netIncome ? `netIncome: ${formatFact(facts.netIncome)}` : undefined,
	]
		.filter(Boolean)
		.join("\n");
}

function formatTechnicalDetails(
	label: string,
	details: {
		historyHealth: SourceHealth;
		technicalSnapshot: TechnicalSnapshot | null;
		degradedReasons: string[];
	},
	artifact?: MarketArtifact,
): string {
	const snapshot = details.technicalSnapshot;
	return [
		`${label} fetched. Artifact: ${formatArtifact(artifact)}.`,
		`summary: ${formatHealthShort(details.historyHealth)}, degraded=${formatDegradedShort(details.degradedReasons)}`,
		snapshot
			? `technical: symbol=${snapshot.symbol}, period=${snapshot.period}, latestClose=${formatValue(snapshot.latestClose)}, trend=${snapshot.trend}, asOf=${formatValue(snapshot.asOf)}, source=${snapshot.source}`
			: "technical: unavailable",
	].join("\n");
}

function formatSymbolContext(label: string, context: SymbolContext, artifact?: MarketArtifact): string {
	return [
		`${label} fetched. Artifact: ${formatArtifact(artifact)}.`,
		`summary: symbol=${context.symbol}, market=${context.market}, asOf=${context.asOf}, degraded=${formatDegradedShort(context.degradedReasons)}`,
		`coverage: quote=${context.quote ? "yes" : "no"}, historyBars=${context.history.bars.length}, newsItems=${context.news.items.length}, technical=${context.technicalSnapshot ? "yes" : "no"}, fundamentals=${context.fundamentals ? "yes" : "no"}`,
		context.technicalSnapshot
			? `quickTechnical: latestClose=${formatValue(context.technicalSnapshot.latestClose)}, trend=${context.technicalSnapshot.trend}, asOf=${formatValue(context.technicalSnapshot.asOf)}`
			: "quickTechnical: unavailable",
	].join("\n");
}

async function writeFinanceArtifact(label: string, details: unknown, cwd: string): Promise<MarketArtifact | undefined> {
	const lines = financeArtifactLines(details);
	if (!lines) return undefined;
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const relativePath = `.pi/artifacts/market-data/${stamp}-${slugify(label)}.csv`;
	const dir = join(cwd, ".pi", "artifacts", "market-data");
	await mkdir(dir, { recursive: true });
	await writeFile(join(cwd, relativePath), lines.join("\n"), "utf8");
	return { relativePath, rows: Math.max(0, lines.length - 1) };
}

function financeArtifactLines(details: unknown): string[] | undefined {
	if (isHistorySourceResult(details)) {
		return [
			"time,open,high,low,close,volume",
			...details.value.bars.map((bar) => csvRow([bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume])),
		];
	}
	if (isNewsSourceResult(details)) {
		return [
			"publishedAt,publisher,title,url",
			...details.value.items.map((item) => csvRow([item.publishedAt, item.publisher, item.title, item.url])),
		];
	}
	if (isQuoteSourceResult(details)) {
		const quote = details.value;
		return [
			"symbol,price,currency,exchange,marketCap,asOf,source,status,degradedReason",
			csvRow([
				quote?.symbol,
				quote?.price,
				quote?.currency,
				quote?.exchange,
				quote?.marketCap,
				quote?.asOf,
				quote?.source,
				details.health.status,
				details.degradedReason,
			]),
		];
	}
	if (isSymbolContext(details)) return symbolContextArtifactLines(details);
	if (isCompareSymbolsResult(details) || isMarketBrief(details)) {
		return [
			"symbol,price,priceSource,latestClose,trend,newsCount,degradedReasons",
			...details.contexts.map((context) =>
				csvRow([
					context.symbol,
					context.quote?.price,
					context.quote?.source,
					context.technicalSnapshot?.latestClose,
					context.technicalSnapshot?.trend,
					context.news.items.length,
					context.degradedReasons.join("|"),
				]),
			),
		];
	}
	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object");
}

function symbolContextArtifactLines(context: SymbolContext): string[] {
	return [
		"section,time,open,high,low,close,volume,publishedAt,publisher,title,source,status,latestAt,degradedReason",
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
				undefined,
				health.source,
				health.status,
				health.latestAt,
				health.degradedReason,
			]),
		),
		...context.history.bars.map((bar) =>
			csvRow(["bar", bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume]),
		),
		...context.news.items.map((item) =>
			csvRow([
				"news",
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				item.publishedAt,
				item.publisher,
				item.title,
				item.source,
			]),
		),
	];
}

function formatDegradedShort(reasons: string[]): string {
	return reasons.length > 0 ? reasons.join("|") : "none";
}

function formatHealthShort(health: SourceHealth): string {
	return `source=${health.source}, status=${health.status}, latestAt=${formatValue(health.latestAt)}`;
}

function formatArtifact(artifact: MarketArtifact | undefined): string {
	return artifact ? `${artifact.relativePath} (csv, rows=${artifact.rows})` : "not written";
}

function formatFact(fact: Fundamentals["facts"]["revenue"]): string {
	if (!fact) return "unavailable";
	return `${fact.label}=${fact.value}${fact.unit ? ` ${fact.unit}` : ""}, fy=${formatValue(fact.fiscalYear)}, fp=${formatValue(fact.fiscalPeriod)}, form=${formatValue(fact.form)}, filed=${formatValue(fact.filed)}`;
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
	name: "finance_quote",
	label: "Finance Quote",
	description: "Fetch the latest public quote for a US equity or ETF symbol.",
	promptSnippet: "Fetch sourced US equity/ETF quote data",
	promptGuidelines: [
		"finance_quote provides current price, market cap, exchange, and quote facts for US equities or ETFs.",
		"When using finance_quote values, mention source/asOf if available.",
	],
	parameters: Type.Object(symbolParam),
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		return financeTextResult("Finance quote", await client.getQuote(params.symbol), ctx);
	},
});

const historyTool = defineTool({
	name: "finance_history",
	label: "Finance History",
	description: "Fetch historical bars for a US equity or ETF symbol.",
	promptSnippet: "Fetch sourced historical price bars for US equities/ETFs",
	promptGuidelines: [
		"finance_history provides recent performance, drawdown, trend, and price-history data.",
		"When using finance_history values, mention range, source, and latestAt/asOf if available.",
	],
	parameters: Type.Object({
		...symbolParam,
		historyRange: Type.Optional(Type.String({ description: "Yahoo chart range, default 6mo" })),
		historyInterval: Type.Optional(Type.String({ description: "Yahoo chart interval, default 1d" })),
	}),
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		return financeTextResult(
			"Finance history",
			await client.getHistory(params.symbol, params.historyRange, params.historyInterval),
			ctx,
		);
	},
});

const newsTool = defineTool({
	name: "finance_news",
	label: "Finance News",
	description: "Fetch recent public news for a US equity or ETF symbol.",
	promptSnippet: "Fetch recent sourced US equity/ETF news",
	promptGuidelines: [
		"finance_news provides catalysts, recent events, and sentiment-driver inputs.",
		"When using news, separate reported facts from interpretation and cite publisher/publishedAt if available.",
	],
	parameters: Type.Object({
		...symbolParam,
		newsLimit: Type.Optional(
			Type.Number({ description: "Maximum news items to fetch, default 10", minimum: 1, maximum: 50 }),
		),
	}),
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		return financeTextResult("Finance news", await client.getNews(params.symbol, params.newsLimit), ctx);
	},
});

const secFactsTool = defineTool({
	name: "finance_sec_facts",
	label: "Finance SEC Facts",
	description: "Fetch latest available SEC company facts for a US equity symbol.",
	promptSnippet: "Fetch SEC company facts for US equities",
	promptGuidelines: [
		"finance_sec_facts provides revenue, net income, fundamentals, filings, and SEC-sourced facts.",
		"When using SEC facts, cite filed date, fiscal period, form, and source when present.",
	],
	parameters: Type.Object(symbolParam),
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		return financeTextResult("Finance SEC facts", await client.getSecFacts(params.symbol), ctx);
	},
});

const technicalTool = defineTool({
	name: "finance_technical_snapshot",
	label: "Finance Technical Snapshot",
	description: "Fetch history and compute a technical snapshot for a US equity or ETF symbol.",
	promptSnippet: "Compute trend, returns, and moving averages from sourced history",
	promptGuidelines: [
		"finance_technical_snapshot provides trend, momentum, moving averages, and recent returns.",
		"When making technical conclusions, account for insufficient or degraded history instead of overstating certainty.",
	],
	parameters: Type.Object({
		...symbolParam,
		historyRange: Type.Optional(Type.String({ description: "Yahoo chart range, default 6mo" })),
		historyInterval: Type.Optional(Type.String({ description: "Yahoo chart interval, default 1d" })),
	}),
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const history = await client.getHistory(params.symbol, params.historyRange, params.historyInterval);
		const technicalSnapshot =
			history.value.bars.length > 0
				? buildTechnicalSnapshot(params.symbol, history.value.bars, params.historyInterval ?? "daily")
				: null;
		return financeTextResult(
			"Finance technical snapshot",
			{
				historyHealth: history.health,
				technicalSnapshot,
				degradedReasons: history.degradedReason ? [history.degradedReason] : [],
			},
			ctx,
		);
	},
});

const contextTool = defineTool({
	name: "finance_symbol_context",
	label: "Finance Symbol Context",
	description: "Build quote, history, news, technical and SEC context for a US equity or ETF symbol.",
	promptSnippet: "Build sourced full research context for a US equity/ETF",
	promptGuidelines: [
		"finance_symbol_context bundles quote, history, news, technical, and SEC data for a single US equity or ETF.",
		"Use finance_symbol_context when broad symbol context would help, but choose the response structure yourself.",
	],
	parameters: Type.Object({
		...symbolParam,
		...contextOptions,
	}),
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		return financeTextResult(
			"Finance symbol context",
			await client.getSymbolContext(params.symbol, optionsFromParams(params)),
			ctx,
		);
	},
});

const compareTool = defineTool({
	name: "finance_compare_symbols",
	label: "Finance Compare Symbols",
	description: "Build comparable sourced contexts for multiple US equity or ETF symbols.",
	promptSnippet: "Compare multiple US equities/ETFs with sourced contexts",
	promptGuidelines: [
		"finance_compare_symbols provides comparable sourced contexts for companies, peers, or ETFs.",
		"Avoid ranking claims unless the compared metrics are present in the tool result.",
	],
	parameters: Type.Object({
		symbols: Type.Array(Type.String(), {
			description: "US equity or ETF tickers to compare",
			minItems: 1,
			maxItems: 10,
		}),
		...contextOptions,
	}),
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		return financeTextResult(
			"Finance comparison",
			await client.compareSymbols(params.symbols, optionsFromParams(params)),
			ctx,
		);
	},
});

const marketBriefTool = defineTool({
	name: "finance_market_brief",
	label: "Finance Market Brief",
	description: "Build a sourced market brief from a basket of US equity or ETF symbols.",
	promptSnippet: "Build sourced market brief context from a US symbol basket",
	promptGuidelines: [
		"finance_market_brief provides sourced context for a market, sector, or watchlist basket.",
		"Account for sourceHealth and degradedReasons instead of hiding missing data.",
	],
	parameters: Type.Object({
		symbols: Type.Array(Type.String(), {
			description: "US equity or ETF tickers for the brief, for example SPY, QQQ, AAPL, MSFT",
			minItems: 1,
			maxItems: 20,
		}),
		...contextOptions,
	}),
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		return financeTextResult(
			"Finance market brief",
			await client.getMarketBrief(params.symbols, optionsFromParams(params)),
			ctx,
		);
	},
});

const financePrompt = `

FINANCE AGENT MODE:
- You are a US equity and ETF research agent.
- finance_* tools can provide prices, history, news, SEC facts, technical snapshots, comparisons, and market briefs when useful.
- Do not invent prices, dates, financial metrics, filing facts, or news. If tool data is missing, say what is missing.
- When using tool data, mention source/asOf/latestAt where available.
- Let the user's question determine which tools to call and how to structure the answer; do not force a fixed template.
- Do not claim to execute trades or connect to brokerage accounts.
`;

export default function financeAgentExtension(pi: ExtensionAPI) {
	pi.registerTool(quoteTool);
	pi.registerTool(historyTool);
	pi.registerTool(newsTool);
	pi.registerTool(secFactsTool);
	pi.registerTool(technicalTool);
	pi.registerTool(contextTool);
	pi.registerTool(compareTool);
	pi.registerTool(marketBriefTool);

	pi.on("before_agent_start", (event) => ({
		systemPrompt: event.systemPrompt + financePrompt,
	}));
}
