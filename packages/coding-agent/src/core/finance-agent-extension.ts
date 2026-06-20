import type { SymbolContextOptions } from "@earendil-works/pi-finance";
import { buildTechnicalSnapshot, FinanceClient } from "@earendil-works/pi-finance";
import { Type } from "typebox";
import { defineTool, type ExtensionAPI } from "./extensions/types.ts";

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

export function financeTextResult(label: string, details: unknown) {
	const json = JSON.stringify(details, null, 2);
	return {
		content: [{ type: "text" as const, text: `${label} fetched.\n\n${json}` }],
		details,
	};
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
	async execute(_toolCallId, params) {
		return financeTextResult("Finance quote", await client.getQuote(params.symbol));
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
	async execute(_toolCallId, params) {
		return financeTextResult(
			"Finance history",
			await client.getHistory(params.symbol, params.historyRange, params.historyInterval),
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
	async execute(_toolCallId, params) {
		return financeTextResult("Finance news", await client.getNews(params.symbol, params.newsLimit));
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
	async execute(_toolCallId, params) {
		return financeTextResult("Finance SEC facts", await client.getSecFacts(params.symbol));
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
	async execute(_toolCallId, params) {
		const history = await client.getHistory(params.symbol, params.historyRange, params.historyInterval);
		const technicalSnapshot =
			history.value.bars.length > 0
				? buildTechnicalSnapshot(params.symbol, history.value.bars, params.historyInterval ?? "daily")
				: null;
		return financeTextResult("Finance technical snapshot", {
			historyHealth: history.health,
			technicalSnapshot,
			degradedReasons: history.degradedReason ? [history.degradedReason] : [],
		});
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
	async execute(_toolCallId, params) {
		return financeTextResult(
			"Finance symbol context",
			await client.getSymbolContext(params.symbol, optionsFromParams(params)),
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
	async execute(_toolCallId, params) {
		return financeTextResult(
			"Finance comparison",
			await client.compareSymbols(params.symbols, optionsFromParams(params)),
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
	async execute(_toolCallId, params) {
		return financeTextResult(
			"Finance market brief",
			await client.getMarketBrief(params.symbols, optionsFromParams(params)),
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
