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
| MCP connector catalog | `.pi/finance-mcp.example.json` |
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

`.pi/finance-mcp.example.json` is a corrected, Pi-local example manifest based on Anthropic's financial-services MCP catalog. To enable runtime calls, copy the needed entries to `.pi/finance-mcp.json`, fill provider URLs/headers/tokens, then use:

- `finance_mcp_servers`
- `finance_mcp_list_tools`
- `finance_mcp_call_tool`

Connector categories:

- Daloopa
- Morningstar
- S&P Global / Kensho
- FactSet
- Moody's
- MT Newswires
- Aiera
- LSEG
- PitchBook
- Chronograph
- Egnyte
- Box

## Source hierarchy

Pi finance workflows should prefer:

1. user-provided files and local `.pi/artifacts/market-data/*.csv`;
2. the compact free-source stack: SEC EDGAR, Yahoo chart/news, and Binance public market data;
3. optional FRED macro data when a free key is configured;
4. configured institutional MCP/data connectors only when premium data is required;
5. primary issuer materials for segment/KPI commentary;
6. web/news search for freshness and catalysts, not primary valuation data.

Deliberately excluded from the default path: Alpha Vantage, FMP, Finnhub, Twelve Data, Polygon, CoinGecko, DefiLlama, and similar broad provider catalogs. They can be added later as explicit features, but the default finance agent should not scatter calls across many partially overlapping free tiers.

## Why this shape

Pi keeps this MCP support project-local and finance-specific. The migrated version puts Anthropic's connector architecture into:

- an explicit manifest template,
- runtime `finance_mcp_*` tools,
- prompt/source-priority rules,
- and project skills/prompts that can be used today.

This keeps the current Pi CLI working without introducing a service process, FastAPI, MongoDB, or a separate MCP runtime daemon.
