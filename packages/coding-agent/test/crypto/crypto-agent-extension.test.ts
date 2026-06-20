import { describe, expect, it } from "vitest";

import cryptoAgentExtension from "../../src/core/crypto-agent-extension.ts";
import { createTestExtensionsResult } from "../utilities.ts";

describe("crypto agent extension", () => {
	it("registers Binance-backed crypto tools and prompt guidance", async () => {
		const result = await createTestExtensionsResult([{ factory: cryptoAgentExtension, path: "<crypto-agent>" }]);
		const extension = result.extensions[0];

		expect(extension?.tools.has("crypto_quote")).toBe(true);
		expect(extension?.tools.has("crypto_history")).toBe(true);
		expect(extension?.tools.has("crypto_derivatives")).toBe(true);
		expect(extension?.tools.has("crypto_context")).toBe(true);
		expect(extension?.handlers.has("before_agent_start")).toBe(true);
	});
});
