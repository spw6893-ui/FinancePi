import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { scanMemoryContent, validateMemoryEntryMetadata } from "./memory-security.ts";
import type {
	MemoryAuditResult,
	MemoryEntryOperation,
	MemoryListResult,
	MemoryNamespaceConfig,
	MemoryReadResult,
	MemorySearchMatch,
	MemorySearchResult,
	MemoryTargetConfig,
	MemoryTargetState,
	MemoryWriteResult,
} from "./memory-types.ts";

export const MEMORY_ENTRY_DELIMITER = "\n§\n";

interface MemoryStoreOptions {
	cwd: string;
	namespaces: MemoryNamespaceConfig[];
}

interface ResolvedTarget {
	config: MemoryNamespaceConfig;
	target: MemoryTargetConfig;
	absolutePath: string;
	relativePath: string;
}

function normalizeTargetName(value: string): string {
	return value.trim();
}

function charsForEntries(entries: string[]): number {
	return entries.length === 0 ? 0 : entries.join(MEMORY_ENTRY_DELIMITER).length;
}

function usageText(chars: number, limit: number): string {
	const pct = limit > 0 ? Math.min(100, Math.floor((chars / limit) * 100)) : 0;
	return `${pct}% - ${chars}/${limit} chars`;
}

function usagePct(chars: number, limit: number): number {
	return limit > 0 ? Math.min(100, Math.floor((chars / limit) * 100)) : 0;
}

function queryTerms(query: string, ignoreCase: boolean): string[] {
	const normalized = ignoreCase ? query.toLowerCase() : query;
	return normalized
		.split(/\s+/)
		.map((term) => term.trim())
		.filter(Boolean);
}

function scoreTerms(text: string, terms: string[], ignoreCase: boolean): number {
	const normalized = ignoreCase ? text.toLowerCase() : text;
	let score = 0;
	for (const term of terms) {
		let offset = normalized.indexOf(term);
		if (offset === -1) continue;
		score += 10;
		while (offset !== -1) {
			score += 1;
			offset = normalized.indexOf(term, offset + term.length);
		}
	}
	return score;
}

function buildSearchSnippet(text: string, terms: string[], ignoreCase: boolean): string {
	const normalizedText = text.replace(/\s+/g, " ").trim();
	const searchable = ignoreCase ? normalizedText.toLowerCase() : normalizedText;
	const firstMatch = terms
		.map((term) => searchable.indexOf(term))
		.filter((index) => index >= 0)
		.sort((a, b) => a - b)[0];
	if (firstMatch === undefined || normalizedText.length <= 220) return normalizedText.slice(0, 220);
	const start = Math.max(0, firstMatch - 80);
	const end = Math.min(normalizedText.length, start + 220);
	return `${start > 0 ? "..." : ""}${normalizedText.slice(start, end)}${end < normalizedText.length ? "..." : ""}`;
}

export class MemoryStore {
	private readonly cwd: string;
	private readonly namespaces = new Map<string, MemoryNamespaceConfig>();

	constructor(options: MemoryStoreOptions) {
		this.cwd = resolve(options.cwd);
		for (const namespace of options.namespaces) {
			this.namespaces.set(namespace.namespace, namespace);
		}
	}

	list(options: { namespace?: string; target?: string; layer?: string } = {}): MemoryListResult {
		const entries: MemoryTargetState[] = [];
		for (const namespace of this.selectedNamespaces(options.namespace)) {
			for (const target of namespace.targets) {
				if (options.target && target.target !== options.target) continue;
				if (options.layer && target.layer !== options.layer) continue;
				entries.push(this.getTargetStateSync(namespace, target));
			}
		}
		return { entries };
	}

	audit(options: { namespace?: string; target?: string; layer?: string } = {}): MemoryAuditResult {
		const states = this.list(options).entries;
		return {
			namespaces: new Set(states.map((state) => state.namespace)).size,
			targets: states.length,
			entries: states.reduce((sum, state) => sum + state.entries.length, 0),
			chars: states.reduce((sum, state) => sum + state.chars, 0),
			targetsDetail: states.map((state) => {
				const pct = usagePct(state.chars, state.charLimit);
				return {
					namespace: state.namespace,
					target: state.target,
					layer: state.layer,
					relativePath: state.relativePath,
					entries: state.entries.length,
					chars: state.chars,
					charLimit: state.charLimit,
					usagePct: pct,
					injectPolicy: state.injectPolicy,
					risk:
						state.chars > state.charLimit
							? "over_limit"
							: pct >= 80
								? "near_limit"
								: state.entries.length === 0
									? "empty"
									: "ok",
					description: state.description,
				};
			}),
		};
	}

