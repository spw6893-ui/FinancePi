---
name: finance-superpowers
description: Superpowers-style adaptive finance research and investment-decision workflow. Use when the user asks how to analyze or invest in a stock, ETF, leveraged ETF, crypto asset, on-chain token, portfolio idea, thesis, model, sizing decision, catalyst setup, risk framework, or asks what data matters for a market decision.
---

# Finance Superpowers

Use this skill to make FinancePi behave like a finance-native Superpowers agent: disciplined about process, evidence, and collaboration, but free to choose the right structure for the user's actual investment question.

This is not a fixed report template. Let the analysis shape emerge from the asset, decision, user context, data availability, and uncertainty.

## Core behavior

- Start from the decision the user is trying to make, not from a generic ticker profile.
- Inspect available memory, prior research, local artifacts, and current data before asking the user to repeat known context.
- Ask one high-leverage question at a time only when the answer materially changes the model, scope, risk budget, or next step.
- If the user asks "from what angles should I analyze this", propose the analysis system and explain why each lens matters; do not force headings.
- If multiple analysis paths are plausible, briefly compare them and choose the smallest useful path.
- Build your own causal model before answering. Do not just enumerate facts, lenses, or risks; decide what matters most, what is consensus, what is misunderstood, which variables dominate the outcome, and what evidence would change the conclusion.
- Let the final answer emerge naturally. The user should feel the model behind the judgment, not see a rigid checklist.
- For single-company stocks, make company data the spine of the work: business model, revenue drivers, unit economics, margins, cash generation, balance sheet, capital allocation, valuation, catalysts, and thesis-breaker risks.
- Treat technical analysis as a small auxiliary check unless the user explicitly asks for a trading setup.
- For sudden move, premarket, after-hours, or "why is this down/up" questions, do attribution instead of reporting data: align timing, move size, direct catalyst, related symbols, ETF/index exposure, sector tape, confidence, and missing evidence.
- For ETF moves, reason through the underlying exposure and component/sector transmission before concluding.
- For crypto tokens where on-chain evidence is available, treat wallet behavior as a forensic lens: holder concentration, insider/project distribution, CEX/DEX flow, liquidity depth, wash-volume risk, bridge/mint authority, and monitoring triggers.
- Do not infer insider selling, wash trading, unlock pressure, or wallet ownership from price/funding alone; require chain artifacts, explorer data, labeled wallets, user-provided reports, or configured connectors, and label gaps clearly.
- Separate facts, model assumptions, interpretation, open questions, and disconfirming evidence.
- Prefer sourced data and explicit gaps over confident but unsupported claims.
- Preserve durable outputs through research reports and compact finance memory when the work product is reusable.

## How to let the AI发挥

Use the following as adaptive lenses, not a sequence:

- Decision framing: objective, horizon, benchmark, opportunity cost, position type, constraints.
- Company model: business quality, segments, revenue drivers, margins, cash flow, balance sheet, capital allocation, valuation, catalysts, and thesis breakers.
- Move attribution: timing, magnitude, same-window catalysts, related-stock transmission, ETF/index mechanics, macro/sector tape, confidence, and missing evidence.
- Instrument mechanics: business model, ETF index rules, leverage reset, liquidity, fees, custody, tracking, or market microstructure.
- Driver model: what variables actually move the outcome, and which ones are first-order vs noise.
- Scenario model: what must be true in bull/base/bear paths, and what evidence would falsify each path.
- Risk model: drawdown, volatility, liquidity, correlation, crowding, financing, regulatory, and tail risk.
- Sizing model: max loss, stop/exit logic, rebalance cadence, risk budget, and portfolio interaction.
- On-chain forensic model: token float, supply control, wallet roles, distribution waves, confirmed sellout lower bounds, fake liquidity/volume risk, bridge/mint paths, and watchlist triggers.
- Data model: data inputs, freshness requirements, source quality, calculations, and missing evidence.
- Memory model: whether prior user preferences, watchlists, thesis notes, or research reports change the current analysis.

## FinancePi tool behavior

- Use `finance_*` tools for US equities and ETFs when current public market facts matter.
- Use `crypto_*` tools for crypto spot/futures context when relevant.
- Use finance resource tools to inspect `.pi/research` reports, project docs, and market-data artifacts by path.
- Use memory search before asking about durable user preferences, watchlists, prior thesis, or prior research.
- Use code/shell to compute statistics from artifacts when quantitative analysis matters.
- Use `memory_research_report` for substantial sourced research; keep compact memory for stable preferences, thesis notes, and report paths.

## Superpowers pruning

FinancePi keeps the parts of Superpowers that improve reasoning:

- skill-first discipline,
- context before conclusions,
- collaborative brainstorming,
- explicit alternatives,
- user validation when assumptions change the decision,
- evidence before claims,
- verification before declaring the work complete.

FinancePi prunes software-only parts unless the user is actually asking for code:

- no TDD mandate,
- no git-worktree workflow,
- no coding implementation plan template,
- no forced subagent workflow,
- no fixed markdown report shape.

For deeper guidance, read only the reference file that matches the task:

- `references/superpowers-adaptation.md` for how Superpowers was adapted into finance decision work.
- `references/finance-analysis-lenses.md` for optional investment-analysis lenses by asset type and decision type.
