# FinancePi

Finance-first agent harness for public market research, persistent memory, and CLI-driven workflows.

FinancePi is built around Pi, but the product focus is finance research instead of generic coding assistance:

- US equity and ETF research tools by default
- Separate crypto tools for BTC and related markets
- Persistent session memory and research artifacts
- Built-in finance workflow modes such as plan, invest, and goal

## Packages

| Package | Description |
|---|---|
| [`@earendil-works/pi-ai`](packages/ai) | Unified multi-provider LLM API |
| [`@earendil-works/pi-agent-core`](packages/agent) | Agent runtime with tool calling and state management |
| [`@earendil-works/pi-coding-agent`](packages/coding-agent) | FinancePi CLI and workflow runtime |
| [`@earendil-works/pi-finance`](packages/finance) | Database-free US equity/ETF research utilities |
| [`@earendil-works/pi-crypto`](packages/crypto) | Crypto research utilities |
| [`@earendil-works/pi-tui`](packages/tui) | Terminal UI library |

## What it does

- Research public equities, ETFs, and crypto with sourced data
- Persist long-form research in `.pi/research`
- Keep compact memory indexes in `.pi/memory`
- Support finance-oriented workflow modes for planning, investment-method modeling, and goal tracking
- Expose CLI and extension hooks for custom finance workflows

## Usage

See [`docs/financepi-usage.md`](docs/financepi-usage.md) for day-to-day usage: startup, model/API key setup, finance workflows, skills, prompt templates, memory, research artifacts, PDF research, and institutional holdings analysis.

## Development

```bash
npm install --ignore-scripts
npm run check
./test.sh
./pi-test.sh
```

## Repository rules

- Keep direct dependency versions pinned
- Treat lockfile and shrinkwrap changes as reviewed code
- Prefer small, reversible changes
- Use explicit file staging before commits

## Security

FinancePi does not provide a built-in permission boundary for filesystem, process, network, or credential access. If you need stronger isolation, run it inside a container or sandbox.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`AGENTS.md`](AGENTS.md) for project rules.

## License

MIT
