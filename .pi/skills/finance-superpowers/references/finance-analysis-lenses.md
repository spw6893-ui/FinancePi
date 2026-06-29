# Finance Analysis Lenses

Use these as optional lenses, not a fixed template. Pick only the lenses that matter for the user's question.

Before writing, compress the relevant lenses into your own causal model: what drives the asset, what the market is likely underwriting, what could surprise consensus, which variable has the most leverage on value, and what would falsify the view. Do not output every lens just because it is listed here.

## Single stocks

- Business quality: revenue drivers, unit economics, margins, moat, customer concentration.
- Financial trajectory: growth, margin bridge, cash generation, dilution, leverage, capital allocation.
- Valuation: multiples, DCF drivers, expectations embedded in price, peer set quality.
- Catalysts: earnings, product cycles, regulation, capital markets, index inclusion, sentiment shifts.
- Risks: thesis breakers, downside path, liquidity, accounting, governance, cyclicality.
- Technical setup: only as an auxiliary timing/risk-management lens after company data, valuation, and catalysts are understood.

## small-cap commercialization stories

Use for OUST/Ouster-like early industrial hardware, sensors, lidar, robotics, autonomy, energy, biotech-adjacent tools, and newly scaling platform companies.

- Product-market fit: paying customer, workflow urgency, ROI, integration friction, pilot-to-production conversion.
- Customer adoption curve: named customers, repeat orders, deployment breadth, customer concentration, budget cycle, channel dependence.
- Order quality: backlog, design wins, framework agreements, cancellability, pricing, delivery timing, and backlog-to-revenue conversion.
- Gross margin ramp: scale benefit, bill-of-materials improvement, manufacturing yield, service/support burden, mix shift.
- Unit economics: contribution margin, sales cycle, customer acquisition cost, payback, replacement/upgrade cycle.
- Cash runway: cash balance, burn rate, working-capital needs, debt maturities, covenants, capital-market access.
- Dilution risk: ATM programs, convertibles, secondary offerings, stock compensation, acquisition financing.
- Competitive substitutes: incumbent technology, internal build, cheaper "good enough" alternatives, standardization risk.
- Commercialization milestones: revenue conversion, repeat orders, named-customer expansion, gross margin inflection, cash-burn improvement, and reduced dilution dependence.
- Anti-pattern: do not make broad TAM, recent stock momentum, or technology elegance the thesis before proving adoption, margin, and survival math.

## Industry value chain

Use for companies whose economics depend on ecosystem position, not just reported growth: OUST/Ouster-like lidar and sensors, robotics, industrial hardware, AI infrastructure, semiconductors, energy, and supply-chain node companies.

- Upstream suppliers: key components, bill of materials, cost curve, manufacturing yield, supply concentration, dependency risk, and who captures component-level margin.
- Downstream customers: use cases, budget owner, procurement cycle, ROI threshold, integration friction, replacement timing, deployment scale, and whether customers can delay adoption without pain.
- Intermediaries and control points: system integrators, OEMs, Tier-1 suppliers, distributors, cloud/platform partners, channel partners, certification gates, and who owns the customer relationship.
- Value capture: who has pricing power, who can bundle or commoditize the product, where gross margin can persist, how bargaining power shifts with scale, and which link in the chain keeps the profit pool.
- Competitive substitutes: incumbent workflow, camera/radar/software alternatives, cheaper good-enough products, in-house build, platform bundling, regulation, and standardization.
- Ecosystem milestones: design-in to production, partner certification, standards adoption, reference customers, repeat orders, attach-rate expansion, and evidence that pilots are converting into production economics.
- Anti-pattern: do not call a company "well positioned" because the end market is large or the product spec is strong; first explain the company's exact industry value chain role and why that role can retain durable economics.

## Value-investing pressure tests

These are adapted from `ai-berkshire`. Use them to improve judgment and kill weak theses, not to impose a report template.

- 信息丰富度:
  - A级: mature, heavily covered, many filings/news/estimates. Main risk is consensus regurgitation; ask why smart investors still avoid it.
  - B级: partial coverage and some estimates. Mark inference vs sourced fact clearly; do not fill gaps with fake certainty.
  - C级: sparse, newly listed, niche, or structurally opaque. Do not equate "AI cannot find enough" with "bad business"; fall back to first-principles questions about customer value, replication risk, and management decisions.
- AI分析置信度 vs 投资确定性:
  - AI分析置信度 is source coverage, recency, consistency, and calculability.
  - 投资确定性 is business understandability, moat durability, balance-sheet survival, management quality, and price paid.
  - A data-rich but fragile story can have high AI confidence and low investment certainty; a data-poor but simple business can be the reverse.
- 四大师 adversarial lenses:
  - 段永平: business essence, customer reason to pay, good business/right people/right price, and whether the answer can be stated simply.
  - 巴菲特: durable moat, owner earnings, capital efficiency, capital allocation, intrinsic value, margin of safety.
  - 芒格: inversion, failure paths, historical analogies, incentives, bias, and the strongest short/avoid argument.
  - 李录: long-term industry/civilization trend, compounding runway, management culture, and whether the company still matters in 10-20 years.
- 镜子测试:
  - Can the buy/add/hold rationale be said plainly: I am doing X at price Y because the business essence, moat, management, valuation, and downside are acceptable.
  - If the rationale needs jargon, price momentum, or borrowed conviction to sound persuasive, it is not ready.
- 快速否决:
  - unclear revenue engine;
  - sustained negative FCF with no credible improvement path;
  - management integrity or governance red flags;
  - irreversibly eroding moat;
  - thesis depends on greater-fool demand;
  - downside is emotionally or financially intolerable;
  - reason is FOMO, someone else's call, or recent price action;
  - cannot write the buy reason clearly in about 200 words.
- 反向DCF / 三情景估值:
  - Reverse DCF asks what growth, margin, reinvestment, dilution, terminal multiple, or discount-rate assumptions are already embedded in price.
  - Bull/base/bear scenarios should expose which variable drives the return, not pretend precision.
  - Use exact calculations or artifacts for important valuation math; label source, asOf/filed date, fiscal period, currency, and GAAP/non-GAAP scope.

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

## Options positioning / dealer-positioning lens

Use for short-term trade planning, earnings/event setup, sudden moves, pinning, squeeze/unwind, and "where are the walls" questions.

- Put-call ratio: compare option volume and open-interest ratios; read them as crowding/hedging context, not a directional signal by themselves.
- Call wall / put wall: identify strikes with concentrated open interest or estimated gamma; treat them as candidate magnet/resistance/support/air-pocket zones only when price, volume, catalyst timing, and index/ETF context agree.
- Gamma exposure: use estimated net/gross gamma exposure and gamma-by-strike to reason about convexity, hedging sensitivity, possible pinning, and whether a move may accelerate after key strikes break.
- Max pain: useful as one positioning clue near expiration, not as a predictive law.
- Expiration structure: separate weekly event-driven positioning from longer-dated thesis or hedge positioning.
- Limitations: free Yahoo/Cboe options-chain data is not professional real-time flow; Cboe data is delayed; open interest is delayed; customer/dealer direction is unknown; estimated gamma exposure is public-chain-derived positioning, not a dealer book.
- Thesis rule: options positioning changes timing, risk, and trade execution; it should not replace company research, valuation, balance-sheet work, or catalyst analysis for a long-term investment.

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
