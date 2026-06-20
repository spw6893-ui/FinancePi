import { describe, expect, it } from "vitest";

import { financeTextResult } from "../../src/core/finance-agent-extension.ts";

describe("finance tool result content", () => {
	it("includes structured data in model-visible content", () => {
		const result = financeTextResult("Finance quote", {
			value: { symbol: "NVDA", price: 123.45, source: "test_source" },
			health: { source: "test_source", status: "ok", latestAt: "2026-06-20T00:00:00.000Z" },
		});

		expect(result.content[0]?.text).toContain('"symbol": "NVDA"');
		expect(result.content[0]?.text).toContain('"price": 123.45');
		expect(result.content[0]?.text).not.toContain("Use details JSON");
		expect(result.details).toEqual({
			value: { symbol: "NVDA", price: 123.45, source: "test_source" },
			health: { source: "test_source", status: "ok", latestAt: "2026-06-20T00:00:00.000Z" },
		});
	});
});
