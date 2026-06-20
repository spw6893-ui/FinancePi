import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { cryptoTextResult } from "../../src/core/crypto-agent-extension.ts";

describe("crypto tool result content", () => {
	it("includes compact model-visible data and points to a CSV artifact", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-crypto-artifact-"));
		const result = await cryptoTextResult(
			"Crypto context",
			{
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
			},
			{
				cwd,
			} as never,
		);

		try {
			const text = result.content[0]?.text ?? "";

			expect(text).toContain("symbol=BTCUSDT");
			expect(text).toContain("lastPrice=64000");
			expect(text).toContain(".pi/artifacts/market-data/");
			expect(text).toContain("(csv, rows=2)");
			expect(text).not.toContain("source_health_csv:");
			expect(text).not.toContain("bars_csv_last_1:");
			expect(text).not.toContain('"binanceSymbol"');
			expect(text).not.toContain("Use details JSON");
			expect(result.details).toMatchObject({ ok: true, binanceSymbol: "BTCUSDT" });

			const artifactPath = text.match(/\.pi\/artifacts\/market-data\/\S+\.csv/)?.[0];
			expect(artifactPath).toBeTruthy();
			const csv = await readFile(join(cwd, artifactPath ?? ""), "utf8");
			expect(csv).toContain("source_health");
			expect(csv).toContain("bar,2026-06-20T00:00:00.000Z");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
