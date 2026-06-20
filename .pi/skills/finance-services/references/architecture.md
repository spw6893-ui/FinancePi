# Anthropic Financial Services Architecture Mapped to Pi

Source reference: https://github.com/anthropics/financial-services

## What Anthropic built

The repository is a financial-services agent system, not a single prompt. It has four layers:

1. **Agents**
   - Named end-to-end workflows such as Market Researcher, Earnings Reviewer, Pitch Agent, Model Builder, Meeting Prep Agent, and fund/admin agents.
   - Each agent combines a system prompt, skills, optional commands, and optional data connectors.

2. **Skills**
   - Reusable workflow instructions such as comps-analysis, DCF, sector-overview, earnings-analysis, idea-generation, competitive-analysis, model-update, and deck/model authoring.
   - Skills are progressive-disclosure assets: load only the skill needed for the current task.

3. **Commands**
   - Explicit slash workflows such as `/comps`, `/dcf`, `/earnings`, `/sector`, `/screen`, `/model-update`, `/catalysts`, `/thesis`.
   - In Pi, these map to `.pi/prompts/*.md` prompt templates and `/skill:<name>` skill commands.

4. **Connectors**
   - Optional MCP connectors for user-provided free, self-hosted, or explicitly licensed data/document systems.
   - In Pi, connector configuration is represented by `.pi/finance-mcp.example.json`; active runtime configuration lives in `.pi/finance-mcp.json` and is exposed through `finance_mcp_*` tools.

## Pi mapping

| Anthropic layer | Pi equivalent |
| --- | --- |
| Agent plugin | Built-in finance/crypto extension plus this `finance-services` skill |
| Skill bundle | `.pi/skills/finance-services/` |
| Slash commands | `.pi/prompts/*.md` |
| MCP connector manifest | `.pi/finance-mcp.example.json` |
| Data tools | `finance_*`, `crypto_*`, local files, shell/code analysis |

## Core principle

The model should decide the next research step rather than dump a fixed template. A tool result is evidence, not the final answer. After a market tool returns, decide whether to:

- inspect the CSV artifact,
- compute metrics,
- call a narrower or broader tool,
- use a user-configured MCP connector,
- search for missing source evidence,
- or answer with explicit limitations.

## Named workflows worth preserving

- Market Researcher: sector/theme to overview, landscape, peer comps, and ideas.
- Earnings Reviewer: filings/transcript/news to model update and note.
- Model Builder: DCF, LBO, 3-statement, comps, and audit.
- Pitch Agent: profiles, comps, process/deal material, and deck output.
- Meeting Prep: company/client profile, recent news, briefing pack.
- Wealth/PE/Fund Admin workflows: useful later, but not first-class in this Pi version.
