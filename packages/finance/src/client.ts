import type {
	CompareSymbolsResult,
	FinanceClientOptions,
	FundamentalFact,
	Fundamentals,
	History,
	MarketBrief,
	NewsItem,
	NewsResult,
	PriceBar,
	Quote,
	SourceResult,
	SymbolContext,
	SymbolContextOptions,
} from "./contracts.ts";
import { inferMarketCode, normalizeSymbol } from "./symbols.ts";
import { buildTechnicalSnapshot } from "./technical.ts";

interface SecTickerEntry {
	cik_str?: number;
	ticker?: string;
	title?: string;
}

type JsonRecord = Record<string, unknown>;

const YAHOO_QUERY_1 = "https://query1.finance.yahoo.com";
const YAHOO_QUERY_2 = "https://query2.finance.yahoo.com";
const SEC_BASE = "https://data.sec.gov";
const SEC_FILES = "https://www.sec.gov";

interface YahooChartMeta {
	currency?: string;
	exchangeName?: string;
	fullExchangeName?: string;
	longName?: string;
	shortName?: string;
	regularMarketPrice?: number;
	regularMarketTime?: number;
	chartPreviousClose?: number;
	previousClose?: number;
	validRanges: string[];
}

interface YahooChartData {
	meta: YahooChartMeta;
	bars: PriceBar[];
	latestAt: string | null;
	range: string;
	interval: string;
}

function isoFromUnixSeconds(value: unknown): string | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return new Date(value * 1000).toISOString();
}

function numberOrNull(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return value;
}

function numberOrUndefined(value: unknown): number | undefined {
	const parsed = numberOrNull(value);
	return parsed === null ? undefined : parsed;
}

function stringOrUndefined(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed || undefined;
}

