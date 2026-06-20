import type { CryptoSymbol } from "./contracts.ts";

export function normalizeCryptoSymbol(value: unknown): CryptoSymbol {
	const raw = String(value ?? "")
		.trim()
		.toUpperCase()
		.replace(/\s+/g, "")
		.replace(/[-_/]/g, "");
	const withoutPerpSuffix = raw.endsWith("PERP") ? raw.slice(0, -4) : raw;
	const asset = withoutPerpSuffix.endsWith("USDT")
		? withoutPerpSuffix.slice(0, -4)
		: withoutPerpSuffix.endsWith("USD")
			? withoutPerpSuffix.slice(0, -3)
			: withoutPerpSuffix;
	const normalizedAsset = asset || "BTC";
	return {
		asset: normalizedAsset,
		binanceSymbol: `${normalizedAsset}USDT`,
		quoteAsset: "USDT",
	};
}
