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
});