	async read(options: {
		namespace: string;
		target: string;
		offset?: number;
		limit?: number;
	}): Promise<MemoryReadResult> {
		const resolved = this.resolveTarget(options.namespace, options.target);
		const content = await this.readRawFile(resolved.absolutePath);
		const lines = content ? content.split(/\r?\n/) : [];
		const start = Math.max(0, (options.offset ?? 1) - 1);
		const limit = Math.max(1, options.limit ?? 200);
		const selected = lines.slice(start, start + limit);
		return {
			namespace: resolved.config.namespace,
			target: resolved.target.target,
			relativePath: resolved.relativePath,
			startLine: lines.length === 0 ? 0 : start + 1,
			endLine: lines.length === 0 ? 0 : Math.min(lines.length, start + selected.length),
			totalLines: lines.length,
			text: selected.join("\n"),
		};
	}

	async search(options: {
		query: string;
		namespace?: string;
		target?: string;
		layer?: string;
		literal?: boolean;
		ignoreCase?: boolean;
		limit?: number;
		context?: number;
	}): Promise<MemorySearchResult> {
		const query = options.query.trim();
		if (!query) return { matches: [], truncated: false };
		const limit = Math.max(1, options.limit ?? 50);
		const context = Math.max(0, options.context ?? 0);
		const ignoreCase = options.ignoreCase ?? true;
		const flags = ignoreCase ? "i" : "";
		const pattern = (options.literal ?? true) ? undefined : new RegExp(query, flags);
		const terms = queryTerms(query, ignoreCase);
		const matches: MemorySearchMatch[] = [];

		for (const namespace of this.selectedNamespaces(options.namespace)) {
			for (const target of namespace.targets) {
				if (options.target && target.target !== options.target) continue;
				if (options.layer && target.layer !== options.layer) continue;
				const resolved = this.resolveTarget(namespace.namespace, target.target);
				const content = await this.readRawFile(resolved.absolutePath);
				const lines = content ? content.split(/\r?\n/) : [];
				for (let index = 0; index < lines.length; index++) {
					const line = lines[index];
					const score = pattern ? (pattern.test(line) ? 1 : 0) : scoreTerms(line, terms, ignoreCase);
					if (score <= 0) continue;
					if (pattern) pattern.lastIndex = 0;
					matches.push({
						namespace: namespace.namespace,
						target: target.target,
						relativePath: resolved.relativePath,
						line: index + 1,
						text: line,
						snippet: buildSearchSnippet(line, pattern ? [query] : terms, ignoreCase),
						score,
						contextBefore: lines
							.slice(Math.max(0, index - context), index)
							.map((text, offset) => ({ line: Math.max(0, index - context) + offset + 1, text })),
						contextAfter: lines
							.slice(index + 1, index + 1 + context)
							.map((text, offset) => ({ line: index + offset + 2, text })),
					});
				}
			}
		}
		matches.sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath) || a.line - b.line);
		return { matches: matches.slice(0, limit), truncated: matches.length > limit };
	}

	async write(options: {
		namespace: string;
		target: string;
		action?: "add" | "replace" | "remove";
		content?: string;
		oldText?: string;
		operations?: MemoryEntryOperation[];
	}): Promise<MemoryWriteResult> {
		const resolved = this.resolveTarget(options.namespace, options.target);
		const operations = options.operations?.length
			? options.operations
			: options.action
				? [{ action: options.action, content: options.content, oldText: options.oldText }]
				: [];
		if (operations.length === 0) {
			return this.writeError(resolved, "No memory operation supplied.");
		}

		for (const [index, operation] of operations.entries()) {
			if ((operation.action === "add" || operation.action === "replace") && operation.content) {
				const scanError = scanMemoryContent(operation.content);
				if (scanError) return this.writeError(resolved, `Operation ${index + 1}: ${scanError}`);
				const metadataError = validateMemoryEntryMetadata(operation.content, resolved.target);
				if (metadataError) return this.writeError(resolved, `Operation ${index + 1}: ${metadataError}`);
			}
		}

		const entries = await this.readEntries(resolved.absolutePath);
		const working = [...entries];
		for (const [index, operation] of operations.entries()) {
			const label = `Operation ${index + 1} (${operation.action})`;
			if (operation.action === "add") {
				const content = operation.content?.trim();
				if (!content) return this.writeError(resolved, `${label}: content is required.`, entries);
				if (!working.includes(content)) working.push(content);
				continue;
			}
			const oldText = operation.oldText?.trim();
			if (!oldText) return this.writeError(resolved, `${label}: oldText is required.`, entries);
			const matches = working.map((entry, i) => ({ entry, i })).filter(({ entry }) => entry.includes(oldText));
			if (matches.length === 0)
				return this.writeError(resolved, `${label}: no entry matched '${oldText}'.`, entries);
			if (new Set(matches.map(({ entry }) => entry)).size > 1) {
				return this.writeError(resolved, `${label}: oldText matched multiple distinct entries.`, entries);
			}
			if (operation.action === "remove") {
				working.splice(matches[0].i, 1);
				continue;
			}
			if (operation.action === "replace") {
				const content = operation.content?.trim();
				if (!content) return this.writeError(resolved, `${label}: content is required.`, entries);
				working[matches[0].i] = content;
				continue;
			}
			return this.writeError(resolved, `${label}: unknown action.`, entries);
		}

		const chars = charsForEntries(working);
		if (chars > resolved.target.charLimit) {
			return this.writeError(
				resolved,
				`Memory would exceed limit: ${chars}/${resolved.target.charLimit} chars. Remove or shorten entries in the same batch.`,
				entries,
			);
		}
		await this.writeEntries(resolved.absolutePath, working);
		return {
			success: true,
			done: true,
			namespace: resolved.config.namespace,
			target: resolved.target.target,
			message: `Applied ${operations.length} operation(s).`,
			usage: usageText(chars, resolved.target.charLimit),
			entryCount: working.length,
		};
	}

	getSystemSnapshotTargets(): MemoryTargetState[] {
		const states: MemoryTargetState[] = [];
		for (const namespace of this.namespaces.values()) {
			for (const target of namespace.targets) {
				if (target.injectPolicy === "never" || target.injectPolicy === "search_only") continue;
				states.push(this.getTargetStateSync(namespace, target));
			}
		}
		return states;
	}

	private selectedNamespaces(namespace?: string): MemoryNamespaceConfig[] {
		if (!namespace) return [...this.namespaces.values()];
		const config = this.namespaces.get(namespace);
		if (!config) throw new Error(`Unknown memory namespace: ${namespace}`);
		return [config];
	}

	private resolveTarget(namespaceName: string, targetName: string): ResolvedTarget {
		const config = this.namespaces.get(namespaceName);
		if (!config) throw new Error(`Unknown memory namespace: ${namespaceName}`);
		const target = config.targets.find((item) => item.target === normalizeTargetName(targetName));
		if (!target) throw new Error(`Unknown memory target '${targetName}' in namespace '${namespaceName}'`);
		if (target.file.includes("..") || isAbsolute(target.file)) {
			throw new Error(`Invalid memory target file for ${namespaceName}/${target.target}`);
		}
		const root = this.resolveRoot(config.root);
		const absolutePath = resolve(root, target.file);
		const rootRelative = relative(root, absolutePath);
		if (rootRelative.startsWith("..") || isAbsolute(rootRelative)) {
			throw new Error(`Memory target path escapes namespace root: ${namespaceName}/${target.target}`);
		}
		return {
			config,
			target,
			absolutePath,
			relativePath: relative(this.cwd, absolutePath) || target.file,
		};
	}

	private resolveRoot(root: string): string {
		const absolute = isAbsolute(root) ? resolve(root) : resolve(this.cwd, root);
		const rel = relative(this.cwd, absolute);
		if (rel.startsWith("..") || isAbsolute(rel)) {
			throw new Error(`Memory namespace root must stay under project root: ${root}`);
		}
		return absolute;
	}

	private getTargetStateSync(namespace: MemoryNamespaceConfig, target: MemoryTargetConfig): MemoryTargetState {
		const resolved = this.resolveTarget(namespace.namespace, target.target);
		const raw = existsSync(resolved.absolutePath) ? readFileSync(resolved.absolutePath, "utf8") : "";
		const entries = this.parseEntries(raw);
		return {
			namespace: namespace.namespace,
			target: target.target,
			layer: target.layer,
			relativePath: resolved.relativePath,
			entries,
			chars: charsForEntries(entries),
			charLimit: target.charLimit,
			injectPolicy: target.injectPolicy,
			description: target.description,
		};
	}

	private async readRawFile(path: string): Promise<string> {
		try {
			return await readFile(path, "utf8");
		} catch {
			return "";
		}
	}

	private async readEntries(path: string): Promise<string[]> {
		return this.parseEntries(await this.readRawFile(path));
	}

	private parseEntries(raw: string): string[] {
		if (!raw.trim()) return [];
		return [
			...new Set(
				raw
					.split(MEMORY_ENTRY_DELIMITER)
					.map((entry) => entry.trim())
					.filter(Boolean),
			),
		];
	}

	private async writeEntries(path: string, entries: string[]): Promise<void> {
		const dir = dirname(path);
		await mkdir(dir, { recursive: true });
		const tempPath = join(dir, `.memory-${process.pid}-${Date.now()}.tmp`);
		try {
			await writeFile(tempPath, entries.length ? entries.join(MEMORY_ENTRY_DELIMITER) : "", "utf8");
			await rename(tempPath, path);
		} finally {
			await rm(tempPath, { force: true });
		}
	}

	private writeError(resolved: ResolvedTarget, error: string, entries?: string[]): MemoryWriteResult {
		const currentEntries = entries ?? this.getTargetStateSync(resolved.config, resolved.target).entries;
		return {
			success: false,
			namespace: resolved.config.namespace,
			target: resolved.target.target,
			error,
			usage: usageText(charsForEntries(currentEntries), resolved.target.charLimit),
			entryCount: currentEntries.length,
			currentEntries,
		};
	}
}
