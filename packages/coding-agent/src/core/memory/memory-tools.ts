import type { Stats } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { Type } from "typebox";
import { CONFIG_DIR_NAME } from "../../config.ts";
import { defineTool, type ExtensionContext } from "../extensions/types.ts";
import { getDefaultSessionDir } from "../session-manager.ts";
import { searchMemorySqliteIndex } from "./memory-index.ts";
import type {
	MemoryProvider,
	MemoryProviderError,
	MemoryProviderTool,
	MemoryProviderToolCallContext,
} from "./memory-provider.ts";
import { scanMemoryContent, scanMemoryReportContent, validateMemoryEntryMetadata } from "./memory-security.ts";
import {
	type MemorySessionSearchMatch,
	type MemorySessionSearchResult,
	searchSessionMemory,
} from "./memory-session-search.ts";
import { MEMORY_ENTRY_DELIMITER, MemoryStore } from "./memory-store.ts";
import type {
	MemoryAuditResult,
	MemoryNamespaceConfig,
	MemorySearchMatch,
	MemorySearchResult,
	MemoryTargetConfig,
} from "./memory-types.ts";

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

const MAX_MEMORY_ERROR_CURRENT_ENTRIES_CHARS = 1000;

type MemoryWritePolicyDecision = "allow" | "suggest_review" | "block";

interface MemoryWritePolicyOperation {
	action: "add" | "replace" | "remove";
	content?: string;
	oldText?: string;
}

interface MemoryWritePolicyParams {
	namespace: string;
	target: string;
	action?: "add" | "replace" | "remove";
	content?: string;
	oldText?: string;
	operations?: MemoryWritePolicyOperation[];
}

interface MemoryIndexSearchParams {
	query?: string;
	namespace?: string;
	target?: string;
	layer?: string;
	symbol?: string;
	reportPath?: string;
	sourcePath?: string;
	ignoreCase?: boolean;
	limit?: number;
}

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

async function validateResearchSourcePath(cwd: string, path: string): Promise<string> {
	const projectRelativePath = assertProjectRelativePath(cwd, path);
	let sourceStat: Stats;
	try {
		sourceStat = await stat(resolve(cwd, projectRelativePath));
	} catch {
		throw new Error(`Research source path does not exist: ${projectRelativePath}`);
	}
	if (!sourceStat.isFile()) {
		throw new Error(`Research source path must be a file: ${projectRelativePath}`);
	}
	return projectRelativePath;
}

async function validateSessionSourcePath(cwd: string, path: string, line: number): Promise<string> {
	const resolvedCwd = resolve(cwd);
	const absolutePath = isAbsolute(path) ? resolve(path) : resolve(cwd, path);
	const projectRelativePath = relative(resolvedCwd, absolutePath);
	let sourceStat: Stats;
	try {
		sourceStat = await stat(absolutePath);
	} catch {
		throw new Error(`session source path does not exist: ${projectRelativePath}`);
	}
	if (!sourceStat.isFile()) {
		throw new Error(`session source path must be a file: ${projectRelativePath}`);
	}
	const projectSessionRoot = resolve(cwd, CONFIG_DIR_NAME, "agent", "sessions");
	const defaultSessionRoot = resolve(getDefaultSessionDir(cwd));
	if (!pathIsInside(projectSessionRoot, absolutePath) && !pathIsInside(defaultSessionRoot, absolutePath)) {
		throw new Error(
			`session source path must be under ${CONFIG_DIR_NAME}/agent/sessions or the configured Pi session directory: ${projectRelativePath}`,
		);
	}
	if (!projectRelativePath.endsWith(".jsonl")) {
		throw new Error(`session source path must be a .jsonl file: ${projectRelativePath}`);
	}
	const sourceLine = Math.max(1, Math.floor(line));
	const content = await readFile(absolutePath, "utf8");
	const lines = content.split(/\r?\n/);
	const rawLine = lines[sourceLine - 1];
	if (rawLine === undefined || rawLine.trim().length === 0) {
		throw new Error(`session source line does not exist: ${projectRelativePath}:${sourceLine}`);
	}
	let entry: { type?: unknown; message?: { role?: unknown } };
	try {
		entry = JSON.parse(rawLine) as { type?: unknown; message?: { role?: unknown } };
	} catch {
		throw new Error(`session source line is not valid json: ${projectRelativePath}:${sourceLine}`);
	}
	if (entry.type !== "message" || (entry.message?.role !== "user" && entry.message?.role !== "assistant")) {
		throw new Error(`session source line is not a user/assistant message: ${projectRelativePath}:${sourceLine}`);
	}
	return projectRelativePath;
}

