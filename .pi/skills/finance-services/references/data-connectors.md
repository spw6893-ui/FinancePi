# Data Connectors and Source Hierarchy

Source reference: https://github.com/anthropics/financial-services

## Connector policy

Anthropic's financial-services repository includes paid institutional MCP-style providers. Pi intentionally does not list those endpoints in `.pi/finance-mcp.example.json` because they are not free anonymous data sources. Use the example only as a template for user-provided free, self-hosted, or explicitly licensed MCP servers.

## Data-source priority

Use the smallest reliable source set that can answer the question:

1. User-uploaded files and local artifacts, if the user wants those analyzed.
2. Default free Pi sources:
   - SEC EDGAR for reported US fundamentals and filings.
   - Yahoo chart/news for public US equity/ETF context. Treat chart-derived prices as latest available bars or closes, not guaranteed real-time quotes.
   - Binance public market data for crypto spot, klines, funding, and open interest.
3. Optional free-key source: FRED for macro data, if a key is configured.
4. User-configured MCP/data connectors only when `.pi/finance-mcp.json` points to a working free, self-hosted, or explicitly licensed server.
5. Company investor relations materials for management commentary and segment/KPI detail.
6. Reputable news or web search only for freshness, catalysts, or source discovery.

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
- User-configured MCP context: `finance_mcp_servers`, `finance_mcp_list_tools`, `finance_mcp_call_tool`.

Keep the free stack intentionally small. Do not add broad free-tier APIs or paid institutional providers to the default agent path unless a specific feature needs them and the user provides working access.
