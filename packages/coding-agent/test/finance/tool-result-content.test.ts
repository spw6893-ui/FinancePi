import { describe, expect, it } from "vitest";

import { financeTextResult } from "../../src/core/finance-agent-extension.ts";

describe("finance tool result content", () => {
	it("includes compact model-visible data without flushing raw JSON", () => {
		const result = financeTextResult("Finance quote", {
			value: { symbol: "NVDA", price: 123.45, source: "test_source" },
			health: { source: "test_source", status: "ok", latestAt: "2026-06-20T00:00:00.000Z" },
		});

		expect(result.content[0]?.text).toContain("quote: symbol=NVDA");
		expect(result.content[0]?.text).toContain("price=123.45");
		expect(result.content[0]?.text).toContain("health: source=test_source");
		expect(result.content[0]?.text).toContain("full raw result is preserved in tool details");
		expect(result.content[0]?.text).not.toContain('"value"');
		expect(result.content[0]?.text).not.toContain("Use details JSON");
		expect(result.details).toEqual({
			value: { symbol: "NVDA", price: 123.45, source: "test_source" },
			health: { source: "test_source", status: "ok", latestAt: "2026-06-20T00:00:00.000Z" },
		});
	});

	it("summarizes broad symbol context as small tables", () => {
		const result = financeTextResult("Finance symbol context", {
			ok: true,
			symbol: "NVDA",
			market: "US",
			quote: {
				symbol: "NVDA",
				market: "US",
				price: 123.45,
				asOf: "2026-06-20T00:00:00.000Z",
				source: "test_quote",
			},
			history: {
				symbol: "NVDA",
				market: "US",
				source: "test_history",
				latestAt: "2026-06-20T00:00:00.000Z",
				bars: [
					{ time: "2026-06-19", open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
					{ time: "2026-06-20", open: 1.5, high: 2.5, low: 1, close: 2, volume: 200 },
				],
			},
			news: {
				symbol: "NVDA",
				market: "US",
				source: "test_news",
				latestAt: "2026-06-20T00:00:00.000Z",
				items: [
					{
						title: "Nvidia headline",
						publisher: "Test",
						publishedAt: "2026-06-20T00:00:00.000Z",
						source: "test_news",
					},
				],
			},
			technicalSnapshot: {
				symbol: "NVDA",
				period: "daily",
				asOf: "2026-06-20",
				latestClose: 2,
				return1d: 0.1,
				return5d: 0.2,
				return20d: 0.3,
				sma20: 1.8,
				sma50: 1.6,
				trend: "uptrend",
				source: "computed_from_history",
			},
			fundamentals: null,
			sourceHealth: [{ source: "test_quote", status: "ok", latestAt: "2026-06-20T00:00:00.000Z" }],
			degradedReasons: [],
			asOf: "2026-06-20T00:00:00.000Z",
		});

		expect(result.content[0]?.text).toContain("source_health_csv:");
		expect(result.content[0]?.text).toContain("bars_csv_last_2:");
		expect(result.content[0]?.text).toContain("news_csv_top_1:");
		expect(result.content[0]?.text).toContain("quote: price=123.45");
		expect(result.content[0]?.text).not.toContain('"sourceHealth"');
	});
});
