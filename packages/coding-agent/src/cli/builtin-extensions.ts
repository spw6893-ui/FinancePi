import cryptoAgentExtension from "../core/crypto-agent-extension.ts";
import type { ExtensionFactory } from "../core/extensions/types.ts";
import financeAgentExtension from "../core/finance-agent-extension.ts";
import type { Args } from "./args.ts";

export function getCliExtensionFactories(_parsed: Args, baseFactories: ExtensionFactory[] = []): ExtensionFactory[] {
	const factories = [...baseFactories];
	if (!factories.includes(financeAgentExtension)) factories.push(financeAgentExtension);
	if (!factories.includes(cryptoAgentExtension)) factories.push(cryptoAgentExtension);
	return factories;
}
