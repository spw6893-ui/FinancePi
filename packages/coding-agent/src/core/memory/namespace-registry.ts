import type { MemoryNamespaceConfig } from "./memory-types.ts";

export function createFinanceMemoryNamespace(): MemoryNamespaceConfig {
	return {
		namespace: "finance",
		root: ".pi/memory/finance",
		description: "Finance research memory",
		targets: [
			{
				target: "user",
				layer: "user",
				file: "USER.md",
				charLimit: 1800,
				injectPolicy: "always",
				description:
					"Finance-specific user preferences, risk posture, data-source preferences, and output preferences.",
			},
			{
				target: "memory",
				layer: "long_term",
				file: "MEMORY.md",
				charLimit: 2200,
				injectPolicy: "summary",
				description: "Finance agent operational notes and durable lessons.",
			},
			{
				target: "watchlist",
				layer: "domain",
				file: "WATCHLIST.md",
				charLimit: 4000,
				injectPolicy: "search_only",
				description: "Assets, symbols, markets, and themes the user wants to track.",
			},
			{
				target: "symbol_notes",
				layer: "domain",
				file: "SYMBOL_NOTES.md",
				charLimit: 6000,
				injectPolicy: "search_only",
				description: "Durable symbol-level thesis, risks, and tracking checklists.",
			},
			{
				target: "research",
				layer: "domain",
				file: "RESEARCH.md",
				charLimit: 8000,
				injectPolicy: "search_only",
				description: "Reusable research conclusions, source paths, open questions, and as-of notes.",
			},
			{
				target: "long_term",
				layer: "long_term",
				file: "LONG_TERM.md",
				charLimit: 3000,
				injectPolicy: "summary",
				description: "Long-term finance research workflow rules and reusable checklists.",
			},
		],
		promptGuidelines: [
			"Use namespace=finance for finance memory.",
			"Do not treat finance memory as fresh market data; verify market-sensitive claims with tools or artifacts.",
			"Save durable preferences, watchlist items, thesis notes, and workflow lessons; do not save raw prices, raw news lists, or large tool outputs.",
		],
	};
}
