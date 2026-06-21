# Finance Agent 项目简历素材

## 一句话项目描述

将通用 CLI coding agent 改造为金融研究 agent，接入免费公开金融/加密货币/网页数据源，设计工具调用循环、数据 artifact 检索与来源可追溯机制，使模型能够按需获取、读取、搜索和分析市场数据，而不是一次性向上下文灌入大 JSON。

## 可直接放进简历的版本

### 中文版

- 基于 TypeScript/Node.js 改造本地 AI Agent CLI，将原 coding workflow 扩展为金融研究 workflow，支持 US equities/ETFs、Binance crypto、网页搜索、新闻、技术指标和 SEC facts 等数据能力。
- 设计并实现金融工具调用体系，包括 `finance_symbol_context`、`finance_compare_symbols`、`crypto_context`、`web_search/web_open`、`finance_list_resources/read/search_resources` 等工具，使 LLM 能自主判断何时获取行情、新闻、历史 K 线、财报事实、网页资料和本地 artifact。
- 将大体量行情/新闻/财务数据落盘为 CSV/TXT artifact，并在模型上下文中仅返回 compact summary + artifact path，降低上下文污染和 token 消耗，同时保留可复查、可计算的数据路径。
- 为金融 agent 增加 scoped resource inspection 能力，允许模型按需列出、读取和搜索 `.pi/artifacts/market-data`、`.pi/artifacts/web` 以及相关项目金融文档，避免泛化成 coding/project-doc agent。
- 接入 OpenAI hosted `web_search`，并保留本地 SearxNG/DuckDuckGo fallback，解决金融分析中新闻、催化剂和最新资料检索能力不足的问题。
- 参考 Anthropic financial-services skill，重构系统提示与研究流程：强调数据来源、asOf/latestAt、degraded source、artifact 复查、同业比较、技术面/基本面/新闻催化剂拆分，避免固定模板输出。
- 新增加密货币数据接口，基于 Binance spot/futures 数据提供 quote、kline history、funding rate、open interest 和 crypto context，并与美股数据源隔离。
- 建立测试覆盖和验证流程，覆盖 finance tool result、crypto extension、web extension、market research loop、resource inspection、OpenAI hosted web search 和构建检查，保证功能集成可回归。

### English Version

- Transformed a general-purpose TypeScript/Node.js coding agent CLI into a finance research agent supporting US equities/ETFs, Binance crypto data, web search, news, technical snapshots, and SEC facts.
- Designed an LLM tool-calling workflow with finance/crypto/web tools such as `finance_symbol_context`, `finance_compare_symbols`, `crypto_context`, `web_search`, `web_open`, and scoped finance resource inspection tools.
- Implemented compact market-data responses backed by persistent CSV/TXT artifacts, reducing context pollution and token usage while preserving reproducible data paths for downstream analysis.
- Added finance-scoped resource discovery/read/search over market-data artifacts, web artifacts, and relevant project finance docs, enabling the model to inspect data on demand without becoming a generic coding-document agent.
- Integrated OpenAI hosted `web_search` with local SearxNG/DuckDuckGo fallback for fresh catalyst/news/source discovery in financial analysis.
- Adapted Anthropic financial-services research patterns into agent prompts and workflows, emphasizing source attribution, `asOf/latestAt`, degraded data handling, artifact inspection, peer comparison, and separation of facts from inference.
- Added Binance-based crypto data connectors for spot quotes, kline history, funding rates, open interest, and broader crypto context, separated from the US equity data stack.
- Added regression tests for finance/crypto/web extensions, market research loop behavior, resource inspection, hosted web search integration, and build/check validation.

## STAR 展开版

### 背景

原项目是一个偏 coding 场景的本地 CLI agent。金融分析场景下，原始工具链存在几个问题：

- 数据源不完整：缺少 crypto、网页搜索、新闻/催化剂补充能力。
- 上下文污染：金融工具如果直接返回完整 JSON，会占用大量上下文并干扰模型推理。
- 分析 loop 不明显：模型容易拿到一次工具结果后直接输出结论，而不是继续检查缺口、读取 artifact、补充搜索或计算统计。
- 工具语义偏 coding：文档/文件检索能力需要重构为金融资源检索，而不是通用项目文档检索。

### 任务

把 agent 改造成一个可交互的 finance research agent，使其能：

1. 自主选择是否调用行情、新闻、SEC、技术面、crypto、web search 等工具。
2. 返回 compact summary，而不是大 JSON。
3. 将完整数据保存为本地 artifact，供模型后续按需读取/搜索/计算。
4. 明确标注数据来源、时间戳和 degraded 状态。
5. 保持本地可运行、免费数据优先，并避免 Bloomberg/Mongo/FastAPI 等额外付费或重服务依赖。

### 行动

