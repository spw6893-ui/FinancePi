import type {
	FinanceMcpConfig,
	FinanceMcpServerConfig,
	FinanceMcpTool,
	FinanceMcpToolCallResult,
	FinanceMcpToolsResult,
	SourceHealth,
	SourceResult,
} from "./contracts.ts";

interface JsonRpcError {
	code?: number;
	message?: string;
	data?: unknown;
}

type JsonRecord = Record<string, unknown>;

export interface FinanceMcpClientOptions {
	fetch?: typeof fetch;
	now?: () => Date;
	env?: Record<string, string | undefined>;
	clientName?: string;
	clientVersion?: string;
}

export class FinanceMcpClient {
	private readonly fetchImpl: typeof fetch;
	private readonly now: () => Date;
	private readonly env: Record<string, string | undefined>;
	private readonly clientName: string;
	private readonly clientVersion: string;
	private readonly sessions = new Map<string, string>();
	private nextId = 1;

	constructor(options: FinanceMcpClientOptions = {}) {
		this.fetchImpl = options.fetch ?? fetch;
		this.now = options.now ?? (() => new Date());
		this.env = options.env ?? process.env;
		this.clientName = options.clientName ?? "pi-finance-agent";
		this.clientVersion = options.clientVersion ?? "0.1";
	}

	async listTools(config: FinanceMcpConfig, serverName: string): Promise<SourceResult<FinanceMcpToolsResult>> {
		const asOf = this.now().toISOString();
		const empty: FinanceMcpToolsResult = {
			server: serverName,
			tools: [],
			source: `mcp:${serverName}`,
			asOf,
		};
		const server = config.mcpServers[serverName];
		if (!server || server.disabled) return this.degraded(empty, serverName, "mcp_server_missing");
		try {
			await this.initialize(server);
			const result = await this.request(server, "tools/list");
			const tools = asArray(result.tools)
				.map((tool) => asRecord(tool))
				.filter((tool) => typeof tool.name === "string")
				.map(
					(tool): FinanceMcpTool => ({
						name: String(tool.name),
						description: typeof tool.description === "string" ? tool.description : undefined,
						inputSchema: tool.inputSchema,
					}),
				);
			return {
				value: { ...empty, tools, asOf: this.now().toISOString() },
				health: this.health(serverName),
			};
		} catch (error) {
			return this.degraded(empty, serverName, this.errorReason(error));
		}
	}

	async callTool(
		config: FinanceMcpConfig,
		serverName: string,
		toolName: string,
		args: unknown = {},
	): Promise<SourceResult<FinanceMcpToolCallResult>> {
		const asOf = this.now().toISOString();
		const empty: FinanceMcpToolCallResult = {
			server: serverName,
			toolName,
			content: [],
			source: `mcp:${serverName}`,
			asOf,
		};
		const server = config.mcpServers[serverName];
		if (!server || server.disabled) return this.degraded(empty, serverName, "mcp_server_missing");
		try {
			await this.initialize(server);
			const result = await this.request(server, "tools/call", {
				name: toolName,
				arguments: isRecord(args) ? args : {},
			});
			return {
				value: {
					...empty,
					content: asArray(result.content),
					structuredContent: result.structuredContent,
					rawResult: result,
					asOf: this.now().toISOString(),
				},
				health: this.health(serverName),
			};
		} catch (error) {
			return this.degraded(empty, serverName, this.errorReason(error));
		}
	}

	private async initialize(server: FinanceMcpServerConfig): Promise<void> {
		const result = await this.postJsonRpc(server, "initialize", {
			protocolVersion: "2025-03-26",
			capabilities: {},
			clientInfo: { name: this.clientName, version: this.clientVersion },
		});
		const sessionId = result.sessionId;
		if (typeof sessionId === "string") this.sessions.set(server.url, sessionId);
		await this.postJsonRpc(server, "notifications/initialized", undefined, true).catch(() => undefined);
	}

	private async request(server: FinanceMcpServerConfig, method: string, params?: unknown): Promise<JsonRecord> {
		return this.postJsonRpc(server, method, params);
	}

