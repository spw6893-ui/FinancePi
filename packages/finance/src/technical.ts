import type { PriceBar, TechnicalSnapshot } from "./contracts.ts";
import { normalizeSymbol } from "./symbols.ts";

function safeClose(bar: PriceBar | undefined): number | null {
	if (!bar || bar.close === null || !Number.isFinite(bar.close)) return null;
	return bar.close;
}

function simpleReturn(bars: PriceBar[], periods: number): number | null {
	if (bars.length <= periods) return null;
	const latest = safeClose(bars[bars.length - 1]);
	const previous = safeClose(bars[bars.length - 1 - periods]);
	if (latest === null || previous === null || previous === 0) return null;
	return (latest - previous) / previous;
}

function sma(bars: PriceBar[], periods: number): number | null {
	if (bars.length < periods) return null;
	const closes = bars.slice(-periods).map((bar) => safeClose(bar));
	if (closes.some((close) => close === null)) return null;
	return (closes as number[]).reduce((sum, close) => sum + close, 0) / periods;
}

function inferTrend(
	latestClose: number | null,
	sma20: number | null,
	sma50: number | null,
): TechnicalSnapshot["trend"] {
	if (latestClose === null || sma20 === null) return "insufficient_data";
	if (latestClose > sma20 && (sma50 === null || sma20 >= sma50)) return "uptrend";
	if (latestClose < sma20 && (sma50 === null || sma20 <= sma50)) return "downtrend";
	return "neutral";
}

export function buildTechnicalSnapshot(symbol: string, bars: PriceBar[], period = "daily"): TechnicalSnapshot {
	const orderedBars = [...bars].filter((bar) => bar.time).sort((left, right) => left.time.localeCompare(right.time));
	const latestBar = orderedBars[orderedBars.length - 1];
	const latestClose = safeClose(latestBar);
	const sma20 = sma(orderedBars, 20);
	const sma50 = sma(orderedBars, 50);

	return {
		symbol: normalizeSymbol(symbol),
		period,
		asOf: latestBar?.time ?? null,
		latestClose,
		return1d: simpleReturn(orderedBars, 1),
		return5d: simpleReturn(orderedBars, 5),
		return20d: simpleReturn(orderedBars, 20),
		sma20,
		sma50,
		trend: inferTrend(latestClose, sma20, sma50),
		source: "computed_from_history",
	};
}
