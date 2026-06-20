import { describe, expect, it } from "vitest";

import { cryptoTextResult } from "../../src/core/crypto-agent-extension.ts";

describe("crypto tool result content", () => {
	it("includes compact model-visible data without flushing raw JSON", () => {
		const result = cryptoTextResult("Crypto context", {
			ok: true,
			asset: "BTC",
			binanceSymbol: "BTCUSDT",
			quoteAsset: "USDT",
			quote: { lastPrice: 64000, source: "binance_spot_ticker", asOf: "2026-06-20T00:00:00.000Z" },
			history: {
				asset: "BTC",
				binanceSymbol: "BTCUSDT",
				quoteAsset: "USDT",
				interval: "1h",
				bars: [
					{
						openTime: "2026-06-20T00:00:00.000Z",
						closeTime: "2026-06-20T00:59:59.999Z",
						open: 1,
						high: 2,
						low: 0.5,
						close: 1.5,
						volume: 100,
						quoteVolume: 150,
					},
				],
				latestAt: "2026-06-20T00:59:59.999Z",
				source: "binance_spot_klines",
			},
			derivatives: {
				asset: "BTC",
				binanceSymbol: "BTCUSDT",
				quoteAsset: "USDT",
				fundingRate: 0.0001,
				fundingTime: "2026-06-20T00:00:00.000Z",
				openInterest: 123,
				openInterestTime: "2026-06-20T00:00:00.000Z",
				source: "binance_usdm_futures",
			},
			sourceHealth: [{ source: "binance_spot_ticker", status: "ok", latestAt: "2026-06-20T00:00:00.000Z" }],
			degradedReasons: [],
			asOf: "2026-06-20T00:00:00.000Z",
		});

		expect(result.content[0]?.text).toContain("symbol=BTCUSDT");
		expect(result.content[0]?.text).toContain("lastPrice=64000");
		expect(result.content[0]?.text).toContain("source_health_csv:");
		expect(result.content[0]?.text).toContain("bars_csv_last_1:");
		expect(result.content[0]?.text).toContain("full raw result is preserved in tool details");
		expect(result.content[0]?.text).not.toContain('"binanceSymbol"');
		expect(result.content[0]?.text).not.toContain("Use details JSON");
		expect(result.details).toMatchObject({ ok: true, binanceSymbol: "BTCUSDT" });
	});
});
