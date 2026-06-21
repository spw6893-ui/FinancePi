import { buildMemorySystemPromptBlock } from "./memory-context.ts";
import { MemoryStore } from "./memory-store.ts";
import { createMemoryTools } from "./memory-tools.ts";
import type { MemoryNamespaceConfig } from "./memory-types.ts";

export interface MemoryManagerOptions {
	cwd: string;
	namespaces: MemoryNamespaceConfig[];
}

export class MemoryManager {
	private readonly cwd: string;
	private readonly namespaces: MemoryNamespaceConfig[];
	private readonly store: MemoryStore;

	constructor(options: MemoryManagerOptions) {
		this.cwd = options.cwd;
		this.namespaces = [...new Map(options.namespaces.map((namespace) => [namespace.namespace, namespace])).values()];
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

	buildSystemPromptBlock(): string {
		return buildMemorySystemPromptBlock(this.store, this.namespaces);
	}
}
