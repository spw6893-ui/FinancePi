import { describe, expect, it } from "vitest";

import { FinanceClient } from "../../../finance/src/index.ts";

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "content-type": "application/json" },
	});
}

const quotePayload = {
	quoteResponse: {
		result: [
			{
				symbol: "AAPL",
				shortName: "Apple Inc.",
				regularMarketPrice: 200,
				regularMarketChangePercent: 1.25,
				regularMarketTime: 1781913600,
				currency: "USD",
				exchange: "NMS",
				marketCap: 3000000000000,
			},
		],
	},
};

const chartPayload = {
	chart: {
		result: [
			{
				timestamp: [1781568000, 1781654400, 1781740800, 1781827200, 1781913600],
				indicators: {
					quote: [
						{
							open: [196, 197, 198, 199, 200],
							high: [197, 198, 199, 200, 201],
							low: [195, 196, 197, 198, 199],
							close: [196, 197, 198, 199, 200],
							volume: [10, 11, 12, 13, 14],
						},
					],
				},
			},
		],
	},
};

const chartPayloadWithMisleadingMetaPreviousClose = {
	chart: {
		result: [
			{
				meta: {
					regularMarketPrice: 200,
					regularMarketTime: 1781913600,
					chartPreviousClose: 190,
				},
				timestamp: [1781740800, 1781827200, 1781913600],
				indicators: {
					quote: [
						{
							open: [198, 199, 200],
							high: [199, 200, 201],
							low: [197, 198, 199],
							close: [198, 199, 200],
							volume: [12, 13, 14],
						},
					],
				},
			},
		],
	},
};

const iceSemitLimitedChartPayload = {
	chart: {
		result: [
			{
				meta: {
					currency: "USD",
					exchangeName: "NYQ",
					fullExchangeName: "NYSE",
					longName: "NYSE Semiconductor Index (TR)",
					shortName: "NYSE Semiconductor Index (TR)",
					regularMarketPrice: 4193.807,
					regularMarketTime: 1781913600,
					chartPreviousClose: 4091.2102,
					validRanges: ["1d", "5d"],
				},
				timestamp: [1781913600],
				indicators: {
					quote: [
						{
							open: [4110],
							high: [4200],
							low: [4100],
							close: [4193.807],
							volume: [null],
						},
					],
				},
			},
		],
	},
};

const iceSemitIntradayChartPayload = {
	chart: {
		result: [
			{
				meta: {
					currency: "USD",
					exchangeName: "NYQ",
					fullExchangeName: "NYSE",
					longName: "NYSE Semiconductor Index (TR)",
					shortName: "NYSE Semiconductor Index (TR)",
					regularMarketPrice: 4193.807,
					regularMarketTime: 1781913600,
					chartPreviousClose: 4091.2102,
					validRanges: ["1d", "5d"],
				},
				timestamp: [1781906400, 1781910000, 1781913600],
				indicators: {
					quote: [
						{
							open: [4110, 4150, 4180],
							high: [4160, 4190, 4200],
							low: [4100, 4140, 4170],
							close: [4150, 4180, 4193.807],
							volume: [null, null, null],
						},
					],
				},
			},
		],
	},
};

const newsPayload = {
	news: [
		{
			uuid: "n1",
			title: "Apple announces product update",
			publisher: "Yahoo Finance",
			link: "https://finance.example/news/aapl",
			providerPublishTime: 1781913600,
		},
	],
};

const tickerMapPayload = {
	0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
};

