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
			expect(text).toContain("summary: source=test_source");
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
				fundamentals: {
					symbol: "NVDA",
					market: "US",
					cik: "0001045810",
					companyName: "NVIDIA Corporation",
					facts: {
						revenue: {
							label: "Revenue",
							value: 130497000000,
							concept: "RevenueFromContractWithCustomerExcludingAssessedTax",
							fiscalYear: 2026,
							fiscalPeriod: "FY",
							periodStart: "2025-02-01",
							periodEnd: "2026-01-31",
							frame: "CY2025",
							form: "10-K",
							filed: "2026-03-01",
							unit: "USD",
						},
						netIncome: {
							label: "Net income",
							value: 72880000000,
							concept: "NetIncomeLoss",
							fiscalYear: 2026,
							fiscalPeriod: "FY",
							periodStart: "2025-02-01",
							periodEnd: "2026-01-31",
							frame: "CY2025",
							form: "10-K",
							filed: "2026-03-01",
							unit: "USD",
						},
					},
					asOf: "2026-03-01",
					source: "sec_companyfacts",
				},
				sourceHealth: [
					{
						source: "test_quote",
						status: "ok",
						latestAt: "2026-06-20T00:00:00.000Z",
						configured: true,
						used: true,
					},
					{
						source: "finnhub_company_news",
						status: "ok",
						latestAt: "2026-06-20T00:00:00.000Z",
						configured: true,
						used: true,
					},
					{
						source: "alpha_vantage_news_sentiment",
						status: "degraded",
						latestAt: "2026-06-20T00:00:00.000Z",
						configured: true,
						used: false,
						degradedReason: "alpha_vantage_news_http_429",
					},
				],
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
			expect(text).toContain("coverage: quote=yes");
			expect(text).toContain("companyData=yes");
			expect(text).toContain("priceHistoryBars=2");
			expect(text).toContain("newsItems=1");
			expect(text).toContain("companyData: companyName=NVIDIA Corporation");
			expect(text).toContain(
				"sources: test_quote=ok(configured=true,used=true),finnhub_company_news=ok(configured=true,used=true),alpha_vantage_news_sentiment=degraded(configured=true,used=false,reason=alpha_vantage_news_http_429)",
			);
			expect(text).toContain("revenue=Revenue=130497000000 USD");
			expect(text).toContain("netIncome=Net income=72880000000 USD");
			expect(text).toContain("concept=RevenueFromContractWithCustomerExcludingAssessedTax");
			expect(text).toContain("period=2025-02-01..2026-01-31");
			expect(text).toContain("technicalAux: latestClose=2");
			expect(text).not.toContain("quickTechnical");
			expect(text).not.toContain("source_health_csv:");
			expect(text).not.toContain("bars_csv_last_2:");
			expect(text).not.toContain("news_csv_top_1:");
			expect(text).not.toContain("topNews=");
			expect(text).not.toContain('"sourceHealth"');

			const artifactPath = text.match(/\.pi\/artifacts\/market-data\/\S+\.csv/)?.[0];
			expect(artifactPath).toBeTruthy();
			const csv = await readFile(join(cwd, artifactPath ?? ""), "utf8");
			expect(csv).toContain("source_health");
			expect(csv).toContain(
				"source_health,NA,NA,NA,NA,NA,NA,NA,NA,NA,alpha_vantage_news_sentiment,degraded,2026-06-20T00:00:00.000Z,alpha_vantage_news_http_429",
			);
			expect(csv).toContain("fundamental");
			expect(csv).toContain(
				"Revenue,130497000000,USD,2026,FY,2025-02-01,2026-01-31,CY2025,10-K,2026-03-01,NVIDIA Corporation,0001045810",
			);
			expect(csv).toContain("bar,2026-06-19");
			expect(csv).toContain("news,NA,NA,NA,NA,NA,NA,2026-06-20T00:00:00.000Z,Test,Nvidia headline,test_news");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("summarizes market brief macro and provider health", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-finance-brief-artifact-"));
		const result = await financeTextResult(
			"Finance market brief",
			{
				ok: true,
				symbols: ["AAPL"],
				contexts: [
					{
						ok: true,
						symbol: "AAPL",
						market: "US",
						quote: null,
						history: { symbol: "AAPL", market: "US", bars: [], latestAt: null, source: "yahoo_chart" },
						news: {
							symbol: "AAPL",
							market: "US",
							items: [],
							latestAt: null,
							source: "yahoo_news",
							sourceHealth: [],
						},
						technicalSnapshot: null,
						fundamentals: null,
						sourceHealth: [],
						degradedReasons: [],
						asOf: "2026-06-20T00:00:00.000Z",
					},
				],
				macro: {
					observations: [
						{
							seriesId: "DGS10",
							label: "US 10Y Treasury yield",
							value: 4.25,
							unit: "percent",
							date: "2026-06-19",
							source: "fred",
						},
					],
					latestAt: "2026-06-19",
					source: "fred",
					sourceHealth: [
						{
							source: "fred:DGS10",
							status: "ok",
							latestAt: "2026-06-19",
							configured: true,
							used: true,
						},
					],
					degradedReasons: [],
				},
				asOf: "2026-06-20T00:00:00.000Z",
				sourceHealth: [
					{
						source: "fred:DGS10",
						status: "ok",
						latestAt: "2026-06-19",
						configured: true,
						used: true,
					},
				],
				degradedReasons: [],
			},
			{
				cwd,
			} as never,
		);

		try {
			const text = result.content[0]?.text ?? "";

			expect(text).toContain("macro: US 10Y Treasury yield=4.25 percent asOf=2026-06-19");
			expect(text).toContain("sources: fred:DGS10=ok(configured=true,used=true)");

			const artifactPath = text.match(/\.pi\/artifacts\/market-data\/\S+\.csv/)?.[0];
			expect(artifactPath).toBeTruthy();
			const csv = await readFile(join(cwd, artifactPath ?? ""), "utf8");
			expect(csv).toContain("macro,DGS10,US 10Y Treasury yield,4.25,percent,2026-06-19,fred");
			expect(csv).toContain("source_health,fred:DGS10,ok,2026-06-19,NA,true,true");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("summarizes MCP tool results without flushing raw JSON", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-finance-mcp-artifact-"));
		const result = await financeTextResult(
			"Finance MCP tool call",
			{
				value: {
					server: "custom-provider",
					toolName: "get_estimates",
					content: [{ type: "text", text: "NVDA revenue estimate: 1" }],
					structuredContent: { ticker: "NVDA", rows: [{ value: 1 }] },
					source: "mcp:custom-provider",
					asOf: "2026-06-21T00:00:00.000Z",
				},
				health: { source: "mcp:custom-provider", status: "ok", latestAt: "2026-06-21T00:00:00.000Z" },
			},
			{
				cwd,
			} as never,
		);

		try {
			const text = result.content[0]?.text ?? "";

			expect(text).toContain("Finance MCP tool call fetched");
			expect(text).toContain("server=custom-provider");
			expect(text).toContain("tool=get_estimates");
			expect(text).toContain("contentItems=1");
			expect(text).toContain("structured=yes");
			expect(text).toContain(".pi/artifacts/market-data/");
			expect(text).not.toContain('"structuredContent"');
			expect(text).not.toContain('"rows"');

			const artifactPath = text.match(/\.pi\/artifacts\/market-data\/\S+\.csv/)?.[0];
			expect(artifactPath).toBeTruthy();
			const csv = await readFile(join(cwd, artifactPath ?? ""), "utf8");
			expect(csv).toContain("server,toolName,index,type,text");
			expect(csv).toContain("custom-provider,get_estimates,0,text,NVDA revenue estimate: 1");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
