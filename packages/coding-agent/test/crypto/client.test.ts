import { describe, expect, it } from "vitest";

import { CryptoClient } from "../../../crypto/src/index.ts";

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "content-type": "application/json" },
	});
}

const tickerPayload = {
	symbol: "BTCUSDT",
	lastPrice: "100000.12",
	priceChangePercent: "2.5",
	volume: "1234.5",
	quoteVolume: "123450000",
	openTime: 1781910000000,
	closeTime: 1781913600000,
};

const klinesPayload = [
	[1781740800000, "99000", "101000", "98000", "100000", "1000", 1781827199999, "100000000"],
	[1781827200000, "100000", "102000", "99500", "101500", "1100", 1781913599999, "111650000"],
];

const fundingPayload = [
	{
		symbol: "BTCUSDT",
		fundingRate: "0.0001",
		fundingTime: 1781913600000,
	},
];

const openInterestPayload = {
	symbol: "BTCUSDT",
	openInterest: "12345.678",
	time: 1781913600000,
};

describe("CryptoClient", () => {
	it("builds a BTC context from Binance spot and futures data", async () => {
		const client = new CryptoClient({
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url) => {
				const text = String(url);
				if (text.includes("/api/v3/ticker/24hr")) return jsonResponse(tickerPayload);
				if (text.includes("/api/v3/klines")) return jsonResponse(klinesPayload);
				if (text.includes("/fapi/v1/fundingRate")) return jsonResponse(fundingPayload);
				if (text.includes("/fapi/v1/openInterest")) return jsonResponse(openInterestPayload);
				throw new Error(`unexpected URL ${text}`);
			},
		});

		const context = await client.getCryptoContext("btc");

		expect(context.ok).toBe(true);
		expect(context.asset).toBe("BTC");
		expect(context.binanceSymbol).toBe("BTCUSDT");
		expect(context.quote?.lastPrice).toBe(100000.12);
		expect(context.history.bars).toHaveLength(2);
		expect(context.derivatives?.fundingRate).toBe(0.0001);
		expect(context.derivatives?.openInterest).toBe(12345.678);
		expect(context.degradedReasons).toEqual([]);
		expect(context.sourceHealth.every((item) => item.status === "ok")).toBe(true);
	});

	it("keeps context usable when futures data is unavailable", async () => {
		const client = new CryptoClient({
			now: () => new Date("2026-06-20T00:00:00Z"),
			fetch: async (url) => {
				const text = String(url);
				if (text.includes("/api/v3/ticker/24hr")) return jsonResponse(tickerPayload);
				if (text.includes("/api/v3/klines")) return jsonResponse(klinesPayload);
				if (text.includes("/fapi/v1/fundingRate")) return jsonResponse({ error: "rate limited" }, 429);
				if (text.includes("/fapi/v1/openInterest")) return jsonResponse(openInterestPayload);
				throw new Error(`unexpected URL ${text}`);
			},
		});

		const context = await client.getCryptoContext("BTC");

		expect(context.ok).toBe(true);
		expect(context.quote?.lastPrice).toBe(100000.12);
		expect(context.derivatives?.openInterest).toBe(12345.678);
		expect(context.derivatives?.fundingRate).toBeNull();
		expect(context.degradedReasons).toContain("funding_http_429");
	});
});
