import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { Type } from "typebox";
import { defineTool, type ExtensionContext } from "../extensions/types.ts";
import type { MemoryProvider } from "./memory-provider.ts";
import { type MemorySessionSearchResult, searchSessionMemory } from "./memory-session-search.ts";
import { MemoryStore } from "./memory-store.ts";
import type { MemoryNamespaceConfig, MemorySearchResult } from "./memory-types.ts";

const namespaceParam = {
	namespace: Type.Optional(Type.String({ description: "Memory namespace, for example finance." })),
};

const targetParam = {
	target: Type.Optional(Type.String({ description: "Memory target inside the namespace." })),
};

const layerParam = {
	layer: Type.Optional(
		Type.Union([Type.Literal("user"), Type.Literal("domain"), Type.Literal("long_term")], {
			description: "Optional memory layer filter.",
		}),
	),
};

function slugify(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 80) || "research-report"
	);
}

function utcStamp(date = new Date()): string {
	return date.toISOString().replace(/[:.]/g, "-");
}

function assertProjectRelativePath(cwd: string, path: string): string {
	if (isAbsolute(path)) throw new Error("Research source path must be project-relative.");
	const absolute = resolve(cwd, path);
	const rel = relative(resolve(cwd), absolute);
	if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Research source path escapes project root.");
	return path;
}

async function writeResearchReportFile(cwd: string, title: string, content: string): Promise<string> {
	const relativePath = `.pi/research/${utcStamp()}-${slugify(title)}.md`;
	const absolutePath = join(cwd, relativePath);
	await mkdir(join(cwd, ".pi", "research"), { recursive: true });
	await writeFile(absolutePath, content, "utf8");
	return relativePath;
}

function createStore(ctx: ExtensionContext, namespaces: MemoryNamespaceConfig[]): MemoryStore {
	return new MemoryStore({ cwd: ctx.cwd, namespaces });
}

function formatList(store: MemoryStore, params: { namespace?: string; target?: string; layer?: string }): string {
	const list = store.list(params);
	if (list.entries.length === 0) return "memory_list: none";
	return [
		`memory_list: count=${list.entries.length}`,
		...list.entries.map(
			(entry) =>
				`${entry.namespace}/${entry.target} | ${entry.relativePath} | layer=${entry.layer} | entries=${entry.entries.length} | chars=${entry.chars}/${entry.charLimit} | inject=${entry.injectPolicy}`,
		),
	].join("\n");
}

function formatSearch(result: MemorySearchResult): string {
	if (result.matches.length === 0) return "memory_search: no matches";
	const lines = [`memory_search: matches=${result.matches.length}${result.truncated ? " truncated=true" : ""}`];
	for (const match of result.matches) {
		for (const before of match.contextBefore) {
			lines.push(`${match.relativePath}-${before.line}- ${before.text}`);
		}
		lines.push(`${match.relativePath}:${match.line}: ${match.text}`);
		for (const after of match.contextAfter) {
			lines.push(`${match.relativePath}-${after.line}- ${after.text}`);
		}
	}
	return lines.join("\n");
}

function formatSessionSearch(result: MemorySessionSearchResult): string {
	if (result.matches.length === 0) return "memory_session_search: no matches";
	const lines = [
		`memory_session_search: matches=${result.matches.length}${result.truncated ? " truncated=true" : ""}`,
	];
	for (const match of result.matches) {
		lines.push(
			`${match.relativePath}:${match.line}: role=${match.role} session=${match.sessionId} at=${match.timestamp} text=${match.text}`,
		);
	}
	return lines.join("\n");
}

