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

function textResult(label: string, details: unknown) {
	return {
		content: [{ type: "text" as const, text: `${label} fetched. Use details JSON for sourced analysis.` }],
		details,
	};
}

const quoteTool = defineTool({
	name: "finance_quote",
	label: "Finance Quote",
	description: "Fetch the latest public quote for a US equity or ETF symbol.",
	promptSnippet: "Fetch sourced US equity/ETF quote data",
	promptGuidelines: [
		"Use finance_quote when the user asks for current price, market cap, exchange, or quote facts for a US equity or ETF.",
		"Finance answers must cite finance_quote details such as source and asOf when using quote numbers.",
	],
	parameters: Type.Object(symbolParam),
	async execute(_toolCallId, params) {
		return textResult("Finance quote", await client.getQuote(params.symbol));
	},
});

const historyTool = defineTool({
	name: "finance_history",
	label: "Finance History",
	description: "Fetch historical bars for a US equity or ETF symbol.",
	promptSnippet: "Fetch sourced historical price bars for US equities/ETFs",
	promptGuidelines: [
		"Use finance_history when the user asks for recent performance, drawdown, trend, or price history.",
		"Finance answers using history must mention the range, source, and latestAt/asOf from finance_history details.",
	],
	parameters: Type.Object({
		...symbolParam,
		historyRange: Type.Optional(Type.String({ description: "Yahoo chart range, default 6mo" })),
		historyInterval: Type.Optional(Type.String({ description: "Yahoo chart interval, default 1d" })),
	}),
	async execute(_toolCallId, params) {
		return textResult(
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
		"Use finance_news when the user asks for catalysts, recent events, or sentiment drivers.",
		"Finance answers using news must separate reported facts from interpretation and cite publisher/publishedAt when available.",
	],
	parameters: Type.Object({
		...symbolParam,
		newsLimit: Type.Optional(
			Type.Number({ description: "Maximum news items to fetch, default 10", minimum: 1, maximum: 50 }),
		),
	}),
	async execute(_toolCallId, params) {
		return textResult("Finance news", await client.getNews(params.symbol, params.newsLimit));
	},
});

const secFactsTool = defineTool({
	name: "finance_sec_facts",
	label: "Finance SEC Facts",
	description: "Fetch latest available SEC company facts for a US equity symbol.",
	promptSnippet: "Fetch SEC company facts for US equities",
	promptGuidelines: [
		"Use finance_sec_facts when the user asks about revenue, net income, fundamentals, filings, or SEC-sourced facts.",
		"Finance answers using SEC facts must cite filed date, fiscal period, form, and source when present.",
	],
	parameters: Type.Object(symbolParam),
	async execute(_toolCallId, params) {
		return textResult("Finance SEC facts", await client.getSecFacts(params.symbol));
	},
});

const technicalTool = defineTool({
	name: "finance_technical_snapshot",
	label: "Finance Technical Snapshot",
	description: "Fetch history and compute a technical snapshot for a US equity or ETF symbol.",
	promptSnippet: "Compute trend, returns, and moving averages from sourced history",
	promptGuidelines: [
		"Use finance_technical_snapshot when the user asks for technical trend, momentum, moving averages, or recent returns.",
		"Finance technical conclusions must identify whether the data is insufficient, uptrend, downtrend, or neutral.",
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
		return textResult("Finance technical snapshot", {
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
		"Use finance_symbol_context before producing a full single-stock or ETF research view.",
		"Finance research must explicitly split Data facts, Inference, Risks, and Verification items when using finance_symbol_context.",
	],
	parameters: Type.Object({
		...symbolParam,
		...contextOptions,
	}),
	async execute(_toolCallId, params) {
		return textResult(
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
		"Use finance_compare_symbols when the user asks to compare companies, peers, or ETFs.",
		"Finance comparisons must avoid ranking claims unless the compared metrics are present in finance_compare_symbols details.",
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
		return textResult("Finance comparison", await client.compareSymbols(params.symbols, optionsFromParams(params)));
	},
});

const marketBriefTool = defineTool({
	name: "finance_market_brief",
	label: "Finance Market Brief",
	description: "Build a sourced market brief from a basket of US equity or ETF symbols.",
	promptSnippet: "Build sourced market brief context from a US symbol basket",
	promptGuidelines: [
		"Use finance_market_brief when the user asks for a market, sector, or watchlist brief.",
		"Finance market briefs must report sourceHealth and degradedReasons instead of hiding missing data.",
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
		return textResult("Finance market brief", await client.getMarketBrief(params.symbols, optionsFromParams(params)));
	},
});

const financePrompt = `

FINANCE AGENT MODE:
- You are a US equity and ETF research agent.
- Use finance_* tools for prices, history, news, SEC facts, technical snapshots, comparisons, and market briefs.
- Do not invent prices, dates, financial metrics, filing facts, or news. If tool data is missing, say what is missing.
- Every finance answer based on tool data must mention source/asOf/latestAt where available.
- Separate outputs into: Data facts, Inference, Risks and uncertainty, Verification path.
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
