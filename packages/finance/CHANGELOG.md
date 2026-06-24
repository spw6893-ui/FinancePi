# Changelog

## [Unreleased]

### Added

- Added database-free US equity/ETF quote, history, news, SEC facts, technical snapshot, symbol context, comparison, and market brief utilities for Pi's default finance agent workflow.
- Added configured free provider enrichment for finance tools: Finnhub and Alpha Vantage news in symbol news/context, plus FRED macro observations in market briefs.

### Fixed

- Fixed Yahoo chart handling for index symbols such as `^ICESEMIT` by using chart metadata for quotes and falling back to short chart ranges when longer history returns limited data.
- Fixed SEC company facts extraction to prefer modern revenue concepts and expose additional company data fields for finance research.
