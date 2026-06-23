import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli/args.ts";
import { getCliExtensionFactories } from "../../src/cli/builtin-extensions.ts";
import financeWorkflowExtension from "../../src/core/finance-workflow-extension.ts";
import type { SessionEntry } from "../../src/core/session-manager.ts";
import { createTestExtensionsResult } from "../utilities.ts";

function firstText(result: { content: Array<{ type: string; text?: string }> } | undefined): string | undefined {
	const content = result?.content[0];
	return content?.type === "text" ? content.text : undefined;
}

describe("finance workflow extension", () => {
	it("is registered by default as a built-in workflow extension", () => {
		const factories = getCliExtensionFactories(parseArgs([]));

		expect(factories).toContain(financeWorkflowExtension);
	});

	it("registers plan, grill, and goal commands", async () => {
		const result = await createTestExtensionsResult([{ factory: financeWorkflowExtension, path: "<workflow>" }]);
		const extension = result.extensions[0];

		expect(extension?.commands.has("plan")).toBe(true);
		expect(extension?.commands.has("grill")).toBe(true);
		expect(extension?.commands.has("grill-me")).toBe(true);
		expect(extension?.commands.has("goal")).toBe(true);
		expect(extension?.flags.has("plan")).toBe(true);
		expect(extension?.flags.has("grill")).toBe(true);
		expect(extension?.tools.has("get_goal")).toBe(true);
		expect(extension?.tools.has("create_goal")).toBe(true);
		expect(extension?.tools.has("update_goal")).toBe(true);
	});

	it("injects non-template finance plan mode guidance when plan mode is active", async () => {
		const result = await createTestExtensionsResult([{ factory: financeWorkflowExtension, path: "<workflow>" }]);
		const extension = result.extensions[0];
		const planHandler = extension?.commands.get("plan")?.handler;
		const beforeStart = extension?.handlers.get("before_agent_start")?.[0];
		const notifications: string[] = [];

		await planHandler?.("", {
			ui: { notify: (message: string) => notifications.push(message), setStatus: () => {} },
		} as never);
		const output = (await beforeStart?.(
			{
				type: "before_agent_start",
				prompt: "分析NVDA",
				systemPrompt: "base",
				systemPromptOptions: {} as never,
			},
			{} as never,
		)) as { systemPrompt?: string } | undefined;

		expect(notifications.join("\n")).toContain("Plan mode enabled");
		expect(output?.systemPrompt).toContain("FINANCE PLAN MODE");
		expect(output?.systemPrompt).toContain("Do not mutate files or session state to execute the plan");
		expect(output?.systemPrompt).toContain("<proposed_plan>");
		expect(output?.systemPrompt).toContain("decision complete");
		expect(output?.systemPrompt).not.toContain("coding assistant");
	});

	it("blocks mutating tools while plan mode is active", async () => {
		const result = await createTestExtensionsResult([{ factory: financeWorkflowExtension, path: "<workflow>" }]);
		const extension = result.extensions[0];
		const planHandler = extension?.commands.get("plan")?.handler;
		const toolCall = extension?.handlers.get("tool_call")?.[0];

		await planHandler?.("", {
			ui: { notify: () => {}, setStatus: () => {} },
		} as never);
		const output = (await toolCall?.(
			{
				type: "tool_call",
				toolName: "edit",
				input: {},
			},
			{} as never,
		)) as { block?: boolean; reason?: string } | undefined;

		expect(output?.block).toBe(true);
		expect(output?.reason).toContain("Plan mode");
	});

	it("blocks state-writing workflow and memory tools while plan mode is active", async () => {
		const result = await createTestExtensionsResult([{ factory: financeWorkflowExtension, path: "<workflow>" }]);
		const extension = result.extensions[0];
		const planHandler = extension?.commands.get("plan")?.handler;
		const toolCall = extension?.handlers.get("tool_call")?.[0];

		await planHandler?.("", {
			ui: { notify: () => {}, setStatus: () => {} },
		} as never);

		for (const toolName of ["create_goal", "update_goal", "memory_write", "memory_research_report"]) {
			const output = (await toolCall?.(
				{
					type: "tool_call",
					toolName,
					input: {},
				},
				{} as never,
			)) as { block?: boolean; reason?: string } | undefined;

			expect(output?.block).toBe(true);
			expect(output?.reason).toContain("Plan mode");
		}
	});

	it("leaves plan mode and asks the finance agent to execute when /plan execute is used", async () => {
		const result = await createTestExtensionsResult([{ factory: financeWorkflowExtension, path: "<workflow>" }]);
		const extension = result.extensions[0];
		const planHandler = extension?.commands.get("plan")?.handler;
		const toolCall = extension?.handlers.get("tool_call")?.[0];
		const userMessages: Array<{ content: string; options?: { deliverAs?: "steer" | "followUp" } }> = [];
		result.runtime.sendUserMessage = (content, options) => {
			if (typeof content === "string") userMessages.push({ content, options });
		};

		await planHandler?.("", {
			ui: { notify: () => {}, setStatus: () => {} },
		} as never);
		await planHandler?.("execute", {
			ui: { notify: () => {}, setStatus: () => {} },
		} as never);
		const output = (await toolCall?.(
			{
				type: "tool_call",
				toolName: "edit",
				input: {},
			},
			{} as never,
		)) as { block?: boolean } | undefined;

		expect(output?.block).toBeUndefined();
		expect(userMessages).toEqual([
			{
				content:
					"Execute the approved finance plan. Continue naturally from the latest proposed plan and current evidence.",
				options: { deliverAs: "followUp" },
			},
		]);
	});

	it("injects grill mode guidance that keeps asking finance due-diligence questions", async () => {
		const result = await createTestExtensionsResult([{ factory: financeWorkflowExtension, path: "<workflow>" }]);
		const extension = result.extensions[0];
		const grillHandler = extension?.commands.get("grill")?.handler;
		const beforeStart = extension?.handlers.get("before_agent_start")?.[0];

		await grillHandler?.("", {
			ui: { notify: () => {}, setStatus: () => {} },
		} as never);
		const output = (await beforeStart?.(
			{
				type: "before_agent_start",
				prompt: "我的AI投资框架合理吗",
				systemPrompt: "base",
				systemPromptOptions: {} as never,
			},
			{} as never,
		)) as { systemPrompt?: string } | undefined;

		expect(output?.systemPrompt).toContain("FINANCE GRILL MODE");
		expect(output?.systemPrompt).toContain("Keep asking");
		expect(output?.systemPrompt).toContain("one high-leverage question");
		expect(output?.systemPrompt).toContain("thesis, evidence, valuation, catalysts, risks");
		expect(output?.systemPrompt).not.toContain("fixed answer template");
	});

	it("persists goal state and injects Codex-style continuation guidance", async () => {
		const result = await createTestExtensionsResult([{ factory: financeWorkflowExtension, path: "<workflow>" }]);
		const extension = result.extensions[0];
		const goalHandler = extension?.commands.get("goal")?.handler;
		const beforeStart = extension?.handlers.get("before_agent_start")?.[0];
		const entries: SessionEntry[] = [];
		result.runtime.appendEntry = (customType, data) => {
			entries.push({
				type: "custom",
				id: String(entries.length),
				parentId: null,
				timestamp: new Date().toISOString(),
				customType,
				data,
			});
		};

		await goalHandler?.("研究半导体设备链机会", {
			ui: { notify: () => {}, setStatus: () => {} },
			sessionManager: { getEntries: () => entries },
		} as never);
		const output = (await beforeStart?.(
			{
				type: "before_agent_start",
				prompt: "继续",
				systemPrompt: "base",
				systemPromptOptions: {} as never,
			},
			{
				sessionManager: { getEntries: () => entries },
			} as never,
		)) as { systemPrompt?: string } | undefined;

		expect(entries).toHaveLength(1);
		const entry = entries[0];
		expect(entry?.type).toBe("custom");
		expect(entry?.type === "custom" ? entry.customType : undefined).toBe("finance-workflow-goal");
		expect(output?.systemPrompt).toContain("ACTIVE FINANCE GOAL");
		expect(output?.systemPrompt).toContain("研究半导体设备链机会");
		expect(output?.systemPrompt).toContain("Do not shrink the objective");
		expect(output?.systemPrompt).toContain("Only mark the goal complete when current evidence proves");
	});

	it("goal tools expose and update persisted goal state", async () => {
		const result = await createTestExtensionsResult([{ factory: financeWorkflowExtension, path: "<workflow>" }]);
		const extension = result.extensions[0];
		const entries: SessionEntry[] = [];
		result.runtime.appendEntry = (customType, data) => {
			entries.push({
				type: "custom",
				id: String(entries.length),
				parentId: null,
				timestamp: new Date().toISOString(),
				customType,
				data,
			});
		};
		const ctx = { sessionManager: { getEntries: () => entries } } as never;

		const createResult = await extension?.tools
			.get("create_goal")
			?.definition.execute("create", { objective: "研究AI电力链机会" }, undefined, undefined, ctx);
		const getResult = await extension?.tools
			.get("get_goal")
			?.definition.execute("get", {}, undefined, undefined, ctx);
		const updateResult = await extension?.tools
			.get("update_goal")
			?.definition.execute("update", { status: "complete" }, undefined, undefined, ctx);

		expect(firstText(createResult)).toContain("active");
		expect(firstText(getResult)).toContain("研究AI电力链机会");
		expect(firstText(updateResult)).toContain("complete");
	});

	it("does not let create_goal overwrite an unfinished existing goal", async () => {
		const result = await createTestExtensionsResult([{ factory: financeWorkflowExtension, path: "<workflow>" }]);
		const extension = result.extensions[0];
		const entries: SessionEntry[] = [];
		result.runtime.appendEntry = (customType, data) => {
			entries.push({
				type: "custom",
				id: String(entries.length),
				parentId: null,
				timestamp: new Date().toISOString(),
				customType,
				data,
			});
		};
		const ctx = { sessionManager: { getEntries: () => entries } } as never;

		await extension?.tools
			.get("create_goal")
			?.definition.execute("create-1", { objective: "研究AI电力链机会" }, undefined, undefined, ctx);
		await expect(
			extension?.tools
				.get("create_goal")
				?.definition.execute("create-2", { objective: "研究银行股机会" }, undefined, undefined, ctx),
		).rejects.toThrow("unfinished finance goal");
		const getResult = await extension?.tools
			.get("get_goal")
			?.definition.execute("get", {}, undefined, undefined, ctx);

		expect(firstText(getResult)).toContain("研究AI电力链机会");
		expect(firstText(getResult)).not.toContain("研究银行股机会");
	});
});
