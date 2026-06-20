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

`.pi/finance-mcp.example.json` is a corrected, Pi-local example manifest based on Anthropic's financial-services MCP catalog. It is not automatically enabled by Pi. Use it as a connector inventory for an MCP-capable runtime or a future Pi extension layer.

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
2. configured institutional MCP/data connectors;
3. Pi local `finance_*` and `crypto_*` tools;
4. primary SEC filings and issuer materials;
5. web/news search for freshness and catalysts, not primary valuation data.

## Why this shape

Pi currently documents "No MCP" as a default product stance. The migrated version therefore puts Anthropic's connector architecture into:

- an explicit manifest template,
- prompt/source-priority rules,
- and project skills/prompts that can be used today.

This keeps the current Pi CLI working without introducing a service process, FastAPI, MongoDB, or a new MCP runtime.
