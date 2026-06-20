import { describe, expect, it } from "vitest";

import { inferMarketCode, normalizeSymbol } from "../../../finance/src/index.ts";

describe("finance symbol helpers", () => {
	it("normalizes US equity and ETF symbols without losing class separators", () => {
		expect(normalizeSymbol("spy")).toBe("SPY");
		expect(normalizeSymbol(" brk-b ")).toBe("BRK-B");
		expect(normalizeSymbol("brk/b")).toBe("BRK-B");
	});

	it("infers US as the default market for stock-like tickers", () => {
		expect(inferMarketCode("AAPL")).toBe("US");
		expect(inferMarketCode("SPY")).toBe("US");
	});
});
