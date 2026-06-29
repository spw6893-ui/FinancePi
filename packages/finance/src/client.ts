import type {
	CompareSymbolsResult,
	FinanceClientOptions,
	FundamentalFact,
	Fundamentals,
	History,
	MacroObservation,
	MacroSnapshot,
	MarketBrief,
	NewsItem,
	NewsResult,
	OptionGammaByStrike,
	OptionsExpirationPositioning,
	OptionsPositioning,
	OptionsPositioningOptions,
	OptionsPositioningSummary,
	OptionWall,
	PriceBar,
	Quote,
	SourceHealth,
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
const FINNHUB_BASE = "https://finnhub.io";
const ALPHA_VANTAGE_BASE = "https://www.alphavantage.co";
const FRED_BASE = "https://api.stlouisfed.org";
const CBOE_OPTIONS_BASE = "https://cdn.cboe.com/api/global/delayed_quotes/options";
const YAHOO_USER_AGENT =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const FRED_MACRO_SERIES = [
	{ seriesId: "DGS10", label: "US 10Y Treasury yield", unit: "percent" },
	{ seriesId: "DGS2", label: "US 2Y Treasury yield", unit: "percent" },
	{ seriesId: "FEDFUNDS", label: "Effective federal funds rate", unit: "percent" },
	{ seriesId: "BAMLH0A0HYM2", label: "US high yield option-adjusted spread", unit: "percent" },
];

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

type OptionType = "call" | "put";

interface ParsedOptionContract {
	optionType: OptionType;
	contractSymbol?: string;
	expirationUnix: number;
	expirationDate: string;
	strike: number;
	volume: number | null;
	openInterest: number | null;
	impliedVolatility: number | null;
}

interface YahooOptionsExpirationData {
	expirationUnix: number;
	expirationDate: string;
	contracts: ParsedOptionContract[];
}

interface YahooOptionsChainData {
	symbol: string;
	underlyingPrice: number | null;
	asOf: string;
	expirationDates: number[];
	option?: YahooOptionsExpirationData;
}

interface YahooAuth {
	cookie: string;
	crumb: string;
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

function isoFromAlphaVantageTimestamp(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value.trim());
	if (!match) return undefined;
	return new Date(
		Date.UTC(
			Number(match[1]),
			Number(match[2]) - 1,
			Number(match[3]),
			Number(match[4]),
			Number(match[5]),
			Number(match[6]),
		),
	).toISOString();
}

function isoFromCboeTimestamp(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim().replace(" ", "T");
	const timestamp = Date.parse(`${normalized.endsWith("Z") ? normalized : `${normalized}Z`}`);
	return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function latestIso(items: Array<{ publishedAt?: string }>): string | null {
	return (
		items
			.flatMap((item) => (item.publishedAt ? [item.publishedAt] : []))
			.sort((left, right) => right.localeCompare(left))[0] ?? null
	);
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
	private readonly env: Record<string, string | undefined>;
	private secTickerMap?: Map<string, SecTickerEntry>;
	private yahooOptionsAuth?: YahooAuth;

	constructor(options: FinanceClientOptions = {}) {
		this.fetchImpl = options.fetch ?? fetch;
		this.now = options.now ?? (() => new Date());
		this.userAgent = options.userAgent ?? "pi-finance-agent/0.1 contact=agent-pi@example.invalid";
		this.env = options.env ?? process.env;
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

	private async fetchYahooOptionsChain(normalized: string, expirationUnix?: number): Promise<YahooOptionsChainData> {
		const payload = await this.fetchYahooOptionsJson(normalized, expirationUnix);
		const optionChain = asRecord(asRecord(payload).optionChain);
		const error = optionChain.error;
		if (error) {
			const errorRecord = asRecord(error);
			const code = stringOrUndefined(errorRecord.code) ?? "error";
			throw new Error(`yahoo_options_${code}`);
		}
		const result = asRecord(asArray(optionChain.result)[0]);
		const quote = asRecord(result.quote);
		const expirationDates = asArray(result.expirationDates)
			.flatMap((value) => (typeof value === "number" && Number.isFinite(value) ? [value] : []))
			.sort((left, right) => left - right);
		const rawOption = asRecord(asArray(result.options)[0]);
		const parsedExpiration =
			numberOrUndefined(rawOption.expirationDate) ??
			firstContractExpiration(rawOption) ??
			expirationUnix ??
			expirationDates[0];
		const option =
			parsedExpiration === undefined
				? undefined
				: {
						expirationUnix: parsedExpiration,
						expirationDate: dateFromUnixSeconds(parsedExpiration),
						contracts: [
							...parseOptionContracts(asArray(rawOption.calls), "call", parsedExpiration),
							...parseOptionContracts(asArray(rawOption.puts), "put", parsedExpiration),
						],
					};
		return {
			symbol: normalizeSymbol(stringOrUndefined(quote.symbol) ?? normalized),
			underlyingPrice: numberOrNull(quote.regularMarketPrice),
			asOf: isoFromUnixSeconds(quote.regularMarketTime) ?? this.now().toISOString(),
			expirationDates,
			option,
		};
	}

	private async fetchYahooOptionsJson(normalized: string, expirationUnix?: number): Promise<unknown> {
		try {
			return await this.fetchYahooOptionsJsonWithAuth(normalized, expirationUnix, this.yahooOptionsAuth);
		} catch (error) {
			if (!isYahooOptionsAuthError(error)) throw error;
			this.yahooOptionsAuth = undefined;
			const auth = await this.getYahooOptionsAuth();
			return this.fetchYahooOptionsJsonWithAuth(normalized, expirationUnix, auth);
		}
	}

	private async fetchYahooOptionsJsonWithAuth(
		normalized: string,
		expirationUnix: number | undefined,
		auth: YahooAuth | undefined,
	): Promise<unknown> {
		const url = this.yahooOptionsUrl(normalized, expirationUnix, auth?.crumb);
		const headers = auth ? { cookie: auth.cookie } : undefined;
		return this.fetchJson(url, "yahoo_options", headers);
	}

	private yahooOptionsUrl(normalized: string, expirationUnix: number | undefined, crumb: string | undefined): string {
		const params = new URLSearchParams();
		if (expirationUnix !== undefined) params.set("date", String(expirationUnix));
		if (crumb) params.set("crumb", crumb);
		const query = params.toString();
		return `${YAHOO_QUERY_1}/v7/finance/options/${encodeURIComponent(normalized)}${query ? `?${query}` : ""}`;
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

	async getOptionsPositioning(
		symbol: string,
		options: OptionsPositioningOptions = {},
	): Promise<SourceResult<OptionsPositioning | null>> {
		const normalized = normalizeSymbol(symbol);
		try {
			const firstChain = await this.fetchYahooOptionsChain(normalized);
			const selectedExpirations = selectOptionExpirations(
				firstChain,
				options.expiration,
				options.expirationLimit ?? 4,
			);
			const expirationChains = await Promise.all(
				selectedExpirations.map(async (expirationUnix) =>
					firstChain.option?.expirationUnix === expirationUnix
						? firstChain
						: this.fetchYahooOptionsChain(normalized, expirationUnix),
				),
			);
			const expirations = expirationChains
				.flatMap((chain) => (chain.option ? [chain.option] : []))
				.filter((chain) => chain.contracts.length > 0);
			if (expirations.length === 0) {
				return this.degraded(null, "yahoo_options", "options_chain_empty");
			}
			const underlyingPrice = firstChain.underlyingPrice ?? firstNonNullPrice(expirationChains);
			const expirationPositioning = expirations.map((expiration) =>
				buildExpirationPositioning(expiration, underlyingPrice, this.now()),
			);
			const allContracts = expirations.flatMap((expiration) => expiration.contracts);
			const summary = buildOptionsSummary(allContracts, underlyingPrice, undefined, this.now());
			const expirationDates = expirationPositioning.map((expiration) => expiration.expirationDate);
			const asOf =
				expirationChains.map((chain) => chain.asOf).sort((left, right) => right.localeCompare(left))[0] ??
				this.now().toISOString();
			return {
				value: {
					symbol: normalized,
					market: inferMarketCode(normalized),
					underlyingPrice,
					asOf,
					expirationDates,
					expirations: expirationPositioning,
					summary,
					source: "yahoo_options",
					limitations: [
						"estimated_gamma_not_dealer_book",
						"open_interest_is_delayed",
						"customer_direction_unknown",
						"yahoo_options_not_realtime_professional_feed",
					],
				},
				health: {
					source: "yahoo_options",
					status: "ok",
					latestAt: asOf,
					configured: true,
					used: true,
				},
			};
		} catch (error) {
			const fallback = await this.getCboeOptionsPositioning(normalized, options);
			if (fallback.value) return fallback;
			return this.degraded(null, "yahoo_options", this.errorReason("options", error));
		}
	}

	private async getCboeOptionsPositioning(
		normalized: string,
		options: OptionsPositioningOptions,
	): Promise<SourceResult<OptionsPositioning | null>> {
		try {
			const url = `${CBOE_OPTIONS_BASE}/${encodeURIComponent(normalized)}.json`;
			const payload = await this.fetchJson(url, "cboe_options");
			const data = asRecord(asRecord(payload).data);
			const allContracts = asArray(data.options).flatMap(parseCboeOptionContract);
			if (allContracts.length === 0) return this.degraded(null, "cboe_options", "cboe_options_chain_empty");
			const requestedExpiration = parseExpirationInput(options.expiration);
			const expirationLimit = Math.max(1, Math.min(12, Math.floor(options.expirationLimit ?? 4)));
			const expirationUnixDates = [
				...new Set(allContracts.map((contract) => contract.expirationUnix).sort((left, right) => left - right)),
			];
			const selectedExpirations =
				requestedExpiration === undefined ? expirationUnixDates.slice(0, expirationLimit) : [requestedExpiration];
			const expirations = selectedExpirations
				.map((expirationUnix) => ({
					expirationUnix,
					expirationDate: dateFromUnixSeconds(expirationUnix),
					contracts: allContracts.filter((contract) => contract.expirationUnix === expirationUnix),
				}))
				.filter((expiration) => expiration.contracts.length > 0);
			if (expirations.length === 0) return this.degraded(null, "cboe_options", "cboe_options_chain_empty");
			const underlyingPrice = numberOrNull(data.current_price);
			const expirationPositioning = expirations.map((expiration) =>
				buildExpirationPositioning(expiration, underlyingPrice, this.now()),
			);
			const selectedContracts = expirations.flatMap((expiration) => expiration.contracts);
			const summary = buildOptionsSummary(selectedContracts, underlyingPrice, undefined, this.now());
			const asOf = isoFromCboeTimestamp(asRecord(payload).timestamp) ?? this.now().toISOString();
			return {
				value: {
					symbol: normalizeSymbol(stringOrUndefined(data.symbol) ?? normalized),
					market: inferMarketCode(normalized),
					underlyingPrice,
					asOf,
					expirationDates: expirationPositioning.map((expiration) => expiration.expirationDate),
					expirations: expirationPositioning,
					summary,
					source: "cboe_options",
					limitations: [
						"estimated_gamma_not_dealer_book",
						"open_interest_is_delayed",
						"customer_direction_unknown",
						"cboe_options_delayed",
					],
				},
				health: {
					source: "cboe_options",
					status: "ok",
					latestAt: asOf,
					configured: true,
					used: true,
				},
			};
		} catch (error) {
			return this.degraded(null, "cboe_options", this.errorReason("cboe_options", error));
		}
	}

	async getNews(symbol: string, limit = 10): Promise<SourceResult<NewsResult>> {
		const normalized = normalizeSymbol(symbol);
		const empty: NewsResult = {
			symbol: normalized,
			market: inferMarketCode(normalized),
			items: [],
			latestAt: null,
			source: "news_aggregate",
			sourceHealth: [],
		};
		const providerResults = await Promise.all([
			this.getYahooNews(normalized, limit),
			this.getFinnhubNews(normalized, limit),
			this.getAlphaVantageNews(normalized, limit),
		]);
		const configuredResults = providerResults.filter((result) => result.health.configured !== false);
		const sourceHealth = configuredResults.map((result) => result.health);
		const items = providerResults
			.flatMap((result) => result.value)
			.sort((left, right) => (right.publishedAt ?? "").localeCompare(left.publishedAt ?? ""))
			.slice(0, limit);
		const latestAt = latestIso(items);
		const degradedReasons = configuredResults.flatMap((result) =>
			result.degradedReason ? [result.degradedReason] : [],
		);
		const status = degradedReasons.length > 0 || items.length === 0 ? "degraded" : "ok";
		return {
			value: {
				...empty,
				items,
				latestAt,
				sourceHealth,
			},
			health: {
				source: "news_aggregate",
				status,
				latestAt: latestAt ?? this.now().toISOString(),
				degradedReason: status === "degraded" ? (degradedReasons[0] ?? "news_unavailable") : undefined,
				configured: true,
				used: items.length > 0,
			},
			degradedReason: degradedReasons[0],
		};
	}

	private async getYahooNews(normalized: string, limit: number): Promise<SourceResult<NewsItem[]>> {
		try {
			const url = `${YAHOO_QUERY_2}/v1/finance/search?q=${encodeURIComponent(normalized)}&newsCount=${limit}`;
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
			const latestAt = latestIso(items);
			return {
				value: items,
				health: {
					source: "yahoo_news",
					status: "ok",
					latestAt: latestAt ?? undefined,
					configured: true,
					used: items.length > 0,
				},
			};
		} catch (error) {
			return this.degraded([], "yahoo_news", this.errorReason("news", error));
		}
	}

	private async getFinnhubNews(normalized: string, limit: number): Promise<SourceResult<NewsItem[]>> {
		const token = this.envValue("FINNHUB_API_KEY");
		if (!token) return this.notConfigured([], "finnhub_company_news", "finnhub_api_key_missing");
		try {
			const to = this.dateString(this.now());
			const from = this.dateString(new Date(this.now().getTime() - 14 * 24 * 60 * 60 * 1000));
			const url = `${FINNHUB_BASE}/api/v1/company-news?symbol=${encodeURIComponent(normalized)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&token=${encodeURIComponent(token)}`;
			const payload = await this.fetchJson(url, "finnhub_company_news");
			const items: NewsItem[] = asArray(payload)
				.slice(0, limit)
				.map((raw) => {
					const item = asRecord(raw);
					return {
						id: typeof item.id === "number" ? String(item.id) : stringOrUndefined(item.id),
						title: stringOrUndefined(item.headline) ?? "Untitled news item",
						publisher: stringOrUndefined(item.source),
						url: stringOrUndefined(item.url),
						publishedAt: isoFromUnixSeconds(item.datetime),
						source: "finnhub_company_news",
					};
				});
			const latestAt = latestIso(items);
			return {
				value: items,
				health: {
					source: "finnhub_company_news",
					status: "ok",
					latestAt: latestAt ?? undefined,
					configured: true,
					used: items.length > 0,
				},
			};
		} catch (error) {
			return this.degraded([], "finnhub_company_news", this.errorReason("finnhub_news", error));
		}
	}

	private async getAlphaVantageNews(normalized: string, limit: number): Promise<SourceResult<NewsItem[]>> {
		const apiKey = this.envValue("ALPHA_VANTAGE_API_KEY");
		if (!apiKey) return this.notConfigured([], "alpha_vantage_news_sentiment", "alpha_vantage_api_key_missing");
		try {
			const url = `${ALPHA_VANTAGE_BASE}/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(normalized)}&apikey=${encodeURIComponent(apiKey)}`;
			const payload = await this.fetchJson(url, "alpha_vantage_news_sentiment");
			const items: NewsItem[] = asArray(asRecord(payload).feed)
				.filter((raw) => alphaVantageItemMatchesSymbol(raw, normalized))
				.slice(0, limit)
				.map((raw) => {
					const item = asRecord(raw);
					return {
						id: stringOrUndefined(item.url),
						title: stringOrUndefined(item.title) ?? "Untitled news item",
						publisher: stringOrUndefined(item.source),
						url: stringOrUndefined(item.url),
						publishedAt: isoFromAlphaVantageTimestamp(item.time_published),
						source: "alpha_vantage_news_sentiment",
					};
				});
			const latestAt = latestIso(items);
			return {
				value: items,
				health: {
					source: "alpha_vantage_news_sentiment",
					status: "ok",
					latestAt: latestAt ?? undefined,
					configured: true,
					used: items.length > 0,
				},
			};
		} catch (error) {
			return this.degraded([], "alpha_vantage_news_sentiment", this.errorReason("alpha_vantage_news", error));
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
		const sourceHealth = [quote.health, history.health, ...sourceHealthForNews(news), fundamentals.health];
		const degradedReasons = sourceHealth.flatMap((health) => (health.degradedReason ? [health.degradedReason] : []));
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
			sourceHealth,
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
		const [comparison, macro] = await Promise.all([this.compareSymbols(symbols, options), this.getMacroSnapshot()]);
		return {
			ok: true,
			symbols: comparison.symbols,
			contexts: comparison.contexts,
			macro,
			asOf: comparison.asOf,
			sourceHealth: [...comparison.contexts.flatMap((context) => context.sourceHealth), ...macro.sourceHealth],
			degradedReasons: [...comparison.degradedReasons, ...macro.degradedReasons],
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
				configured: true,
				used: false,
			},
			degradedReason: reason,
		};
	}

	private notConfigured<T>(value: T, source: string, reason: string): SourceResult<T> {
		return {
			value,
			health: {
				source,
				status: "degraded",
				latestAt: this.now().toISOString(),
				degradedReason: reason,
				configured: false,
				used: false,
			},
			degradedReason: reason,
		};
	}

	private async getMacroSnapshot(): Promise<MacroSnapshot> {
		const apiKey = this.envValue("FRED_API_KEY");
		if (!apiKey) {
			return {
				observations: [],
				latestAt: null,
				source: "fred",
				sourceHealth: [],
				degradedReasons: [],
			};
		}
		const results = await Promise.all(
			FRED_MACRO_SERIES.map(async (series) => this.getFredObservation(series, apiKey)),
		);
		const observations = results.flatMap((result) => (result.value ? [result.value] : []));
		const sourceHealth = results.map((result) => result.health);
		return {
			observations,
			latestAt: observations.map((item) => item.date).sort((left, right) => right.localeCompare(left))[0] ?? null,
			source: "fred",
			sourceHealth,
			degradedReasons: results.flatMap((result) => (result.degradedReason ? [result.degradedReason] : [])),
		};
	}

	private async getFredObservation(
		series: { seriesId: string; label: string; unit: string },
		apiKey: string,
	): Promise<SourceResult<MacroObservation | null>> {
		const source = `fred:${series.seriesId}`;
		try {
			const url = `${FRED_BASE}/fred/series/observations?series_id=${encodeURIComponent(series.seriesId)}&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=1`;
			const payload = await this.fetchJson(url, source);
			const observation = asRecord(asArray(asRecord(payload).observations)[0]);
			const date = stringOrUndefined(observation.date);
			if (!date) return this.degraded(null, source, `${reasonPart(series.seriesId)}_fred_observation_missing`);
			return {
				value: {
					seriesId: series.seriesId,
					label: series.label,
					value: numberFromFredValue(observation.value),
					unit: series.unit,
					date,
					source: "fred",
				},
				health: {
					source,
					status: "ok",
					latestAt: date,
					configured: true,
					used: true,
				},
			};
		} catch (error) {
			return this.degraded(null, source, this.errorReason(`fred_${reasonPart(series.seriesId)}`, error));
		}
	}

	private envValue(name: string): string | undefined {
		const value = this.env[name];
		if (typeof value !== "string") return undefined;
		const trimmed = value.trim();
		return trimmed || undefined;
	}

	private dateString(date: Date): string {
		return date.toISOString().slice(0, 10);
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

	private async getYahooOptionsAuth(): Promise<YahooAuth> {
		if (this.yahooOptionsAuth) return this.yahooOptionsAuth;
		const cookie = await this.fetchYahooCookie();
		const crumb = await this.fetchYahooCrumb(cookie);
		this.yahooOptionsAuth = { cookie, crumb };
		return this.yahooOptionsAuth;
	}

	private async fetchYahooCookie(): Promise<string> {
		const response = await this.fetchImpl("https://fc.yahoo.com", {
			headers: {
				"user-agent": YAHOO_USER_AGENT,
			},
		});
		const cookie = cookieHeaderFromSetCookie(response.headers);
		if (!cookie) throw new Error("yahoo_options_cookie_missing");
		return cookie;
	}

	private async fetchYahooCrumb(cookie: string): Promise<string> {
		const response = await this.fetchImpl(`${YAHOO_QUERY_1}/v1/test/getcrumb`, {
			headers: {
				accept: "text/plain",
				cookie,
				"user-agent": YAHOO_USER_AGENT,
			},
		});
		if (!response.ok) {
			throw new Error(`yahoo_options_crumb_http_${response.status}`);
		}
		const crumb = (await response.text()).trim();
		if (!crumb || crumb.startsWith("{")) throw new Error("yahoo_options_crumb_missing");
		return crumb;
	}

	private async fetchJson(url: string, source: string, headers: Record<string, string> = {}): Promise<unknown> {
		const response = await this.fetchImpl(url, {
			headers: {
				accept: "application/json",
				"user-agent": source.startsWith("yahoo_") ? YAHOO_USER_AGENT : this.userAgent,
				...headers,
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

function isYahooOptionsAuthError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message === "yahoo_options_http_401" ||
		message === "yahoo_options_http_403" ||
		message === "yahoo_options_http_429" ||
		message === "yahoo_options_Unauthorized"
	);
}

function cookieHeaderFromSetCookie(headers: Headers): string | undefined {
	const setCookieHeaders = headers.getSetCookie();
	const values = setCookieHeaders.length > 0 ? setCookieHeaders : [headers.get("set-cookie") ?? ""];
	const pairs = values.flatMap((value) => {
		const pair = value.split(";")[0]?.trim();
		return pair?.includes("=") ? [pair] : [];
	});
	return pairs.length > 0 ? pairs.join("; ") : undefined;
}

function firstContractExpiration(rawOption: JsonRecord): number | undefined {
	for (const raw of [...asArray(rawOption.calls), ...asArray(rawOption.puts)]) {
		const expiration = numberOrUndefined(asRecord(raw).expiration);
		if (expiration !== undefined) return expiration;
	}
	return undefined;
}

function parseOptionContracts(
	rawContracts: unknown[],
	optionType: OptionType,
	fallbackExpirationUnix: number,
): ParsedOptionContract[] {
	return rawContracts.flatMap((raw) => {
		const contract = asRecord(raw);
		const strike = numberOrUndefined(contract.strike);
		if (strike === undefined) return [];
		const expirationUnix = numberOrUndefined(contract.expiration) ?? fallbackExpirationUnix;
		return [
			{
				optionType,
				contractSymbol: stringOrUndefined(contract.contractSymbol),
				expirationUnix,
				expirationDate: dateFromUnixSeconds(expirationUnix),
				strike,
				volume: numberOrNull(contract.volume),
				openInterest: numberOrNull(contract.openInterest),
				impliedVolatility: numberOrNull(contract.impliedVolatility),
			},
		];
	});
}

function parseCboeOptionContract(raw: unknown): ParsedOptionContract[] {
	const contract = asRecord(raw);
	const contractSymbol = stringOrUndefined(contract.option);
	const match = contractSymbol ? /^(.+)(\d{6})([CP])(\d{8})$/.exec(contractSymbol) : null;
	if (!match) return [];
	const expirationUnix = unixFromOptionDate(match[2]);
	if (expirationUnix === undefined) return [];
	const rawStrike = Number(match[4]);
	if (!Number.isFinite(rawStrike)) return [];
	return [
		{
			optionType: match[3] === "C" ? "call" : "put",
			contractSymbol,
			expirationUnix,
			expirationDate: dateFromUnixSeconds(expirationUnix),
			strike: rawStrike / 1000,
			volume: numberOrNull(contract.volume),
			openInterest: numberOrNull(contract.open_interest),
			impliedVolatility: numberOrNull(contract.iv),
		},
	];
}

function dateFromUnixSeconds(value: number): string {
	return new Date(value * 1000).toISOString().slice(0, 10);
}

function unixFromOptionDate(value: string): number | undefined {
	const match = /^(\d{2})(\d{2})(\d{2})$/.exec(value);
	if (!match) return undefined;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
	if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
	const fullYear = year >= 70 ? 1900 + year : 2000 + year;
	return Math.floor(Date.UTC(fullYear, month - 1, day) / 1000);
}

function parseExpirationInput(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (/^\d+$/.test(trimmed)) {
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	const parsed = Date.parse(`${trimmed.slice(0, 10)}T00:00:00Z`);
	return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined;
}

function selectOptionExpirations(
	chain: YahooOptionsChainData,
	expiration: string | undefined,
	expirationLimit: number,
): number[] {
	const requestedExpiration = parseExpirationInput(expiration);
	if (requestedExpiration !== undefined) return [requestedExpiration];
	const limit = Math.max(1, Math.min(12, Math.floor(expirationLimit)));
	const dates = chain.expirationDates.length > 0 ? chain.expirationDates : [];
	const preferredFirst = chain.option?.expirationUnix;
	const selected = preferredFirst === undefined ? [] : [preferredFirst];
	for (const date of dates) {
		if (selected.length >= limit) break;
		if (!selected.includes(date)) selected.push(date);
	}
	return selected.slice(0, limit);
}

function firstNonNullPrice(chains: YahooOptionsChainData[]): number | null {
	for (const chain of chains) {
		if (chain.underlyingPrice !== null) return chain.underlyingPrice;
	}
	return null;
}

function buildExpirationPositioning(
	expiration: YahooOptionsExpirationData,
	underlyingPrice: number | null,
	now: Date,
): OptionsExpirationPositioning {
	return {
		expirationDate: expiration.expirationDate,
		...buildOptionsSummary(expiration.contracts, underlyingPrice, expiration.expirationUnix, now),
	};
}

function buildOptionsSummary(
	contracts: ParsedOptionContract[],
	underlyingPrice: number | null,
	_expirationUnix: number | undefined,
	now: Date,
): OptionsPositioningSummary {
	const callVolume = sumOptionField(contracts, "call", "volume");
	const putVolume = sumOptionField(contracts, "put", "volume");
	const callOpenInterest = sumOptionField(contracts, "call", "openInterest");
	const putOpenInterest = sumOptionField(contracts, "put", "openInterest");
	const gammaByStrike = buildGammaByStrike(contracts, underlyingPrice, now);
	return {
		callVolume,
		putVolume,
		callOpenInterest,
		putOpenInterest,
		volumePutCallRatio: ratioOrNull(putVolume, callVolume),
		openInterestPutCallRatio: ratioOrNull(putOpenInterest, callOpenInterest),
		callWall: wallBySide(gammaByStrike, "call"),
		putWall: wallBySide(gammaByStrike, "put"),
		maxPain: maxPainStrike(contracts, gammaByStrike),
		estimatedNetGammaExposure: roundMetric(
			gammaByStrike.reduce((total, strike) => total + strike.netGammaExposure, 0),
		),
		estimatedGrossGammaExposure: roundMetric(
			gammaByStrike.reduce((total, strike) => total + strike.grossGammaExposure, 0),
		),
		gammaByStrike,
		contracts: contracts.length,
	};
}

function sumOptionField(
	contracts: ParsedOptionContract[],
	optionType: OptionType,
	field: "volume" | "openInterest",
): number {
	return contracts
		.filter((contract) => contract.optionType === optionType)
		.reduce((total, contract) => total + (contract[field] ?? 0), 0);
}

function ratioOrNull(numerator: number, denominator: number): number | null {
	if (denominator === 0) return null;
	return numerator / denominator;
}

function buildGammaByStrike(
	contracts: ParsedOptionContract[],
	underlyingPrice: number | null,
	now: Date,
): OptionGammaByStrike[] {
	const byStrike = new Map<number, OptionGammaByStrike>();
	for (const contract of contracts) {
		const current = byStrike.get(contract.strike) ?? {
			strike: contract.strike,
			callOpenInterest: 0,
			putOpenInterest: 0,
			totalOpenInterest: 0,
			callVolume: 0,
			putVolume: 0,
			callGammaExposure: 0,
			putGammaExposure: 0,
			netGammaExposure: 0,
			grossGammaExposure: 0,
		};
		const openInterest = contract.openInterest ?? 0;
		const volume = contract.volume ?? 0;
		const gammaExposure = estimateGammaExposure(contract, underlyingPrice, now);
		if (contract.optionType === "call") {
			current.callOpenInterest += openInterest;
			current.callVolume += volume;
			current.callGammaExposure += gammaExposure;
		} else {
			current.putOpenInterest += openInterest;
			current.putVolume += volume;
			current.putGammaExposure -= gammaExposure;
		}
		current.totalOpenInterest = current.callOpenInterest + current.putOpenInterest;
		current.netGammaExposure = current.callGammaExposure + current.putGammaExposure;
		current.grossGammaExposure = Math.abs(current.callGammaExposure) + Math.abs(current.putGammaExposure);
		byStrike.set(contract.strike, current);
	}
	return [...byStrike.values()]
		.map((strike) => ({
			...strike,
			callGammaExposure: roundMetric(strike.callGammaExposure),
			putGammaExposure: roundMetric(strike.putGammaExposure),
			netGammaExposure: roundMetric(strike.netGammaExposure),
			grossGammaExposure: roundMetric(strike.grossGammaExposure),
		}))
		.sort((left, right) => right.grossGammaExposure - left.grossGammaExposure || left.strike - right.strike);
}

function estimateGammaExposure(contract: ParsedOptionContract, underlyingPrice: number | null, now: Date): number {
	const spot = underlyingPrice;
	const impliedVolatility = contract.impliedVolatility;
	const openInterest = contract.openInterest ?? 0;
	if (
		spot === null ||
		spot <= 0 ||
		contract.strike <= 0 ||
		impliedVolatility === null ||
		impliedVolatility <= 0 ||
		openInterest <= 0
	) {
		return 0;
	}
	const yearsToExpiration = Math.max(
		1 / 365,
		(contract.expirationUnix * 1000 - now.getTime()) / (365 * 24 * 60 * 60 * 1000),
	);
	const sqrtTime = Math.sqrt(yearsToExpiration);
	const d1 =
		(Math.log(spot / contract.strike) + 0.5 * impliedVolatility * impliedVolatility * yearsToExpiration) /
		(impliedVolatility * sqrtTime);
	const gamma = normalPdf(d1) / (spot * impliedVolatility * sqrtTime);
	return gamma * openInterest * 100 * spot * spot * 0.01;
}

function normalPdf(value: number): number {
	return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

function wallBySide(gammaByStrike: OptionGammaByStrike[], side: OptionType): OptionWall | null {
	const sorted = [...gammaByStrike].sort((left, right) => {
		const leftValue = side === "call" ? left.callOpenInterest : left.putOpenInterest;
		const rightValue = side === "call" ? right.callOpenInterest : right.putOpenInterest;
		return rightValue - leftValue || left.strike - right.strike;
	});
	const top = sorted[0];
	const sideOpenInterest = top ? (side === "call" ? top.callOpenInterest : top.putOpenInterest) : 0;
	if (!top || sideOpenInterest === 0) return null;
	return {
		strike: top.strike,
		callOpenInterest: top.callOpenInterest,
		putOpenInterest: top.putOpenInterest,
		totalOpenInterest: top.totalOpenInterest,
	};
}

function maxPainStrike(contracts: ParsedOptionContract[], gammaByStrike: OptionGammaByStrike[]): OptionWall | null {
	if (contracts.length === 0 || gammaByStrike.length === 0) return null;
	const byStrike = new Map(gammaByStrike.map((strike) => [strike.strike, strike]));
	let bestStrike: OptionWall | null = null;
	let bestPayout = Number.POSITIVE_INFINITY;
	for (const strike of [...byStrike.keys()].sort((left, right) => left - right)) {
		const payout = contracts.reduce((total, contract) => {
			const openInterest = contract.openInterest ?? 0;
			const intrinsic =
				contract.optionType === "call"
					? Math.max(0, strike - contract.strike)
					: Math.max(0, contract.strike - strike);
			return total + intrinsic * openInterest * 100;
		}, 0);
		if (payout < bestPayout) {
			const row = byStrike.get(strike);
			bestPayout = payout;
			bestStrike = row
				? {
						strike: row.strike,
						callOpenInterest: row.callOpenInterest,
						putOpenInterest: row.putOpenInterest,
						totalOpenInterest: row.totalOpenInterest,
					}
				: null;
		}
	}
	return bestStrike;
}

function roundMetric(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.round(value * 100) / 100;
}

function reasonPart(value: string): string {
	return (
		value
			.replace(/[^a-z0-9]+/gi, "_")
			.replace(/^_+|_+$/g, "")
			.slice(0, 32) || "unknown"
	);
}

function numberFromFredValue(value: unknown): number | null {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value !== "string") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function sourceHealthForNews(news: SourceResult<NewsResult>): SourceHealth[] {
	return news.value.sourceHealth?.length ? news.value.sourceHealth : [news.health];
}

function alphaVantageItemMatchesSymbol(raw: unknown, normalized: string): boolean {
	const sentiments = asArray(asRecord(raw).ticker_sentiment);
	if (sentiments.length === 0) return true;
	return sentiments.some((sentiment) => {
		const item = asRecord(sentiment);
		if (normalizeSymbol(stringOrUndefined(item.ticker) ?? "") !== normalized) return false;
		const relevance = numberFromFredValue(item.relevance_score);
		return relevance === null || relevance >= 0.8;
	});
}
