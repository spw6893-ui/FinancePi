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

const finnhubNewsPayload = [
	{
		id: 101,
		headline: "Apple supplier demand improves",
		source: "Finnhub Wire",
		url: "https://finnhub.example/news/aapl-demand",
		datetime: 1781827200,
	},
];

const alphaVantageNewsPayload = {
	feed: [
		{
			title: "Analysts discuss Apple services momentum",
			source: "Alpha Wire",
			url: "https://alpha.example/news/aapl-services",
			time_published: "20260617T120000",
			ticker_sentiment: [{ ticker: "AAPL", relevance_score: "1.000000" }],
		},
		{
			title: "Form 6K unrelated company that only mentions Apple as a peer",
			source: "Alpha Wire",
			url: "https://alpha.example/news/unrelated-form-6k",
			time_published: "20260618T120000",
			ticker_sentiment: [
				{ ticker: "SDM", relevance_score: "1.000000" },
				{ ticker: "AAPL", relevance_score: "0.638521" },
			],
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

const optionExpirationA = Math.floor(Date.parse("2026-07-17T00:00:00Z") / 1000);
const optionExpirationB = Math.floor(Date.parse("2026-08-21T00:00:00Z") / 1000);

const optionsPayloadA = {
	optionChain: {
		result: [
			{
				quote: {
					symbol: "NVDA",
					regularMarketPrice: 100,
					regularMarketTime: 1781913600,
				},
				expirationDates: [optionExpirationA, optionExpirationB],
				options: [
					{
						expirationDate: optionExpirationA,
						calls: [
							{
								contractSymbol: "NVDA260717C00100000",
								strike: 100,
								volume: 100,
								openInterest: 1000,
								impliedVolatility: 0.4,
								expiration: optionExpirationA,
							},
							{
								contractSymbol: "NVDA260717C00105000",
								strike: 105,
								volume: 250,
								openInterest: 2200,
								impliedVolatility: 0.45,
								expiration: optionExpirationA,
							},
						],
						puts: [
							{
								contractSymbol: "NVDA260717P00100000",
								strike: 100,
								volume: 80,
								openInterest: 900,
								impliedVolatility: 0.42,
								expiration: optionExpirationA,
							},
							{
								contractSymbol: "NVDA260717P00095000",
								strike: 95,
								volume: 300,
								openInterest: 2500,
								impliedVolatility: 0.5,
								expiration: optionExpirationA,
							},
						],
					},
				],
			},
		],
	},
};

const optionsPayloadB = {
	optionChain: {
		result: [
			{
				quote: {
					symbol: "NVDA",
					regularMarketPrice: 100,
					regularMarketTime: 1781913600,
				},
				expirationDates: [optionExpirationA, optionExpirationB],
				options: [
					{
						expirationDate: optionExpirationB,
						calls: [
							{
								contractSymbol: "NVDA260821C00110000",
								strike: 110,
								volume: 50,
								openInterest: 1000,
								impliedVolatility: 0.48,
								expiration: optionExpirationB,
							},
						],
						puts: [
							{
								contractSymbol: "NVDA260821P00090000",
								strike: 90,
								volume: 70,
								openInterest: 1200,
								impliedVolatility: 0.55,
								expiration: optionExpirationB,
							},
						],
					},
				],
			},
		],
	},
};

const cboeOptionsPayload = {
	timestamp: "2026-06-20 20:00:00",
	data: {
		symbol: "NVDA",
		current_price: 100,
		options: [
			{
				option: "NVDA260717C00100000",
				volume: 100,
				open_interest: 1000,
				iv: 0.4,
				gamma: 0.05,
			},
			{
				option: "NVDA260717C00105000",
				volume: 250,
				open_interest: 2200,
				iv: 0.45,
				gamma: 0.04,
			},
			{
				option: "NVDA260717P00100000",
				volume: 80,
				open_interest: 900,
				iv: 0.42,
				gamma: 0.05,
			},
			{
				option: "NVDA260717P00095000",
				volume: 300,
				open_interest: 2500,
				iv: 0.5,
				gamma: 0.03,
			},
		],
	},
};

describe("FinanceClient", () => {
	it("builds a symbol context from quote, history, news and SEC facts", async () => {
		const client = new FinanceClient({
			env: {},
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
			env: {},
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

	it("merges configured free news providers into one news result", async () => {
		const requestedUrls: string[] = [];
		const client = new FinanceClient({
			env: {
				FINNHUB_API_KEY: "finnhub-test-key",
				ALPHA_VANTAGE_API_KEY: "alpha-test-key",
			},
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url) => {
				const text = String(url);
				requestedUrls.push(text);
				if (text.includes("/v1/finance/search")) return jsonResponse(newsPayload);
				if (text.includes("finnhub.io/api/v1/company-news")) return jsonResponse(finnhubNewsPayload);
				if (text.includes("alphavantage.co/query")) return jsonResponse(alphaVantageNewsPayload);
				throw new Error(`unexpected URL ${text}`);
			},
		});

		const news = await client.getNews("aapl", 10);

		expect(news.value.items.map((item) => item.source)).toEqual([
			"yahoo_news",
			"finnhub_company_news",
			"alpha_vantage_news_sentiment",
		]);
		expect(news.value.items.map((item) => item.title)).not.toContain(
			"Form 6K unrelated company that only mentions Apple as a peer",
		);
		expect(news.value.source).toBe("news_aggregate");
		expect(news.value.latestAt).toBe("2026-06-20T00:00:00.000Z");
		expect(news.value.sourceHealth).toEqual([
			expect.objectContaining({ source: "yahoo_news", status: "ok", configured: true, used: true }),
			expect.objectContaining({ source: "finnhub_company_news", status: "ok", configured: true, used: true }),
			expect.objectContaining({
				source: "alpha_vantage_news_sentiment",
				status: "ok",
				configured: true,
				used: true,
			}),
		]);
		expect(news.health).toEqual(
			expect.objectContaining({ source: "news_aggregate", status: "ok", configured: true, used: true }),
		);
		expect(requestedUrls.some((url) => url.includes("token=finnhub-test-key"))).toBe(true);
		expect(requestedUrls.some((url) => url.includes("apikey=alpha-test-key"))).toBe(true);
	});

	it("carries configured free news provider health into symbol context", async () => {
		const client = new FinanceClient({
			env: {
				FINNHUB_API_KEY: "finnhub-test-key",
				ALPHA_VANTAGE_API_KEY: "alpha-test-key",
			},
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url) => {
				const text = String(url);
				if (text.includes("/v8/finance/chart")) return jsonResponse(chartPayload);
				if (text.includes("/v1/finance/search")) return jsonResponse(newsPayload);
				if (text.includes("finnhub.io/api/v1/company-news")) return jsonResponse(finnhubNewsPayload);
				if (text.includes("alphavantage.co/query")) return jsonResponse(alphaVantageNewsPayload);
				if (text.includes("/files/company_tickers.json")) return jsonResponse(tickerMapPayload);
				if (text.includes("/api/xbrl/companyfacts/")) return jsonResponse(factsPayload);
				throw new Error(`unexpected URL ${text}`);
			},
		});

		const context = await client.getSymbolContext("AAPL");

		expect(context.news.items).toHaveLength(3);
		expect(context.sourceHealth).toContainEqual(
			expect.objectContaining({ source: "finnhub_company_news", status: "ok", configured: true, used: true }),
		);
		expect(context.sourceHealth).toContainEqual(
			expect.objectContaining({
				source: "alpha_vantage_news_sentiment",
				status: "ok",
				configured: true,
				used: true,
			}),
		);
	});

	it("adds a FRED macro snapshot to market briefs when configured", async () => {
		const fredValues: Record<string, string> = {
			DGS10: "4.25",
			DGS2: "3.80",
			FEDFUNDS: "4.33",
			BAMLH0A0HYM2: "3.15",
		};
		const client = new FinanceClient({
			env: { FRED_API_KEY: "fred-test-key" },
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url) => {
				const text = String(url);
				if (text.includes("/v8/finance/chart")) return jsonResponse(chartPayload);
				if (text.includes("/v1/finance/search")) return jsonResponse(newsPayload);
				if (text.includes("/files/company_tickers.json")) return jsonResponse(tickerMapPayload);
				if (text.includes("/api/xbrl/companyfacts/")) return jsonResponse(factsPayload);
				if (text.includes("api.stlouisfed.org/fred/series/observations")) {
					const requestUrl = new URL(text);
					const seriesId = requestUrl.searchParams.get("series_id") ?? "";
					return jsonResponse({ observations: [{ date: "2026-06-19", value: fredValues[seriesId] ?? "." }] });
				}
				throw new Error(`unexpected URL ${text}`);
			},
		});

		const brief = await client.getMarketBrief(["AAPL"]);

		expect(brief.macro.observations).toEqual([
			expect.objectContaining({ seriesId: "DGS10", label: "US 10Y Treasury yield", value: 4.25 }),
			expect.objectContaining({ seriesId: "DGS2", label: "US 2Y Treasury yield", value: 3.8 }),
			expect.objectContaining({ seriesId: "FEDFUNDS", label: "Effective federal funds rate", value: 4.33 }),
			expect.objectContaining({
				seriesId: "BAMLH0A0HYM2",
				label: "US high yield option-adjusted spread",
				value: 3.15,
			}),
		]);
		expect(brief.macro.latestAt).toBe("2026-06-19");
		expect(brief.sourceHealth).toContainEqual(
			expect.objectContaining({ source: "fred:DGS10", status: "ok", configured: true, used: true }),
		);
		expect(brief.degradedReasons).toEqual([]);
	});

	it("uses free chart latest close for quotes without calling Yahoo quote", async () => {
		const client = new FinanceClient({
			env: {},
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
			env: {},
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
			env: {},
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
			env: {},
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
			env: {},
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
			env: {},
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

	it("builds options positioning from Yahoo option chains", async () => {
		const requestedUrls: string[] = [];
		const client = new FinanceClient({
			env: {},
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url) => {
				const text = String(url);
				requestedUrls.push(text);
				if (!text.includes("/v7/finance/options/NVDA")) throw new Error(`unexpected URL ${text}`);
				const requestUrl = new URL(text);
				const date = requestUrl.searchParams.get("date");
				if (date === String(optionExpirationB)) return jsonResponse(optionsPayloadB);
				return jsonResponse(optionsPayloadA);
			},
		});

		const positioning = await client.getOptionsPositioning("nvda", { expirationLimit: 2 });

		expect(positioning.value?.symbol).toBe("NVDA");
		expect(positioning.value?.underlyingPrice).toBe(100);
		expect(positioning.value?.expirationDates).toEqual(["2026-07-17", "2026-08-21"]);
		expect(positioning.value?.expirations).toHaveLength(2);
		expect(positioning.value?.summary.callVolume).toBe(400);
		expect(positioning.value?.summary.putVolume).toBe(450);
		expect(positioning.value?.summary.volumePutCallRatio).toBeCloseTo(1.125);
		expect(positioning.value?.summary.callOpenInterest).toBe(4200);
		expect(positioning.value?.summary.putOpenInterest).toBe(4600);
		expect(positioning.value?.summary.openInterestPutCallRatio).toBeCloseTo(4600 / 4200);
		expect(positioning.value?.summary.callWall).toEqual(
			expect.objectContaining({ strike: 105, callOpenInterest: 2200 }),
		);
		expect(positioning.value?.summary.putWall).toEqual(
			expect.objectContaining({ strike: 95, putOpenInterest: 2500 }),
		);
		expect(positioning.value?.summary.maxPain).toEqual(expect.objectContaining({ strike: 100 }));
		expect(positioning.value?.summary.estimatedGrossGammaExposure).toBeGreaterThan(0);
		expect(positioning.value?.summary.gammaByStrike.length).toBeGreaterThan(0);
		expect(positioning.value?.limitations).toContain("estimated_gamma_not_dealer_book");
		expect(positioning.health.status).toBe("ok");
		expect(requestedUrls).toHaveLength(2);
		expect(requestedUrls[1]).toContain(`date=${optionExpirationB}`);
	});

	it("refreshes Yahoo options cookie and crumb when the option chain rejects the first request", async () => {
		const requestedUrls: string[] = [];
		const requestedHeaders: Headers[] = [];
		const client = new FinanceClient({
			env: {},
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url, init) => {
				const text = String(url);
				requestedUrls.push(text);
				requestedHeaders.push(new Headers(init?.headers));
				if (text === "https://fc.yahoo.com") {
					expect(new Headers(init?.headers).get("user-agent")).toContain("Mozilla");
					return new Response("", {
						status: 404,
						headers: {
							"set-cookie":
								"A3=test-cookie; Expires=Tue, 29 Jun 2027 12:28:31 GMT; Domain=.yahoo.com; Path=/; SameSite=None; Secure; HttpOnly",
						},
					});
				}
				if (text === "https://query1.finance.yahoo.com/v1/test/getcrumb") {
					expect(new Headers(init?.headers).get("cookie")).toBe("A3=test-cookie");
					expect(new Headers(init?.headers).get("user-agent")).toContain("Mozilla");
					return new Response("test-crumb", { status: 200, headers: { "content-type": "text/plain" } });
				}
				if (text.includes("/v7/finance/options/NVDA")) {
					const requestUrl = new URL(text);
					if (!requestUrl.searchParams.has("crumb")) return jsonResponse({ error: "Invalid Crumb" }, 429);
					expect(requestUrl.searchParams.get("crumb")).toBe("test-crumb");
					expect(new Headers(init?.headers).get("cookie")).toBe("A3=test-cookie");
					expect(new Headers(init?.headers).get("user-agent")).toContain("Mozilla");
					return jsonResponse(optionsPayloadA);
				}
				throw new Error(`unexpected URL ${text}`);
			},
		});

		const positioning = await client.getOptionsPositioning("NVDA", { expirationLimit: 1 });

		expect(positioning.health.status).toBe("ok");
		expect(positioning.value?.summary.contracts).toBe(4);
		expect(requestedUrls).toEqual([
			"https://query1.finance.yahoo.com/v7/finance/options/NVDA",
			"https://fc.yahoo.com",
			"https://query1.finance.yahoo.com/v1/test/getcrumb",
			"https://query1.finance.yahoo.com/v7/finance/options/NVDA?crumb=test-crumb",
		]);
		expect(requestedHeaders[0]?.get("cookie")).toBeNull();
	});

	it("falls back to Cboe delayed options when Yahoo options stays unavailable", async () => {
		const requestedUrls: string[] = [];
		const client = new FinanceClient({
			env: {},
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url) => {
				const text = String(url);
				requestedUrls.push(text);
				if (text.includes("/v7/finance/options/NVDA")) return jsonResponse({ error: "anonymous blocked" }, 429);
				if (text === "https://fc.yahoo.com") {
					return new Response("", {
						status: 404,
						headers: { "set-cookie": "A3=test-cookie; Domain=.yahoo.com; Path=/; Secure; HttpOnly" },
					});
				}
				if (text === "https://query1.finance.yahoo.com/v1/test/getcrumb") {
					return new Response("Too Many Requests", { status: 429 });
				}
				if (text === "https://cdn.cboe.com/api/global/delayed_quotes/options/NVDA.json") {
					return jsonResponse(cboeOptionsPayload);
				}
				throw new Error(`unexpected URL ${text}`);
			},
		});

		const positioning = await client.getOptionsPositioning("NVDA", { expirationLimit: 1 });

		expect(positioning.health.status).toBe("ok");
		expect(positioning.health.source).toBe("cboe_options");
		expect(positioning.value?.source).toBe("cboe_options");
		expect(positioning.value?.asOf).toBe("2026-06-20T20:00:00.000Z");
		expect(positioning.value?.summary.volumePutCallRatio).toBeCloseTo(380 / 350);
		expect(positioning.value?.summary.openInterestPutCallRatio).toBeCloseTo(3400 / 3200);
		expect(positioning.value?.limitations).toContain("cboe_options_delayed");
		expect(requestedUrls).toContain("https://cdn.cboe.com/api/global/delayed_quotes/options/NVDA.json");
	});
});
