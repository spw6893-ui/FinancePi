import type {
	CryptoClientOptions,
	CryptoContext,
	CryptoContextOptions,
	CryptoDerivatives,
	CryptoHistory,
	CryptoPriceBar,
	CryptoQuote,
	SourceHealth,
} from "./contracts.ts";
import { normalizeCryptoSymbol } from "./symbols.ts";

interface SourceResult<T> {
	value: T;
	health: SourceHealth;
	degradedReason?: string;
}

type JsonRecord = Record<string, unknown>;

const BINANCE_SPOT_BASE = "https://api.binance.com";
const BINANCE_FUTURES_BASE = "https://fapi.binance.com";

function asRecord(value: unknown): JsonRecord {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function numberOrNull(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function isoFromMs(value: unknown): string | null {
	const numeric = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(numeric)) return null;
	return new Date(numeric).toISOString();
}

export class CryptoClient {
	private readonly fetchImpl: typeof fetch;
	private readonly now: () => Date;
	private readonly userAgent: string;

	constructor(options: CryptoClientOptions = {}) {
		this.fetchImpl = options.fetch ?? fetch;
		this.now = options.now ?? (() => new Date());
		this.userAgent = options.userAgent ?? "pi-crypto-agent/0.1 (https://github.com/earendil-works/pi)";
	}

	async getCryptoQuote(symbol: string): Promise<SourceResult<CryptoQuote | null>> {
		const normalized = normalizeCryptoSymbol(symbol);
		const url = `${BINANCE_SPOT_BASE}/api/v3/ticker/24hr?symbol=${encodeURIComponent(normalized.binanceSymbol)}`;
		try {
			const payload = asRecord(await this.fetchJson(url, "binance_spot_ticker"));
			const asOf = isoFromMs(payload.closeTime) ?? this.now().toISOString();
			return {
				value: {
					...normalized,
					lastPrice: numberOrNull(payload.lastPrice),
					changePercent24h: numberOrNull(payload.priceChangePercent),
					baseVolume24h: numberOrNull(payload.volume),
					quoteVolume24h: numberOrNull(payload.quoteVolume),
					asOf,
					source: "binance_spot_ticker",
				},
				health: { source: "binance_spot_ticker", status: "ok", latestAt: asOf },
			};
		} catch (error) {
			return this.degraded(null, "binance_spot_ticker", this.errorReason("quote", error));
		}
	}

	async getCryptoHistory(symbol: string, interval = "1d", limit = 120): Promise<SourceResult<CryptoHistory>> {
		const normalized = normalizeCryptoSymbol(symbol);
		const url = `${BINANCE_SPOT_BASE}/api/v3/klines?symbol=${encodeURIComponent(normalized.binanceSymbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
		const empty: CryptoHistory = {
			...normalized,
			interval,
			bars: [],
			latestAt: null,
			source: "binance_spot_klines",
		};
		try {
			const rows = asArray(await this.fetchJson(url, "binance_spot_klines"));
			const bars: CryptoPriceBar[] = rows.map((row) => {
				const values = asArray(row);
				return {
					openTime: isoFromMs(values[0]) ?? String(values[0] ?? ""),
					open: numberOrNull(values[1]),
					high: numberOrNull(values[2]),
					low: numberOrNull(values[3]),
					close: numberOrNull(values[4]),
					volume: numberOrNull(values[5]),
					closeTime: isoFromMs(values[6]) ?? String(values[6] ?? ""),
					quoteVolume: numberOrNull(values[7]),
				};
			});
			const latestAt = bars[bars.length - 1]?.closeTime ?? null;
			return {
				value: { ...empty, bars, latestAt },
				health: { source: "binance_spot_klines", status: "ok", latestAt: latestAt ?? undefined },
			};
		} catch (error) {
			return this.degraded(empty, "binance_spot_klines", this.errorReason("history", error));
		}
	}

	async getCryptoDerivatives(symbol: string): Promise<SourceResult<CryptoDerivatives | null>> {
		const normalized = normalizeCryptoSymbol(symbol);
		const empty: CryptoDerivatives = {
			...normalized,
			fundingRate: null,
			fundingTime: null,
			openInterest: null,
			openInterestTime: null,
			source: "binance_usdm_futures",
		};
		const degradedReasons: string[] = [];
		const funding = await this.getFundingRate(normalized.binanceSymbol);
		const openInterest = await this.getOpenInterest(normalized.binanceSymbol);
		if (funding.degradedReason) degradedReasons.push(funding.degradedReason);
		if (openInterest.degradedReason) degradedReasons.push(openInterest.degradedReason);
		const value = {
			...empty,
			fundingRate: funding.value?.fundingRate ?? null,
			fundingTime: funding.value?.fundingTime ?? null,
			openInterest: openInterest.value?.openInterest ?? null,
			openInterestTime: openInterest.value?.openInterestTime ?? null,
		};
		const degradedReason = degradedReasons[0];
		return {
			value,
			health: degradedReason
				? {
						source: "binance_usdm_futures",
						status: "degraded",
						latestAt: this.now().toISOString(),
						degradedReason,
					}
				: {
						source: "binance_usdm_futures",
						status: "ok",
						latestAt: value.fundingTime ?? value.openInterestTime ?? undefined,
					},
			degradedReason,
		};
	}

	async getCryptoContext(symbol: string, options: CryptoContextOptions = {}): Promise<CryptoContext> {
		const normalized = normalizeCryptoSymbol(symbol);
		const [quote, history, derivatives] = await Promise.all([
			this.getCryptoQuote(normalized.binanceSymbol),
			this.getCryptoHistory(normalized.binanceSymbol, options.interval, options.limit),
			this.getCryptoDerivatives(normalized.binanceSymbol),
		]);
		const sourceResults = [quote, history, derivatives];
		return {
			ok: true,
			...normalized,
			quote: quote.value,
			history: history.value,
			derivatives: derivatives.value,
			sourceHealth: sourceResults.map((result) => result.health),
			degradedReasons: sourceResults.flatMap((result) => (result.degradedReason ? [result.degradedReason] : [])),
			asOf: this.now().toISOString(),
		};
	}

	private async getFundingRate(symbol: string): Promise<
		SourceResult<{
			fundingRate: number | null;
			fundingTime: string | null;
		} | null>
	> {
		const url = `${BINANCE_FUTURES_BASE}/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=1`;
		try {
			const row = asRecord(asArray(await this.fetchJson(url, "binance_funding_rate"))[0]);
			return {
				value: {
					fundingRate: numberOrNull(row.fundingRate),
					fundingTime: isoFromMs(row.fundingTime),
				},
				health: { source: "binance_funding_rate", status: "ok", latestAt: isoFromMs(row.fundingTime) ?? undefined },
			};
		} catch (error) {
			return this.degraded(null, "binance_funding_rate", this.errorReason("funding", error));
		}
	}

	private async getOpenInterest(symbol: string): Promise<
		SourceResult<{
			openInterest: number | null;
			openInterestTime: string | null;
		} | null>
	> {
		const url = `${BINANCE_FUTURES_BASE}/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`;
		try {
			const payload = asRecord(await this.fetchJson(url, "binance_open_interest"));
			return {
				value: {
					openInterest: numberOrNull(payload.openInterest),
					openInterestTime: isoFromMs(payload.time),
				},
				health: { source: "binance_open_interest", status: "ok", latestAt: isoFromMs(payload.time) ?? undefined },
			};
		} catch (error) {
			return this.degraded(null, "binance_open_interest", this.errorReason("open_interest", error));
		}
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
