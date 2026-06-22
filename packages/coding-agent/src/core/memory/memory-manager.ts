import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { defineTool } from "../extensions/types.ts";
import { buildMemorySystemPromptBlock } from "./memory-context.ts";
import type {
	MemoryProvider,
	MemoryProviderError,
	MemoryProviderInitContext,
	MemoryRecallContext,
	MemorySessionContext,
	MemorySyncContext,
	MemoryTurn,
} from "./memory-provider.ts";
import { MemoryStore } from "./memory-store.ts";
import { createMemoryProviderTools, createMemoryTools } from "./memory-tools.ts";
import type { MemoryNamespaceConfig } from "./memory-types.ts";

export interface MemoryManagerOptions {
	cwd: string;
	namespaces: MemoryNamespaceConfig[];
	providers?: MemoryProvider[];
}

export class MemoryManager {
	private readonly cwd: string;
	private readonly namespaces: MemoryNamespaceConfig[];
	private readonly providers: MemoryProvider[];
	private availableProviders: MemoryProvider[] | undefined;
	private readonly store: MemoryStore;
	private readonly providerErrors: MemoryProviderError[] = [];
	private providerContext: Omit<MemoryProviderInitContext, "cwd"> = {};

	constructor(options: MemoryManagerOptions) {
		this.cwd = options.cwd;
		this.namespaces = [...new Map(options.namespaces.map((namespace) => [namespace.namespace, namespace])).values()];
		this.providers = options.providers ?? [];
		this.store = new MemoryStore({ cwd: this.cwd, namespaces: this.namespaces });
	}

	hasNamespaces(): boolean {
		return this.namespaces.length > 0;
	}

	hasProviders(): boolean {
		return this.providers.length > 0;
	}

	getNamespaces(): MemoryNamespaceConfig[] {
		return this.namespaces;
	}

	getStore(): MemoryStore {
		return this.store;
	}

	createTools() {
		return [...createMemoryTools(this.namespaces), this.createProviderAuditTool()];
	}

	createProviderAuditTools() {
		return [this.createProviderAuditTool()];
	}

	createProviderTools() {
		return createMemoryProviderTools(this.getAvailableProviders(), {
			context: { cwd: this.cwd, ...this.providerContext },
			reservedToolNames: new Set(this.createTools().map((tool) => tool.name)),
			onProviderError: (provider, phase, error) => this.recordProviderError(provider, phase, error),
		});
	}

	buildSystemPromptBlock(): string {
		return buildMemorySystemPromptBlock(this.store, this.namespaces);
	}

	getAvailableProviders(): MemoryProvider[] {
		return this.availableProviders ?? [];
	}

	getProviderErrors(): MemoryProviderError[] {
		return [...this.providerErrors];
	}

	async initializeProviders(ctx: Omit<MemoryProviderInitContext, "cwd"> = {}): Promise<void> {
		this.providerContext = this.withDefaultNamespace(ctx);
		const available: MemoryProvider[] = [];
		for (const provider of this.providers) {
			let isAvailable = false;
			try {
				isAvailable = await provider.isAvailable();
			} catch (error) {
				this.recordProviderError(provider, "isAvailable", error);
				continue;
			}
			if (!isAvailable) continue;
			try {
				await provider.initialize({ cwd: this.cwd, ...this.providerContext });
			} catch (error) {
				this.recordProviderError(provider, "initialize", error);
				continue;
			}
			available.push(provider);
		}
		this.availableProviders = available;
	}

	async buildProviderSystemPromptBlock(): Promise<string> {
		const blocks = await Promise.all(
			this.getAvailableProviders().map(async (provider) => {
				try {
					return await provider.systemPromptBlock?.();
				} catch (error) {
					this.recordProviderError(provider, "systemPromptBlock", error);
					return undefined;
				}
			}),
		);
		return blocks.filter((block): block is string => Boolean(block?.trim())).join("\n\n");
	}

	async prefetch(query: string, ctx: Omit<MemoryRecallContext, "cwd"> = {}): Promise<string> {
		const providerCtx = this.withDefaultNamespace(ctx);
		const recalls = await Promise.all(
			this.getAvailableProviders().map(async (provider) => {
				try {
					return await provider.prefetch?.(query, { cwd: this.cwd, ...providerCtx });
				} catch (error) {
					this.recordProviderError(provider, "prefetch", error);
					return undefined;
				}
			}),
		);
		return recalls.filter((recall): recall is string => Boolean(recall?.trim())).join("\n\n");
	}

	async syncTurn(turn: MemoryTurn, ctx: Omit<MemorySyncContext, "cwd"> = {}): Promise<void> {
		const providerCtx = this.withDefaultNamespace(ctx);
		await Promise.all(
			this.getAvailableProviders().map(async (provider) => {
				try {
					await provider.syncTurn?.(turn, { cwd: this.cwd, ...providerCtx });
				} catch (error) {
					this.recordProviderError(provider, "syncTurn", error);
				}
			}),
		);
	}

	async onSessionEnd(messages: AgentMessage[], ctx: Omit<MemorySessionContext, "cwd"> = {}): Promise<void> {
		const providerCtx = this.withDefaultNamespace(ctx);
		await Promise.all(
			this.getAvailableProviders().map(async (provider) => {
				try {
					await provider.onSessionEnd?.(messages, { cwd: this.cwd, ...providerCtx });
				} catch (error) {
					this.recordProviderError(provider, "onSessionEnd", error);
				}
			}),
		);
	}

	async shutdownProviders(): Promise<void> {
		await Promise.all(
			this.getAvailableProviders().map(async (provider) => {
				try {
					await provider.shutdown?.();
				} catch (error) {
					this.recordProviderError(provider, "shutdown", error);
				}
			}),
		);
	}

	private withDefaultNamespace<T extends { namespace?: string }>(ctx: T): T {
		if (ctx.namespace || this.namespaces.length !== 1) return { ...ctx };
		return { ...ctx, namespace: this.namespaces[0].namespace };
	}

	private recordProviderError(provider: MemoryProvider, phase: MemoryProviderError["phase"], error: unknown): void {
		const entry = {
			provider: provider.name,
			phase,
			message: error instanceof Error ? error.message : String(error),
		};
		if (
			this.providerErrors.some(
				(existing) =>
					existing.provider === entry.provider &&
					existing.phase === entry.phase &&
					existing.message === entry.message,
			)
		) {
			return;
		}
		this.providerErrors.push(entry);
	}

	private createProviderAuditTool() {
		return defineTool({
			name: "memory_provider_audit",
			label: "Memory Provider Audit",
			description: "Audit configured external memory providers, available providers, and provider errors.",
			promptSnippet: "Audit external memory provider state",
			promptGuidelines: [
				"Use memory_provider_audit when external/provider memory seems unavailable, stale, or inconsistent.",
			],
			parameters: Type.Object({}),
			execute: async () => {
				const configured = this.providers.map((provider) => provider.name);
				const available = this.getAvailableProviders().map((provider) => provider.name);
				const errors = this.getProviderErrors();
				const lines = [
					`memory_provider_audit: configured=${configured.length} available=${available.length} errors=${errors.length}`,
					`configured=${configured.length ? configured.join(",") : "none"}`,
					`available=${available.length ? available.join(",") : "none"}`,
					...errors.map(
						(error) => `error provider=${error.provider} phase=${error.phase} message=${error.message}`,
					),
				];
				return { content: [{ type: "text" as const, text: lines.join("\n") }], details: undefined };
			},
		});
	}
}
