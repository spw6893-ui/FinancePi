export type MemoryLayer = "session" | "user" | "domain" | "long_term";

export type MemoryInjectPolicy = "always" | "summary" | "search_only" | "never";

export interface MemoryTargetConfig {
	target: string;
	layer: MemoryLayer;
	file: string;
	charLimit: number;
	injectPolicy: MemoryInjectPolicy;
	description: string;
}

export interface MemoryNamespaceConfig {
	namespace: string;
	root: string;
	description: string;
	targets: MemoryTargetConfig[];
	promptGuidelines?: string[];
}

export interface MemoryEntryOperation {
	action: "add" | "replace" | "remove";
	content?: string;
	oldText?: string;
}

export interface MemoryTargetState {
	namespace: string;
	target: string;
	layer: MemoryLayer;
	relativePath: string;
	entries: string[];
	chars: number;
	charLimit: number;
	injectPolicy: MemoryInjectPolicy;
	description: string;
}

export interface MemoryWriteResult {
	success: boolean;
	done?: boolean;
	namespace: string;
	target: string;
	message?: string;
	error?: string;
	usage: string;
	entryCount: number;
	currentEntries?: string[];
}

export interface MemoryCompactResult {
	success: boolean;
	done?: boolean;
	namespace: string;
	target: string;
	message?: string;
	error?: string;
	usage: string;
	entryCount: number;
	previousEntryCount: number;
}

export interface MemoryListResult {
	entries: MemoryTargetState[];
}

export interface MemoryAuditTarget {
	namespace: string;
	target: string;
	layer: MemoryLayer;
	relativePath: string;
	entries: number;
	chars: number;
	charLimit: number;
	usagePct: number;
	duplicateEntries: number;
	staleEntries: number;
	injectPolicy: MemoryInjectPolicy;
	risk: "ok" | "empty" | "near_limit" | "over_limit" | "duplicate_entries" | "stale_market_data";
	description: string;
}

export interface MemoryAuditResult {
	namespaces: number;
	targets: number;
	entries: number;
	chars: number;
	targetsDetail: MemoryAuditTarget[];
}

export interface MemoryReadResult {
	namespace: string;
	target: string;
	relativePath: string;
	startLine: number;
	endLine: number;
	totalLines: number;
	text: string;
}

export interface MemorySearchMatch {
	namespace: string;
	target: string;
	relativePath: string;
	line: number;
	text: string;
	snippet: string;
	score: number;
	contextBefore: Array<{ line: number; text: string }>;
	contextAfter: Array<{ line: number; text: string }>;
}

export interface MemorySearchResult {
	matches: MemorySearchMatch[];
	truncated: boolean;
}
