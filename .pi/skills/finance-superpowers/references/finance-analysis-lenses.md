# Finance Analysis Lenses

Use these as optional lenses, not a fixed template. Pick only the lenses that matter for the user's question.

## Single stocks

- Business quality: revenue drivers, unit economics, margins, moat, customer concentration.
- Financial trajectory: growth, margin bridge, cash generation, dilution, leverage, capital allocation.
- Valuation: multiples, DCF drivers, expectations embedded in price, peer set quality.
- Catalysts: earnings, product cycles, regulation, capital markets, index inclusion, sentiment shifts.
- Risks: thesis breakers, downside path, liquidity, accounting, governance, cyclicality.
- Technical setup: only as an auxiliary timing/risk-management lens after company data, valuation, and catalysts are understood.

## ETFs

- Exposure: index methodology, holdings, concentration, sector/factor exposure.
- Product mechanics: fees, liquidity, spreads, tracking difference, rebalance rules.
- Macro/regime: rates, liquidity, volatility, factor rotation, earnings cycle.
- Portfolio role: core allocation, tactical trade, hedge, beta replacement, risk concentration.
- Move attribution: separate underlying/index move, constituent concentration, sector beta, leverage/reset mechanics, and same-window component news.

## Sudden moves and premarket/after-hours attribution

- First verify the move magnitude and timestamp before explaining it.
- Compare the directly mentioned symbol with related symbols, ETFs, index proxies, and sector leaders.
- Align catalysts by time: earnings, guidance, filings, analyst actions, macro data, rates, futures, commodity/FX moves, and peer news.
- Rank explanations by confidence: confirmed catalyst, likely transmission, plausible correlation, or unknown.
- If no headline explains the move, say what was checked and what evidence would confirm or falsify each explanation.

## Leveraged ETFs

- Underlying index exposure and daily reset leverage.
- Path dependency and volatility drag.
- Financing, fee, and tracking drag.
- Drawdown depth and recovery math.
- Holding-period fit: intraday/tactical vs multi-week/month thesis.
- Scenario sensitivity: underlying return, realized volatility, rebalance cadence, stop logic.

## Crypto

- Spot/futures basis, funding, open interest, liquidity, exchange/custody risk.
- Regime sensitivity: risk appetite, liquidity, policy, stablecoin flows, leverage unwind.
- Catalyst path: ETF flows, protocol changes, unlocks, regulatory events.
- On-chain forensic lens when chain evidence exists:
  - One-screen verdict: current phase, risk score, decisive evidence, and what would change the conclusion.
  - Holder structure: project/treasury/insider wallets, exchange transit pools, DEX pools, retail/unknown holders, dormant wallets, and verifiable non-insider sell pressure.
  - Distribution rhythm: pre-launch allocation, downstream fanout, recent 24-72h abnormal flows, and whether the flow is completed, active, or dormant.
  - Sellout lower bound: confirmed DEX swaps plus CEX deposit paths by relevant wallets; call it a lower bound because CEX/OTC/off-index bridge flows may be invisible.
  - Liquidity quality: LP depth, estimated 5% slippage capacity, volume/LP ratio, suspected wash volume, bot concentration, and whether reported volume reflects real absorbable demand.
  - Source of funds: mint, DEX buy, CEX withdrawal, bridge, P2P/OTC, treasury distribution, airdrop/claim, or unlabeled source.
  - Contract/path risk: mint authority, bridge/multichain deployment, staking/airdrop contracts, upgrade/admin permissions, unlock/vesting schedule, and chain coverage limits.
  - Monitoring plan: critical/high wallets, trigger thresholds, DEX route/CEX deposit movements, dormant-wallet wakeups, and data gaps that require re-run.
- Keep on-chain conclusions evidence-gated: never claim "insider", "wash", "dumping", or wallet common ownership unless the chain path, label, or user-provided report supports it.
- Treat token volume and CEX-reported volume as suspect until reconciled with liquidity depth, DEX flows, and order-book/flow quality.
- Distinguish "tokens transferred", "throughput", "confirmed sold", "possible future supply", and "current holder balance"; do not collapse them into one sell-pressure number.

## Position sizing

- Maximum acceptable loss before thesis reassessment.
- Volatility and correlation with current portfolio.
- Stop/trim/add rules and rebalance cadence.
- Whether the position is expressing conviction, hedging, or gathering information.

## Data plan

For each input, decide:

- why it matters,
- preferred source,
- freshness requirement,
- calculation method,
- threshold that changes the decision,
- whether missing data blocks the conclusion or only lowers confidence.
