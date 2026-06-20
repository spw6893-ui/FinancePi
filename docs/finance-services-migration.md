# Finance Services Migration

This project carries a Pi-native adaptation of Anthropic's public `financial-services` repository:

<https://github.com/anthropics/financial-services>

The migration is not a direct vendored copy. It maps the same architecture into Pi's resource model.

## What was migrated

| Anthropic concept | Pi implementation |
| --- | --- |
| Agent plugins | Built-in finance/crypto extensions plus `.pi/skills/finance-services` |
| Skills | `.pi/skills/finance-services/SKILL.md` and references |
| Commands | `.pi/prompts/*.md` prompt templates |
| MCP connector runtime | `finance_mcp_*` tools plus `.pi/finance-mcp.example.json` template |
| Web research runtime | Built-in `web_search` and `web_open` tools with local artifacts under `.pi/artifacts/web/` |
| Market data workflow | Default finance prompt and market-research continuation loop |

## Included workflows

- Market Researcher: sector overview, competitive landscape, comps, idea shortlist.
- Equity Research: earnings analysis, earnings preview, initiating coverage, thesis tracker, catalyst calendar, idea generation.
- Financial Analysis: comps, DCF framing, 3-statement/model update, audit checks.

## Prompt commands

These project prompt templates are available when project prompts are loaded:

- `/sector`
- `/comps`
- `/competitive-analysis`
- `/screen`
- `/earnings`
- `/earnings-preview`
- `/dcf`
- `/lbo`
- `/3-statement-model`
- `/debug-model`
- `/model-update`
- `/morning-note`
- `/initiate`
- `/thesis`
- `/catalysts`

They all route into `/skill:finance-services` and then ask the model to run the relevant workflow.

## MCP connector template

`.pi/finance-mcp.example.json` is a Pi-local template for user-provided free, self-hosted, or explicitly licensed MCP servers. Paid institutional endpoints from Anthropic's public catalog are intentionally not listed because they return 401/403 without commercial access.

To enable runtime calls, copy the needed entries to `.pi/finance-mcp.json`, fill provider URLs/headers/tokens, then use:

- `finance_mcp_servers`
- `finance_mcp_list_tools`
- `finance_mcp_call_tool`

The default free agent path does not include paid institutional endpoints.

## Web research

Pi includes provider-independent web research tools:

- `web_search` returns a compact result summary and writes search hits to `.pi/artifacts/web/*.csv`.
- `web_open` fetches a page, extracts readable text, and writes the extracted text to `.pi/artifacts/web/*.txt`.

For OpenAI Responses and OpenAI Codex Responses models, Pi also injects OpenAI's hosted `web_search` tool by default. In that mode Pi removes the local `web_search` function from the OpenAI request to avoid duplicate search tools, while keeping `web_open` available. Set `PI_OPENAI_HOSTED_WEB_SEARCH=0` to disable hosted web search.

For non-OpenAI providers, set `PI_WEB_SEARCH_SEARXNG_URL` to a free/self-hosted SearxNG instance for reliable local search. Without it, Pi attempts a best-effort public DuckDuckGo HTML search, which can degrade if the search engine blocks automated requests.

## Source hierarchy

Pi finance workflows should prefer:

1. user-provided files and local `.pi/artifacts/market-data/*.csv`;
2. the compact free-source stack: SEC EDGAR, Yahoo chart/news, and Binance public market data;
3. optional FRED macro data when a free key is configured;
4. user-configured MCP connectors only when the user has provided a working free, self-hosted, or licensed server;
5. primary issuer materials for segment/KPI commentary;
6. `web_search`/`web_open` for freshness, catalysts, source discovery, and verification, not primary valuation data.

Deliberately excluded from the default path: Alpha Vantage, FMP, Finnhub, Twelve Data, Polygon, CoinGecko, DefiLlama, and similar broad provider catalogs. They can be added later as explicit features, but the default finance agent should not scatter calls across many partially overlapping free tiers.

The default free US equity price path is chart-derived. It should be presented as latest available price/bar/close with `asOf` metadata, not as a guaranteed real-time or live intraday quote.

## Why this shape

Pi keeps this MCP support project-local and finance-specific. The migrated version puts Anthropic's connector architecture into:

- an explicit manifest template,
- runtime `finance_mcp_*` tools for user-configured MCP servers,
- prompt/source-priority rules,
- and project skills/prompts that can be used today.

This keeps the current Pi CLI working without introducing a service process, FastAPI, MongoDB, or a separate MCP runtime daemon.
