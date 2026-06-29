---
name: institutional-holdings
description: Use when the user asks about institutional holdings, 13F, 13D, 13G, N-PORT, fund ownership, hedge fund positions, top holders, who is buying or selling a stock, ownership changes, put/call positions, activist stakes, or whether institution flows support an investment thesis.
---

# Institutional Holdings

Use this skill to analyze institutional ownership as one evidence layer in equity research. Do not treat holdings data as real-time order flow or as a standalone buy/sell signal. 机构持仓数据通常有披露滞后，先看报告期和 filed date。

## Core workflow

1. Frame the question:
   - issuer-side: "who owns this company and is ownership changing?"
   - manager-side: "what did this fund buy/sell?"
   - signal-side: "does smart-money behavior strengthen or weaken the thesis?"
2. Choose the filing family:
   - 13F: quarterly holdings of institutional investment managers (投资经理) with investment discretion over at least $100M in Section 13(f) securities.
   - 13D/13G: beneficial ownership above 5%; 13D is usually stronger for activist/control intent, 13G is usually passive/exempt/qualified holder context.
   - NPORT: registered fund portfolio holdings; useful for mutual fund/ETF ownership when available.
   - Form 3/4/5: insider ownership and transactions; keep separate from institution flow.
3. Pull current company context first if the ownership question affects an investment conclusion: float, market cap, recent price move, catalysts, liquidity, index/ETF inclusion, and share-count changes.
4. Normalize before comparing:
   - map CUSIP to ticker/share class;
   - compare report period, filing date, amendment status, and manager identity;
   - adjust for splits, share-class changes, mergers, ticker changes, and ADR/ordinary-share differences.
5. Rank signal strength (信号强度):
   - strongest: fresh 13D/13D-A with explicit Item 4 plan, large active stake, activist history, or board/strategy language.
   - medium: repeated 13F accumulation by high-conviction active managers, rising ownership across credible active funds, or notable concentration changes.
   - weaker: passive ETF/index changes, 被动ETF/index fund flows, broad sector flows, small q/q 13F changes, stale holdings, or positions that track AUM/benchmark movement.
6. Translate holdings into the thesis:
   - what institution behavior says about consensus, crowding, float pressure, liquidity, governance, and catalyst probability;
   - what it does not say: intraperiod trades, shorts, complete derivatives exposure, real-time buying, or current conviction.

## 13F interpretation rules

- 13F is delayed and quarterly. Treat it as a stale position snapshot, not live flow.
- It mainly reports long positions in reportable 13(f) securities and listed option put/call positions; it does not reveal shorts or full derivatives books.
- A 13F position can reflect investment discretion, client mandates, risk hedges, market making, index exposure, or multi-manager aggregation; do not assume a named manager personally chose every line item.
- Compare shares as well as market value; value changes may be price movement rather than buying or selling.
- Check amendments, confidential treatment gaps, duplicated reporting, shared discretion, and "sole/shared/none" voting authority.

## 13D/13G interpretation rules

- 13D/13G are beneficial ownership filings, not ordinary portfolio snapshots.
- Treat 13D and 13D/A as potentially thesis-changing when Item 4 discusses plans, proposals, transactions, board matters, financing, or strategic alternatives.
- Treat 13G as ownership context unless the holder type, size, or amendment pattern suggests a change in control dynamics.
- Always separate percent of class from percent of company economics, especially for ADRs, dual-class issuers, and changing share counts.

## NPORT and fund-holder rules

- NPORT can help identify registered fund exposure, but public availability and cadence can change; verify the current SEC instructions when timing matters.
- Fund holdings can be passive, mandate-driven, or benchmark-driven. Do not treat them like hedge-fund conviction without evidence.
- For ETF holders, separate primary-market creation/redemption mechanics and index methodology from discretionary buying.

## Output guidance

- Use a natural structure; do not force a template.
- Always state the asOf/report period and filed date.
- Label confidence as confirmed filing evidence, likely interpretation, or unsupported inference.
- Separate active investors, passive/index holders, registered funds, insiders, and unknown/aggregated owners.
- If data is unavailable, say which filing/search would resolve it rather than guessing.
