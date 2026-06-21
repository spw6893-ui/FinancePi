# Core Memory Architecture Design

## Purpose

本文档定义 FinancePi 的 core memory 设计：在不破坏 Pi 现有 session / continue / compaction 架构的前提下，引入 Hermes-style 的分层长期记忆能力，让 FinancePi 能跨会话保存用户偏好、关注标的、研究摘要和长期工作流经验。

设计重点不是“把所有历史都塞给模型”，而是把 memory 做成 core 能力：短小稳定内容自动注入，长研究内容按需搜索/读取，外部记忆服务通过 provider 接口接入。

## Scope

覆盖范围：

- Pi 当前已有的 session 记忆能力。
- Core memory substrate 的模块边界。
- Finance namespace 的 memory targets。
- Memory tool、prompt 注入和 provider lifecycle。
- Finance 场景下的写入规则、召回规则和安全边界。
- 后续接入 Hermes-style 外部 memory provider 的扩展点。

不覆盖：

- 具体外部 provider 的商业服务选型。
- Web UI memory 管理界面。
- 自动把所有历史对话总结进长期记忆。
- 把行情 artifact、新闻列表或工具 JSON 自动写成长记忆。

## Status

当前状态：core memory substrate 已落地到 Pi core，Finance extension 已作为第一个 namespace 使用方接入。

已实现的核心代码：

- `packages/coding-agent/src/core/memory/memory-types.ts`
- `packages/coding-agent/src/core/memory/memory-store.ts`
- `packages/coding-agent/src/core/memory/memory-security.ts`
- `packages/coding-agent/src/core/memory/memory-tools.ts`
- `packages/coding-agent/src/core/memory/memory-context.ts`
- `packages/coding-agent/src/core/memory/memory-manager.ts`
- `packages/coding-agent/src/core/memory/memory-provider.ts`
- `packages/coding-agent/src/core/memory/namespace-registry.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/extensions/types.ts`
- `packages/coding-agent/src/core/extensions/loader.ts`
- `packages/coding-agent/src/core/finance-agent-extension.ts`

已覆盖的测试：

- `packages/coding-agent/test/memory/memory-store.test.ts`
- `packages/coding-agent/test/memory/memory-tools.test.ts`
- `packages/coding-agent/test/memory/memory-context.test.ts`
- `packages/coding-agent/test/memory/memory-manager.test.ts`
- `packages/coding-agent/test/memory/memory-public-api.test.ts`
- `packages/coding-agent/test/finance/finance-memory-namespace.test.ts`

## Current Pi Memory Baseline

Pi 原本已经有 session-level memory，但它不是长期 curated memory。

### Session memory

现有 session manager 保存：

- 对话消息。
- tool result。
- branch。
- compaction summary。
- extension custom entry。
- session metadata。

这适合“继续当前会话”，但不适合承载长期偏好和研究状态，因为它没有 namespace、target、容量、安全扫描和可控召回。

### Finance artifacts

FinancePi 已经把完整数据写入 artifact：

```text
.pi/artifacts/market-data/*.csv
.pi/artifacts/web/*.txt
```

artifact 是证据层，不是记忆层。它保存行情、K 线、新闻、SEC facts、网页正文等可复查资料。Memory 只保存以后值得召回的摘要、偏好、研究索引和 artifact path。

## Design Goals

1. **Core-first**
   - Memory 属于 Pi core，不写死在 finance extension。
   - Finance、coding、research、ops 等未来场景都可以注册自己的 namespace。

2. **Layered memory**
   - session memory、user memory、domain/research memory、long-term/procedural memory 分层。
   - 不混用实时上下文、用户画像、研究结论和行为规则。

3. **Short snapshot + on-demand recall**
   - system prompt 只注入短小稳定内容。
   - 长研究笔记通过 `memory_search` / `memory_read` 按需召回。

4. **Explicit write**
   - LLM 必须通过 `memory_write` 或 provider lifecycle 明确写入。
   - 默认不把每次回答、工具结果或行情数据自动灌入长期记忆。

5. **Market freshness guard**
   - Memory 不是当前事实源。
   - 市场敏感内容必须带 `asOf` 或 `createdAt`。
   - 当前价格、新闻、财报和技术面仍要通过 finance/crypto/web/artifact 验证。

