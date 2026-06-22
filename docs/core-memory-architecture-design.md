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

## Architecture Decision

当前采用四层 memory，而不是把所有历史统一塞进一个长期记忆池：

1. `session memory`：Pi 已有的 JSONL/compaction/continue 能力，只负责当前会话连续性。
2. `user memory`：稳定用户偏好，允许短小条目常驻 prompt。
3. `domain/research memory`：标的、主题、研究摘要和 artifact path，默认 search-only。
4. `long-term/procedural memory`：agent 工作流经验，允许短规则摘要注入，复杂内容按需搜索。

这个分层适合 FinancePi：它把“当前事实”“用户偏好”“历史研究”“工作流经验”分开，避免旧行情、新闻列表或大 JSON 污染分析上下文。Core 只提供 memory substrate；Finance namespace 只是第一个使用方。

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
memory_compact
memory_session_search
memory_promote_session
memory_research_report
memory_audit
memory_provider_audit
```

Finance 使用时固定 `namespace="finance"`。

工具设计原则：

- `memory_write` 成功时不回显全文，只返回 usage、entry count 和 message。
- `memory_write` 的成功 message 会标出 `skippedDuplicates` / `mergedDuplicates`，让模型知道本次写入是否被去重。
- `memory_write` 失败时才返回 current entries 预览，方便模型合并后重试；预览会截断，避免大 memory target 全量 flush 污染上下文。
- `memory_write` 对 add/replace 写入做空白规范化去重，避免同一条用户偏好或研究结论因换行/多空格差异重复污染 memory。
- `memory_compact` 在 agent 读过当前条目数后，把单个 target 压缩成一个 curated entry；如果 `sourceEntryCount` 与当前条目数不一致则拒绝覆盖，避免 stale compaction 覆盖新记忆。
- 搜索和读取由模型主动决定，不在每轮自动 flush 全量 memory。
- `memory_search` 搜索 persistent memory 时返回 compact score/snippet，并按 query term 覆盖度和命中次数排序。
- `memory_search` 对 delimiter-separated memory file 按完整 entry 召回；当一条研究记忆的 symbol、thesis、risk 分布在多行时，query terms 跨行仍能命中同一条 curated memory。
- `memory_session_search` 搜索当前项目历史 session JSONL，只返回 compact role/text/path/time/score/snippet 命中，不回显完整 session 或 provider payload；其中 `line` 是真实 JSONL 文件行号。无法映射到真实 source line 的合成上下文不返回，避免后续 `memory_promote_session` 拿到不可验证的 `line=0`。
- `memory_promote_session` 在 `memory_session_search` 找到可复用历史证据后，把模型整理出的 compact entry 写入 persistent memory，并附带 `sourceSession=<path>:<line>`，避免自动把整段历史灌入长期记忆；sourceSession 必须指向真实 `.jsonl` user/assistant message 行，且 source path 必须位于项目 session root 或当前配置的 Pi 默认 session root。
- `memory_research_report` 把长研究报告写入 `.pi/research/*.md`，再把 compact summary、report path 和 source paths 写进 memory index。
- `memory_research_report` 会先校验 `sourcePaths` 是项目内相对文件路径且文件存在，避免写入不可复查的 compact research index。
- `memory_audit` 返回 namespace/target/path/usage/inject/risk 的 compact health view，并标出 `duplicate_entries`、`stale_market_data` 等污染或陈旧风险；`duplicate_entries` 覆盖 exact duplicate 和空白等价 duplicate，方便模型和用户审计 memory 状态。
- `memory_audit` 输出 `duplicateEntries` 和 `staleEntries` 计数，帮助模型判断需要合并多少条重复 memory、需要复核多少条旧市场记忆。
- `stale_market_data` 当前按实现固定阈值判定：带 `asOf` / `createdAt` 的 market-sensitive entry 超过 180 天会计入 `staleEntries`。
- core memory prompt 和 `memory_audit` 工具提示模型：看到 `risk=duplicate_entries` 时先 `memory_read`，再用 `memory_compact` 合并成单条 curated memory。
- core memory prompt 和 `memory_audit` 工具提示模型：看到 `risk=stale_market_data` 时先 `memory_read`，再用最新工具或 artifact 验证，并用带新时间戳的摘要 replace/compact。
- `memory_compact` 将 target 压缩为单条 curated memory，适合容量压力或长期研究摘要收束。
- `memory_provider_audit` 返回 configured/available provider 和 provider error 的 compact view，并对重复 provider error 做去重，方便审计外部记忆服务状态。

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
  getToolDefinitions?(): MemoryProviderTool[];
  handleToolCall?(toolName, args, ctx): Promise<unknown>;
  shutdown?(): Promise<void>;
}
```

使用原则：

- Provider 只能 additive，不能覆盖 core memory rules。
- Provider prompt block 追加在 core prompt block 之后。
- 外部 provider 不应绕过 secret 扫描、时间戳约束和 market freshness 规则。
- 只有 provider、没有本地 memory namespace 的扩展仍会暴露 `memory_provider_audit`，方便排查外部 memory 服务状态。
- Provider 自带 tool 与 core memory tool 同名时，core memory tool 保持优先；冲突的 provider tool 会被跳过并写入 `memory_provider_audit`，避免外部 provider 覆盖 `memory_write` 等安全边界。
- 多个 provider 注册同名自带 tool 时，第一个 provider 的 tool 保留，后续冲突 tool 会被跳过并写入 `memory_provider_audit`，避免 tool registry 歧义。
- Provider 自带 tool 的 `handleToolCall()` 会收到 `cwd`、`sessionId` 和当前单 namespace，方便外部 adapter 按项目、会话和 finance/coding/research namespace 隔离索引与召回。
- 单个 provider 在 `isAvailable`、`initialize`、`systemPromptBlock`、`prefetch`、`syncTurn`、`onSessionEnd` 或 `shutdown` 阶段失败时，只记录 provider error，不中断其他 provider 或主 agent 流程。
- Provider 自带 tool 的 `getToolDefinitions()` / `handleToolCall()` 失败时，tool 注册或执行返回 compact failure path，不抛出未捕获异常，并写入 provider audit 错误记录。

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
7. 每轮 prompt 发给 provider 前，`AgentSession` 会调用 provider `prefetch()`，把 compact recall 作为本轮临时 system prompt 追加。
8. 普通 assistant turn 完成后，`AgentSession` 将最近的 user/assistant 文本同步给已初始化 provider 的 `syncTurn()`。
9. Session runtime 关闭、切换、新建、恢复、fork 或直接 dispose 旧 session 前，会调用 provider 的 `onSessionEnd()`，随后 `shutdown()`。
10. 当当前 session 只有一个 memory namespace 时，`MemoryManager` 会把该 namespace 默认注入 provider lifecycle ctx；`AgentSession` 显式传入时也会保留该 namespace，避免外部 adapter 把 finance/coding/research 记忆混在一起。
11. Provider 可通过 `getToolDefinitions()` 暴露自有 memory tools，core 会包装并注册给当前 AgentSession。

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
8. 如果用户明确要求“记住”，或本轮产生可复用偏好、watchlist、thesis 或 workflow lesson，使用 `memory_write` 写入 compact memory。
9. 如果长期价值来自历史 session，先用 `memory_session_search` 找证据，再用 `memory_promote_session` 写入带 `sourceSession` 的 compact memory。
10. 如果 `memory_audit` 显示 target 接近容量上限、重复或陈旧，先读取当前内容，再用 `memory_compact` 安全收束。

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
- 搜索结果按 query term 覆盖度和命中次数排序，并带 compact snippet。
- 搜索结果作为历史上下文，不是事实源。
- 不需要 SQLite 或外部服务。

目标：

- `.pi/memory` 和 session search 已具备轻量 score/snippet/ranking。
- 后续可为 `.pi/memory` 和 session summary 建本地 FTS 索引。
- 后续可支持更强的 symbol、topic、用户偏好搜索。
- 不依赖外部服务。

### Phase B：Research memory provider

当前轻量实现：

- `memory_research_report` 可生成 `.pi/research/*.md`。
- `.pi/memory/<namespace>/RESEARCH.md` 只保存摘要、report path、symbols 和 source paths。
- 后续模型通过 `memory_search` 找索引，再通过 finance resource tools 按需读取报告或 artifact。
- Report 内容会经过 secret/prompt-injection/invisible Unicode 扫描；memory index 写入失败时不会留下孤立 report 文件；report 文件写入失败时会回滚 compact memory index。

后续目标：

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
- `memory_search` 返回 score/snippet，并优先返回覆盖更多 query terms 的 memory 命中。
- `memory_promote_session` 能把历史 session 命中的 durable 结论带 `sourceSession` 写入 curated memory。
- `memory_audit` 能查看 memory target 容量、条目数、注入策略、路径和风险状态。
- `memory_provider_audit` 能查看外部 memory provider 配置、可用状态和错误记录。
- `memory_compact` 能把过长 target 安全压缩为单条 curated entry，并在条目数不匹配时拒绝覆盖。
- 当前市场分析不会把 memory 里的旧价格当实时价格。
- 工具结果保持 compact，完整数据落 artifact。
- 长研究内容能通过 `memory_research_report` 落 `.pi/research/*.md`，memory 只保存 compact index。
- `memory_research_report` 不允许 secret/prompt-injection report 内容；source path 缺失或 index 失败时不留下孤立 report；report 写入失败时回滚 memory index。
- Finance resource tools 能读取 `.pi/research/*.md` report path。
- Memory 不保存 secret、大 JSON、raw news 或 raw price dump。
- Finance extension 不再手写 memory tools/prompt，core 自动注入。
- 外部 memory provider 可以注册、初始化并追加 prompt block。
- 外部 memory provider 自带工具不能覆盖 core memory tools。
- 外部 memory provider 的 `prefetch()` 结果能进入当前 turn system prompt，且不写入 session。
- 外部 memory provider 能在已完成 user/assistant turn 后收到 `syncTurn()`。
- 外部 memory provider 能在 session runtime teardown 时收到 `onSessionEnd()`，再执行 `shutdown()`。
- 外部 memory provider 自带工具能通过 `getToolDefinitions()/handleToolCall()` 暴露给模型。
- 外部 memory provider 单点失败不会拖垮主 agent 或其他 provider，错误可从 `MemoryManager.getProviderErrors()` 审计。
- 外部 memory provider 自带工具注册或执行失败时返回 compact failure path，而不是中断 agent tool loop，并能被 `memory_provider_audit` 看到。
- 模型能用 `memory_session_search` 召回当前项目历史 session 的 compact 讨论片段。
- `memory_session_search` 返回 score/snippet，并优先返回覆盖更多 query terms 的命中。
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

- 2026-06-21：补充 provider 自带工具通过 core 注册到 AgentSession 的设计说明。
- 2026-06-21：新增 `memory_research_report` 设计说明，用于长研究报告落盘和 compact memory 索引。
- 2026-06-21：增强 `memory_session_search` 设计说明，补充相关性排序和 snippet。
- 2026-06-21：新增 `memory_promote_session`，用于把历史 session 命中显式整理成带 `sourceSession` 的 curated memory，并校验 sourceSession 指向真实 `.jsonl` user/assistant message 行。
- 2026-06-21：增强 `memory_session_search`，过滤无法映射到真实 JSONL source line 的历史上下文，保证返回结果可作为 session promotion 证据。
- 2026-06-21：修正 `memory_promote_session` 的 source path 校验，支持默认 `memory_session_search` 返回的配置化 Pi session root，同时继续拒绝非 session root 任意路径。
- 2026-06-21：增强 `memory_search` 设计说明，补充 persistent memory 的相关性排序和 snippet。
- 2026-06-21：增强 `memory_search`，对 delimiter-separated multi-line memory entry 做 entry-level 召回，避免 symbol/thesis/risk 分散在多行时被逐行搜索拆碎。
- 2026-06-21：补充 `memory_write` 对 add/replace 写入的空白规范化去重规则，减少重复 memory 污染。
- 2026-06-21：补充 `memory_write` 成功 message 的 duplicate 去重计数，避免模型误判已写入新条目。
- 2026-06-21：补充 `memory_write` 失败时 current entries 预览截断规则，避免错误路径全量回显长期记忆。
- 2026-06-21：补充 `memory_research_report` 安全扫描和无孤立 report 写入规则。
- 2026-06-21：补充 `memory_research_report` 文件写入失败时回滚 compact memory index 的规则。
- 2026-06-21：补充 `memory_research_report` 的 source path 存在性校验，确保研究索引可复查。
- 2026-06-21：新增 `memory_audit` 设计说明，用于 compact memory health/capacity 审计。
- 2026-06-21：补充 `memory_audit` 的 `duplicate_entries` 风险，用于发现手工编辑或历史文件中的重复 memory。
- 2026-06-21：补充 `memory_audit` 的 `duplicateEntries` 计数，让重复 cleanup 更可操作。
- 2026-06-21：补充 `risk=duplicate_entries` 的 agentic cleanup guidance，要求先读后 compact。
- 2026-06-21：补充 `memory_audit` 的 `stale_market_data` 风险和 `staleEntries` 计数，用于发现需要复核的旧市场记忆。
- 2026-06-21：新增 `memory_provider_audit`，用于外部 memory provider 状态和错误审计。
- 2026-06-21：补充 provider-only extension 也会暴露 `memory_provider_audit`，避免无本地 namespace 时无法审计外部 memory。
- 2026-06-21：新增 `memory_compact` 设计说明，用于基于已读条目数的安全压缩写回。
- 2026-06-21：补充 provider lifecycle 错误隔离规则，避免外部 memory provider 故障拖垮主 agent。
- 2026-06-21：补充 core memory prompt 对 `memory_write`、`memory_audit` 和 `memory_compact` 的 agentic loop 指导。
- 2026-06-21：补充 provider 自带 memory tool 注册/执行的错误隔离和 audit 记录规则。
- 2026-06-21：补充 provider 自带 tool 不得覆盖 core memory tools 的注册优先级规则。
- 2026-06-21：补充 provider 自带 tool 与 core memory tool 同名冲突会被跳过并写入 `memory_provider_audit`。
- 2026-06-21：补充多个 provider 自带 tool 同名冲突会跳过后续 tool 并写入 `memory_provider_audit`。
- 2026-06-21：补充 provider audit 对重复 provider error 的去重规则，避免 registry 刷新污染 audit。
- 2026-06-21：补充 `MemoryManager` 对单 namespace provider lifecycle ctx 的默认注入，减少调用方漏传 namespace 的风险。
- 2026-06-21：补充 provider `prefetch()` 与当前 turn system prompt 的临时召回注入说明。
- 2026-06-21：补充 provider `syncTurn()` 与 completed assistant turn 的自动同步说明。
- 2026-06-21：补充 provider `onSessionEnd()` 与 session runtime teardown 的生命周期说明。
- 2026-06-21：补充直接 `AgentSession.dispose()` 时也会先调用 provider `onSessionEnd()` 再 `shutdown()`，避免长记忆 provider 丢失最后整理机会。
- 2026-06-21：新增 `memory_session_search` 设计说明，用于当前项目历史 session 召回。
- 2026-06-21：新增 core memory architecture design，整理 Pi core、Finance namespace 和 Hermes-style provider 的一体化设计。