- 实现金融数据工具和 artifact 落盘机制，将行情、历史 K 线、新闻、SEC facts、比较结果、MCP 工具结果统一写入 `.pi/artifacts/market-data/*.csv`。
- 新增 Binance crypto extension，提供 quote、history、derivatives、context，并生成独立 CSV artifact。
- 新增 web extension，提供 `web_search` 和 `web_open`，搜索结果保存为 CSV，网页正文保存为 TXT artifact。
- 为 OpenAI Responses / Codex Responses provider 接入 hosted `web_search`，并避免与本地 `web_search` function tool 命名冲突。
- 增加 finance-scoped resource tools：
  - `finance_list_resources`
  - `finance_read_resource`
  - `finance_search_resources`
  用于检索金融 artifact 与相关项目金融文档。
- 重写 finance system prompt，引导模型区分 facts/inference/risks，检查 degraded sources，并按需读取 artifact 或补充 web search。
- 移除/收缩默认付费 MCP provider 预设，保留用户自配置 MCP 能力。
- 添加自动测试和真实 CLI 验证，确保工具可被模型调用、输出格式紧凑、artifact 可读、构建通过。

### 结果

- Agent 从 coding-oriented workflow 转为 finance-oriented workflow。
- 模型不再一次性接收完整 JSON，而是拿到轻量 summary 和 artifact path。
- 金融分析支持多步 loop：获取数据 → 判断缺口 → 读取 artifact → 补充 web/news → 计算指标 → 输出分析。
- 支持美股/ETF、crypto、网页资料、项目金融文档和本地 artifacts 的统一检索。
- 保持免费公开数据源优先，无需 FastAPI、MongoDB、Bloomberg 等额外依赖。

## 技术亮点

### 1. Tool-calling Agent Workflow

通过工具描述、prompt guidance 和 market research loop，使 LLM 不再被固定模板限制，而是能根据用户问题动态选择：

- broad context：`finance_symbol_context`
- peer comparison：`finance_compare_symbols`
- market basket：`finance_market_brief`
- crypto：`crypto_context`
- news/freshness：`web_search` / hosted web search
- artifact inspection：`finance_read_resource` / `finance_search_resources`

### 2. Artifact-first Context Management

工具返回：

```text
Finance symbol context fetched. Artifact:
.pi/artifacts/market-data/...csv (csv, rows=...)
summary: symbol=..., degraded=...
coverage: quote=..., historyBars=..., newsItems=...
```

完整数据不直接灌进上下文，而是写入 CSV/TXT，由模型按需读取。这解决了：

- JSON 噪音
- token 消耗
- 上下文污染
- 数据不可复查

### 3. Finance-scoped Resource Inspection

没有做泛用 `project_doc` 工具，而是做成金融 agent 专属接口：

- artifacts：`.pi/artifacts/market-data/*`、`.pi/artifacts/web/*`
- docs：`AGENTS.md`、`README*`、`docs/**`
- 排除源码目录，避免 agent 退回 coding 模式

### 4. Data Freshness and Source Health

金融输出中保留：

- `source`
- `asOf`
- `latestAt`
- `degradedReason`
- `sourceHealth`

模型被要求不能把免费延迟数据称为实时行情，必须说明数据新鲜度和缺口。

### 5. OpenAI Hosted Web Search Integration

为 OpenAI provider 注入 hosted `web_search`：

- 默认启用
- `PI_OPENAI_HOSTED_WEB_SEARCH=0` 可关闭
- 自动过滤本地同名 `web_search` function tool，避免工具冲突

## 面试可讲的取舍

- 没有引入数据库：因为当前目标是本地 CLI 和轻量研究 workflow，CSV artifact 足够可追踪、可调试、可被模型按需读取。
- 没有强制输出模板：金融分析的结构应由 LLM 根据任务决定，系统只约束来源、缺口、风险和验证路径。
- 没有做泛用项目文档检索：防止 agent 重新偏向 coding，用 finance resource tools 约束检索范围。
- 免费数据优先：Yahoo/SEC/Binance/web search 能覆盖原型和个人研究需求，付费 MCP 只保留用户自配置入口。

## 简历短版 Bullet

如果只能写 3 条：

- 改造 TypeScript 本地 AI Agent CLI 为金融研究 agent，接入 US equity/ETF、Binance crypto、SEC facts、新闻和 web search 工具，实现可动态调用的金融分析 workflow。
- 设计 artifact-first 数据上下文机制，将行情/新闻/财报/网页数据落盘为 CSV/TXT，并仅向 LLM 返回 compact summary + artifact path，显著降低上下文污染并保留可复查数据链路。
- 实现 finance-scoped resource inspection、OpenAI hosted web search 和完整回归测试，支持模型按需搜索/读取金融 artifacts 与项目金融文档，形成多步研究 loop。

