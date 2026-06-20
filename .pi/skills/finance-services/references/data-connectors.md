# Data Connectors and Source Hierarchy

Source reference: https://github.com/anthropics/financial-services

## Connector catalog

Anthropic's financial-services repository lists these MCP-style provider categories:

| Provider | Typical use |
| --- | --- |
| Daloopa | standardized company financials and KPIs |
| Morningstar | funds, fundamentals, reference data |
| S&P Global / Kensho | Capital IQ-style company, estimates, market data |
| FactSet | company financials, estimates, ownership, market data |
| Moody's | credit, ratings, macro and risk data |
| MT Newswires | market news |
| Aiera | earnings calls, transcripts, events |
| LSEG | market data, rates, FX, analytics |
| PitchBook | private markets, PE/VC, transactions |
| Chronograph | private equity portfolio and fund data |
| Egnyte / Box | document repositories |

See `.pi/finance-mcp.example.json` for a corrected template manifest.

## Data-source priority

Use the highest reliable source available for the fact type:

1. User-uploaded files and local artifacts, if the user wants those analyzed.
2. Institutional MCP/data connectors when configured and relevant.
3. SEC EDGAR or primary issuer filings for reported fundamentals.
4. Exchange or broker/data-provider APIs for current or historical market data.
5. Company investor relations materials for management commentary and segment/KPI detail.
6. Reputable news for recent catalysts only.
7. General web search only for source discovery or freshness checks.

## Citation and audit rules

- Every numeric claim should carry source metadata when available: source, asOf/latestAt/filed date, fiscal period, and form.
- If a number cannot be sourced, label it as unavailable or unsourced rather than estimating.
- Keep periods comparable across peer sets. Flag FY, LTM, NTM, quarterly, or estimated values.
- Do not mix US equity tools with crypto tools unless the user asks for cross-asset context.
- Treat source health and degraded reasons as part of the analysis, not UI noise.

## Pi-specific connector behavior

Pi currently has local tools for:

- US equity/ETF context: `finance_quote`, `finance_history`, `finance_news`, `finance_sec_facts`, `finance_technical_snapshot`, `finance_symbol_context`, `finance_compare_symbols`, `finance_market_brief`.
- Crypto context: `crypto_quote`, `crypto_history`, `crypto_derivatives`, `crypto_context`.
- Institutional MCP context: `finance_mcp_servers`, `finance_mcp_list_tools`, `finance_mcp_call_tool`.

When `.pi/finance-mcp.json` is configured, prefer MCP tools for institutional-grade financials, estimates, transcripts, ownership, and comps. Use Pi local tools as fallback or for quick public-data context.
