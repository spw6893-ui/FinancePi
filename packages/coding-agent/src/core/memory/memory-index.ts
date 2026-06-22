import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { MEMORY_ENTRY_DELIMITER } from "./memory-store.ts";
import type {
	MemoryNamespaceConfig,
	MemorySearchMatch,
	MemorySearchResult,
	MemoryTargetConfig,
} from "./memory-types.ts";

const SQLITE_INDEX_FILE = ".memory-index.sqlite";

interface MemoryIndexSearchOptions {
	cwd: string;
	namespaces: MemoryNamespaceConfig[];
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

interface ResolvedNamespace {
	config: MemoryNamespaceConfig;
	root: string;
}

interface IndexedEntry {
	namespace: string;
	target: string;
	layer: string;
	relativePath: string;
	line: number;
	text: string;
	symbol: string;
	reportPath: string;
	sourcePaths: string;
}

interface SqliteModule {
	DatabaseSync: new (path: string) => DatabaseSync;
}

function getSqliteModule(): SqliteModule {
	const emitWarning = process.emitWarning;
	try {
		process.emitWarning = (() => {}) as typeof process.emitWarning;
		const sqlite = process.getBuiltinModule("node:sqlite");
		if (!sqlite || !("DatabaseSync" in sqlite)) throw new Error("node:sqlite is not available.");
		return sqlite as SqliteModule;
	} finally {
		process.emitWarning = emitWarning;
	}
}

function pathIsInside(root: string, path: string): boolean {
	const rel = relative(resolve(root), resolve(path));
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function resolveNamespaceRoot(cwd: string, root: string): string {
	const absolute = isAbsolute(root) ? resolve(root) : resolve(cwd, root);
	if (!pathIsInside(cwd, absolute)) throw new Error(`Memory namespace root must stay under project root: ${root}`);
	return absolute;
}

function resolveTargetPath(cwd: string, namespaceRoot: string, namespace: string, target: MemoryTargetConfig) {
	if (target.file.includes("..") || isAbsolute(target.file)) {
		throw new Error(`Invalid memory target file for ${namespace}/${target.target}`);
	}
	const absolutePath = resolve(namespaceRoot, target.file);
	if (!pathIsInside(namespaceRoot, absolutePath)) {
		throw new Error(`Memory target path escapes namespace root: ${namespace}/${target.target}`);
	}
	return {
		absolutePath,
		relativePath: relative(cwd, absolutePath) || target.file,
	};
}

async function readRawFile(path: string): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return "";
	}
}

function parseEntryRecords(raw: string): Array<{ text: string; line: number }> {
	if (!raw.trim()) return [];
	if (!raw.includes(MEMORY_ENTRY_DELIMITER)) {
		return raw
			.split(/\r?\n/)
			.map((text, index) => ({ text: text.trim(), line: index + 1 }))
			.filter((entry) => entry.text.length > 0);
	}

	const records: Array<{ text: string; line: number }> = [];
	let currentLine = 1;
	for (const entry of raw.split(MEMORY_ENTRY_DELIMITER)) {
		const text = entry.trim();
		if (text) records.push({ text, line: currentLine });
		currentLine += (entry ? entry.split(/\r?\n/).length : 0) + 1;
	}
	return records;
}

function metadataValue(text: string, key: string): string {
	const pattern = new RegExp(`(?:^|[|\\n])\\s*${key}\\s*=\\s*([^|\\n]+)`, "gi");
	const values: string[] = [];
	let match = pattern.exec(text);
	while (match) {
		values.push(match[1].trim());
		match = pattern.exec(text);
	}
	return values.join(" ");
}

function metadataSymbols(text: string): string {
	return [metadataValue(text, "symbol"), metadataValue(text, "symbols")].filter(Boolean).join(" ");
}

function tokenizeFtsValue(value: string): string[] {
	return value
		.trim()
		.split(/\s+/)
		.map((term) => term.trim())
		.filter(Boolean);
}

function quoteFtsPhrase(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

function ftsTerms(value: string): string {
	return tokenizeFtsValue(value).map(quoteFtsPhrase).join(" AND ");
}

function ftsColumnPhrase(column: string, value: string): string {
	return `${column}:${quoteFtsPhrase(value.trim())}`;
}

function buildFtsMatchExpression(options: MemoryIndexSearchOptions): string {
	const clauses: string[] = [];
	if (options.query?.trim()) clauses.push(ftsTerms(options.query));
	if (options.symbol?.trim()) clauses.push(ftsColumnPhrase("symbol", options.symbol));
	if (options.reportPath?.trim()) clauses.push(ftsColumnPhrase("reportPath", options.reportPath));
	if (options.sourcePath?.trim()) clauses.push(ftsColumnPhrase("sourcePaths", options.sourcePath));
	return clauses.filter(Boolean).join(" AND ");
}

function queryTerms(query: string): string[] {
	return query
		.toLowerCase()
		.split(/\s+/)
		.map((term) => term.trim())
		.filter(Boolean);
}

function buildSnippet(text: string, query: string): string {
	const normalizedText = text.replace(/\s+/g, " ").trim();
	const terms = queryTerms(query);
	const searchable = normalizedText.toLowerCase();
	const firstMatch = terms
		.map((term) => searchable.indexOf(term))
		.filter((index) => index >= 0)
		.sort((a, b) => a - b)[0];
	if (firstMatch === undefined || normalizedText.length <= 220) return normalizedText.slice(0, 220);
	const start = Math.max(0, firstMatch - 80);
	const end = Math.min(normalizedText.length, start + 220);
	return `${start > 0 ? "..." : ""}${normalizedText.slice(start, end)}${end < normalizedText.length ? "..." : ""}`;
}

function sqliteText(row: Record<string, unknown>, key: string): string {
	const value = row[key];
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "bigint") return String(value);
	return "";
}

