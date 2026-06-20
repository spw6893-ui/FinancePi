import { describe, expect, it } from "vitest";

import { buildTechnicalSnapshot, type PriceBar } from "../../../finance/src/index.ts";

describe("buildTechnicalSnapshot", () => {
	it("computes latest close, returns, moving averages and trend", () => {
		const bars: PriceBar[] = Array.from({ length: 30 }, (_, index) => ({
			time: `2026-01-${String(index + 1).padStart(2, "0")}`,
			open: 100 + index,
			high: 101 + index,
			low: 99 + index,
			close: 100 + index,
			volume: 1000 + index,
		}));

		const snapshot = buildTechnicalSnapshot("AAPL", bars, "daily");

		expect(snapshot.symbol).toBe("AAPL");
		expect(snapshot.period).toBe("daily");
		expect(snapshot.latestClose).toBe(129);
		expect(snapshot.return1d).toBeCloseTo((129 - 128) / 128, 6);
		expect(snapshot.return5d).toBeCloseTo((129 - 124) / 124, 6);
		expect(snapshot.sma20).toBeCloseTo(119.5, 6);
		expect(snapshot.trend).toBe("uptrend");
		expect(snapshot.asOf).toBe("2026-01-30");
	});
});
