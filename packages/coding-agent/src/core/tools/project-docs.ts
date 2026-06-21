import { existsSync } from "node:fs";
import { stat as fsStat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from "./truncate.ts";

const DEFAULT_DOC_LIMIT = 200;
const DEFAULT_SEARCH_LIMIT = 50;

const listSchema = Type.Object({
	path: Type.Optional(Type.String({ description: "Directory to search in (default: current directory)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of docs to return (default: 200)" })),
});

const readSchema = Type.Object({
	path: Type.String({ description: "Project doc path to read (relative to the project root or absolute)" }),
	offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});

const searchSchema = Type.Object({
	query: Type.String({ description: "Search text" }),
	path: Type.Optional(Type.String({ description: "Directory to search in (default: current directory)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of matches to return (default: 50)" })),
	context: Type.Optional(Type.Number({ description: "Number of surrounding lines to include (default: 0)" })),
	literal: Type.Optional(Type.Boolean({ description: "Treat the query as a literal string (default: true)" })),
	ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search (default: false)" })),
});

export type ListProjectDocsInput = Static<typeof listSchema>;
export type ReadProjectDocInput = Static<typeof readSchema>;
export type SearchProjectDocsInput = Static<typeof searchSchema>;

const DOC_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);
const DOC_FILE_NAMES = new Set([
	"AGENTS.md",
	"AGENTS.override.md",
	"CLAUDE.md",
	"CLAUDE.override.md",
	"README.md",
	"README.mdx",
	"README.markdown",
	"README.txt",
	"SKILL.md",
]);
const IGNORED_DIR_NAMES = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	"coverage",
	".next",
	".turbo",
	"out",
	"target",
]);

type DocEntry = {
	path: string;
	relativePath: string;
	size: number;
	title?: string;
};

function findProjectRoot(cwd: string): string {
	let current = path.resolve(cwd);
	while (true) {
		if (existsSync(path.join(current, ".git"))) {
			return current;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			return path.resolve(cwd);
		}
		current = parent;
	}
}

function isDocFile(filePath: string): boolean {
	const fileName = path.basename(filePath);
	if (DOC_FILE_NAMES.has(fileName)) return true;
	return DOC_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function normalizeRelativePath(root: string, absolutePath: string): string | null {
	const relativePath = path.relative(root, absolutePath);
	if (!relativePath || relativePath === "." || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
		return null;
	}
	return relativePath.split(path.sep).join("/");
}

function resolveProjectRootPath(root: string, inputPath: string): string {
	return path.resolve(path.isAbsolute(inputPath) ? inputPath : path.join(root, inputPath));
}

function extractTitle(content: string, fallbackName: string): string {
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (trimmed.startsWith("#")) {
			return trimmed.replace(/^#+\s*/, "").trim() || fallbackName;
		}
		return trimmed.slice(0, 80);
	}
	return fallbackName;
}

async function walkProjectDocs(root: string, limit: number, scopeDir: string): Promise<DocEntry[]> {
	const results: DocEntry[] = [];
	const stack = [scopeDir];

	while (stack.length > 0 && results.length < limit) {
		const dir = stack.pop()!;
		let entries: import("node:fs").Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}

		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			const absolutePath = path.join(dir, entry.name);
			const relativePath = normalizeRelativePath(root, absolutePath);
			if (!relativePath) continue;
			if (entry.isDirectory()) {
				if (IGNORED_DIR_NAMES.has(entry.name)) continue;
				stack.push(absolutePath);
				continue;
			}
			if (!entry.isFile() && !entry.isSymbolicLink()) continue;
			if (!isDocFile(absolutePath)) continue;
			try {
				const stat = await fsStat(absolutePath);
				results.push({
					path: absolutePath,
					relativePath,
					size: stat.size,
				});
				if (results.length >= limit) break;
			} catch {}
		}
	}

	results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
	return results.slice(0, limit);
}

