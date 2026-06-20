import type { Tool as OpenAITool } from "openai/resources/responses/responses.js";
import type { Api, Model, ProviderEnv } from "../types.ts";
import { getProviderEnvValue } from "../utils/provider-env.ts";

const FALSE_VALUES = new Set(["0", "false", "off", "no", "disabled"]);
const TRUE_VALUES = new Set(["1", "true", "on", "yes", "enabled"]);

export function withOpenAIHostedWebSearchTool<TApi extends Api>(
	tools: OpenAITool[] | undefined,
	model: Model<TApi>,
	env?: ProviderEnv,
): OpenAITool[] | undefined {
	if (!shouldUseOpenAIHostedWebSearch(model, env)) return tools;
	if (tools?.some((tool) => isWebSearchToolType((tool as { type?: unknown }).type))) return tools;
	const filteredTools = (tools ?? []).filter((tool) => !isLocalWebSearchFunction(tool));
	return [...filteredTools, { type: "web_search" } as OpenAITool];
}

function shouldUseOpenAIHostedWebSearch<TApi extends Api>(model: Model<TApi>, env?: ProviderEnv): boolean {
	const setting = getProviderEnvValue("PI_OPENAI_HOSTED_WEB_SEARCH", env)?.trim().toLowerCase();
	if (setting && FALSE_VALUES.has(setting)) return false;
	if (setting && TRUE_VALUES.has(setting)) return true;
	return model.provider === "openai" || model.provider === "openai-codex";
}

function isWebSearchToolType(type: unknown): boolean {
	return (
		type === "web_search" ||
		type === "web_search_2025_08_26" ||
		type === "web_search_preview" ||
		type === "web_search_preview_2025_03_11"
	);
}

function isLocalWebSearchFunction(tool: OpenAITool): boolean {
	const candidate = tool as { type?: unknown; name?: unknown };
	return candidate.type === "function" && candidate.name === "web_search";
}
