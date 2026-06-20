export interface SourceHealth {
	source: string;
	status: "ok" | "degraded";
	latestAt?: string;
	degradedReason?: string;
}

export interface CryptoSymbol {
	asset: string;
	binanceSymbol: string;
	quoteAsset: string;
}

export interface CryptoQuote {
	asset: string;
	binanceSymbol: string;
	quoteAsset: string;
	lastPrice: number | null;
	changePercent24h: number | null;
	baseVolume24h: number | null;
	quoteVolume24h: number | null;
	asOf: string;
	source: string;
}

export interface CryptoPriceBar {
	openTime: string;
	closeTime: string;
	open: number | null;
	high: number | null;
	low: number | null;
	close: number | null;
	volume: number | null;
	quoteVolume: number | null;
}

export interface CryptoHistory {
	asset: string;
	binanceSymbol: string;
	quoteAsset: string;
	interval: string;
	bars: CryptoPriceBar[];
	latestAt: string | null;
	source: string;
}

export interface CryptoDerivatives {
	asset: string;
	binanceSymbol: string;
	quoteAsset: string;
	fundingRate: number | null;
	fundingTime: string | null;
	openInterest: number | null;
	openInterestTime: string | null;
	source: string;
}

export interface CryptoContext {
	ok: true;
	asset: string;
	binanceSymbol: string;
	quoteAsset: string;
	quote: CryptoQuote | null;
	history: CryptoHistory;
	derivatives: CryptoDerivatives | null;
	sourceHealth: SourceHealth[];
	degradedReasons: string[];
	asOf: string;
}

export interface CryptoClientOptions {
	fetch?: typeof fetch;
	now?: () => Date;
	userAgent?: string;
}

export interface CryptoContextOptions {
	interval?: string;
	limit?: number;
}