function pathIsInside(root: string, path: string): boolean {
	const rel = relative(resolve(root), resolve(path));
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function buildResearchReportPath(title: string): string {
	return `.pi/research/${utcStamp()}-${slugify(title)}.md`;
}

async function writeResearchReportFile(cwd: string, relativePath: string, content: string): Promise<void> {
	const absolutePath = join(cwd, relativePath);
	await mkdir(join(cwd, ".pi", "research"), { recursive: true });
	await writeFile(absolutePath, content, "utf8");
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

function formatAudit(result: MemoryAuditResult): string {
	return [
		`memory_audit: namespaces=${result.namespaces} targets=${result.targets} entries=${result.entries} chars=${result.chars}`,
		...result.targetsDetail.map(
			(target) =>
				`${target.namespace}/${target.target} | ${target.relativePath} | layer=${target.layer} | entries=${target.entries} | chars=${target.chars}/${target.charLimit} | usage=${target.usagePct}% | duplicateEntries=${target.duplicateEntries} | staleEntries=${target.staleEntries} | inject=${target.injectPolicy} | risk=${target.risk} | ${target.description}`,
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
		lines.push(
			`${match.relativePath}:${match.line}: score=${match.score} snippet=${match.snippet} text=${match.text}`,
		);
		for (const after of match.contextAfter) {
			lines.push(`${match.relativePath}-${after.line}- ${after.text}`);
		}
	}
	return lines.join("\n");
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildIndexQuery(params: MemoryIndexSearchParams): string {
	return [params.query, params.symbol, params.reportPath, params.sourcePath]
		.map((value) => value?.trim())
		.filter((value): value is string => Boolean(value))
		.join(" ");
}

function metadataHasSymbol(text: string, symbol: string, ignoreCase: boolean): boolean {
	return (
		metadataListHasValue(text, "symbol", symbol, ignoreCase) ||
		metadataListHasValue(text, "symbols", symbol, ignoreCase)
	);
}

function textIncludes(text: string, needle: string, ignoreCase: boolean): boolean {
	return ignoreCase ? text.toLowerCase().includes(needle.toLowerCase()) : text.includes(needle);
}

function metadataValues(text: string, key: string): string[] {
	const pattern = new RegExp(`(?:^|[|\\n])\\s*${escapeRegExp(key)}\\s*=\\s*([^|\\n]+)`, "gi");
	const values: string[] = [];
	let match = pattern.exec(text);
	while (match) {
		values.push(match[1].trim());
		match = pattern.exec(text);
	}
	return values;
}

function metadataListHasValue(text: string, key: string, value: string, ignoreCase: boolean): boolean {
	const expected = ignoreCase ? value.trim().toLowerCase() : value.trim();
	return metadataValues(text, key)
		.flatMap((entry) => entry.split(","))
		.map((entry) => entry.trim())
		.some((entry) => (ignoreCase ? entry.toLowerCase() : entry) === expected);
}

function queryMatchesAllTerms(text: string, query: string, ignoreCase: boolean): boolean {
	return query
		.trim()
		.split(/\s+/)
		.map((term) => term.trim())
		.filter(Boolean)
		.every((term) => textIncludes(text, term, ignoreCase));
}

function matchesIndexSearchFilters(match: MemorySearchMatch, params: MemoryIndexSearchParams): boolean {
	const ignoreCase = params.ignoreCase ?? true;
	if (params.query?.trim() && !queryMatchesAllTerms(match.text, params.query, ignoreCase)) return false;
	if (params.symbol?.trim() && !metadataHasSymbol(match.text, params.symbol, ignoreCase)) return false;
	if (params.reportPath?.trim() && !metadataListHasValue(match.text, "reportPath", params.reportPath, ignoreCase)) {
		return false;
	}
	if (
		params.sourcePath?.trim() &&
		!metadataListHasValue(match.text, "sourcePaths", params.sourcePath, ignoreCase) &&
		!metadataListHasValue(match.text, "sourcePath", params.sourcePath, ignoreCase)
	) {
		return false;
	}
	return true;
}

function scoreIndexMatch(match: MemorySearchMatch, params: MemoryIndexSearchParams): MemorySearchMatch {
	const ignoreCase = params.ignoreCase ?? true;
	let score = match.score;
	if (params.symbol?.trim() && metadataHasSymbol(match.text, params.symbol, ignoreCase)) score += 100;
	if (params.reportPath?.trim() && metadataListHasValue(match.text, "reportPath", params.reportPath, ignoreCase)) {
		score += 100;
	}
	if (
		params.sourcePath?.trim() &&
		(metadataListHasValue(match.text, "sourcePaths", params.sourcePath, ignoreCase) ||
			metadataListHasValue(match.text, "sourcePath", params.sourcePath, ignoreCase))
	) {
		score += 80;
	}
	return { ...match, score };
}

function formatIndexSearch(result: MemorySearchResult, index: "sqlite_fts5" | "lightweight"): string {
	if (result.matches.length === 0) return `memory_index_search: no matches index=${index}`;
	const lines = [`memory_index_search: matches=${result.matches.length}${result.truncated ? " truncated=true" : ""}`];
	lines[0] += ` index=${index}`;
	for (const match of result.matches) {
		lines.push(
			`${match.relativePath}:${match.line}: target=${match.target} score=${match.score} snippet=${match.snippet} text=${match.text}`,
		);
	}
	return lines.join("\n");
}

async function searchLightweightIndex(
	store: MemoryStore,
	params: MemoryIndexSearchParams,
	query: string,
	limit: number,
): Promise<MemorySearchResult> {
	const raw = await store.search({
		query: params.query?.trim() ? params.query : query,
		namespace: params.namespace,
		target: params.target,
		layer: params.layer,
		ignoreCase: params.ignoreCase,
		limit: Math.max(100, limit * 20),
	});
	const matches = raw.matches
		.filter((match) => matchesIndexSearchFilters(match, params))
		.map((match) => scoreIndexMatch(match, params))
		.sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath) || a.line - b.line)
		.slice(0, limit);
	return { matches, truncated: raw.matches.length > limit || raw.truncated };
}

function formatSessionSearch(result: MemorySessionSearchResult): string {
	if (result.matches.length === 0) return "memory_session_search: no matches";
	const lines = [
		`memory_session_search: matches=${result.matches.length}${result.truncated ? " truncated=true" : ""}`,
	];
	for (const match of result.matches) {
		lines.push(
			`${match.relativePath}:${match.line}: role=${match.role} session=${match.sessionId} at=${match.timestamp} score=${match.score} snippet=${match.snippet} text=${match.text}`,
		);
	}
	return lines.join("\n");
}

function currentMarketFactReason(content: string): string | undefined {
	if (
		/\b(?:current|latest|today(?:'s)?)\s+(?:price|quote|close|market cap)\b/i.test(content) ||
		/\bprice\s+is\s+[-+]?\d+(?:\.\d+)?\b/i.test(content) ||
		/当前价格|最新价格|今日价格/.test(content)
	) {
		return "current_market_fact";
	}
	return undefined;
}

function findMemoryTarget(
	namespaces: MemoryNamespaceConfig[],
	namespaceName: string,
	targetName: string,
): { namespace?: MemoryNamespaceConfig; target?: MemoryTargetConfig } {
	const namespace = namespaces.find((item) => item.namespace === namespaceName);
	return { namespace, target: namespace?.targets.find((item) => item.target === targetName) };
}

function projectedAddChars(store: MemoryStore, namespace: string, target: string, content: string): number {
	const state = store.list({ namespace, target }).entries[0];
	if (!state) return content.trim().length;
	return state.chars + (state.entries.length > 0 ? MEMORY_ENTRY_DELIMITER.length : 0) + content.trim().length;
}

function evaluateWritePolicy(
	store: MemoryStore,
	namespaces: MemoryNamespaceConfig[],
	params: MemoryWritePolicyParams,
): { decision: MemoryWritePolicyDecision; reasons: string[] } {
	const reasons: string[] = [];
	const { namespace, target } = findMemoryTarget(namespaces, params.namespace, params.target);
	if (!namespace) {
		return { decision: "block", reasons: [`unknown_namespace:${params.namespace}`] };
	}
	if (!target) {
		return { decision: "block", reasons: [`unknown_target:${params.target}`] };
	}
	const operations = params.operations?.length
		? params.operations
		: params.action
			? [{ action: params.action, content: params.content, oldText: params.oldText }]
			: [];
	if (operations.length === 0) {
		return { decision: "block", reasons: ["no_memory_operation_supplied"] };
	}

	let blocked = false;
	let review = false;
	for (const [index, operation] of operations.entries()) {
		const prefix = `operation${index + 1}`;
		if (operation.action === "replace" || operation.action === "remove") {
			review = true;
			reasons.push(`${prefix}:destructive_or_overwrite_operation`);
			if (!operation.oldText?.trim()) {
				blocked = true;
				reasons.push(`${prefix}:oldText_required`);
			}
		}
		if (operation.action === "add" || operation.action === "replace") {
			const content = operation.content?.trim();
			if (!content) {
				blocked = true;
				reasons.push(`${prefix}:content_required`);
				continue;
			}
			const scanError = scanMemoryContent(content);
			if (scanError) {
				blocked = true;
				reasons.push(`${prefix}:${scanError}`);
			}
			const metadataError = validateMemoryEntryMetadata(content, target);
			if (metadataError) {
				blocked = true;
				reasons.push(`${prefix}:${metadataError}`);
			}
			const marketReason = currentMarketFactReason(content);
			if (marketReason) {
				review = true;
				reasons.push(`${prefix}:${marketReason}`);
			}
			if (target.layer === "domain" && !/\b(?:sourcePaths?|sourceSession|reportPath)=/i.test(content)) {
				review = true;
				reasons.push(`${prefix}:missing_source_reference`);
			}
			if (
				operation.action === "add" &&
				projectedAddChars(store, params.namespace, params.target, content) > target.charLimit
			) {
				blocked = true;
				reasons.push(`${prefix}:target_capacity_would_exceed_limit`);
			}
		}
	}

	if (blocked) return { decision: "block", reasons };
	if (review) return { decision: "suggest_review", reasons };
	return { decision: "allow", reasons: ["safe_compact_memory_write"] };
}

function formatWritePolicy(
	store: MemoryStore,
	namespaces: MemoryNamespaceConfig[],
	params: MemoryWritePolicyParams,
): string {
	const action = params.operations?.length ? "batch" : (params.action ?? "none");
	const result = evaluateWritePolicy(store, namespaces, params);
	return [
		`memory_write_policy: decision=${result.decision} namespace=${params.namespace} target=${params.target} action=${action} writesPersistentMemory=false`,
		...result.reasons.map((reason) => `reason=${reason}`),
	].join("\n");
}

function extractPromotionAsOf(match: MemorySessionSearchMatch): string {
	const explicit = /\basOf=(\d{4}-\d{2}-\d{2})\b/i.exec(match.text)?.[1];
	if (explicit) return `asOf=${explicit}`;
	return `createdAt=${match.timestamp.slice(0, 10)}`;
}

function extractPromotionSymbol(text: string): string | undefined {
	const symbol = /\b[A-Z]{2,6}\b/.exec(text)?.[0];
	return symbol;
}

function compactPromotionNote(text: string): string {
	return text
		.replace(/\basOf=\d{4}-\d{2}-\d{2}(?:T[^\s,|.]+)?[,.]?/gi, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 280);
}

function suggestPromotionTarget(namespace: MemoryNamespaceConfig, match: MemorySessionSearchMatch): string {
	const text = match.text.toLowerCase();
	const hasTarget = (target: string) => namespace.targets.some((item) => item.target === target);
	if (/\b(preference|prefer|risk posture|output style)\b|偏好|风险偏好/.test(text) && hasTarget("user")) {
		return "user";
	}
	if (match.role === "assistant" && hasTarget("research")) return "research";
	if (/\b(watchlist|track)\b|关注列表|加入关注|加入自选/.test(text) && hasTarget("watchlist")) {
		return "watchlist";
	}
	if (hasTarget("memory")) return "memory";
	return namespace.targets[0]?.target ?? "memory";
}

function formatPromotionSuggestions(namespace: MemoryNamespaceConfig, result: MemorySessionSearchResult): string {
	if (result.matches.length === 0) return "memory_suggest_promotions: no candidates";
	const lines = [
		`memory_suggest_promotions: candidates=${result.matches.length}${result.truncated ? " truncated=true" : ""}`,
	];
	for (const [index, match] of result.matches.entries()) {
		const target = suggestPromotionTarget(namespace, match);
		const symbol = extractPromotionSymbol(match.text);
		const timestamp = extractPromotionAsOf(match);
		const note = compactPromotionNote(match.text);
		const contentDraft = [symbol ? `symbol=${symbol}` : "", timestamp, `note=${note}`].filter(Boolean).join(" | ");
		lines.push(
			[
				`candidate=${index + 1}`,
				`target=${target}`,
				`sourceSessionPath=${match.relativePath}`,
				`sourceLine=${match.line}`,
				`score=${match.score}`,
				`contentDraft=${contentDraft}`,
				"reason=prior session evidence matched query; review and use memory_promote_session to save",
			].join(" "),
		);
	}
	return lines.join("\n");
}

function formatCurrentEntriesForError(entries: string[]): string {
	const compact = entries.join(" | ");
	if (compact.length <= MAX_MEMORY_ERROR_CURRENT_ENTRIES_CHARS) return compact;
	return `${compact.slice(0, MAX_MEMORY_ERROR_CURRENT_ENTRIES_CHARS)} [truncated]`;
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

	const auditTool = defineTool({
		name: "memory_audit",
		label: "Memory Audit",
		description:
			"Audit persistent memory namespaces, targets, usage, paths, inject policies, and compact risk state.",
		promptSnippet: "Audit persistent memory health and capacity",
		promptGuidelines: [
			"Use memory_audit when you need a compact overview of memory state, capacity pressure, paths, and inject policies.",
			"If memory_audit reports risk=duplicate_entries, read the target and compact equivalent entries into one curated memory.",
			"If memory_audit reports risk=stale_market_data, read the target, verify fresh tools or artifacts, and compact or replace the stale entry with a timestamped summary.",
		],
		parameters: Type.Object({
			...namespaceParam,
			...targetParam,
			...layerParam,
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return {
				content: [{ type: "text" as const, text: formatAudit(createStore(ctx, namespaces).audit(params)) }],
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

	const indexSearchTool = defineTool({
		name: "memory_index_search",
		label: "Memory Index Search",
		description:
			"Search SQLite FTS5-backed compact persistent-memory indexes with symbol, reportPath, and sourcePath-aware ranking.",
		promptSnippet: "Search SQLite FTS5 persistent memory indexes",
		promptGuidelines: [
			"Use memory_index_search when looking for symbol-level research indexes, report paths, or source artifact paths; it rebuilds a local SQLite FTS5 derived index from Markdown memory.",
			"Treat results as pointers into memory, reports, or artifacts; read referenced resources before using detailed conclusions.",
		],
		parameters: Type.Object({
			query: Type.Optional(Type.String({ description: "Optional topic keywords, for example Blackwell margin." })),
			...namespaceParam,
			...targetParam,
			...layerParam,
			symbol: Type.Optional(Type.String({ description: "Optional symbol metadata filter, for example NVDA." })),
			reportPath: Type.Optional(Type.String({ description: "Optional reportPath metadata value." })),
			sourcePath: Type.Optional(Type.String({ description: "Optional sourcePaths metadata value." })),
			ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search, default true." })),
			limit: Type.Optional(Type.Number({ description: "Maximum matches to return, default 20." })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const query = buildIndexQuery(params);
			if (!query) {
				return {
					content: [{ type: "text" as const, text: "memory_index_search: no matches index=sqlite_fts5" }],
					details: undefined,
				};
			}
			const limit = Math.max(1, params.limit ?? 20);
			const store = createStore(ctx, namespaces);
			let result: MemorySearchResult;
			let index: "sqlite_fts5" | "lightweight" = "sqlite_fts5";
			try {
				result = await searchMemorySqliteIndex({ cwd: ctx.cwd, namespaces, ...params, limit });
			} catch {
				index = "lightweight";
				result = await searchLightweightIndex(store, params, query, limit);
			}
			return {
				content: [
					{
						type: "text" as const,
						text: formatIndexSearch(result, index),
					},
				],
				details: undefined,
			};
		},
	});

	const writePolicyTool = defineTool({
		name: "memory_write_policy",
		label: "Memory Write Policy",
		description:
			"Review a proposed persistent memory write against safety, freshness, source, and capacity policy without writing memory.",
		promptSnippet: "Review a proposed persistent memory write",
		promptGuidelines: [
			"Use memory_write_policy before uncertain memory_write or memory_promote_session calls.",
			"decision=allow means the proposal looks safe; decision=suggest_review means verify or tighten it; decision=block means do not write.",
			"memory_write_policy is read-only and never writes .pi/memory.",
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
			return {
				content: [
					{
						type: "text" as const,
						text: formatWritePolicy(createStore(ctx, namespaces), namespaces, params),
					},
				],
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
						result.currentEntries?.length
							? `currentEntries=${formatCurrentEntriesForError(result.currentEntries)}`
							: "",
					]
						.filter(Boolean)
						.join("\n");
			return { content: [{ type: "text" as const, text }], details: undefined, isError: !result.success };
		},
	});

	const compactTool = defineTool({
		name: "memory_compact",
		label: "Memory Compact",
		description:
			"Replace one persistent memory target with a single compact curated entry after reading the current entries.",
		promptSnippet: "Compact a persistent memory target",
		promptGuidelines: [
			"Use memory_compact after memory_audit/read shows a target is too large or stale.",
			"Read the target first and pass the observed sourceEntryCount so stale compactions do not overwrite newer memory.",
			"Write a compact, sourced summary only; do not save raw data dumps, secrets, or current market prices.",
		],
		parameters: Type.Object({
			namespace: Type.String({ description: "Memory namespace, for example finance." }),
			target: Type.String({ description: "Memory target inside the namespace." }),
			sourceEntryCount: Type.Number({
				description: "Entry count observed from memory_list, memory_audit, or memory_read before compaction.",
			}),
			content: Type.String({ description: "Single compact replacement entry for this target." }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await createStore(ctx, namespaces).compact(params);
			const text = result.success
				? `memory_compact: success namespace=${result.namespace} target=${result.target} previousEntries=${result.previousEntryCount} entries=${result.entryCount} usage=${result.usage} message=${result.message}`
				: `memory_compact: error namespace=${result.namespace} target=${result.target} previousEntries=${result.previousEntryCount} entries=${result.entryCount} usage=${result.usage}\nerror=${result.error}`;
			return { content: [{ type: "text" as const, text }], details: result, isError: !result.success };
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

	const suggestPromotionsTool = defineTool({
		name: "memory_suggest_promotions",
		label: "Memory Suggest Promotions",
		description:
			"Suggest compact curated-memory candidates from prior session evidence without writing persistent memory.",
		promptSnippet: "Suggest prior session evidence that may be promoted into curated memory",
		promptGuidelines: [
			"Use memory_suggest_promotions to review candidate durable preferences, thesis notes, watchlist items, or workflow lessons from prior sessions.",
			"Do not treat suggestions as written memory; call memory_promote_session with the suggested source path and line only after deciding a candidate is worth saving.",
			"Verify market-sensitive suggestions before reuse because session evidence is historical context.",
		],
		parameters: Type.Object({
			namespace: Type.String({ description: "Memory namespace, for example finance." }),
			query: Type.String({ description: "Search words, for example 'NVDA capex'." }),
			limit: Type.Optional(Type.Number({ description: "Maximum candidates to return, default 10." })),
			ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search, default true." })),
			sessionDir: Type.Optional(
				Type.String({
					description:
						"Optional session directory override for tests or custom session storage. Defaults to the current project's Pi session directory.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const namespace = namespaces.find((item) => item.namespace === params.namespace);
			if (!namespace) {
				return {
					content: [
						{
							type: "text" as const,
							text: `memory_suggest_promotions: error unknown namespace ${params.namespace}`,
						},
					],
					details: undefined,
					isError: true,
				};
			}
			const result = await searchSessionMemory({
				cwd: ctx.cwd,
				query: params.query,
				sessionDir: params.sessionDir,
				limit: params.limit ?? 10,
				ignoreCase: params.ignoreCase,
			});
			return {
				content: [{ type: "text" as const, text: formatPromotionSuggestions(namespace, result) }],
				details: undefined,
			};
		},
	});

	const sessionPromoteTool = defineTool({
		name: "memory_promote_session",
		label: "Memory Promote Session",
		description:
			"Promote a compact, durable conclusion from a prior session search result into persistent curated memory with explicit session source evidence.",
		promptSnippet: "Promote prior session evidence into curated memory",
		promptGuidelines: [
			"Use memory_promote_session only after memory_session_search found prior session evidence worth preserving.",
			"Promote compact durable preferences, thesis notes, watchlist items, or workflow lessons; do not promote raw session dumps.",
			"Treat promoted market-sensitive conclusions as historical; include asOf or createdAt and verify current facts before reuse.",
		],
		parameters: Type.Object({
			namespace: Type.String({ description: "Memory namespace, for example finance." }),
			target: Type.String({ description: "Memory target inside the namespace." }),
			content: Type.String({
				description: "Compact curated memory entry to write. Include asOf or createdAt for market-sensitive notes.",
			}),
			sourceSessionPath: Type.String({
				description: "Project-relative .pi/agent/sessions/*.jsonl path returned by memory_session_search.",
			}),
			sourceLine: Type.Number({ description: "Line number from memory_session_search output." }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			let sourceSessionPath: string;
			const sourceLine = Math.max(1, Math.floor(params.sourceLine));
			try {
				sourceSessionPath = await validateSessionSourcePath(ctx.cwd, params.sourceSessionPath, sourceLine);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text" as const, text: `memory_promote_session: error ${message}` }],
					details: { error: message },
					isError: true,
				};
			}
			const sourceSession = `${sourceSessionPath}:${sourceLine}`;
			const result = await createStore(ctx, namespaces).write({
				namespace: params.namespace,
				target: params.target,
				action: "add",
				content: `${params.content.trim()} | sourceSession=${sourceSession}`,
			});
			return {
				content: [
					{
						type: "text" as const,
						text: result.success
							? `memory_promote_session: success namespace=${result.namespace} target=${result.target} sourceSession=${sourceSession} usage=${result.usage} entries=${result.entryCount} message=${result.message}`
							: `memory_promote_session: error namespace=${result.namespace} target=${result.target} sourceSession=${sourceSession} error=${result.error}`,
					},
				],
				details: { sourceSession, memory: result },
				isError: !result.success,
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
			const reportScanError = scanMemoryReportContent(params.content);
			if (reportScanError) {
				return {
					content: [{ type: "text" as const, text: `memory_research_report: error ${reportScanError}` }],
					details: { error: reportScanError },
					isError: true,
				};
			}
			let sourcePaths: string[];
			try {
				sourcePaths = await Promise.all(
					(params.sourcePaths ?? []).map((path) => validateResearchSourcePath(ctx.cwd, path)),
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text" as const, text: `memory_research_report: error ${message}` }],
					details: { error: message },
					isError: true,
				};
			}
			const reportPath = buildResearchReportPath(params.title);
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
			if (result.success) {
				try {
					await writeResearchReportFile(ctx.cwd, reportPath, params.content);
				} catch (error) {
					const rollback = await createStore(ctx, namespaces).write({
						namespace: params.namespace,
						target: params.target ?? "research",
						action: "remove",
						oldText: reportPath,
					});
					const message = error instanceof Error ? error.message : String(error);
					return {
						content: [
							{
								type: "text" as const,
								text: `memory_research_report: error report_write_failed reportPath=${reportPath} rollback=${rollback.success ? "success" : "failed"} error=${message}`,
							},
						],
						details: { reportPath, memory: result, rollback, error: message },
						isError: true,
					};
				}
			}
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

	return [
		listTool,
		readTool,
		searchTool,
		writeTool,
		indexSearchTool,
		writePolicyTool,
		compactTool,
		sessionSearchTool,
		suggestPromotionsTool,
		sessionPromoteTool,
		researchReportTool,
		auditTool,
	];
}

function formatProviderToolResult(result: unknown): string {
	const text = typeof result === "string" ? result : (JSON.stringify(result) ?? String(result));
	if (text.length <= 2000) return text;
	return `${text.slice(0, 2000)}\n[truncated]`;
}

export function createMemoryProviderTools(
	providers: MemoryProvider[],
	options: {
		context?: MemoryProviderToolCallContext;
		onProviderError?: (provider: MemoryProvider, phase: MemoryProviderError["phase"], error: unknown) => void;
		reservedToolNames?: Set<string>;
	} = {},
) {
	const registeredProviderToolNames = new Set<string>();
	return providers.flatMap((provider) => {
		let providerTools: MemoryProviderTool[] = [];
		try {
			providerTools = provider.getToolDefinitions?.() ?? [];
		} catch (error) {
			options.onProviderError?.(provider, "getToolDefinitions", error);
			return [];
		}
		return providerTools.flatMap((providerTool) => {
			if (options.reservedToolNames?.has(providerTool.name)) {
				options.onProviderError?.(
					provider,
					"toolRegistration",
					new Error(`tool name conflicts with core memory tool: ${providerTool.name}`),
				);
				return [];
			}
			if (registeredProviderToolNames.has(providerTool.name)) {
				options.onProviderError?.(
					provider,
					"toolRegistration",
					new Error(`tool name conflicts with another memory provider tool: ${providerTool.name}`),
				);
				return [];
			}
			registeredProviderToolNames.add(providerTool.name);
			return [
				defineTool({
					name: providerTool.name,
					label: providerTool.name,
					description: providerTool.description,
					promptSnippet: providerTool.description,
					promptGuidelines: [
						"Treat external memory provider tool results as historical/background context, not current market data.",
					],
					parameters: providerTool.parameters,
					async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
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
						try {
							const result = await provider.handleToolCall(providerTool.name, params, {
								cwd: ctx.cwd,
								sessionId: options.context?.sessionId ?? ctx.sessionManager.getSessionId(),
								namespace: options.context?.namespace,
							});
							return {
								content: [{ type: "text" as const, text: formatProviderToolResult(result) }],
								details: result,
							};
						} catch (error) {
							const message = error instanceof Error ? error.message : String(error);
							options.onProviderError?.(provider, "handleToolCall", error);
							return {
								content: [
									{
										type: "text" as const,
										text: `memory provider tool error: provider=${provider.name} tool=${providerTool.name} error=${message}`,
									},
								],
								details: { provider: provider.name, tool: providerTool.name, error: message },
								isError: true,
							};
						}
					},
				}),
			];
		});
	});
}