6. **Provider-ready**
   - 本地 Markdown store 是第一实现。
   - Provider 接口预留给 Hermes-style 外部记忆系统，例如 SQLite FTS、本地向量库、Honcho、Mem0、Supermemory。

## Layer Model

### 1. Session memory

定位：当前 session 的工作状态。

来源：

- conversation messages。
- tool results。
- compaction summary。
- market research continuation。

策略：

- 继续由 Pi session manager 负责。
- 不新增独立 long-term 文件。
- 只用于当前会话和 continue/resume。

### 2. User memory

定位：稳定用户偏好。

Finance 路径：

```text
.pi/memory/finance/USER.md
```

典型内容：

- 用户偏好免费公开数据源。
- 用户不希望输出固定模板。
- 用户不希望大 JSON 污染上下文。
- 用户关注的市场范围、风险偏好、仓位偏好。

注入策略：

- `injectPolicy=always`
- 只允许短小稳定内容常驻 prompt。

### 3. Domain / research memory

定位：领域研究状态和标的级长期笔记。

Finance 路径：

```text
.pi/memory/finance/WATCHLIST.md
.pi/memory/finance/SYMBOL_NOTES.md
.pi/memory/finance/RESEARCH.md
```

典型内容：

- watchlist。
- symbol-level thesis。
- 核心风险、催化剂、跟踪指标。
- 某次研究报告的摘要和 artifact path。

注入策略：

- `injectPolicy=search_only`
- 默认不进 system prompt。
- 用户问某个 symbol/主题时，模型先 `memory_search(namespace="finance", query="...")`，再按需 `memory_read`。

### 4. Long-term / procedural memory

定位：长期工作流经验和 agent 自我改进规则。

Finance 路径：

```text
.pi/memory/finance/MEMORY.md
.pi/memory/finance/LONG_TERM.md
```

典型内容：

- 不要在第一个 quote 结果后直接输出。
- 看到 degraded source 先检查 artifact、asOf/latestAt，再决定是否补 web search。
- crypto 数据不要和 US equity 数据路径混用。
- 不默认调用 Bloomberg 等付费 MCP。

注入策略：

- `injectPolicy=summary`
- 小段 workflow rule 可进 prompt。
- 复杂 checklist 通过 search/read 召回。

## Finance Namespace

Finance namespace 由 `createFinanceMemoryNamespace()` 注册：

| target | layer | file | injectPolicy | charLimit | 用途 |
| --- | --- | --- | --- | ---: | --- |
| `user` | `user` | `USER.md` | `always` | 1800 | 用户偏好、风险偏好、输出偏好 |
| `memory` | `long_term` | `MEMORY.md` | `summary` | 2200 | agent operational notes |
| `watchlist` | `domain` | `WATCHLIST.md` | `search_only` | 4000 | 关注资产、主题、市场 |
| `symbol_notes` | `domain` | `SYMBOL_NOTES.md` | `search_only` | 6000 | 标的 thesis、风险、跟踪指标 |
| `research` | `domain` | `RESEARCH.md` | `search_only` | 8000 | 研究摘要、source path、open questions |
| `long_term` | `long_term` | `LONG_TERM.md` | `summary` | 3000 | 长期流程规则、checklist |

## Core Components

### `MemoryStore`

职责：

- 管理本地 Markdown memory 文件。
- 支持 list/read/search/write。
- 控制 namespace root 必须位于项目 cwd 内。
- 控制 target file 不能逃逸目录。
- 写入时做容量检查、安全扫描和时间戳检查。

第一版存储格式：

- 每个 target 一个 Markdown 文件。
- 条目之间用分隔符隔开。
- 方便人工审计和手工编辑。

### `MemoryManager`

职责：

- 聚合 extension 注册的 namespaces。
- 创建 core memory tools。
- 构建 core memory prompt block。
- 管理 provider lifecycle。

关键接口：

```ts
hasNamespaces()
getNamespaces()
getStore()
createTools()
buildSystemPromptBlock()
initializeProviders()
buildProviderSystemPromptBlock()
prefetch()
syncTurn()
onSessionEnd()
shutdownProviders()
```

### `MemoryContext`

职责：

- 生成 `CORE MEMORY CONTEXT` prompt block。
- 只注入非空、非 `search_only`、非 `never` 的 targets。
- 对 `summary` 内容做截断，提示模型使用 `memory_read/search` 获取全文。

