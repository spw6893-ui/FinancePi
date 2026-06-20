export type MarketCode = "US";

export interface SourceHealth {
	source: string;
	status: "ok" | "degraded";
	latestAt?: string;
	degradedReason?: string;
}

export interface Quote {
	symbol: string;
	market: MarketCode;
	name?: string;
	price: number | null;
	changePercent?: number | null;
	currency?: string;
	exchange?: string;
	marketCap?: number | null;
	asOf: string;
	source: string;
}

export interface PriceBar {
	time: string;
	open: number | null;
	high: number | null;
	low: number | null;
	close: number | null;
	volume: number | null;
}

export interface History {
	symbol: string;
	market: MarketCode;
	bars: PriceBar[];
	latestAt: string | null;
	source: string;
}

export interface NewsItem {
	id?: string;
	title: string;
	publisher?: string;
	url?: string;
	publishedAt?: string;
	source: string;
}

export interface NewsResult {
	symbol: string;
	market: MarketCode;
	items: NewsItem[];
	latestAt: string | null;
	source: string;
}

export interface FundamentalFact {
	label: string;
	value: number;
	fiscalYear?: number;
	fiscalPeriod?: string;
	form?: string;
	filed?: string;
	unit?: string;
}

export interface Fundamentals {
	symbol: string;
	market: MarketCode;
	cik?: string;
	companyName?: string;
	facts: {
		revenue?: FundamentalFact;
		netIncome?: FundamentalFact;
	};
	asOf: string;
	source: string;
}

export interface TechnicalSnapshot {
	symbol: string;
	period: string;
	asOf: string | null;
	latestClose: number | null;
	return1d: number | null;
	return5d: number | null;
	return20d: number | null;
	sma20: number | null;
	sma50: number | null;
	trend: "uptrend" | "downtrend" | "neutral" | "insufficient_data";
	source: string;
}

export interface SymbolContext {
	ok: true;
	symbol: string;
	market: MarketCode;
	quote: Quote | null;
	history: History;
	news: NewsResult;
	technicalSnapshot: TechnicalSnapshot | null;
	fundamentals: Fundamentals | null;
	sourceHealth: SourceHealth[];
	degradedReasons: string[];
	asOf: string;
}

export interface CompareSymbolsResult {
	ok: true;
	symbols: string[];
	contexts: SymbolContext[];
	asOf: string;
	degradedReasons: string[];
}

export interface MarketBrief {
	ok: true;
	symbols: string[];
	contexts: SymbolContext[];
	asOf: string;
	sourceHealth: SourceHealth[];
	degradedReasons: string[];
}

export interface FinanceClientOptions {
	fetch?: typeof fetch;
	now?: () => Date;
	userAgent?: string;
}

export interface SymbolContextOptions {
	newsLimit?: number;
	historyRange?: string;
	historyInterval?: string;
}
