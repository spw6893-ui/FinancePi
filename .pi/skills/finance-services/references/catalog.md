# Financial Services Catalog

This catalog maps Anthropic's public financial-services repository into Pi concepts.

Source reference: https://github.com/anthropics/financial-services

## Named agents

| Agent | Use in Pi |
| --- | --- |
| Market Researcher | sector/theme primer, competitive landscape, peer comps, idea shortlist |
| Earnings Reviewer | earnings call, filing, model update, and note draft |
| Model Builder | DCF, LBO, 3-statement, comps, spreadsheet/model authoring |
| Pitch Agent | comps, precedents, LBO, one-pagers, pitch deck workflow |
| Meeting Prep Agent | company/client profile, recent news, briefing pack |
| Valuation Reviewer | valuation package review and reporting draft |
| GL Reconciler | break tracing and reconciliation workflow |
| Month-End Closer | accruals, roll-forwards, variance commentary |
| Statement Auditor | LP statement and NAV tie-out checks |
| KYC Screener | onboarding document parsing and rules-grid checks |

## Vertical plugin families

| Vertical | Representative workflows |
| --- | --- |
| financial-analysis | comps, DCF, LBO, 3-statement, audit-xls, deck/model QC |
| equity-research | earnings, preview, initiation, model update, morning note, sector, thesis, catalysts, idea screen |
| investment-banking | CIM, teaser, one-pager, buyer list, merger model, process letter, deal tracker |
| private-equity | sourcing, deal screening, diligence, IC memo, returns, portfolio monitoring, value creation |
| wealth-management | client review, report, proposal, financial plan, rebalancing, tax-loss harvesting |
| fund-admin | GL recon, accruals, NAV tie-out, roll-forward, variance commentary |
| operations | KYC doc parse and rules evaluation |

## Pi prompt command mapping

| Anthropic command | Pi prompt |
| --- | --- |
| `/sector` | `.pi/prompts/sector.md` |
| `/comps` | `.pi/prompts/comps.md` |
| `/competitive-analysis` | `.pi/prompts/competitive-analysis.md` |
| `/screen` | `.pi/prompts/screen.md` |
| `/earnings` | `.pi/prompts/earnings.md` |
| `/earnings-preview` | `.pi/prompts/earnings-preview.md` |
| `/dcf` | `.pi/prompts/dcf.md` |
| `/lbo` | `.pi/prompts/lbo.md` |
| `/3-statement-model` | `.pi/prompts/3-statement-model.md` |
| `/debug-model` | `.pi/prompts/debug-model.md` |
| `/model-update` | `.pi/prompts/model-update.md` |
| `/morning-note` | `.pi/prompts/morning-note.md` |
| `/initiate` | `.pi/prompts/initiate.md` |
| `/thesis` | `.pi/prompts/thesis.md` |
| `/catalysts` | `.pi/prompts/catalysts.md` |

## Connector template

See `data-connectors.md` and `.pi/finance-mcp.example.json` for the user-configured MCP template. Paid institutional provider endpoints from Anthropic's public catalog are intentionally not listed in Pi defaults.
