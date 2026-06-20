import { describe, expect, it } from "vitest";

import { FinanceMcpClient, type FinanceMcpConfig } from "../../../finance/src/index.ts";

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

function sseResponse(payload: unknown) {
	return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
		status: 200,
		headers: { "content-type": "text/event-stream" },
	});
}

describe("FinanceMcpClient", () => {
	const config: FinanceMcpConfig = {
		mcpServers: {
			"custom-provider": {
				type: "http",
				url: "https://mcp.example/custom-provider",
				headers: { Authorization: "Bearer $" + "{CUSTOM_FINANCE_MCP_TOKEN}" },
			},
		},
	};

	it("initializes and lists tools from a configured HTTP MCP server", async () => {
		const methods: string[] = [];
		const authHeaders: string[] = [];
		const client = new FinanceMcpClient({
			env: { CUSTOM_FINANCE_MCP_TOKEN: "test-token" },
			now: () => new Date("2026-06-21T00:00:00.000Z"),
			fetch: async (_url, init) => {
				authHeaders.push(String(new Headers(init?.headers).get("authorization")));
				const body = JSON.parse(String(init?.body));
				methods.push(body.method);
				if (body.method === "initialize") {
					return jsonResponse(
						{ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-03-26", capabilities: {} } },
						200,
						{ "mcp-session-id": "session-1" },
					);
				}
				if (body.method === "notifications/initialized") return new Response("", { status: 202 });
				if (body.method === "tools/list") {
					return jsonResponse({
						jsonrpc: "2.0",
						id: body.id,
						result: {
							tools: [
								{
									name: "get_company_profile",
									description: "Fetch company profile",
									inputSchema: { type: "object" },
								},
							],
						},
					});
				}
				throw new Error(`unexpected method ${body.method}`);
			},
		});

		const result = await client.listTools(config, "custom-provider");

		expect(result.health.status).toBe("ok");
		expect(result.health.source).toBe("mcp:custom-provider");
		expect(result.value.tools).toHaveLength(1);
		expect(result.value.tools[0]?.name).toBe("get_company_profile");
		expect(methods).toEqual(["initialize", "notifications/initialized", "tools/list"]);
		expect(authHeaders).toContain("Bearer test-token");
	});

	it("calls an MCP tool and parses event-stream JSON-RPC responses", async () => {
		const methods: string[] = [];
		const client = new FinanceMcpClient({
			now: () => new Date("2026-06-21T00:00:00.000Z"),
			fetch: async (_url, init) => {
				const body = JSON.parse(String(init?.body));
				methods.push(body.method);
				if (body.method === "initialize") {
					return jsonResponse({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-03-26" } });
				}
				if (body.method === "notifications/initialized") return new Response("", { status: 202 });
				if (body.method === "tools/call") {
					expect(body.params).toEqual({ name: "get_estimates", arguments: { ticker: "NVDA" } });
					return sseResponse({
						jsonrpc: "2.0",
						id: body.id,
						result: {
							content: [{ type: "text", text: "NVDA revenue estimate: 1" }],
							structuredContent: { ticker: "NVDA" },
						},
					});
				}
				throw new Error(`unexpected method ${body.method}`);
			},
		});

		const result = await client.callTool(config, "custom-provider", "get_estimates", { ticker: "NVDA" });

		expect(result.health.status).toBe("ok");
		expect(result.value.server).toBe("custom-provider");
		expect(result.value.toolName).toBe("get_estimates");
		expect(result.value.content).toEqual([{ type: "text", text: "NVDA revenue estimate: 1" }]);
		expect(result.value.structuredContent).toEqual({ ticker: "NVDA" });
		expect(methods).toContain("tools/call");
	});

	it("returns a degraded result when the requested server is not configured", async () => {
		const client = new FinanceMcpClient({ now: () => new Date("2026-06-21T00:00:00.000Z") });

		const result = await client.listTools(config, "missing");

		expect(result.health.status).toBe("degraded");
		expect(result.degradedReason).toBe("mcp_server_missing");
		expect(result.value.tools).toEqual([]);
	});
});
