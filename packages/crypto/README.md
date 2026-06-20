# Pi Crypto

Binance-backed crypto market data utilities for Pi.

This package is intentionally separate from `@earendil-works/pi-finance`, which covers US equities and ETFs. It does not include databases, workers, schedulers, exchange account access, private endpoints, or trade execution.

## Capabilities

- Normalize crypto symbols such as `BTC`, `BTC-USD`, `BTCUSDT`, and `ETH`.
- Fetch Binance spot 24h ticker data.
- Fetch Binance spot kline history.
- Fetch Binance USD-M futures funding rate and open interest.
- Build a sourced crypto context with `sourceHealth` and `degradedReasons`.

## Tools

The coding agent registers these built-in crypto tools:

- `crypto_quote`
- `crypto_history`
- `crypto_derivatives`
- `crypto_context`
