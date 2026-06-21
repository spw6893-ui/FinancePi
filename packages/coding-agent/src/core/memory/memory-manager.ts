import type { AgentMessage } from "@earendil-works/pi-agent-core";
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

	constructor(options: MemoryManagerOptions) {
		this.cwd = options.cwd;
		this.namespaces = [...new Map(options.namespaces.map((namespace) => [namespace.namespace, namespace])).values()];
		this.providers = options.providers ?? [];
		this.store = new MemoryStore({ cwd: this.cwd, namespaces: this.namespaces });
	}

	hasNamespaces(): boolean {
		return this.namespaces.length > 0;
	}

	getNamespaces(): MemoryNamespaceConfig[] {
		return this.namespaces;
	}

	getStore(): MemoryStore {
		return this.store;
	}

	createTools() {
		return createMemoryTools(this.namespaces);
	}

	createProviderTools() {
		return createMemoryProviderTools(this.getAvailableProviders());
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
				await provider.initialize({ cwd: this.cwd, ...ctx });
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
		const recalls = await Promise.all(
			this.getAvailableProviders().map(async (provider) => {
				try {
					return await provider.prefetch?.(query, { cwd: this.cwd, ...ctx });
				} catch (error) {
					this.recordProviderError(provider, "prefetch", error);
					return undefined;
				}
			}),
		);
		return recalls.filter((recall): recall is string => Boolean(recall?.trim())).join("\n\n");
	}

	async syncTurn(turn: MemoryTurn, ctx: Omit<MemorySyncContext, "cwd"> = {}): Promise<void> {
		await Promise.all(
			this.getAvailableProviders().map(async (provider) => {
				try {
					await provider.syncTurn?.(turn, { cwd: this.cwd, ...ctx });
				} catch (error) {
					this.recordProviderError(provider, "syncTurn", error);
				}
			}),
		);
	}

	async onSessionEnd(messages: AgentMessage[], ctx: Omit<MemorySessionContext, "cwd"> = {}): Promise<void> {
		await Promise.all(
			this.getAvailableProviders().map(async (provider) => {
				try {
					await provider.onSessionEnd?.(messages, { cwd: this.cwd, ...ctx });
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

	private recordProviderError(provider: MemoryProvider, phase: MemoryProviderError["phase"], error: unknown): void {
		this.providerErrors.push({
			provider: provider.name,
			phase,
			message: error instanceof Error ? error.message : String(error),
		});
	}
}