function asRecord(value: unknown): JsonRecord {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function factCandidates(label: string, concept: string, rawFact: unknown): FundamentalFact[] {
	const units = asRecord(asRecord(rawFact).units);
	const facts: FundamentalFact[] = [];
	for (const [unit, rows] of Object.entries(units)) {
		for (const row of asArray(rows).map((item) => asRecord(item))) {
			if (typeof row.val !== "number") continue;
			facts.push({
				label,
				value: row.val,
				concept,
				fiscalYear: typeof row.fy === "number" ? row.fy : undefined,
				fiscalPeriod: stringOrUndefined(row.fp),
				periodStart: stringOrUndefined(row.start),
				periodEnd: stringOrUndefined(row.end),
				frame: stringOrUndefined(row.frame),
				form: stringOrUndefined(row.form),
				filed: stringOrUndefined(row.filed),
				unit,
			});
		}
	}
	return facts;
}

function latestFact(label: string, usGaap: JsonRecord, concepts: string[]): FundamentalFact | undefined {
	return concepts
		.flatMap((concept) => factCandidates(label, concept, usGaap[concept]))
		.sort((left, right) => factRecencyKey(right).localeCompare(factRecencyKey(left)))[0];
}

function factRecencyKey(fact: FundamentalFact): string {
	return [
		fact.filed ?? "",
		String(fact.fiscalYear ?? "").padStart(4, "0"),
		fact.periodEnd ?? "",
		fact.fiscalPeriod ?? "",
		fact.frame ?? "",
	].join("|");
}

function latestFiled(facts: Array<FundamentalFact | undefined>): string | undefined {
	return facts
		.flatMap((fact) => (fact?.filed ? [fact.filed] : []))
		.sort((left, right) => right.localeCompare(left))[0];
}

function latestBarWithClose(bars: PriceBar[], beforeIndex = bars.length): PriceBar | undefined {
	for (let index = Math.min(beforeIndex, bars.length) - 1; index >= 0; index--) {
		const bar = bars[index];
		if (bar.close !== null) return bar;
	}
	return undefined;
}

export class FinanceClient {
	private readonly fetchImpl: typeof fetch;
	private readonly now: () => Date;
	private readonly userAgent: string;
	private secTickerMap?: Map<string, SecTickerEntry>;

	constructor(options: FinanceClientOptions = {}) {
		this.fetchImpl = options.fetch ?? fetch;
		this.now = options.now ?? (() => new Date());
		this.userAgent = options.userAgent ?? "pi-finance-agent/0.1 contact=agent-pi@example.invalid";
	}

	async getQuote(symbol: string): Promise<SourceResult<Quote | null>> {
		const normalized = normalizeSymbol(symbol);
		return this.getQuoteFromChart(normalized);
	}

	private async getQuoteFromChart(normalized: string): Promise<SourceResult<Quote | null>> {
		try {
			const chart = await this.fetchYahooChart(normalized, "5d", "1d");
			const latestBar = latestBarWithClose(chart.bars);
			const price = chart.meta.regularMarketPrice ?? latestBar?.close ?? null;
			if (price === null) {
				return this.degraded(null, "yahoo_chart", "chart_quote_missing");
			}
			const latestIndex = latestBar ? chart.bars.indexOf(latestBar) : chart.bars.length;
			const previousBar = latestBarWithClose(chart.bars, latestIndex);
			const previousClose = previousBar?.close ?? chart.meta.previousClose ?? chart.meta.chartPreviousClose ?? null;
			const changePercent =
				price !== null && previousClose !== null && previousClose !== 0
					? ((price - previousClose) / previousClose) * 100
					: null;
			const asOf = isoFromUnixSeconds(chart.meta.regularMarketTime) ?? latestBar?.time ?? this.now().toISOString();
			return {
				value: {
					symbol: normalized,
					market: inferMarketCode(normalized),
					name: chart.meta.longName ?? chart.meta.shortName,
					price,
					changePercent,
					currency: chart.meta.currency,
					exchange: chart.meta.fullExchangeName ?? chart.meta.exchangeName,
					asOf,
					source: "yahoo_chart_quote",
				},
				health: {
					source: "yahoo_chart",
					status: "ok",
					latestAt: asOf,
				},
			};
		} catch (error) {
			return this.degraded(null, "yahoo_chart", this.errorReason("chart_quote", error));
		}
	}

	private async fetchYahooChart(normalized: string, range: string, interval: string): Promise<YahooChartData> {
		const url = `${YAHOO_QUERY_1}/v8/finance/chart/${encodeURIComponent(normalized)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
		const payload = await this.fetchJson(url, "yahoo_chart");
		const chart = asRecord(asRecord(payload).chart);
		const error = chart.error;
		if (error) {
			const errorRecord = asRecord(error);
			const code = stringOrUndefined(errorRecord.code) ?? "error";
			throw new Error(`yahoo_chart_${code}`);
		}
		const chartResult = asArray(chart.result)[0];
		const result = asRecord(chartResult);
		const rawMeta = asRecord(result.meta);
		const meta: YahooChartMeta = {
			currency: stringOrUndefined(rawMeta.currency),
			exchangeName: stringOrUndefined(rawMeta.exchangeName),
			fullExchangeName: stringOrUndefined(rawMeta.fullExchangeName),
			longName: stringOrUndefined(rawMeta.longName),
			shortName: stringOrUndefined(rawMeta.shortName),
			regularMarketPrice: numberOrUndefined(rawMeta.regularMarketPrice),
			regularMarketTime: numberOrUndefined(rawMeta.regularMarketTime),
			chartPreviousClose: numberOrUndefined(rawMeta.chartPreviousClose),
			previousClose: numberOrUndefined(rawMeta.previousClose),
			validRanges: asArray(rawMeta.validRanges).flatMap((value) =>
				typeof value === "string" && value.trim() ? [value.trim()] : [],
			),
		};
		const timestamps = asArray(result.timestamp);
		const quote = asRecord(asArray(asRecord(result.indicators).quote)[0]);
		const opens = asArray(quote.open);
		const highs = asArray(quote.high);
		const lows = asArray(quote.low);
		const closes = asArray(quote.close);
		const volumes = asArray(quote.volume);
		const bars: PriceBar[] = timestamps.map((timestamp, index) => ({
			time: isoFromUnixSeconds(timestamp) ?? String(timestamp),
			open: numberOrNull(opens[index]),
			high: numberOrNull(highs[index]),
			low: numberOrNull(lows[index]),
			close: numberOrNull(closes[index]),
			volume: numberOrNull(volumes[index]),
		}));
		return {
			meta,
			bars,
			latestAt: bars[bars.length - 1]?.time ?? isoFromUnixSeconds(meta.regularMarketTime) ?? null,
			range,
			interval,
		};
	}

	private shouldTryHistoryFallback(chart: YahooChartData, requestedRange: string, requestedInterval: string): boolean {
		if (chart.bars.length > 1) return false;
		if (requestedRange === "1d" && requestedInterval === "1m") return false;
		if (chart.bars.length === 0) return true;
		return chart.meta.validRanges.length > 0 && !chart.meta.validRanges.includes(requestedRange);
	}

	private async chartWithFallback(
		normalized: string,
		range: string,
		interval: string,
	): Promise<{
		chart: YahooChartData;
		degradedReason?: string;
	}> {
		const primary = await this.fetchYahooChart(normalized, range, interval);
		if (!this.shouldTryHistoryFallback(primary, range, interval)) return { chart: primary };

		const fallbacks = [
			{ range: "5d", interval: "1d" },
			{ range: "1d", interval: "1m" },
		].filter((candidate) => candidate.range !== range || candidate.interval !== interval);
		for (const fallback of fallbacks) {
			try {
				const chart = await this.fetchYahooChart(normalized, fallback.range, fallback.interval);
				if (chart.bars.length > primary.bars.length) {
					return {
						chart,
						degradedReason: `history_range_fallback_${reasonPart(range)}_${reasonPart(interval)}_to_${reasonPart(fallback.range)}_${reasonPart(fallback.interval)}`,
					};
				}
			} catch {
				// Keep the original chart if a best-effort fallback fails.
			}
		}
		return {
			chart: primary,
			degradedReason: `history_range_limited_${reasonPart(range)}_${reasonPart(interval)}`,
		};
	}

	async getHistory(symbol: string, range = "6mo", interval = "1d"): Promise<SourceResult<History>> {
		const normalized = normalizeSymbol(symbol);
		const empty: History = {
			symbol: normalized,
			market: inferMarketCode(normalized),
			bars: [],
			latestAt: null,
			source: "yahoo_chart",
			range,
			interval,
		};
		try {
			const { chart, degradedReason } = await this.chartWithFallback(normalized, range, interval);
			return {
				value: {
					...empty,
					bars: chart.bars,
					latestAt: chart.latestAt,
					range: chart.range,
					interval: chart.interval,
				},
				health: {
					source: "yahoo_chart",
					status: degradedReason ? "degraded" : "ok",
					latestAt: chart.latestAt ?? undefined,
					degradedReason,
				},
				degradedReason,
			};
		} catch (error) {
			return this.degraded(empty, "yahoo_chart", this.errorReason("history", error));
		}
	}

	async getNews(symbol: string, limit = 10): Promise<SourceResult<NewsResult>> {
		const normalized = normalizeSymbol(symbol);
		const url = `${YAHOO_QUERY_2}/v1/finance/search?q=${encodeURIComponent(normalized)}&newsCount=${limit}`;
		const empty: NewsResult = {
			symbol: normalized,
			market: inferMarketCode(normalized),
			items: [],
			latestAt: null,
			source: "yahoo_news",
		};
		try {
			const payload = await this.fetchJson(url, "yahoo_news");
			const items: NewsItem[] = asArray(asRecord(payload).news)
				.slice(0, limit)
				.map((raw) => {
					const item = asRecord(raw);
					return {
						id: stringOrUndefined(item.uuid),
						title: stringOrUndefined(item.title) ?? "Untitled news item",
						publisher: stringOrUndefined(item.publisher),
						url: stringOrUndefined(item.link),
						publishedAt: isoFromUnixSeconds(item.providerPublishTime),
						source: "yahoo_news",
					};
				});
			const latestAt = items[0]?.publishedAt ?? null;
			return {
				value: { ...empty, items, latestAt },
				health: { source: "yahoo_news", status: "ok", latestAt: latestAt ?? undefined },
			};
		} catch (error) {
			return this.degraded(empty, "yahoo_news", this.errorReason("news", error));
		}
	}

	async getSecFacts(symbol: string): Promise<SourceResult<Fundamentals | null>> {
		const normalized = normalizeSymbol(symbol);
		try {
			const tickerMap = await this.getSecTickerMap();
			const entry = tickerMap.get(normalized);
			if (!entry?.cik_str) {
				return this.degraded(null, "sec_companyfacts", "sec_cik_missing");
			}
			const cik = String(entry.cik_str).padStart(10, "0");
			const payload = await this.fetchJson(`${SEC_BASE}/api/xbrl/companyfacts/CIK${cik}.json`, "sec_companyfacts");
			const usGaap = asRecord(asRecord(asRecord(payload).facts)["us-gaap"]);
			const revenue = latestFact("Revenue", usGaap, [
				"RevenueFromContractWithCustomerExcludingAssessedTax",
				"Revenues",
				"SalesRevenueNet",
				"SalesRevenueGoodsNet",
			]);
			const grossProfit = latestFact("Gross profit", usGaap, ["GrossProfit"]);
			const operatingIncome = latestFact("Operating income", usGaap, ["OperatingIncomeLoss"]);
			const netIncome = latestFact("Net income", usGaap, ["NetIncomeLoss", "ProfitLoss"]);
			const operatingCashFlow = latestFact("Operating cash flow", usGaap, [
				"NetCashProvidedByUsedInOperatingActivities",
				"NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
			]);
			const capitalExpenditures = latestFact("Capital expenditures", usGaap, [
				"PaymentsToAcquirePropertyPlantAndEquipment",
				"PaymentsToAcquireProductiveAssets",
			]);
			const assets = latestFact("Assets", usGaap, ["Assets"]);
			const liabilities = latestFact("Liabilities", usGaap, ["Liabilities"]);
			const stockholdersEquity = latestFact("Stockholders' equity", usGaap, [
				"StockholdersEquity",
				"StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
			]);
			const facts = {
				revenue,
				grossProfit,
				operatingIncome,
				netIncome,
				operatingCashFlow,
				capitalExpenditures,
				assets,
				liabilities,
				stockholdersEquity,
			};
			const asOf =
				latestFiled(Object.values(facts)) ?? revenue?.filed ?? netIncome?.filed ?? this.now().toISOString();
			return {
				value: {
					symbol: normalized,
					market: "US",
					cik,
					companyName: entry.title,
					facts,
					asOf,
					source: "sec_companyfacts",
				},
				health: { source: "sec_companyfacts", status: "ok", latestAt: asOf },
			};
		} catch (error) {
			return this.degraded(null, "sec_companyfacts", this.errorReason("sec_facts", error));
		}
	}

	async getSymbolContext(symbol: string, options: SymbolContextOptions = {}): Promise<SymbolContext> {
		const normalized = normalizeSymbol(symbol);
		const [quote, history, news, fundamentals] = await Promise.all([
			this.getQuote(normalized),
			this.getHistory(normalized, options.historyRange, options.historyInterval),
			this.getNews(normalized, options.newsLimit ?? 10),
			this.getSecFacts(normalized),
		]);
		const sourceResults = [quote, history, news, fundamentals];
		const degradedReasons = sourceResults.flatMap((result) => (result.degradedReason ? [result.degradedReason] : []));
		const technicalSnapshot =
			history.value.bars.length > 0
				? buildTechnicalSnapshot(normalized, history.value.bars, history.value.interval ?? "daily")
				: null;

		return {
			ok: true,
			symbol: normalized,
			market: inferMarketCode(normalized),
			quote: quote.value,
			history: history.value,
			news: news.value,
			technicalSnapshot,
			fundamentals: fundamentals.value,
			sourceHealth: sourceResults.map((result) => result.health),
			degradedReasons,
			asOf: this.now().toISOString(),
		};
	}

	async compareSymbols(symbols: string[], options: SymbolContextOptions = {}): Promise<CompareSymbolsResult> {
		const normalized = symbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean);
		const contexts = await Promise.all(normalized.map((symbol) => this.getSymbolContext(symbol, options)));
		return {
			ok: true,
			symbols: normalized,
			contexts,
			asOf: this.now().toISOString(),
			degradedReasons: contexts.flatMap((context) => context.degradedReasons),
		};
	}

	async getMarketBrief(symbols: string[], options: SymbolContextOptions = {}): Promise<MarketBrief> {
		const comparison = await this.compareSymbols(symbols, options);
		return {
			ok: true,
			symbols: comparison.symbols,
			contexts: comparison.contexts,
			asOf: comparison.asOf,
			sourceHealth: comparison.contexts.flatMap((context) => context.sourceHealth),
			degradedReasons: comparison.degradedReasons,
		};
	}

	private degraded<T>(value: T, source: string, reason: string): SourceResult<T> {
		return {
			value,
			health: {
				source,
				status: "degraded",
				latestAt: this.now().toISOString(),
				degradedReason: reason,
			},
			degradedReason: reason,
		};
	}

	private async getSecTickerMap(): Promise<Map<string, SecTickerEntry>> {
		if (this.secTickerMap) return this.secTickerMap;
		const payload = await this.fetchJson(`${SEC_FILES}/files/company_tickers.json`, "sec_ticker_map");
		const map = new Map<string, SecTickerEntry>();
		for (const rawEntry of Object.values(asRecord(payload))) {
			const entry = asRecord(rawEntry) as SecTickerEntry;
			const ticker = normalizeSymbol(entry.ticker);
			if (ticker) map.set(ticker, entry);
		}
		this.secTickerMap = map;
		return map;
	}

	private async fetchJson(url: string, source: string): Promise<unknown> {
		const response = await this.fetchImpl(url, {
			headers: {
				accept: "application/json",
				"user-agent": this.userAgent,
			},
		});
		if (!response.ok) {
			throw new Error(`${source}_http_${response.status}`);
		}
		return response.json();
	}

	private errorReason(scope: string, error: unknown): string {
		const message = error instanceof Error ? error.message : String(error);
		const httpMatch = /_http_(\d+)/.exec(message);
		if (httpMatch) return `${scope}_http_${httpMatch[1]}`;
		return `${scope}_unavailable`;
	}
}

function reasonPart(value: string): string {
	return (
		value
			.replace(/[^a-z0-9]+/gi, "_")
			.replace(/^_+|_+$/g, "")
			.slice(0, 32) || "unknown"
	);
}
