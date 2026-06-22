import type { MemoryTargetConfig } from "./memory-types.ts";

const SECRET_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
	{ id: "openai_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
	{ id: "api_key_assignment", pattern: /\b[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)\s*=\s*['"]?[^'"\s]{8,}/i },
	{ id: "authorization_bearer", pattern: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i },
];

const INJECTION_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
	{ id: "ignore_instructions", pattern: /\bignore\s+(?:all\s+)?(?:previous|prior|system)\s+instructions\b/i },
	{ id: "system_override", pattern: /\bsystem\s+prompt\s+override\b/i },
	{ id: "role_hijack", pattern: /\byou\s+are\s+now\s+(?:a|an|the)\b/i },
	{ id: "hide_from_user", pattern: /\bdo\s+not\s+(?:tell|show|reveal)\s+(?:the\s+)?user\b/i },
	{ id: "context_exfil", pattern: /\b(?:output|print|share|send)\s+(?:the\s+)?(?:full|entire)\s+context\b/i },
];

const INVISIBLE_UNICODE_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u;
const MEMORY_TIMESTAMP_PATTERN = /\b(?:asOf|createdAt)\s*=\s*(\d{4}-\d{2}-\d{2}(?:T[^\s|]+)?)\b/i;
const MARKET_SENSITIVE_PATTERN =
	/\b(?:symbol|ticker)\s*=|\b(?:price|revenue|earnings|eps|margin|volume|valuation|thesis|risk|catalyst)\b/i;

function scanUnsafeContent(content: string): string | undefined {
	for (const { id, pattern } of SECRET_PATTERNS) {
		if (pattern.test(content)) return `Blocked memory content: potential secret detected (${id}).`;
	}
	for (const { id, pattern } of INJECTION_PATTERNS) {
		if (pattern.test(content)) return `Blocked memory content: prompt-injection pattern detected (${id}).`;
	}
	if (INVISIBLE_UNICODE_PATTERN.test(content)) {
		return "Blocked memory content: invisible Unicode control character detected.";
	}
	return undefined;
}

export function scanMemoryContent(content: string): string | undefined {
	const unsafeError = scanUnsafeContent(content);
	if (unsafeError) return unsafeError;
	if (content.length > 4000) {
		return "Blocked memory content: entry is too large; save a compact summary and artifact path instead.";
	}
	return undefined;
}

export function scanMemoryReportContent(content: string): string | undefined {
	return scanUnsafeContent(content);
}

export function memoryEntryRequiresTimestamp(content: string, target: Pick<MemoryTargetConfig, "layer">): boolean {
	return target.layer === "domain" || (target.layer === "long_term" && MARKET_SENSITIVE_PATTERN.test(content));
}

export function extractMemoryEntryTimestamp(content: string): Date | undefined {
	const match = MEMORY_TIMESTAMP_PATTERN.exec(content);
	const rawTimestamp = match?.[1];
	if (!rawTimestamp) return undefined;
	const timestamp = new Date(rawTimestamp);
	return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

export function validateMemoryEntryMetadata(content: string, target: MemoryTargetConfig): string | undefined {
	const requiresTimestamp = memoryEntryRequiresTimestamp(content, target);
	if (!requiresTimestamp || extractMemoryEntryTimestamp(content)) {
		return undefined;
	}
	return "Blocked memory content: domain or market-sensitive memory must include asOf or createdAt timestamp.";
}
