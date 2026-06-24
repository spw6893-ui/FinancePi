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

	it("guides token due diligence toward evidence-gated on-chain forensic analysis", async () => {
		const result = await createTestExtensionsResult([{ factory: cryptoAgentExtension, path: "<crypto-agent>" }]);
		const handler = result.extensions[0]?.handlers.get("before_agent_start")?.[0];

		const output = (await handler?.(
			{
				type: "before_agent_start",
				prompt: "analyze this token on chain",
				systemPrompt: "base prompt",
				systemPromptOptions: {} as never,
			},
			{ cwd: process.cwd() } as never,
		)) as { systemPrompt?: string } | undefined;

		expect(output?.systemPrompt).toContain("wallet/flow evidence as a forensic lens");
		expect(output?.systemPrompt).toContain("confirmed sellout lower bounds");
		expect(output?.systemPrompt).toContain("Do not infer insider behavior");
		expect(output?.systemPrompt).toContain("separate confirmed sold amounts from transferred throughput");
	});
});