核心约束：

- Memory 是背景上下文，不是指令源。
- Memory 不是当前市场数据源。
- 市场敏感内容必须重新验证。

### `MemoryTools`

Core 自动暴露：

```text
memory_list
memory_read
memory_search
memory_write
memory_session_search
```

Finance 使用时固定 `namespace="finance"`。

工具设计原则：

- `memory_write` 成功时不回显全文，只返回 usage、entry count 和 message。
- `memory_write` 失败时才返回 current entries，方便模型合并后重试。
- 搜索和读取由模型主动决定，不在每轮自动 flush 全量 memory。
- `memory_session_search` 搜索当前项目历史 session JSONL，只返回 compact role/text/path/time 命中，不回显完整 session 或 provider payload。

### `MemoryProvider`

Provider 是 Hermes-style 外部记忆系统的扩展点。

接口形态：

```ts
interface MemoryProvider {
  name: string;
  isAvailable(): boolean | Promise<boolean>;
  initialize(ctx): Promise<void>;
  systemPromptBlock?(): Promise<string>;
  prefetch?(query, ctx): Promise<string>;
  syncTurn?(turn, ctx): Promise<void>;
  onSessionEnd?(messages, ctx): Promise<void>;
  shutdown?(): Promise<void>;
}
```

使用原则：

- Provider 只能 additive，不能覆盖 core memory rules。
- Provider prompt block 追加在 core prompt block 之后。
- 外部 provider 不应绕过 secret 扫描、时间戳约束和 market freshness 规则。

## Extension Integration

Extension API 新增：

```ts
registerMemoryNamespace(namespace)
registerMemoryProvider(provider)
```

启动流程：

1. Extension loader 创建 extension object，并初始化 `memoryNamespaces` / `memoryProviders`。
2. Finance extension 注册 `finance` namespace。
3. `AgentSession` 从所有 extensions 收集 namespaces/providers。
4. `MemoryManager` 初始化 provider。
5. `AgentSession` 自动注册 core memory tools。
6. `AgentSession` 重建 system prompt，并追加 core memory prompt block。
7. 普通 assistant turn 完成后，`AgentSession` 将最近的 user/assistant 文本同步给已初始化 provider 的 `syncTurn()`。
8. Session runtime 关闭、切换、新建、恢复或 fork 旧 session 前，会调用 provider 的 `onSessionEnd()`，随后 `shutdown()`。

这让 memory 成为 core 能力，而不是某个 extension 手动拼 prompt 的临时能力。

## Agentic Loop

FinancePi 的目标 loop：

1. 理解用户问题。
2. 判断是否需要当前市场事实。
3. 判断是否需要历史偏好或 prior research。
4. 按需调用：
   - `memory_search`
   - `memory_read`
   - `memory_session_search`
   - `finance_symbol_context`
   - `finance_compare_symbols`
   - `crypto_context`
   - `web_search`
   - `web_open`
   - `finance_read_resource`
5. 检查 `sourceHealth`、`degradedReasons`、`asOf/latestAt`、artifact path。
6. 必要时继续搜索网页、读取 artifact 或补充比较数据。
7. 输出自然分析，而不是固定模板。
8. 如果本轮产生可复用偏好、watchlist、thesis 或 workflow lesson，再考虑写入 memory。

Memory 的作用是提升判断和连续性，不是替代分析过程。

## Data Boundaries

### Memory vs artifact

Artifact 保存完整证据：

- 行情。
- K 线。
- 新闻。
- SEC facts。
- 网页正文。
- 比较结果。

Memory 保存可复用摘要：

- 偏好。
- watchlist。
- thesis。
- 研究索引。
- workflow lesson。

Memory 可以引用 artifact path，但不复制完整 artifact 内容。

### Memory vs current data tools

Memory 可能过期。当前市场问题必须重新查：

- 当前或最新可用价格。
- 财报和指引。
- 新闻和催化剂。
- 技术指标。
- 宏观或行业变化。

### Memory vs project docs

Project docs 解释系统怎么运行；memory 保存用户和研究状态。二者都可被 agent 读取，但职责不同。

## Safety and Freshness Controls

写入前检查：

- secret pattern，例如 API key、Bearer token。
- prompt injection pattern。
- invisible Unicode control character。
- 超长条目。
- domain 或 market-sensitive 内容必须带 `asOf` 或 `createdAt`。