async function readDocEntry(
	root: string,
	inputPath: string,
): Promise<{ absolutePath: string; relativePath: string; content: string }> {
	const absolutePath = resolveProjectRootPath(root, inputPath);
	const relativePath = normalizeRelativePath(root, absolutePath);
	if (!relativePath) {
		throw new Error("Path is outside the project root");
	}
	if (!isDocFile(absolutePath)) {
		throw new Error("Path is not a supported project doc");
	}
	const content = await readFile(absolutePath, "utf-8");
	return { absolutePath, relativePath, content };
}

function formatListResult(entries: DocEntry[]): string {
	if (entries.length === 0) return "No project docs found";
	return entries
		.map((entry) => {
			const title = entry.title ? ` | ${entry.title}` : "";
			return `${entry.relativePath} | ${formatSize(entry.size)}${title}`;
		})
		.join("\n");
}

function formatReadResultText(
	relativePath: string,
	content: string,
	offset?: number,
	limit?: number,
): { text: string } {
	const allLines = content.split("\n");
	const totalFileLines = allLines.length;
	const startLine = offset ? Math.max(0, offset - 1) : 0;
	const startLineDisplay = startLine + 1;
	if (startLine >= allLines.length) {
		throw new Error(`Offset ${offset} is beyond end of file (${allLines.length} lines total)`);
	}
	let selectedContent: string;
	let userLimitedLines: number | undefined;
	if (limit !== undefined) {
		const endLine = Math.min(startLine + limit, allLines.length);
		selectedContent = allLines.slice(startLine, endLine).join("\n");
		userLimitedLines = endLine - startLine;
	} else {
		selectedContent = allLines.slice(startLine).join("\n");
	}
	const truncation = truncateHead(selectedContent);
	if (truncation.firstLineExceedsLimit) {
		const firstLineSize = formatSize(Buffer.byteLength(allLines[startLine], "utf-8"));
		return {
			text: `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: sed -n '${startLineDisplay}p' ${relativePath} | head -c ${DEFAULT_MAX_BYTES}]`,
		};
	}
	if (truncation.truncated) {
		const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
		const nextOffset = endLineDisplay + 1;
		const notice =
			truncation.truncatedBy === "lines"
				? `[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines}. Use offset=${nextOffset} to continue.]`
				: `[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
		return { text: `${truncation.content}\n\n${notice}` };
	}
	if (userLimitedLines !== undefined && startLine + userLimitedLines < allLines.length) {
		const remaining = allLines.length - (startLine + userLimitedLines);
		const nextOffset = startLine + userLimitedLines + 1;
		return {
			text: `${truncation.content}\n\n[${remaining} more lines in file. Use offset=${nextOffset} to continue.]`,
		};
	}
	return { text: truncation.content };
}

function formatSearchResult(relativePath: string, lines: string[], matchIndex: number, context: number): string {
	const output: string[] = [];
	const start = Math.max(0, matchIndex - context);
	const end = Math.min(lines.length - 1, matchIndex + context);
	for (let i = start; i <= end; i++) {
		const prefix = i === matchIndex ? ":" : "-";
		output.push(`${relativePath}${prefix}${i + 1}${prefix} ${lines[i]}`);
	}
	return output.join("\n");
}

async function collectProjectDocs(cwd: string, scope?: string, limit = DEFAULT_DOC_LIMIT): Promise<DocEntry[]> {
	const root = findProjectRoot(cwd);
	const scopeDir = scope ? resolveProjectRootPath(root, scope) : root;
	const relativeScope = normalizeRelativePath(root, scopeDir);
	if (scope && !relativeScope && path.resolve(scopeDir) !== root) {
		throw new Error("Scope is outside the project root");
	}
	const entries = await walkProjectDocs(root, limit, scopeDir);
	for (const entry of entries) {
		try {
			const content = await readFile(entry.path, "utf-8");
			entry.title = extractTitle(content, path.basename(entry.relativePath));
		} catch {
			entry.title = path.basename(entry.relativePath);
		}
	}
	return entries;
}

function makeListToolDefinition(cwd: string): ToolDefinition<typeof listSchema, undefined> {
	return {
		name: "list_project_docs",
		label: "list_project_docs",
		description: "List project documentation resources under the repo root.",
		promptSnippet: "List project documentation resources",
		parameters: listSchema,
		async execute(_toolCallId, { path: scope, limit }: Static<typeof listSchema>) {
			const docs = await collectProjectDocs(cwd, scope, limit ?? DEFAULT_DOC_LIMIT);
			const text = formatListResult(docs);
			return { content: [{ type: "text", text }], details: undefined };
		},
	};
}

function makeReadToolDefinition(cwd: string): ToolDefinition<typeof readSchema, undefined> {
	return {
		name: "read_project_doc",
		label: "read_project_doc",
		description: "Read a project documentation file by path.",
		promptSnippet: "Read project documentation",
		parameters: readSchema,
		async execute(_toolCallId, { path: docPath, offset, limit }: Static<typeof readSchema>) {
			const root = findProjectRoot(cwd);
			const entry = await readDocEntry(root, docPath);
			const { text } = formatReadResultText(entry.relativePath, entry.content, offset, limit);
			return { content: [{ type: "text", text }], details: undefined };
		},
	};
}

function makeSearchToolDefinition(cwd: string): ToolDefinition<typeof searchSchema, undefined> {
	return {
		name: "search_project_docs",
		label: "search_project_docs",
		description: "Search project documentation resources and return matching lines with context.",
		promptSnippet: "Search project documentation",
		parameters: searchSchema,
		async execute(
			_toolCallId,
			{ query, path: scope, limit, context, literal, ignoreCase }: Static<typeof searchSchema>,
		) {
			const docs = await collectProjectDocs(cwd, scope, DEFAULT_DOC_LIMIT);
			const effectiveLimit = Math.max(1, limit ?? DEFAULT_SEARCH_LIMIT);
			const contextLines = Math.max(0, context ?? 0);
			const matcher = (literal ?? true) ? escapeRegExp(query) : query;
			const flags = ignoreCase ? "i" : "";
			const regex = new RegExp(matcher, flags);
			const output: string[] = [];
			let matches = 0;

			for (const doc of docs) {
				if (matches >= effectiveLimit) break;
				let content: string;
				try {
					content = await readFile(doc.path, "utf-8");
				} catch {
					continue;
				}
				const lines = content.split("\n");
				for (let i = 0; i < lines.length; i++) {
					if (matches >= effectiveLimit) break;
					if (!regex.test(lines[i])) continue;
					output.push(formatSearchResult(doc.relativePath, lines, i, contextLines));
					matches++;
					regex.lastIndex = 0;
				}
			}

			if (output.length === 0) {
				return { content: [{ type: "text", text: "No project doc matches found" }], details: undefined };
			}
			const text = output.join("\n");
			return { content: [{ type: "text", text }], details: undefined };
		},
	};
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createListProjectDocsToolDefinition(cwd: string): ToolDefinition<any, undefined> {
	return makeListToolDefinition(cwd) as ToolDefinition<any, undefined>;
}

export function createReadProjectDocToolDefinition(cwd: string): ToolDefinition<any, undefined> {
	return makeReadToolDefinition(cwd) as ToolDefinition<any, undefined>;
}

export function createSearchProjectDocsToolDefinition(cwd: string): ToolDefinition<any, undefined> {
	return makeSearchToolDefinition(cwd) as ToolDefinition<any, undefined>;
}

export function createListProjectDocsTool(cwd: string): AgentTool<typeof listSchema> {
	return wrapToolDefinition(makeListToolDefinition(cwd));
}

export function createReadProjectDocTool(cwd: string): AgentTool<typeof readSchema> {
	return wrapToolDefinition(makeReadToolDefinition(cwd));
}

export function createSearchProjectDocsTool(cwd: string): AgentTool<typeof searchSchema> {
	return wrapToolDefinition(makeSearchToolDefinition(cwd));
}
