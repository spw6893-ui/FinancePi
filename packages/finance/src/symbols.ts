import type { MarketCode } from "./contracts.ts";

export function normalizeSymbol(value: unknown): string {
	const text = String(value ?? "")
		.trim()
		.toUpperCase();
	if (!text) return "";
	return text.replace(/\//g, "-").replace(/\s+/g, "");
}

export function inferMarketCode(_symbol: string, market?: string): MarketCode {
	const normalizedMarket = String(market ?? "")
		.trim()
		.toUpperCase();
	if (normalizedMarket === "US") return "US";
	return "US";
}