export function createMemoryTools(namespaces: MemoryNamespaceConfig[]) {
	const listTool = defineTool({
		name: "memory_list",
		label: "Memory List",
		description: "List configured persistent memory namespaces and targets.",
		promptSnippet: "List persistent memory namespaces and targets",
		promptGuidelines: [
			"Use memory_list to discover available memory targets before reading or writing persistent memory.",
		],
		parameters: Type.Object({
			...namespaceParam,
			...targetParam,
			...layerParam,
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return {
				content: [{ type: "text" as const, text: formatList(createStore(ctx, namespaces), params) }],
				details: undefined,
			};
		},
	});

	const readTool = defineTool({
		name: "memory_read",
		label: "Memory Read",
		description: "Read a persistent memory target by namespace and target.",
		promptSnippet: "Read a persistent memory target",
		promptGuidelines: ["Use memory_read after memory_search/list when exact memory content is needed."],
		parameters: Type.Object({
			namespace: Type.String({ description: "Memory namespace, for example finance." }),
			target: Type.String({ description: "Memory target inside the namespace." }),
			offset: Type.Optional(Type.Number({ description: "Line number to start reading from, 1-indexed." })),
			limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read." })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await createStore(ctx, namespaces).read(params);
			return {
				content: [
					{
						type: "text" as const,
						text: [
							`memory_read: ${result.namespace}/${result.target} ${result.relativePath} lines=${result.startLine}-${result.endLine}/${result.totalLines}`,
							result.text,
						].join("\n"),
					},
				],
				details: undefined,
			};
		},
	});

	const searchTool = defineTool({
		name: "memory_search",
		label: "Memory Search",
		description: "Search persistent memory across namespaces and targets.",
		promptSnippet: "Search persistent memory",
		promptGuidelines: [
			"Use memory_search before asking users to repeat known preferences, watchlists, prior research, or durable workflow rules.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Search text or regex pattern." }),
			...namespaceParam,
			...targetParam,
			...layerParam,
			literal: Type.Optional(Type.Boolean({ description: "Treat query as literal text, default true." })),
			ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search, default true." })),
			limit: Type.Optional(Type.Number({ description: "Maximum matches to return, default 50." })),
			context: Type.Optional(Type.Number({ description: "Surrounding lines to include, default 0." })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return {
				content: [{ type: "text" as const, text: formatSearch(await createStore(ctx, namespaces).search(params)) }],
				details: undefined,
			};
		},
	});

	const writeTool = defineTool({
		name: "memory_write",
		label: "Memory Write",
		description:
			"Write durable persistent memory. Save only compact, reusable facts or preferences; do not save raw data dumps, secrets, or fresh market prices.",
		promptSnippet: "Write compact persistent memory",
		promptGuidelines: [
			"Use memory_write only for durable preferences, research notes, watchlist items, or workflow lessons.",
			"Do not save current prices, raw news lists, large tool outputs, API keys, or unsourced market claims.",
		],
		parameters: Type.Object({
			namespace: Type.String({ description: "Memory namespace, for example finance." }),
			target: Type.String({ description: "Memory target inside the namespace." }),
			action: Type.Optional(Type.Union([Type.Literal("add"), Type.Literal("replace"), Type.Literal("remove")])),
			content: Type.Optional(Type.String({ description: "Entry content for add/replace." })),
			oldText: Type.Optional(Type.String({ description: "Unique substring for replace/remove." })),
			operations: Type.Optional(
				Type.Array(
					Type.Object({
						action: Type.Union([Type.Literal("add"), Type.Literal("replace"), Type.Literal("remove")]),
						content: Type.Optional(Type.String()),
						oldText: Type.Optional(Type.String()),
					}),
				),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await createStore(ctx, namespaces).write(params);
			const text = result.success
				? `memory_write: success namespace=${result.namespace} target=${result.target} usage=${result.usage} entries=${result.entryCount} message=${result.message}`
				: [
						`memory_write: error namespace=${result.namespace} target=${result.target} usage=${result.usage} entries=${result.entryCount}`,
						`error=${result.error}`,
						result.currentEntries?.length ? `currentEntries=${result.currentEntries.join(" | ")}` : "",
					]
						.filter(Boolean)
						.join("\n");
			return { content: [{ type: "text" as const, text }], details: undefined, isError: !result.success };
		},
	});

	const sessionSearchTool = defineTool({
		name: "memory_session_search",
		label: "Memory Session Search",
		description:
			"Search prior project session messages for historical user questions and assistant conclusions. Use this for 'what did we discuss last time' recall; verify market-sensitive conclusions before reuse.",
		promptSnippet: "Search prior project session memory",
		promptGuidelines: [
			"Use memory_session_search when the user asks about previous discussions, prior conclusions, or historical research context.",
			"Treat session memory as historical context, not current market data; verify current facts with tools or artifacts.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Search words, for example 'NVDA capex'." }),
			limit: Type.Optional(Type.Number({ description: "Maximum matches to return, default 20." })),
			ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search, default true." })),
			sessionDir: Type.Optional(
				Type.String({
					description:
						"Optional session directory override for tests or custom session storage. Defaults to the current project's Pi session directory.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await searchSessionMemory({
				cwd: ctx.cwd,
				query: params.query,
				sessionDir: params.sessionDir,
				limit: params.limit,
				ignoreCase: params.ignoreCase,
			});
			return {
				content: [{ type: "text" as const, text: formatSessionSearch(result) }],
				details: undefined,
			};
		},
	});

	const researchReportTool = defineTool({
		name: "memory_research_report",
		label: "Memory Research Report",
		description:
			"Write a long research report to .pi/research and index only a compact summary/path in persistent memory.",
		promptSnippet: "Persist a long research report and compact memory index",
		promptGuidelines: [
			"Use memory_research_report after a substantial research pass when the full notes are worth preserving.",
			"Keep summary compact and include asOf or createdAt for market-sensitive finance research.",
			"Do not use this for raw market data dumps; save full data as artifacts and reference artifact paths.",
		],
		parameters: Type.Object({
			namespace: Type.String({ description: "Memory namespace, for example finance." }),
			title: Type.String({ description: "Human-readable research report title." }),
			summary: Type.String({
				description: "Compact memory index summary. Include asOf=YYYY-MM-DD or createdAt=YYYY-MM-DD.",
			}),
			content: Type.String({ description: "Full Markdown research report body to write under .pi/research." }),
			target: Type.Optional(Type.String({ description: "Memory target for the compact index, default research." })),
			symbols: Type.Optional(Type.Array(Type.String({ description: "Related symbols or assets." }))),
			sourcePaths: Type.Optional(
				Type.Array(
					Type.String({ description: "Project-relative artifact/report/source paths used by this research." }),
				),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const sourcePaths = (params.sourcePaths ?? []).map((path) => assertProjectRelativePath(ctx.cwd, path));
			const reportPath = await writeResearchReportFile(ctx.cwd, params.title, params.content);
			const indexEntry = [
				params.summary.trim(),
				`reportPath=${reportPath}`,
				params.symbols?.length ? `symbols=${params.symbols.join(",")}` : "",
				sourcePaths.length ? `sourcePaths=${sourcePaths.join(",")}` : "",
			]
				.filter(Boolean)
				.join(" | ");
			const result = await createStore(ctx, namespaces).write({
				namespace: params.namespace,
				target: params.target ?? "research",
				action: "add",
				content: indexEntry,
			});
			return {
				content: [
					{
						type: "text" as const,
						text: result.success
							? `memory_research_report: success namespace=${result.namespace} target=${result.target} reportPath=${reportPath} usage=${result.usage} entries=${result.entryCount}`
							: `memory_research_report: error namespace=${result.namespace} target=${result.target} reportPath=${reportPath} error=${result.error}`,
					},
				],
				details: { reportPath, memory: result },
				isError: !result.success,
			};
		},
	});

	return [listTool, readTool, searchTool, writeTool, sessionSearchTool, researchReportTool];
}

function formatProviderToolResult(result: unknown): string {
	const text = typeof result === "string" ? result : (JSON.stringify(result) ?? String(result));
	if (text.length <= 2000) return text;
	return `${text.slice(0, 2000)}\n[truncated]`;
}

export function createMemoryProviderTools(providers: MemoryProvider[]) {
	return providers.flatMap((provider) =>
		(provider.getToolDefinitions?.() ?? []).map((providerTool) =>
			defineTool({
				name: providerTool.name,
				label: providerTool.name,
				description: providerTool.description,
				promptSnippet: providerTool.description,
				promptGuidelines: [
					"Treat external memory provider tool results as historical/background context, not current market data.",
				],
				parameters: providerTool.parameters,
				async execute(_toolCallId, params) {
					if (!provider.handleToolCall) {
						return {
							content: [
								{
									type: "text" as const,
									text: `memory provider tool error: provider ${provider.name} cannot handle ${providerTool.name}`,
								},
							],
							details: undefined,
							isError: true,
						};
					}
					const result = await provider.handleToolCall(providerTool.name, params);
					return {
						content: [{ type: "text" as const, text: formatProviderToolResult(result) }],
						details: result,
					};
				},
			}),
		),
	);
}
