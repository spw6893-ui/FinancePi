import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall, type Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import type { InputEvent } from "../../src/core/extensions/index.ts";
import type { MemoryProvider } from "../../src/core/memory/memory-provider.ts";
import type { MemoryNamespaceConfig } from "../../src/core/memory/memory-types.ts";
import { createFinanceMemoryNamespace } from "../../src/core/memory/namespace-registry.ts";
import type { PromptTemplate } from "../../src/core/prompt-templates.ts";
import { createSyntheticSourceInfo } from "../../src/core/source-info.ts";
import { createTestResourceLoader } from "../utilities.ts";
import { createHarness, getMessageText, type Harness } from "./harness.ts";

describe("AgentSession prompt characterization", () => {
	const harnesses: Harness[] = [];
	const tempDirs: string[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
		while (tempDirs.length > 0) {
			const tempDir = tempDirs.pop();
			if (tempDir) {
				rmSync(tempDir, { recursive: true, force: true });
			}
		}
	});

	it("prompts while idle and records a single text response", async () => {
		const harness = await createHarness();
		harnesses.push(harness);

		harness.setResponses([fauxAssistantMessage("hello")]);

		await harness.session.prompt("hi");

		expect(harness.session.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
		expect(getMessageText(harness.session.messages[0]!)).toBe("hi");
		expect(harness.getPendingResponseCount()).toBe(0);
	});

	it("syncs completed user and assistant turns to registered memory providers", async () => {
		const syncedTurns: string[] = [];
		const provider: MemoryProvider = {
			name: "turn-sync-memory",
			isAvailable: () => true,
			initialize: async () => {},
			syncTurn: async (turn, ctx) => {
				syncedTurns.push(`${ctx.sessionId ?? "none"}:${turn.user}->${turn.assistant}`);
			},
		};
		const harness = await createHarness({
			extensionFactories: [
				{
					path: "<memory-turn-sync>",
					factory: (pi) => {
						pi.registerMemoryNamespace(createFinanceMemoryNamespace());
						pi.registerMemoryProvider(provider);
					},
				},
			],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});

		harness.setResponses([fauxAssistantMessage("noted")]);

		await harness.session.prompt("remember NVDA");

		expect(syncedTurns).toEqual([`${harness.session.sessionId}:remember NVDA->noted`]);
	});

	it("passes the active memory namespace through provider lifecycle hooks", async () => {
		const providerEvents: string[] = [];
		const provider: MemoryProvider = {
			name: "namespace-memory",
			isAvailable: () => true,
			initialize: async (ctx) => {
				providerEvents.push(`initialize:${ctx.namespace ?? "none"}`);
			},
			systemPromptBlock: async () => "provider prompt",
			prefetch: async (_query, ctx) => {
				providerEvents.push(`prefetch:${ctx.namespace ?? "none"}`);
				return "";
			},
			syncTurn: async (_turn, ctx) => {
				providerEvents.push(`sync:${ctx.namespace ?? "none"}`);
			},
			onSessionEnd: async (_messages, ctx) => {
				providerEvents.push(`end:${ctx.namespace ?? "none"}`);
			},
		};
		const harness = await createHarness({
			extensionFactories: [
				{
					path: "<memory-namespace>",
					factory: (pi) => {
						pi.registerMemoryNamespace(createFinanceMemoryNamespace());
						pi.registerMemoryProvider(provider);
					},
				},
			],
		});
		harnesses.push(harness);

		await harness.session.bindExtensions({});
		harness.setResponses([fauxAssistantMessage("noted")]);
		await harness.session.prompt("NVDA memory namespace");
		await harness.session.closeMemoryProviders();

		expect(providerEvents).toEqual(["initialize:finance", "prefetch:finance", "sync:finance", "end:finance"]);
	});

	it("notifies memory providers on direct session dispose before shutdown", async () => {
		const providerEvents: string[] = [];
		const provider: MemoryProvider = {
			name: "dispose-memory",
			isAvailable: () => true,
			initialize: async () => {
				providerEvents.push("initialize");
			},
			onSessionEnd: async (messages, ctx) => {
				providerEvents.push(`end:${messages.length}:${ctx.namespace ?? "none"}`);
			},
			shutdown: async () => {
				providerEvents.push("shutdown");
			},
		};
		const harness = await createHarness({
			extensionFactories: [
				{
					path: "<memory-dispose>",
					factory: (pi) => {
						pi.registerMemoryNamespace(createFinanceMemoryNamespace());
						pi.registerMemoryProvider(provider);
					},
				},
			],
		});
		harnesses.push(harness);

		await harness.session.bindExtensions({});
		harness.setResponses([fauxAssistantMessage("noted")]);
		await harness.session.prompt("dispose memory");

		harness.session.dispose();
		await new Promise((resolve) => setImmediate(resolve));

		expect(providerEvents).toEqual(["initialize", "end:2:finance", "shutdown"]);
	});

	it("still shuts down memory providers on direct session dispose when onSessionEnd fails", async () => {
		const providerEvents: string[] = [];
		const provider: MemoryProvider = {
			name: "dispose-memory",
			isAvailable: () => true,
			initialize: async () => {
				providerEvents.push("initialize");
			},
			onSessionEnd: async () => {
				providerEvents.push("end");
				throw new Error("dispose memory end failed");
			},
			shutdown: async () => {
				providerEvents.push("shutdown");
			},
		};
		const harness = await createHarness({
			extensionFactories: [
				{
					path: "<memory-dispose-failure>",
					factory: (pi) => {
						pi.registerMemoryNamespace(createFinanceMemoryNamespace());
						pi.registerMemoryProvider(provider);
					},
				},
			],
		});
		harnesses.push(harness);

		await harness.session.bindExtensions({});
		harness.session.dispose();
		await new Promise((resolve) => setImmediate(resolve));

		expect(providerEvents).toEqual(["initialize", "end", "shutdown"]);
	});

	it("does not guess a provider namespace when multiple memory namespaces are active", async () => {
		const providerEvents: string[] = [];
		const researchNamespace: MemoryNamespaceConfig = {
			namespace: "research",
			root: ".pi/memory/research",
			description: "Research memory",
			targets: [
				{
					target: "notes",
					layer: "domain",
					file: "NOTES.md",
					charLimit: 1000,
					injectPolicy: "search_only",
					description: "Research notes",
				},
			],
		};
		const provider: MemoryProvider = {
			name: "namespace-memory",
			isAvailable: () => true,
			initialize: async (ctx) => {
				providerEvents.push(`initialize:${ctx.namespace ?? "none"}`);
			},
			prefetch: async (_query, ctx) => {
				providerEvents.push(`prefetch:${ctx.namespace ?? "none"}`);
				return "";
			},
			syncTurn: async (_turn, ctx) => {
				providerEvents.push(`sync:${ctx.namespace ?? "none"}`);
			},
			onSessionEnd: async (_messages, ctx) => {
				providerEvents.push(`end:${ctx.namespace ?? "none"}`);
			},
		};
		const harness = await createHarness({
			extensionFactories: [
				{
					path: "<memory-multi-namespace>",
					factory: (pi) => {
						pi.registerMemoryNamespace(createFinanceMemoryNamespace());
						pi.registerMemoryNamespace(researchNamespace);
						pi.registerMemoryProvider(provider);
					},
				},
			],
		});
		harnesses.push(harness);

		await harness.session.bindExtensions({});
		harness.setResponses([fauxAssistantMessage("noted")]);
		await harness.session.prompt("NVDA memory namespace");
		await harness.session.closeMemoryProviders();

		expect(providerEvents).toEqual(["initialize:none", "prefetch:none", "sync:none", "end:none"]);
	});

	it("does not sync intermediate tool-use turns to memory providers", async () => {
		const syncedTurns: string[] = [];
		const provider: MemoryProvider = {
			name: "turn-sync-memory",
			isAvailable: () => true,
			initialize: async () => {},
			syncTurn: async (turn) => {
				syncedTurns.push(`${turn.user}->${turn.assistant}`);
			},
		};
		const echoTool: AgentTool = {
			name: "echo",
			label: "Echo",
			description: "Echo text back",
			parameters: Type.Object({ text: Type.String() }),
			execute: async (_toolCallId, params) => {
				const text = typeof params === "object" && params !== null && "text" in params ? String(params.text) : "";
				return {
					content: [{ type: "text", text: `echo:${text}` }],
					details: params,
				};
			},
		};
		const harness = await createHarness({
			tools: [echoTool],
			extensionFactories: [
				{
					path: "<memory-turn-sync>",
					factory: (pi) => {
						pi.registerMemoryNamespace(createFinanceMemoryNamespace());
						pi.registerMemoryProvider(provider);
					},
				},
			],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});

		harness.setResponses([
			fauxAssistantMessage(fauxToolCall("echo", { text: "NVDA" }), { stopReason: "toolUse" }),
			fauxAssistantMessage("final view"),
		]);

		await harness.session.prompt("analyze NVDA");

		expect(syncedTurns).toEqual(["analyze NVDA->final view"]);
	});

	it("injects memory provider prefetch into the current turn system prompt only", async () => {
		let providerSystemPrompt = "";
		const provider: MemoryProvider = {
			name: "prefetch-memory",
			isAvailable: () => true,
			initialize: async () => {},
			prefetch: async (query) => `prior research for ${query}: asOf=2026-06-20`,
		};
		const harness = await createHarness({
			extensionFactories: [
				{
					path: "<memory-prefetch>",
					factory: (pi) => {
						pi.registerMemoryNamespace(createFinanceMemoryNamespace());
						pi.registerMemoryProvider(provider);
					},
				},
			],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});

		harness.setResponses([
			(context) => {
				providerSystemPrompt = context.systemPrompt ?? "";
				return fauxAssistantMessage("used recall");
			},
		]);

		await harness.session.prompt("NVDA");

		expect(providerSystemPrompt).toContain("MEMORY PROVIDER PREFETCH");
		expect(providerSystemPrompt).toContain("prior research for NVDA");
		expect(harness.sessionManager.getEntries().filter((entry) => entry.type === "custom_message")).toHaveLength(0);
	});

	it("continues prompting when memory provider prefetch fails", async () => {
		let sawPrompt = false;
		const provider: MemoryProvider = {
			name: "prefetch-memory",
			isAvailable: () => true,
			initialize: async () => {},
			prefetch: async () => {
				throw new Error("prefetch failed");
			},
		};
		const harness = await createHarness({
			extensionFactories: [
				{
					path: "<memory-prefetch>",
					factory: (pi) => {
						pi.registerMemoryNamespace(createFinanceMemoryNamespace());
						pi.registerMemoryProvider(provider);
					},
				},
			],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});

		harness.setResponses([
			() => {
				sawPrompt = true;
				return fauxAssistantMessage("ok");
			},
		]);

		await harness.session.prompt("NVDA");

		expect(sawPrompt).toBe(true);
		expect(getMessageText(harness.session.messages.at(-1))).toBe("ok");
	});

	it("truncates oversized memory provider prefetch context", async () => {
		let providerSystemPrompt = "";
		const provider: MemoryProvider = {
			name: "prefetch-memory",
			isAvailable: () => true,
			initialize: async () => {},
			prefetch: async () => `NVDA ${"large recall ".repeat(1000)}`,
		};
		const harness = await createHarness({
			extensionFactories: [
				{
					path: "<memory-prefetch>",
					factory: (pi) => {
						pi.registerMemoryNamespace(createFinanceMemoryNamespace());
						pi.registerMemoryProvider(provider);
					},
				},
			],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});

		harness.setResponses([
			(context) => {
				providerSystemPrompt = context.systemPrompt ?? "";
				return fauxAssistantMessage("ok");
			},
		]);

		await harness.session.prompt("NVDA");

		const prefetchBlock = providerSystemPrompt.slice(providerSystemPrompt.indexOf("MEMORY PROVIDER PREFETCH:"));
		expect(prefetchBlock.length).toBeLessThan(2_000);
		expect(providerSystemPrompt).toContain("[truncated]");
	});

	it("handles a tool call turn and waits for the follow-up LLM response", async () => {
		const toolRuns: string[] = [];
		const echoTool: AgentTool = {
			name: "echo",
			label: "Echo",
			description: "Echo text back",
			parameters: Type.Object({ text: Type.String() }),
			execute: async (_toolCallId, params) => {
				const text = typeof params === "object" && params !== null && "text" in params ? String(params.text) : "";
				toolRuns.push(text);
				return {
					content: [{ type: "text", text: `echo:${text}` }],
					details: { text },
				};
			},
		};
		const harness = await createHarness({ tools: [echoTool] });
		harnesses.push(harness);

		harness.setResponses([
			fauxAssistantMessage(fauxToolCall("echo", { text: "hello" }), { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);

		await harness.session.prompt("start");

		expect(toolRuns).toEqual(["hello"]);
		expect(harness.session.messages.map((message) => message.role)).toEqual([
			"user",
			"assistant",
			"toolResult",
			"assistant",
		]);
		expect(harness.session.messages[2]?.role).toBe("toolResult");
		expect(harness.session.messages[3]?.role).toBe("assistant");
	});

	it("executes multiple tool calls from one response and continues with a single follow-up response", async () => {
		const toolRuns: string[] = [];
		const makeTool = (name: string, delayMs: number): AgentTool => ({
			name,
			label: name,
			description: `${name} tool`,
			parameters: Type.Object({ value: Type.String() }),
			execute: async (_toolCallId, params) => {
				const value =
					typeof params === "object" && params !== null && "value" in params ? String(params.value) : "";
				await new Promise((resolve) => setTimeout(resolve, delayMs));
				toolRuns.push(`${name}:${value}`);
				return {
					content: [{ type: "text", text: `${name}:${value}` }],
					details: { value },
				};
			},
		});
		const harness = await createHarness({ tools: [makeTool("slow", 25), makeTool("fast", 0)] });
		harnesses.push(harness);

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("slow", { value: "a" }), fauxToolCall("fast", { value: "b" })], {
				stopReason: "toolUse",
			}),
			(context) => {
				const toolResults = context.messages.filter((message) => message.role === "toolResult");
				return fauxAssistantMessage(`tool results: ${toolResults.length}`);
			},
		]);

		await harness.session.prompt("run tools");

		expect(toolRuns.sort()).toEqual(["fast:b", "slow:a"]);
		expect(harness.session.messages.filter((message) => message.role === "toolResult")).toHaveLength(2);
		expect(harness.session.messages[harness.session.messages.length - 1]?.role).toBe("assistant");
	});

	it("preserves image attachments in the provider context", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		let sawImage = false;

		harness.setResponses([
			(context) => {
				const user = context.messages.find((message) => message.role === "user");
				sawImage =
					user?.role === "user" &&
					typeof user.content !== "string" &&
					user.content.some((part) => part.type === "image");
				return fauxAssistantMessage("ok");
			},
		]);

		await harness.session.prompt("describe", {
			images: [
				{
					type: "image",
					mimeType: "image/png",
					data: "ZmFrZQ==",
				},
			],
		});

		expect(sawImage).toBe(true);
	});

	it("expands skill commands before sending the prompt", async () => {
		const tempDir = join(tmpdir(), `pi-skill-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
		tempDirs.push(tempDir);
		const skillPath = join(tempDir, "test-skill.md");
		writeFileSync(skillPath, "# Test Skill\n\nUse the skill body.");

		const resourceLoader = {
			...createTestResourceLoader(),
			getSkills: () => ({
				skills: [
					{
						name: "test",
						description: "Test skill",
						filePath: skillPath,
						disableModelInvocation: false,
						baseDir: tempDir,
						sourceInfo: createSyntheticSourceInfo(skillPath, {
							source: "local",
							scope: "project",
							origin: "top-level",
							baseDir: tempDir,
						}),
					},
				],
				diagnostics: [],
			}),
		};
		const harness = await createHarness({ resourceLoader });
		harnesses.push(harness);
		let expandedPrompt = "";

		harness.setResponses([
			(context) => {
				const user = context.messages.find((message) => message.role === "user");
				expandedPrompt = user ? getMessageText(user) : "";
				return fauxAssistantMessage("ok");
			},
		]);

		await harness.session.prompt("/skill:test explain this");

		expect(expandedPrompt).toContain('<skill name="test" location="');
		expect(expandedPrompt).toContain("Use the skill body.");
		expect(expandedPrompt).toContain("explain this");
	});

	it("expands prompt templates before sending the prompt", async () => {
		const template: PromptTemplate = {
			name: "review",
			description: "Review template",
			content: "Review this code: $1",
			filePath: "/virtual/review.md",
			sourceInfo: createSyntheticSourceInfo("/virtual/review.md", {
				source: "local",
				scope: "temporary",
				origin: "top-level",
			}),
		};
		const resourceLoader = {
			...createTestResourceLoader(),
			getPrompts: () => ({ prompts: [template], diagnostics: [] }),
		};
		const harness = await createHarness({ resourceLoader });
		harnesses.push(harness);
		let expandedPrompt = "";

		harness.setResponses([
			(context) => {
				const user = context.messages.find((message) => message.role === "user");
				expandedPrompt = user ? getMessageText(user) : "";
				return fauxAssistantMessage("ok");
			},
		]);

		await harness.session.prompt("/review src/index.ts");

		expect(expandedPrompt).toBe("Review this code: src/index.ts");
	});

	it("dispatches extension commands without consuming a provider response", async () => {
		const commandRuns: string[] = [];
		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.registerCommand("testcmd", {
						description: "Test command",
						handler: async (args) => {
							commandRuns.push(args);
						},
					});
				},
			],
		});
		harnesses.push(harness);
		harness.setResponses([fauxAssistantMessage("should stay queued")]);

		await harness.session.prompt("/testcmd hello world");

		expect(commandRuns).toEqual(["hello world"]);
		expect(harness.session.messages).toEqual([]);
		expect(harness.getPendingResponseCount()).toBe(1);
	});

	it("sendUserMessage while idle triggers a turn", async () => {
		const harness = await createHarness();
		harnesses.push(harness);

		harness.setResponses([fauxAssistantMessage("response")]);

		await harness.session.sendUserMessage("from extension");

		expect(harness.session.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
		expect(getMessageText(harness.session.messages[0]!)).toBe("from extension");
	});

	it("does not report streamingBehavior to input handlers while idle", async () => {
		const inputEvents: InputEvent[] = [];
		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.on("input", (event) => {
						inputEvents.push(event);
					});
				},
			],
		});
		harnesses.push(harness);
		harness.setResponses([fauxAssistantMessage("ok")]);

		await harness.session.prompt("idle", { streamingBehavior: "followUp" });

		expect(inputEvents).toHaveLength(1);
		expect(inputEvents[0]?.streamingBehavior).toBeUndefined();
	});

	it("reports streamingBehavior to input handlers while streaming", async () => {
		let releaseToolExecution: (() => void) | undefined;
		const toolRelease = new Promise<void>((resolve) => {
			releaseToolExecution = resolve;
		});
		const inputEvents: InputEvent[] = [];
		const waitTool: AgentTool = {
			name: "wait",
			label: "Wait",
			description: "Wait for release",
			parameters: Type.Object({}),
			execute: async () => {
				await toolRelease;
				return {
					content: [{ type: "text", text: "released" }],
					details: {},
				};
			},
		};
		const harness = await createHarness({
			tools: [waitTool],
			extensionFactories: [
				(pi) => {
					pi.on("input", (event) => {
						inputEvents.push(event);
					});
				},
			],
		});
		harnesses.push(harness);
		harness.setResponses([
			fauxAssistantMessage(fauxToolCall("wait", {}), { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);

		const sawToolStart = new Promise<void>((resolve) => {
			const unsubscribe = harness.session.subscribe((event) => {
				if (event.type === "tool_execution_start") {
					unsubscribe();
					resolve();
				}
			});
		});

		const promptPromise = harness.session.prompt("start");
		await sawToolStart;
		await harness.session.prompt("queued", { streamingBehavior: "followUp" });

		expect(inputEvents.map((event) => event.streamingBehavior)).toEqual([undefined, "followUp"]);

		releaseToolExecution?.();
		await promptPromise;
	});

	it("throws when prompted during streaming without a streamingBehavior", async () => {
		let releaseToolExecution: (() => void) | undefined;
		const toolRelease = new Promise<void>((resolve) => {
			releaseToolExecution = resolve;
		});
		const waitTool: AgentTool = {
			name: "wait",
			label: "Wait",
			description: "Wait for release",
			parameters: Type.Object({}),
			execute: async () => {
				await toolRelease;
				return {
					content: [{ type: "text", text: "released" }],
					details: {},
				};
			},
		};
		const harness = await createHarness({ tools: [waitTool] });
		harnesses.push(harness);
		harness.setResponses([
			fauxAssistantMessage(fauxToolCall("wait", {}), { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);

		const sawToolStart = new Promise<void>((resolve) => {
			const unsubscribe = harness.session.subscribe((event) => {
				if (event.type === "tool_execution_start") {
					unsubscribe();
					resolve();
				}
			});
		});

		const promptPromise = harness.session.prompt("start");
		await sawToolStart;

		await expect(harness.session.prompt("second")).rejects.toThrow(
			"Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.",
		);

		releaseToolExecution?.();
		await promptPromise;
	});

	it("throws when prompting without a model", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		harness.session.agent.state.model = undefined as unknown as Model<any>;

		await expect(harness.session.prompt("hi")).rejects.toThrow("No model selected.");
	});

	it("throws when prompting without configured auth", async () => {
		const harness = await createHarness({ withConfiguredAuth: false });
		harnesses.push(harness);

		await expect(harness.session.prompt("hi")).rejects.toThrow(
			`No API key found for ${harness.getModel().provider}.`,
		);
	});
});
