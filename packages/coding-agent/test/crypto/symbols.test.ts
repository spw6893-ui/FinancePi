import { describe, expect, it } from "vitest";

import { normalizeCryptoSymbol } from "../../../crypto/src/index.ts";

describe("crypto symbol helpers", () => {
	it("normalizes common BTC aliases to Binance USDT symbols", () => {
		expect(normalizeCryptoSymbol("btc")).toEqual({ asset: "BTC", binanceSymbol: "BTCUSDT", quoteAsset: "USDT" });
		expect(normalizeCryptoSymbol("BTC-USD")).toEqual({ asset: "BTC", binanceSymbol: "BTCUSDT", quoteAsset: "USDT" });
		expect(normalizeCryptoSymbol("btcusdt")).toEqual({ asset: "BTC", binanceSymbol: "BTCUSDT", quoteAsset: "USDT" });
	});

	it("maps arbitrary assets to USDT pairs by default", () => {
		expect(normalizeCryptoSymbol("sol")).toEqual({ asset: "SOL", binanceSymbol: "SOLUSDT", quoteAsset: "USDT" });
	});
});
