import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import webAgentExtension, { openWebPage, searchWeb } from "../../src/core/web-agent-extension.ts";
import { createTestExtensionsResult } from "../utilities.ts";

describe("web agent extension", () => {
	let tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
		tempDirs = [];
	});

	it("registers web tools and prompt guidance as an inline extension", async () => {
		const result = await createTestExtensionsResult([{ factory: webAgentExtension, path: "<web-agent>" }]);
		const extension = result.extensions[0];

		expect(extension?.tools.has("web_search")).toBe(true);
		expect(extension?.tools.has("web_open")).toBe(true);
		expect(extension?.handlers.has("before_agent_start")).toBe(true);
	});

	it("parses SearxNG JSON search results and filters domains", async () => {
		const fakeFetch = async (input: string | URL | Request) => {
			const url = String(input);
			expect(url).toContain("format=json");
			expect(decodeURIComponent(url)).toContain("site:sec.gov");
			return new Response(
				JSON.stringify({
					results: [
						{
							title: "NVIDIA 10-K",
							url: "https://www.sec.gov/Archives/example",
							content: "Annual filing",
							engine: "test",
							publishedDate: "2026-03-01",
						},
						{
							title: "Unrelated",
							url: "https://example.com/story",
							content: "Filtered out",
							engine: "test",
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		};

		const result = await searchWeb("NVDA latest filing", {
			providerUrl: "https://search.local",
			domains: ["sec.gov"],
			fetchImpl: fakeFetch as typeof fetch,
			now: () => new Date("2026-06-21T00:00:00.000Z"),
		});

		expect(result.provider).toBe("searxng");
		expect(result.degradedReasons).toEqual([]);
		expect(result.items).toEqual([
			{
				title: "NVIDIA 10-K",
				url: "https://www.sec.gov/Archives/example",
				snippet: "Annual filing",
				source: "test",
				publishedAt: "2026-03-01",
			},
		]);
	});

	it("returns degraded search status instead of throwing on blocked public search", async () => {
		const fakeFetch = async () =>
			new Response("<html><title>challenge</title><body>anomaly detected</body></html>", {
				status: 200,
				headers: { "content-type": "text/html" },
			});

		const result = await searchWeb("NVDA news", {
			provider: "duckduckgo",
			fetchImpl: fakeFetch as typeof fetch,
			now: () => new Date("2026-06-21T00:00:00.000Z"),
		});

		expect(result.items).toEqual([]);
		expect(result.sourceHealth[0]?.status).toBe("degraded");
		expect(result.degradedReasons).toEqual(["duckduckgo_challenge"]);
	});

	it("opens a page, extracts readable text, and writes a text artifact", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-web-test-"));
		tempDirs.push(cwd);
		const fakeFetch = async () =>
			new Response(
				`<html><head><title>Market update</title><style>.x{}</style></head><body><h1>NVDA</h1><script>bad()</script><p>Revenue grew.</p></body></html>`,
				{ status: 200, headers: { "content-type": "text/html" } },
			);

		const result = await openWebPage("https://example.com/market", cwd, {
			fetchImpl: fakeFetch as typeof fetch,
			now: () => new Date("2026-06-21T00:00:00.000Z"),
		});

		expect(result.title).toBe("Market update");
		expect(result.artifactPath).toMatch(/^\.pi\/artifacts\/web\/2026-06-21T00-00-00-000Z-web-open-/);
		expect(result.excerpt).toContain("NVDA");
		expect(result.excerpt).toContain("Revenue grew.");
		expect(result.excerpt).not.toContain("bad()");

		const artifact = await readFile(join(cwd, result.artifactPath!), "utf8");
		expect(artifact).toContain("NVDA");
		expect(artifact).toContain("Revenue grew.");
		expect(artifact).not.toContain("bad()");
	});
});
