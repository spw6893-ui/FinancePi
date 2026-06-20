import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { financeTextResult } from "../../src/core/finance-agent-extension.ts";

describe("finance tool result content", () => {
	it("includes compact model-visible data without flushing raw JSON", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-finance-artifact-"));
		const result = await financeTextResult(
			"Finance quote",
			{
				value: { symbol: "NVDA", price: 123.45, source: "test_source" },
				health: { source: "test_source", status: "ok", latestAt: "2026-06-20T00:00:00.000Z" },
			},
			{
				cwd,
			} as never,
		);

		try {
			const text = result.content[0]?.text ?? "";

			expect(text).toContain("quote: symbol=NVDA");
			expect(text).toContain("price=123.45");
			expect(text).toContain("health: source=test_source");
			expect(text).toContain(".pi/artifacts/market-data/");
			expect(text).toContain("(csv, rows=1)");
			expect(text).not.toContain('"value"');
			expect(text).not.toContain("Use details JSON");
			expect(result.details).toEqual({
				value: { symbol: "NVDA", price: 123.45, source: "test_source" },
				health: { source: "test_source", status: "ok", latestAt: "2026-06-20T00:00:00.000Z" },
			});

			const artifactPath = text.match(/\.pi\/artifacts\/market-data\/\S+\.csv/)?.[0];
			expect(artifactPath).toBeTruthy();
			const csv = await readFile(join(cwd, artifactPath ?? ""), "utf8");
			expect(csv).toContain("symbol,price,currency,exchange,marketCap,asOf,source,status,degradedReason");
			expect(csv).toContain("NVDA,123.45");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("summarizes broad symbol context and points to a CSV artifact", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-finance-context-artifact-"));
		const result = await financeTextResult(
			"Finance symbol context",
			{
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
			},
			{
				cwd,
			} as never,
		);

		try {
			const text = result.content[0]?.text ?? "";

			expect(text).toContain(".pi/artifacts/market-data/");
			expect(text).toContain("quote: price=123.45");
			expect(text).toContain("historyBars=2");
			expect(text).toContain("newsItems=1");
			expect(text).not.toContain("source_health_csv:");
			expect(text).not.toContain("bars_csv_last_2:");
			expect(text).not.toContain("news_csv_top_1:");
			expect(text).not.toContain('"sourceHealth"');

			const artifactPath = text.match(/\.pi\/artifacts\/market-data\/\S+\.csv/)?.[0];
			expect(artifactPath).toBeTruthy();
			const csv = await readFile(join(cwd, artifactPath ?? ""), "utf8");
			expect(csv).toContain("source_health");
			expect(csv).toContain("bar,2026-06-19");
			expect(csv).toContain("news,NA,NA,NA,NA,NA,NA,2026-06-20T00:00:00.000Z,Test,Nvidia headline,test_news");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