function sqliteNumber(row: Record<string, unknown>, key: string): number {
	const value = row[key];
	if (typeof value === "number") return value;
	if (typeof value === "bigint") return Number(value);
	if (typeof value === "string") return Number(value) || 0;
	return 0;
}

function sqliteScore(rank: number): number {
	return Math.max(1, Math.round(-rank * 1_000_000_000));
}

function selectNamespaces(options: MemoryIndexSearchOptions): ResolvedNamespace[] {
	const cwd = resolve(options.cwd);
	const selected = options.namespace
		? options.namespaces.filter((namespace) => namespace.namespace === options.namespace)
		: options.namespaces;
	if (options.namespace && selected.length === 0) throw new Error(`Unknown memory namespace: ${options.namespace}`);
	return selected.map((config) => ({ config, root: resolveNamespaceRoot(cwd, config.root) }));
}

async function collectEntries(
	cwd: string,
	namespace: MemoryNamespaceConfig,
	namespaceRoot: string,
	options: Pick<MemoryIndexSearchOptions, "target" | "layer">,
): Promise<IndexedEntry[]> {
	const entries: IndexedEntry[] = [];
	for (const target of namespace.targets) {
		if (options.target && target.target !== options.target) continue;
		if (options.layer && target.layer !== options.layer) continue;
		const resolved = resolveTargetPath(cwd, namespaceRoot, namespace.namespace, target);
		const raw = await readRawFile(resolved.absolutePath);
		for (const record of parseEntryRecords(raw)) {
			entries.push({
				namespace: namespace.namespace,
				target: target.target,
				layer: target.layer,
				relativePath: resolved.relativePath,
				line: record.line,
				text: record.text,
				symbol: metadataSymbols(record.text),
				reportPath: metadataValue(record.text, "reportPath"),
				sourcePaths: metadataValue(record.text, "sourcePaths"),
			});
		}
	}
	return entries;
}

function initializeSchema(db: DatabaseSync): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS memory_index_meta(
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
		CREATE VIRTUAL TABLE IF NOT EXISTS memory_entries USING fts5(
			namespace UNINDEXED,
			target UNINDEXED,
			layer UNINDEXED,
			relativePath UNINDEXED,
			line UNINDEXED,
			text,
			symbol,
			reportPath,
			sourcePaths,
			tokenize='unicode61'
		);
	`);
}

function rebuildIndex(db: DatabaseSync, entries: IndexedEntry[]): void {
	const insert = db.prepare(`
		INSERT INTO memory_entries(rowid, namespace, target, layer, relativePath, line, text, symbol, reportPath, sourcePaths)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	db.exec("BEGIN");
	try {
		db.prepare("DELETE FROM memory_entries").run();
		let rowid = 1;
		for (const entry of entries) {
			insert.run(
				rowid,
				entry.namespace,
				entry.target,
				entry.layer,
				entry.relativePath,
				entry.line,
				entry.text,
				entry.symbol,
				entry.reportPath,
				entry.sourcePaths,
			);
			rowid++;
		}
		db.prepare("INSERT OR REPLACE INTO memory_index_meta(key, value) VALUES (?, ?)").run("schemaVersion", "1");
		db.prepare("INSERT OR REPLACE INTO memory_index_meta(key, value) VALUES (?, ?)").run(
			"rebuiltAt",
			new Date().toISOString(),
		);
		db.exec("COMMIT");
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
}

function searchDb(db: DatabaseSync, matchExpression: string, limit: number, snippetQuery: string): MemorySearchMatch[] {
	const rows = db
		.prepare(`
			SELECT namespace, target, relativePath, line, text, rank
			FROM memory_entries
			WHERE memory_entries MATCH ?
			ORDER BY rank
			LIMIT ?
		`)
		.all(matchExpression, limit);
	return rows.map((row) => {
		const text = sqliteText(row, "text");
		return {
			namespace: sqliteText(row, "namespace"),
			target: sqliteText(row, "target"),
			relativePath: sqliteText(row, "relativePath"),
			line: sqliteNumber(row, "line"),
			text,
			snippet: buildSnippet(text, snippetQuery),
			score: sqliteScore(sqliteNumber(row, "rank")),
			contextBefore: [],
			contextAfter: [],
		};
	});
}

export async function searchMemorySqliteIndex(options: MemoryIndexSearchOptions): Promise<MemorySearchResult> {
	if (options.ignoreCase === false) {
		throw new Error("SQLite FTS memory index is case-insensitive.");
	}
	const matchExpression = buildFtsMatchExpression(options);
	if (!matchExpression) return { matches: [], truncated: false };

	const cwd = resolve(options.cwd);
	const limit = Math.max(1, options.limit ?? 20);
	const matches: MemorySearchMatch[] = [];
	for (const namespace of selectNamespaces(options)) {
		await mkdir(namespace.root, { recursive: true });
		const entries = await collectEntries(cwd, namespace.config, namespace.root, options);
		const db = new (getSqliteModule().DatabaseSync)(resolve(namespace.root, SQLITE_INDEX_FILE));
		try {
			initializeSchema(db);
			rebuildIndex(db, entries);
			matches.push(...searchDb(db, matchExpression, limit, buildFtsMatchExpression(options).replace(/"/g, " ")));
		} finally {
			db.close();
		}
	}

	matches.sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath) || a.line - b.line);
	return { matches: matches.slice(0, limit), truncated: matches.length > limit };
}
