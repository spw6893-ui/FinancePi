# Pi Finance

Database-free US equity/ETF research utilities for Pi.

This package intentionally does not include FastAPI, MongoDB, Redis, schedulers, workers, brokerage integrations, or trade execution. It exposes fetch-based TypeScript APIs that Pi can call directly from built-in finance tools.

## Capabilities

- Normalize US tickers such as `AAPL`, `SPY`, and `BRK-B`.
- Fetch public quote, history, and news data from Yahoo Finance-style endpoints.
- Fetch SEC company facts from EDGAR.
- Compute simple technical snapshots from historical bars.
- Build single-symbol context, multi-symbol comparisons, and market briefs.
- Return `sourceHealth` and `degradedReasons` when a source is missing or unavailable.

## CLI usage

Pi enables finance research tools by default:

```bash
pi "Analyze AAPL using sourced data"
pi -p "Compare MSFT, AAPL, and NVDA"
```

Finance mode registers:

- `finance_quote`
- `finance_history`
- `finance_news`
- `finance_sec_facts`
- `finance_technical_snapshot`
- `finance_symbol_context`
- `finance_compare_symbols`
- `finance_market_brief`

## Programmatic usage

```ts
import { FinanceClient } from "@earendil-works/pi-finance";

const client = new FinanceClient();
const context = await client.getSymbolContext("AAPL");
console.log(context.sourceHealth, context.degradedReasons);
```
