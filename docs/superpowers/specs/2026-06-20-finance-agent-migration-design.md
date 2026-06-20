# Finance Agent Migration Design

## 目标

将 Pi 改造成美股/ETF 投研 agent。迁移 Informer 的金融语义和投研工作流，但不迁移 FastAPI、MongoDB、Redis、worker、scheduler 或 Hermes 前端。

## 范围

第一版新增一个 TypeScript 金融能力包、一个内置 Pi extension，以及一个示例 extension 包装器：

- `packages/finance/`：无服务、无数据库的金融数据和上下文组装能力。
- `packages/coding-agent/src/core/finance-agent-extension.ts`：注册金融工具并追加金融投研系统提示词。
- `packages/coding-agent/examples/extensions/finance-agent.ts`：复用内置 finance extension，方便通过 `-e` 方式加载。
- `pi --finance`：启用内置金融 agent 模式。

第一版只覆盖美股/ETF 主线。其他市场、实盘交易、券商下单、账户资产管理不在本次范围。

## 架构

`packages/finance` 提供纯函数和可注入 `fetch` 的 `FinanceClient`。默认数据源使用公开 HTTP 接口：

- Yahoo Finance 风格接口：quote、history、news。
- SEC EDGAR：company ticker map、company facts。

所有返回结果必须带 `asOf`、`source` 或 `sourceHealth`，失败时返回降级结构和 `degradedReasons`，而不是抛给 agent。Pi extension 把这些能力暴露为 LLM 工具。

## 迁移自 Informer 的内容

迁移：

- symbol 规范化和市场推断语义。
- `symbol context` 结构：quote、history、news、technicalSnapshot、fundamentals、sourceHealth、degradedReasons。
- 投研输出约束：区分事实、判断、风险、不确定性和验证路径。

不迁移：

- `main.py`、FastAPI router、HTTP 服务进程。
- MongoDB/Redis infra、运行态集合、worker、scheduler。
- Hermes terminal、platform edge、billing、notification。
- TradingAgents-CN 遗留目录。

## 工具

Extension 注册这些工具：

- `finance_quote`
- `finance_history`
- `finance_news`
- `finance_sec_facts`
- `finance_technical_snapshot`
- `finance_symbol_context`
- `finance_compare_symbols`
- `finance_market_brief`

## 验证

- 单元测试覆盖 symbol 规范化、技术面计算、client 降级和 context 组装。
- 修改代码后运行相关 Vitest 测试。
- 最终运行 `npm run check`。
