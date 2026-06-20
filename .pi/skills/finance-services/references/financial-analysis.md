# Financial Analysis Workflows

Use for valuation, modeling, comps, and finance work product.

## Comparable company analysis

1. Define the peer set before pulling numbers.
2. Choose metrics that matter for the industry.
3. Keep periods and definitions comparable.
4. Use source-backed values only; flag estimates and missing values.
5. Compute medians, quartiles, outliers, and dispersion when the question needs ranking.
6. Explain why a premium or discount may exist rather than ranking mechanically.

Common sections:

- company / ticker
- market cap / enterprise value
- revenue and growth
- profitability margin
- EV/Revenue, EV/EBITDA, P/E, FCF yield where relevant
- source, period, and notes

## DCF framing

Use DCF when the user asks for intrinsic value or scenario work. Required components:

- forecast period and revenue growth assumptions
- margin trajectory
- reinvestment/capex/working capital assumptions
- terminal value method
- discount rate/WACC assumptions
- sensitivity table

If the data needed for a true DCF is unavailable, provide a DCF framework and list missing inputs.

## 3-statement and model update

For model work:

- formulas should reference inputs, not hardcoded derived values
- raw inputs need source notes
- reconcile revenue, margins, cash flow, balance sheet, and share count
- surface balancing or sanity-check failures

## Audit and quality checks

- Every number has a source or is marked as an assumption.
- Derived metrics are reproducible from visible inputs.
- Units and periods are explicit.
- Missing data is shown as unavailable, not blank.
- Outliers are flagged, not silently removed.