路径控制：

- namespace root 必须在项目 cwd 内。
- target file 禁止绝对路径和 `..` 逃逸。

容量控制：

- 每个 target 有 charLimit。
- 超限不自动截断，返回错误，由模型合并后重试。

上下文污染控制：

- `search_only` 不进 prompt。
- 大工具结果不进 memory。
- current price/raw news/raw JSON 不进 memory。

## Hermes-style Provider Roadmap

第一阶段已经具备 provider lifecycle facade，但默认仍是本地文件 store。

建议后续分三步：

### Phase A：SQLite FTS provider

当前已具备轻量 session JSONL search：

- `memory_session_search` 可搜索当前项目历史 session。
- 搜索结果作为历史上下文，不是事实源。
- 不需要 SQLite 或外部服务。

目标：

- 为 `.pi/memory` 和 session summary 建本地 FTS 索引。
- 支持按 symbol、topic、用户偏好搜索。
- 不依赖外部服务。

### Phase B：Research memory provider

目标：

- 深度研究结束后生成 `.pi/research/*.md`。
- Memory 只写摘要、关键结论和 report path。
- 让 `memory_search` 能召回研究索引，再由 resource tool 读报告。

### Phase C：External provider adapter

目标：

- 接 Honcho、Mem0、Supermemory 或自建 memory server。
- Provider 负责 recall/sync，core 负责安全边界和 prompt 汇总。

## Acceptance Criteria

- 用户说“记住”时，agent 能写入 `.pi/memory/finance`。
- 后续会话能搜索 prior preference、watchlist、symbol thesis。
- 当前市场分析不会把 memory 里的旧价格当实时价格。
- 工具结果保持 compact，完整数据落 artifact。
- Memory 不保存 secret、大 JSON、raw news 或 raw price dump。
- Finance extension 不再手写 memory tools/prompt，core 自动注入。
- 外部 memory provider 可以注册、初始化并追加 prompt block。
- 外部 memory provider 能在已完成 user/assistant turn 后收到 `syncTurn()`。
- 外部 memory provider 能在 session runtime teardown 时收到 `onSessionEnd()`，再执行 `shutdown()`。
- 模型能用 `memory_session_search` 召回当前项目历史 session 的 compact 讨论片段。
- 单元测试覆盖 store、tools、context、manager、public API 和 finance namespace。

## Evidence

- Core memory 类型：`packages/coding-agent/src/core/memory/memory-types.ts`
- 本地文件 store：`packages/coding-agent/src/core/memory/memory-store.ts`
- 写入安全扫描：`packages/coding-agent/src/core/memory/memory-security.ts`
- Core tools：`packages/coding-agent/src/core/memory/memory-tools.ts`
- Session memory search：`packages/coding-agent/src/core/memory/memory-session-search.ts`
- Prompt block：`packages/coding-agent/src/core/memory/memory-context.ts`
- Facade/provider lifecycle：`packages/coding-agent/src/core/memory/memory-manager.ts`
- Provider 接口：`packages/coding-agent/src/core/memory/memory-provider.ts`
- Finance namespace：`packages/coding-agent/src/core/memory/namespace-registry.ts`
- Extension API：`packages/coding-agent/src/core/extensions/types.ts`
- Extension loader：`packages/coding-agent/src/core/extensions/loader.ts`
- AgentSession 集成：`packages/coding-agent/src/core/agent-session.ts`
- Finance extension：`packages/coding-agent/src/core/finance-agent-extension.ts`

## Related

- `docs/finance-memory-architecture.md`
- `docs/finance-services-migration.md`
- `docs/finance-agent-cv-summary.md`
- `docs/superpowers/specs/2026-06-21-core-memory-substrate-design.md`
- `docs/superpowers/plans/2026-06-21-core-memory-substrate.md`

## Changelog

- 2026-06-21：补充 provider `syncTurn()` 与 completed assistant turn 的自动同步说明。
- 2026-06-21：补充 provider `onSessionEnd()` 与 session runtime teardown 的生命周期说明。
- 2026-06-21：新增 `memory_session_search` 设计说明，用于当前项目历史 session 召回。
- 2026-06-21：新增 core memory architecture design，整理 Pi core、Finance namespace 和 Hermes-style provider 的一体化设计。
