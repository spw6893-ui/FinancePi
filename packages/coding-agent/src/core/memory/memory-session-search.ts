import { relative } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import {
	buildSessionContext,
	loadEntriesFromFile,
	type SessionInfo,
	SessionManager,
	type SessionMessageEntry,
} from "../session-manager.ts";

export interface MemorySessionSearchOptions {
	cwd: string;
	query: string;
	sessionDir?: string;
	limit?: number;
	ignoreCase?: boolean;
}

export interface MemorySessionSearchMatch {
	sessionId: string;
	sessionPath: string;
	relativePath: string;
	timestamp: string;
	role: "user" | "assistant";
	line: number;
	text: string;
	snippet: string;
	score: number;
}

export interface MemorySessionSearchResult {
	matches: MemorySessionSearchMatch[];
	truncated: boolean;
}

const MAX_SESSION_MEMORY_TEXT_CHARS = 500;
const MAX_SESSION_MEMORY_SNIPPET_CHARS = 220;

function compactText(text: string): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= MAX_SESSION_MEMORY_TEXT_CHARS) return normalized;
	return `${normalized.slice(0, MAX_SESSION_MEMORY_TEXT_CHARS)} [truncated]`;
}

function textFromMessage(message: AgentMessage): string {
	if (message.role !== "user" && message.role !== "assistant") return "";
	const content = message.content;
	if (typeof content === "string") return content;
	return content
		.filter((part): part is TextContent => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();
}

function queryTerms(query: string, ignoreCase: boolean): string[] {
	const normalized = ignoreCase ? query.toLowerCase() : query;
	return normalized
		.split(/\s+/)
		.map((term) => term.trim())
		.filter(Boolean);
}

function textMatches(text: string, terms: string[], ignoreCase: boolean): boolean {
	const normalized = ignoreCase ? text.toLowerCase() : text;
	return terms.some((term) => normalized.includes(term));
}

function matchScore(text: string, terms: string[], ignoreCase: boolean): number {
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

function buildSnippet(text: string, terms: string[], ignoreCase: boolean): string {
	const normalizedText = text.replace(/\s+/g, " ").trim();
	const searchable = ignoreCase ? normalizedText.toLowerCase() : normalizedText;
	const firstMatch = terms
		.map((term) => searchable.indexOf(term))
		.filter((index) => index >= 0)
		.sort((a, b) => a - b)[0];
	if (firstMatch === undefined || normalizedText.length <= MAX_SESSION_MEMORY_SNIPPET_CHARS) {
		return compactText(normalizedText).slice(0, MAX_SESSION_MEMORY_SNIPPET_CHARS);
	}
	const start = Math.max(0, firstMatch - 80);
	const end = Math.min(normalizedText.length, start + MAX_SESSION_MEMORY_SNIPPET_CHARS);
	const prefix = start > 0 ? "..." : "";
	const suffix = end < normalizedText.length ? "..." : "";
	return `${prefix}${normalizedText.slice(start, end)}${suffix}`;
}

function sessionMessageTimestamp(entry: SessionMessageEntry): string {
	const messageTimestamp = (entry.message as { timestamp?: unknown }).timestamp;
	if (typeof messageTimestamp === "number" && Number.isFinite(messageTimestamp)) {
		return new Date(messageTimestamp).toISOString();
	}
	return entry.timestamp;
}

async function listCandidateSessions(cwd: string, sessionDir?: string): Promise<SessionInfo[]> {
	if (sessionDir) {
		return SessionManager.list(cwd, sessionDir);
	}
	return SessionManager.list(cwd);
}

export async function searchSessionMemory(options: MemorySessionSearchOptions): Promise<MemorySessionSearchResult> {
	const ignoreCase = options.ignoreCase ?? true;
	const terms = queryTerms(options.query, ignoreCase);
	const limit = options.limit ?? 20;
	if (terms.length === 0 || limit <= 0) {
		return { matches: [], truncated: false };
	}

	const matches: MemorySessionSearchMatch[] = [];
	const sessions = await listCandidateSessions(options.cwd, options.sessionDir);
	for (const session of sessions) {
		const entries = loadEntriesFromFile(session.path);
		const header = entries.find((entry) => entry.type === "session");
		const branchMessages = buildSessionContext(entries.filter((entry) => entry.type !== "session")).messages;
		let line = 0;
		for (const message of branchMessages) {
			if (message.role !== "user" && message.role !== "assistant") continue;
			line++;
			const text = textFromMessage(message);
			if (!textMatches(text, terms, ignoreCase)) continue;
			const messageEntry = entries.find(
				(entry): entry is SessionMessageEntry => entry.type === "message" && entry.message === message,
			);
			const score = matchScore(text, terms, ignoreCase);
			matches.push({
				sessionId: header?.type === "session" ? header.id : session.id,
				sessionPath: session.path,
				relativePath: relative(options.cwd, session.path),
				timestamp: messageEntry ? sessionMessageTimestamp(messageEntry) : session.modified.toISOString(),
				role: message.role,
				line,
				text: compactText(text),
				snippet: buildSnippet(text, terms, ignoreCase),
				score,
			});
		}
	}

	matches.sort((a, b) => b.score - a.score || b.timestamp.localeCompare(a.timestamp));
	return { matches: matches.slice(0, limit), truncated: matches.length > limit };
}
