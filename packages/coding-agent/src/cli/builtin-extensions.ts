import type { ExtensionFactory } from "../core/extensions/types.ts";
import financeAgentExtension from "../core/finance-agent-extension.ts";
import type { Args } from "./args.ts";

export function getCliExtensionFactories(_parsed: Args, baseFactories: ExtensionFactory[] = []): ExtensionFactory[] {
	if (baseFactories.includes(financeAgentExtension)) {
		return baseFactories;
	}
	return [...baseFactories, financeAgentExtension];
}
