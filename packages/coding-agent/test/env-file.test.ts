import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findProjectEnvFile, loadEnvFile, loadProjectEnvFile } from "../src/core/env-file.ts";
import { resolveConfigValue } from "../src/core/resolve-config-value.ts";

const tempDirs: string[] = [];
const testEnvKey = "PI_ENV_FILE_TEST_KEY_12345";
const originalTestEnvValue = process.env[testEnvKey];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
	if (originalTestEnvValue === undefined) {
		delete process.env[testEnvKey];
	} else {
		process.env[testEnvKey] = originalTestEnvValue;
	}
});

function createTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-env-file-test-"));
	tempDirs.push(dir);
	return dir;
}

describe("env file loading", () => {
	it("loads missing variables from .env without overwriting existing environment values", () => {
		const dir = createTempDir();
		const envPath = join(dir, ".env");
		writeFileSync(
			envPath,
			[
				"# comment",
				"OPENAI_API_KEY=from-dotenv",
				"OPENAI_BASE_URL = https://api.example.test/v1",
				"export FRED_API_KEY=fred-key",
				'DOUBLE_QUOTED="hello\\nworld"',
				"SINGLE_QUOTED='literal # value'",
				"INLINE_COMMENT=value # trailing comment",
				"EMPTY_VALUE=",
				"not valid",
			].join("\n"),
			"utf-8",
		);
		const targetEnv: Record<string, string | undefined> = {
			OPENAI_API_KEY: "from-shell",
		};

		const result = loadEnvFile(envPath, targetEnv);

		expect(targetEnv.OPENAI_API_KEY).toBe("from-shell");
		expect(targetEnv.OPENAI_BASE_URL).toBe("https://api.example.test/v1");
		expect(targetEnv.FRED_API_KEY).toBe("fred-key");
		expect(targetEnv.DOUBLE_QUOTED).toBe("hello\nworld");
		expect(targetEnv.SINGLE_QUOTED).toBe("literal # value");
		expect(targetEnv.INLINE_COMMENT).toBe("value");
		expect(targetEnv.EMPTY_VALUE).toBe("");
		expect(result.loaded).toEqual([
			"OPENAI_BASE_URL",
			"FRED_API_KEY",
			"DOUBLE_QUOTED",
			"SINGLE_QUOTED",
			"INLINE_COMMENT",
			"EMPTY_VALUE",
		]);
		expect(result.skipped).toEqual(["OPENAI_API_KEY"]);
		expect(result.invalidLines).toEqual([9]);
	});

	it("finds the nearest project .env from a nested working directory", () => {
		const dir = createTempDir();
		const projectDir = join(dir, "project");
		const nestedDir = join(projectDir, "packages", "coding-agent");
		mkdirSync(join(projectDir, ".git"), { recursive: true });
		mkdirSync(nestedDir, { recursive: true });
		const envPath = join(projectDir, ".env");
		writeFileSync(envPath, "OPENAI_API_KEY=from-dotenv\n", "utf-8");

		expect(findProjectEnvFile(nestedDir)).toBe(envPath);
	});

	it("does not climb above a project root when no project .env exists", () => {
		const dir = createTempDir();
		const projectDir = join(dir, "project");
		const nestedDir = join(projectDir, "packages", "coding-agent");
		mkdirSync(join(projectDir, ".git"), { recursive: true });
		mkdirSync(nestedDir, { recursive: true });
		writeFileSync(join(dir, ".env"), "OPENAI_API_KEY=outside-project\n", "utf-8");

		expect(findProjectEnvFile(nestedDir)).toBeUndefined();
		expect(loadProjectEnvFile(nestedDir, {})).toBeUndefined();
	});

	it("makes loaded values available through normal config resolution without passing env explicitly", () => {
		const dir = createTempDir();
		delete process.env[testEnvKey];
		writeFileSync(join(dir, ".env"), `${testEnvKey}=from-dotenv\n`, "utf-8");

		loadProjectEnvFile(dir);

		expect(resolveConfigValue(`$${testEnvKey}`)).toBe("from-dotenv");
	});
});