	private async postJsonRpc(
		server: FinanceMcpServerConfig,
		method: string,
		params?: unknown,
		notification = false,
	): Promise<JsonRecord> {
		if (server.type && server.type !== "http") throw new Error("mcp_transport_unsupported");
		if (!server.url) throw new Error("mcp_url_missing");
		const id = notification ? undefined : this.nextId++;
		const body: JsonRecord = { jsonrpc: "2.0", method };
		if (id !== undefined) body.id = id;
		if (params !== undefined) body.params = params;
		const response = await this.fetchImpl(this.expand(server.url), {
			method: "POST",
			headers: this.headers(server),
			body: JSON.stringify(body),
		});
		const responseSessionId = response.headers.get("mcp-session-id");
		if (responseSessionId) this.sessions.set(server.url, responseSessionId);
		if (!response.ok) throw new Error(`mcp_http_${response.status}`);
		if (notification) return {};
		const payload = await parseJsonRpcResponse(response, id);
		const error = asRecord(payload.error) as JsonRpcError;
		if (error.message || error.code !== undefined) {
			throw new Error(`mcp_json_rpc_error_${error.code ?? "unknown"}:${error.message ?? "unknown"}`);
		}
		return asRecord(payload.result);
	}

	private headers(server: FinanceMcpServerConfig): Record<string, string> {
		const headers: Record<string, string> = {
			accept: "application/json, text/event-stream",
			"content-type": "application/json",
		};
		for (const [key, value] of Object.entries(server.headers ?? {})) {
			headers[key] = this.expand(value);
		}
		const sessionId = this.sessions.get(server.url);
		if (sessionId) headers["mcp-session-id"] = sessionId;
		return headers;
	}

	private expand(value: string): string {
		return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name: string) => this.env[name] ?? "");
	}

	private health(serverName: string): SourceHealth {
		return { source: `mcp:${serverName}`, status: "ok", latestAt: this.now().toISOString() };
	}

	private degraded<T>(value: T, serverName: string, reason: string): SourceResult<T> {
		return {
			value,
			health: {
				source: `mcp:${serverName}`,
				status: "degraded",
				latestAt: this.now().toISOString(),
				degradedReason: reason,
			},
			degradedReason: reason,
		};
	}

	private errorReason(error: unknown): string {
		const message = error instanceof Error ? error.message : String(error);
		const httpMatch = /mcp_http_(\d+)/.exec(message);
		if (httpMatch) return `mcp_http_${httpMatch[1]}`;
		const rpcMatch = /mcp_json_rpc_error_([^:]+)/.exec(message);
		if (rpcMatch) return `mcp_json_rpc_error_${rpcMatch[1]}`;
		if (message === "mcp_transport_unsupported" || message === "mcp_url_missing") return message;
		return "mcp_unavailable";
	}
}

async function parseJsonRpcResponse(response: Response, expectedId: number | undefined): Promise<JsonRecord> {
	const text = await response.text();
	if (!text.trim()) return {};
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("text/event-stream") || /^\s*(event:|data:)/m.test(text)) {
		const events = parseSseData(text)
			.map((line) => safeJson(line))
			.filter((value): value is JsonRecord => isRecord(value));
		return (
			events.find((event) => expectedId === undefined || event.id === expectedId) ??
			events.find((event) => "result" in event || "error" in event) ??
			{}
		);
	}
	const parsed = safeJson(text);
	return isRecord(parsed) ? parsed : {};
}

function parseSseData(text: string): string[] {
	const events: string[] = [];
	let current: string[] = [];
	for (const line of text.split(/\r?\n/)) {
		if (!line.trim()) {
			if (current.length > 0) events.push(current.join("\n"));
			current = [];
			continue;
		}
		if (line.startsWith("data:")) current.push(line.slice(5).trimStart());
	}
	if (current.length > 0) events.push(current.join("\n"));
	return events;
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function asRecord(value: unknown): JsonRecord {
	return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is JsonRecord {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}
