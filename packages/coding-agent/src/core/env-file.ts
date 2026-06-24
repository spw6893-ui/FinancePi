import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type MutableEnv = Record<string, string | undefined>;

export interface EnvFileLoadResult {
	path: string;
	loaded: string[];
	skipped: string[];
	invalidLines: number[];
}

interface EnvAssignment {
	key: string;
	value: string;
}

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_LINE_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

function decodeEscapedDoubleQuotedValue(value: string): string {
	return value.replace(/\\([nrt"\\])/g, (_match, escaped: string) => {
		switch (escaped) {
			case "n":
				return "\n";
			case "r":
				return "\r";
			case "t":
				return "\t";
			case '"':
				return '"';
			case "\\":
				return "\\";
			default:
				return escaped;
		}
	});
}

function stripUnquotedComment(value: string): string {
	for (let i = 0; i < value.length; i++) {
		if (value[i] === "#" && (i === 0 || /\s/.test(value[i - 1] ?? ""))) {
			return value.slice(0, i);
		}
	}
	return value;
}

function parseEnvValue(rawValue: string): string {
	const trimmed = rawValue.trimStart();
	if (trimmed.startsWith("'")) {
		const endIndex = trimmed.indexOf("'", 1);
		return endIndex >= 0 ? trimmed.slice(1, endIndex) : trimmed.slice(1);
	}
	if (trimmed.startsWith('"')) {
		const endIndex = trimmed.indexOf('"', 1);
		const quotedValue = endIndex >= 0 ? trimmed.slice(1, endIndex) : trimmed.slice(1);
		return decodeEscapedDoubleQuotedValue(quotedValue);
	}
	return stripUnquotedComment(trimmed).trim();
}

function parseEnvLine(line: string): EnvAssignment | undefined {
	const match = ENV_LINE_RE.exec(line);
	if (!match) {
		return undefined;
	}

	const key = match[1] ?? "";
	if (!ENV_KEY_RE.test(key)) {
		return undefined;
	}

	return {
		key,
		value: parseEnvValue(match[2] ?? ""),
	};
}

export function findProjectEnvFile(cwd: string = process.cwd()): string | undefined {
	let currentDir = resolve(cwd);

	while (true) {
		const envPath = join(currentDir, ".env");
		if (isFile(envPath)) {
			return envPath;
		}

		if (existsSync(join(currentDir, ".git"))) {
			return undefined;
		}

		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) {
			return undefined;
		}
		currentDir = parentDir;
	}
}

export function loadEnvFile(path: string, targetEnv: MutableEnv = process.env): EnvFileLoadResult {
	const result: EnvFileLoadResult = {
		path,
		loaded: [],
		skipped: [],
		invalidLines: [],
	};
	const content = readFileSync(path, "utf-8").replace(/^\uFEFF/, "");
	const lines = content.split(/\r?\n/);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		const assignment = parseEnvLine(line);
		if (!assignment) {
			result.invalidLines.push(i + 1);
			continue;
		}

		if (targetEnv[assignment.key] !== undefined) {
			result.skipped.push(assignment.key);
			continue;
		}

		targetEnv[assignment.key] = assignment.value;
		result.loaded.push(assignment.key);
	}

	return result;
}

export function loadProjectEnvFile(
	cwd: string = process.cwd(),
	targetEnv: MutableEnv = process.env,
): EnvFileLoadResult | undefined {
	const envPath = findProjectEnvFile(cwd);
	return envPath ? loadEnvFile(envPath, targetEnv) : undefined;
}
