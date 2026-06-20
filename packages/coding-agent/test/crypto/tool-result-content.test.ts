import { describe, expect, it } from "vitest";

import { cryptoTextResult } from "../../src/core/crypto-agent-extension.ts";

describe("crypto tool result content", () => {
	it("includes structured data in model-visible content", () => {
		const result = cryptoTextResult("Crypto context", {
			ok: true,
			binanceSymbol: "BTCUSDT",
			quote: { lastPrice: 64000, source: "binance_spot_ticker" },
		});

		expect(result.content[0]?.text).toContain('"binanceSymbol": "BTCUSDT"');
		expect(result.content[0]?.text).toContain('"lastPrice": 64000');
		expect(result.content[0]?.text).not.toContain("Use details JSON");
		expect(result.details).toEqual({
			ok: true,
			binanceSymbol: "BTCUSDT",
			quote: { lastPrice: 64000, source: "binance_spot_ticker" },
		});
	});
});
