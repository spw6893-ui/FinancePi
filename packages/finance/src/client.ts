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

function isoFromUnixSeconds(value: unknown): string | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return new Date(value * 1000).toISOString();
}

function numberOrNull(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return value;
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

function latestFact(label: string, rawFact: unknown): FundamentalFact | undefined {
	const units = asRecord(asRecord(rawFact).units);
	for (const [unit, rows] of Object.entries(units)) {
		const candidates = asArray(rows)
			.map((row) => asRecord(row))
			.filter((row) => typeof row.val === "number")
			.sort((left, right) => String(right.filed ?? "").localeCompare(String(left.filed ?? "")));
		const latest = candidates[0];
		if (!latest || typeof latest.val !== "number") continue;
		return {
			label,
			value: latest.val,
			fiscalYear: typeof latest.fy === "number" ? latest.fy : undefined,
			fiscalPeriod: stringOrUndefined(latest.fp),
			form: stringOrUndefined(latest.form),
			filed: stringOrUndefined(latest.filed),
			unit,
		};
	}
	return undefined;
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
		const history = await this.getHistory(normalized, "5d", "1d");
		const latestBar = latestBarWithClose(history.value.bars);
		if (!latestBar) {
			return this.degraded(null, "yahoo_chart", history.degradedReason ?? "chart_quote_missing");
		}
		const latestIndex = history.value.bars.indexOf(latestBar);
		const previousBar = latestBarWithClose(history.value.bars, latestIndex);
		const previousClose = previousBar?.close ?? null;
		const changePercent =
			latestBar.close !== null && previousClose !== null && previousClose !== 0
				? ((latestBar.close - previousClose) / previousClose) * 100
				: null;
		return {
			value: {
				symbol: normalized,
				market: inferMarketCode(normalized),
				price: latestBar.close,
				changePercent,
				asOf: latestBar.time,
				source: "yahoo_chart_quote",
			},
			health: {
				source: "yahoo_chart",
				status: history.health.status,
				latestAt: latestBar.time,
				degradedReason: history.degradedReason,
			},
			degradedReason: history.degradedReason,
		};
	}

	async getHistory(symbol: string, range = "6mo", interval = "1d"): Promise<SourceResult<History>> {
		const normalized = normalizeSymbol(symbol);
		const url = `${YAHOO_QUERY_1}/v8/finance/chart/${encodeURIComponent(normalized)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
		const empty: History = {
			symbol: normalized,
			market: inferMarketCode(normalized),
			bars: [],
			latestAt: null,
			source: "yahoo_chart",
		};
		try {
			const payload = await this.fetchJson(url, "yahoo_chart");
			const chartResult = asArray(asRecord(asRecord(payload).chart).result)[0];
			const result = asRecord(chartResult);
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
			const latestAt = bars[bars.length - 1]?.time ?? null;
			return {
				value: { ...empty, bars, latestAt },
				health: { source: "yahoo_chart", status: "ok", latestAt: latestAt ?? undefined },
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
			const revenue = latestFact("Revenue", usGaap.Revenues);
			const netIncome = latestFact("Net income", usGaap.NetIncomeLoss);
			const asOf = revenue?.filed ?? netIncome?.filed ?? this.now().toISOString();
			return {
				value: {
					symbol: normalized,
					market: "US",
					cik,
					companyName: entry.title,
					facts: { revenue, netIncome },
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
			history.value.bars.length > 0 ? buildTechnicalSnapshot(normalized, history.value.bars, "daily") : null;

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