const factsPayload = {
	facts: {
		"us-gaap": {
			Revenues: {
				units: {
					USD: [{ fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-31", val: 391035000000 }],
				},
			},
			NetIncomeLoss: {
				units: {
					USD: [{ fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-31", val: 93736000000 }],
				},
			},
		},
	},
};

const alternativeRevenueFactsPayload = {
	facts: {
		"us-gaap": {
			Revenues: {
				units: {
					USD: [{ fy: 2011, fp: "FY", form: "10-K", filed: "2012-08-01", val: 1000000000 }],
				},
			},
			RevenueFromContractWithCustomerExcludingAssessedTax: {
				units: {
					USD: [{ fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-02-01", val: 3075000000 }],
				},
			},
			OperatingIncomeLoss: {
				units: {
					USD: [{ fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-02-01", val: 1200000000 }],
				},
			},
			NetCashProvidedByUsedInOperatingActivities: {
				units: {
					USD: [{ fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-02-01", val: 900000000 }],
				},
			},
			Assets: {
				units: {
					USD: [
						{
							fy: 2026,
							fp: "Q2",
							form: "10-Q",
							filed: "2026-02-01",
							end: "2025-06-30",
							val: 14000000000,
						},
						{
							fy: 2026,
							fp: "Q2",
							form: "10-Q",
							filed: "2026-02-01",
							end: "2026-02-01",
							val: 15000000000,
						},
					],
				},
			},
			Liabilities: {
				units: {
					USD: [{ fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-02-01", val: 4000000000 }],
				},
			},
		},
	},
};

describe("FinanceClient", () => {
	it("builds a symbol context from quote, history, news and SEC facts", async () => {
		const client = new FinanceClient({
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url) => {
				const text = String(url);
				if (text.includes("/v7/finance/quote")) return jsonResponse(quotePayload);
				if (text.includes("/v8/finance/chart")) return jsonResponse(chartPayload);
				if (text.includes("/v1/finance/search")) return jsonResponse(newsPayload);
				if (text.includes("/files/company_tickers.json")) return jsonResponse(tickerMapPayload);
				if (text.includes("/api/xbrl/companyfacts/")) return jsonResponse(factsPayload);
				throw new Error(`unexpected URL ${text}`);
			},
		});

		const context = await client.getSymbolContext("aapl", { newsLimit: 5, historyRange: "1mo" });

		expect(context.ok).toBe(true);
		expect(context.symbol).toBe("AAPL");
		expect(context.quote?.price).toBe(200);
		expect(context.history.bars).toHaveLength(5);
		expect(context.news.items[0]?.title).toContain("Apple");
		expect(context.fundamentals?.cik).toBe("0000320193");
		expect(context.fundamentals?.facts.revenue?.value).toBe(391035000000);
		expect(context.technicalSnapshot?.latestClose).toBe(200);
		expect(context.degradedReasons).toEqual([]);
		expect(context.sourceHealth.every((item) => item.status === "ok")).toBe(true);
	});

	it("keeps context usable when an optional source fails", async () => {
		const client = new FinanceClient({
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url) => {
				const text = String(url);
				if (text.includes("/v7/finance/quote")) return jsonResponse(quotePayload);
				if (text.includes("/v8/finance/chart")) return jsonResponse(chartPayload);
				if (text.includes("/v1/finance/search")) return jsonResponse({ error: "rate limited" }, 429);
				if (text.includes("/files/company_tickers.json")) return jsonResponse(tickerMapPayload);
				if (text.includes("/api/xbrl/companyfacts/")) return jsonResponse(factsPayload);
				throw new Error(`unexpected URL ${text}`);
			},
		});

		const context = await client.getSymbolContext("AAPL");

		expect(context.ok).toBe(true);
		expect(context.news.items).toEqual([]);
		expect(context.degradedReasons).toContain("news_http_429");
		expect(context.sourceHealth).toContainEqual(
			expect.objectContaining({ source: "yahoo_news", status: "degraded" }),
		);
	});

	it("uses free chart latest close for quotes without calling Yahoo quote", async () => {
		const client = new FinanceClient({
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url) => {
				const text = String(url);
				if (text.includes("/v7/finance/quote")) throw new Error("Yahoo quote should not be called");
				if (text.includes("/v8/finance/chart")) return jsonResponse(chartPayload);
				throw new Error(`unexpected URL ${text}`);
			},
		});

		const quote = await client.getQuote("AAPL");

		expect(quote.value?.price).toBe(200);
		expect(quote.value?.source).toBe("yahoo_chart_quote");
		expect(quote.degradedReason).toBeUndefined();
		expect(quote.health.status).toBe("ok");
		expect(quote.health.source).toBe("yahoo_chart");
	});

	it("keeps quote day change based on the previous daily bar when available", async () => {
		const client = new FinanceClient({
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url) => {
				const text = String(url);
				if (text.includes("/v8/finance/chart")) return jsonResponse(chartPayloadWithMisleadingMetaPreviousClose);
				throw new Error(`unexpected URL ${text}`);
			},
		});

		const quote = await client.getQuote("MSFT");

		expect(quote.value?.price).toBe(200);
		expect(quote.value?.changePercent).toBeCloseTo(((200 - 199) / 199) * 100);
	});

	it("uses Yahoo chart metadata for chart-only index quotes", async () => {
		const client = new FinanceClient({
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url) => {
				const text = String(url);
				if (text.includes("/v8/finance/chart")) return jsonResponse(iceSemitLimitedChartPayload);
				throw new Error(`unexpected URL ${text}`);
			},
		});

		const quote = await client.getQuote("^icesemit");

		expect(quote.value?.symbol).toBe("^ICESEMIT");
		expect(quote.value?.price).toBe(4193.807);
		expect(quote.value?.changePercent).toBeCloseTo(((4193.807 - 4091.2102) / 4091.2102) * 100);
		expect(quote.value?.name).toBe("NYSE Semiconductor Index (TR)");
		expect(quote.value?.currency).toBe("USD");
		expect(quote.value?.exchange).toBe("NYSE");
		expect(quote.value?.asOf).toBe(new Date(1781913600 * 1000).toISOString());
		expect(quote.health.status).toBe("ok");
	});

	it("falls back to short Yahoo chart ranges when a symbol has limited daily history", async () => {
		const client = new FinanceClient({
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url) => {
				const text = String(url);
				if (!text.includes("/v8/finance/chart")) throw new Error(`unexpected URL ${text}`);
				const requestUrl = new URL(text);
				const range = requestUrl.searchParams.get("range");
				const interval = requestUrl.searchParams.get("interval");
				if (range === "6mo" && interval === "1d") return jsonResponse(iceSemitLimitedChartPayload);
				if (range === "5d" && interval === "1d") return jsonResponse(iceSemitLimitedChartPayload);
				if (range === "1d" && interval === "1m") return jsonResponse(iceSemitIntradayChartPayload);
				throw new Error(`unexpected chart params ${range ?? ""}/${interval ?? ""}`);
			},
		});

		const history = await client.getHistory("^icesemit", "6mo", "1d");

		expect(history.value.symbol).toBe("^ICESEMIT");
		expect(history.value.range).toBe("1d");
		expect(history.value.interval).toBe("1m");
		expect(history.value.bars).toHaveLength(3);
		expect(history.health.status).toBe("degraded");
		expect(history.degradedReason).toBe("history_range_fallback_6mo_1d_to_1d_1m");
		expect(history.health.degradedReason).toBe("history_range_fallback_6mo_1d_to_1d_1m");
	});

	it("uses a SEC-friendly user agent with contact information", async () => {
		let secUserAgent = "";
		const client = new FinanceClient({
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url, init) => {
				const text = String(url);
				if (text.includes("/files/company_tickers.json")) return jsonResponse(tickerMapPayload);
				if (text.includes("/api/xbrl/companyfacts/")) {
					secUserAgent = new Headers(init?.headers).get("user-agent") ?? "";
					return jsonResponse(factsPayload);
				}
				throw new Error(`unexpected URL ${text}`);
			},
		});

		await client.getSecFacts("AAPL");

		expect(secUserAgent).toContain("@");
		expect(secUserAgent).toContain("pi-finance-agent");
	});

	it("uses modern SEC revenue concepts before stale legacy revenue fields", async () => {
		const client = new FinanceClient({
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url) => {
				const text = String(url);
				if (text.includes("/files/company_tickers.json")) {
					return jsonResponse({ 0: { cik_str: 319201, ticker: "KLAC", title: "KLA Corporation" } });
				}
				if (text.includes("/api/xbrl/companyfacts/")) return jsonResponse(alternativeRevenueFactsPayload);
				throw new Error(`unexpected URL ${text}`);
			},
		});

		const facts = await client.getSecFacts("KLAC");

		expect(facts.value?.facts.revenue?.value).toBe(3075000000);
		expect(facts.value?.facts.revenue?.concept).toBe("RevenueFromContractWithCustomerExcludingAssessedTax");
		expect(facts.value?.facts.operatingIncome?.value).toBe(1200000000);
		expect(facts.value?.facts.operatingCashFlow?.value).toBe(900000000);
		expect(facts.value?.facts.assets?.value).toBe(15000000000);
		expect(facts.value?.facts.assets?.periodEnd).toBe("2026-02-01");
		expect(facts.value?.facts.liabilities?.value).toBe(4000000000);
		expect(facts.value?.asOf).toBe("2026-02-01");
	});
});
