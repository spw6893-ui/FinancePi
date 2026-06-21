import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { TSchema } from "typebox";

export interface MemoryProviderInitContext {
	cwd: string;
	sessionId?: string;
	namespace?: string;
}

export interface MemoryRecallContext {
	cwd: string;
	namespace?: string;
}

export interface MemoryTurn {
	user: string;
	assistant: string;
}

export interface MemorySyncContext {
	cwd: string;
	sessionId?: string;
	namespace?: string;
}

export interface MemorySessionContext {
	cwd: string;
	sessionId?: string;
	namespace?: string;
}

export interface MemoryProviderTool {
	name: string;
	description: string;
	parameters: TSchema;
}

export interface MemoryProviderError {
	provider: string;
	phase:
		| "isAvailable"
		| "initialize"
		| "systemPromptBlock"
		| "prefetch"
		| "syncTurn"
		| "onSessionEnd"
		| "shutdown"
		| "getToolDefinitions"
		| "handleToolCall";
	message: string;
}

export interface MemoryProvider {
	name: string;
	isAvailable(): boolean | Promise<boolean>;
	initialize(ctx: MemoryProviderInitContext): Promise<void>;
	systemPromptBlock?(): Promise<string>;
	prefetch?(query: string, ctx: MemoryRecallContext): Promise<string>;
	syncTurn?(turn: MemoryTurn, ctx: MemorySyncContext): Promise<void>;
	onSessionEnd?(messages: AgentMessage[], ctx: MemorySessionContext): Promise<void>;
	getToolDefinitions?(): MemoryProviderTool[];
	handleToolCall?(toolName: string, args: unknown): Promise<unknown>;
	shutdown?(): Promise<void>;
}
