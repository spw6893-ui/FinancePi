export type MarketCode = "US";

export interface SourceHealth {
	source: string;
	status: "ok" | "degraded";
	latestAt?: string;
	degradedReason?: string;
	configured?: boolean;
	used?: boolean;
}

export interface SourceResult<T> {
	value: T;
	health: SourceHealth;
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
	range?: string;
	interval?: string;
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
	sourceHealth?: SourceHealth[];
}

export interface MacroObservation {
	seriesId: string;
	label: string;
	value: number | null;
	unit: string;
	date: string;
	source: string;
}

export interface MacroSnapshot {
	observations: MacroObservation[];
	latestAt: string | null;
	source: string;
	sourceHealth: SourceHealth[];
	degradedReasons: string[];
}

export interface FundamentalFact {
	label: string;
	value: number;
	concept?: string;
	fiscalYear?: number;
	fiscalPeriod?: string;
	periodStart?: string;
	periodEnd?: string;
	frame?: string;
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
		grossProfit?: FundamentalFact;
		operatingIncome?: FundamentalFact;
		netIncome?: FundamentalFact;
		operatingCashFlow?: FundamentalFact;
		capitalExpenditures?: FundamentalFact;
		assets?: FundamentalFact;
		liabilities?: FundamentalFact;
		stockholdersEquity?: FundamentalFact;
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

export interface OptionsPositioningOptions {
	/** Optional expiration date in YYYY-MM-DD or Unix seconds. Defaults to nearest expirations. */
	expiration?: string;
	/** Maximum number of expirations to fetch when expiration is omitted. Defaults to 4. */
	expirationLimit?: number;
}

export interface OptionWall {
	strike: number;
	callOpenInterest: number;
	putOpenInterest: number;
	totalOpenInterest: number;
}

export interface OptionGammaByStrike extends OptionWall {
	callVolume: number;
	putVolume: number;
	callGammaExposure: number;
	putGammaExposure: number;
	netGammaExposure: number;
	grossGammaExposure: number;
}

export interface OptionsPositioningSummary {
	callVolume: number;
	putVolume: number;
	callOpenInterest: number;
	putOpenInterest: number;
	volumePutCallRatio: number | null;
	openInterestPutCallRatio: number | null;
	callWall: OptionWall | null;
	putWall: OptionWall | null;
	maxPain: OptionWall | null;
	estimatedNetGammaExposure: number;
	estimatedGrossGammaExposure: number;
	gammaByStrike: OptionGammaByStrike[];
	contracts: number;
}

export interface OptionsExpirationPositioning extends OptionsPositioningSummary {
	expirationDate: string;
}

export interface OptionsPositioning {
	symbol: string;
	market: MarketCode;
	underlyingPrice: number | null;
	asOf: string;
	expirationDates: string[];
	expirations: OptionsExpirationPositioning[];
	summary: OptionsPositioningSummary;
	source: string;
	limitations: string[];
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
	macro: MacroSnapshot;
	asOf: string;
	sourceHealth: SourceHealth[];
	degradedReasons: string[];
}

export interface FinanceClientOptions {
	fetch?: typeof fetch;
	now?: () => Date;
	userAgent?: string;
	env?: Record<string, string | undefined>;
}

export interface SymbolContextOptions {
	newsLimit?: number;
	historyRange?: string;
	historyInterval?: string;
}

export interface FinanceMcpServerConfig {
	type?: "http";
	url: string;
	headers?: Record<string, string>;
	disabled?: boolean;
}

export interface FinanceMcpConfig {
	mcpServers: Record<string, FinanceMcpServerConfig>;
}

export interface FinanceMcpTool {
	name: string;
	description?: string;
	inputSchema?: unknown;
}

export interface FinanceMcpToolsResult {
	server: string;
	tools: FinanceMcpTool[];
	source: string;
	asOf: string;
}

export interface FinanceMcpToolCallResult {
	server: string;
	toolName: string;
	content: unknown[];
	structuredContent?: unknown;
	rawResult?: unknown;
	source: string;
	asOf: string;
}
