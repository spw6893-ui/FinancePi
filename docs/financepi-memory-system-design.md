# FinancePi Memory System Design

## Purpose

本文档给 FinancePi 的 memory 机制定一个更清晰的系统设计：在 Pi 原有 session/continue/compaction 之上，把 Hermes-style 的长期记忆能力 core 化，并针对金融 agent 做分层、召回、写入、安全和数据新鲜度约束。

核心判断：当前四层 memory 设计是合理的，但必须保持“市场事实”和“长期记忆”分离。FinancePi 需要记住用户偏好、关注标的、研究结论和工作流经验；不应该把当前行情、新闻列表、SEC 原始 facts、大 JSON 或 CSV 全量写进长期记忆。

## Executive Summary

FinancePi 的 memory 不应该做成“每轮自动塞一大段历史上下文”的系统，而应该做成 agent 可主动调用的 core substrate：

- **短记忆进 prompt**：用户偏好、少量长期 workflow rule。
- **长记忆走工具召回**：watchlist、symbol thesis、研究报告索引、历史 session。
- **当前事实走数据工具**：行情、新闻、财报、链上/crypto 数据、网页搜索和 artifact。
- **外部 memory provider 可插拔**：Hermes、Mem0、Honcho、Supermemory 或本地 FTS 都走 provider facade，但不能覆盖 core memory 工具和安全边界。

当前 layer 设计可以保留：`session memory`、`user memory`、`research memory`、`long-term memory`。这四层职责清楚，适合金融 agent，因为金融场景最怕把旧行情、旧新闻和旧观点误当成当前事实。

## Scope

覆盖：

- Pi 当前已有 memory 能力和局限。
- FinancePi 的四层 memory model。
- Core memory substrate 的模块职责。
- Finance namespace/target 设计。
- LLM 在 agentic loop 中如何读写 memory。
- Hermes-style provider 与 Pi core 的结合方式。
- 数据新鲜度、安全边界和验收标准。

不覆盖：

- Web UI memory 管理界面。
- 付费外部 memory 服务选型。
- 自动总结所有历史会话并无条件写入 long-term memory。
- 把行情/新闻/财报 artifact 自动转换成长期事实。

## Status

截至 2026-06-21，仓库中已经存在 core memory substrate 的 MVP：

- 本地 Markdown memory store。
- Finance namespace。
- Core memory tools。
- Memory prompt block。
- Provider lifecycle facade。
- Session memory search。
- Research report 落盘和 compact memory index。
- Memory audit 能标出 `duplicate_entries` 和 `stale_market_data`，帮助发现手工编辑或历史文件中的重复、陈旧市场记忆。
- 当前 stale market-data 审计阈值为 180 天。
- Provider audit 对重复错误去重，避免重复 registry 刷新污染上下文。
- Persistent memory add/replace 写入对空白等价内容去重，避免同一条偏好或研究结论重复污染 recall。
- 只有 external provider、没有本地 namespace 的 extension 仍会暴露 `memory_provider_audit`，用于排查外部 memory 服务可用性。

仍建议继续增强的部分：

- 更强的本地 FTS/embedding 检索。
- 更细粒度的 memory write approval policy。
- 从 session 历史到 curated memory 的半自动整理流程。

## Current Memory State

现在 FinancePi 的 memory 已经不是单纯 session resume，而是三类能力组合：

1. **Pi 原生 session state**
   - 保存会话消息、tool result、branch、compaction 和 continue/resume 状态。
   - 适合恢复“这轮工作做到哪里”，不适合当长期研究库。

2. **本地 curated memory**
   - 路径：`.pi/memory/finance/*.md`
   - 由 `memory_list/read/search/write/compact/audit/research_report` 管理。
   - 适合保存用户偏好、watchlist、symbol thesis、研究索引和长期 workflow。

3. **Provider memory facade**
   - 由 `MemoryProvider` 接口接 Hermes-style 外部记忆系统。
- 支持 initialize、systemPromptBlock、prefetch、syncTurn、onSessionEnd、provider-owned tools 和 shutdown；session runtime teardown 或直接 dispose 时都会先触发 onSessionEnd，再 shutdown。
   - provider 错误进入 `memory_provider_audit`，不会中断主 agent loop。

这意味着当前内存已经可以覆盖“当前会话连续性 + 长期偏好 + 长期研究 + 外部记忆扩展”。下一步不是重新分层，而是增强召回质量、写入审核和 session-to-curated 的整理链路。

## Current Memory Baseline

### 1. Pi 原生 session memory

Pi 已有 session 级上下文：

- conversation messages。
- tool results。
- branch/tree。
- compaction summary。
- custom extension entry。
- continue/resume。

它适合恢复当前会话和工作现场，但不适合作为金融长期记忆的唯一来源：

- 没有 finance/user/research/long-term namespace。
- 没有 target 容量控制。
- 没有市场数据新鲜度约束。
- 没有明确的“哪些内容应该长期保存”规则。
- 召回粒度偏会话，不是偏 symbol/topic/research thesis。

证据：`packages/coding-agent/src/core/session-manager.ts`

### 2. Finance artifact layer

FinancePi 已经把完整市场数据落盘为 artifact。artifact 是证据层，不是 memory 层。

典型路径：

```text
.pi/artifacts/market-data/*.csv
.pi/artifacts/web/*.txt
.pi/research/*.md
```

artifact 保存完整数据和可复查证据；memory 只保存 compact summary、用户偏好、研究索引和 artifact/report path。

### 3. Core persistent memory

当前新增的 core memory substrate 提供：

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

这些工具让模型可以主动发现、搜索、读取、写入和审计 memory，而不是每轮都被动接收一大段 JSON。

证据：

- `packages/coding-agent/src/core/memory/memory-tools.ts`
- `packages/coding-agent/src/core/memory/memory-manager.ts`

## Design Decision

FinancePi 采用四层 memory：

| 层 | 生命周期 | 当前实现 | 默认召回 | 用途 |
| --- | --- | --- | --- | --- |
| session memory | 当前/历史会话 | Pi session JSONL + compaction | continue/resume/search | 当前任务状态、历史对话线索 |
| user memory | 长期稳定 | `.pi/memory/finance/USER.md` | always short snapshot | 用户偏好、风险偏好、输出偏好、数据源偏好 |
| research memory | 中长期研究 | `WATCHLIST.md`、`SYMBOL_NOTES.md`、`RESEARCH.md` | search/read | 标的 thesis、研究摘要、watchlist、source path |
| long-term memory | 长期流程经验 | `MEMORY.md`、`LONG_TERM.md` | summary/search/read | agent workflow、投研 checklist、质量规则 |

这个 layer 是合适的，原因：

1. 金融任务天然要求区分“当前事实”和“历史观点”。
2. 用户偏好应常驻，但 symbol research 不应该常驻污染 prompt。
3. Long-term workflow 能提升 agent 行为质量，但不应覆盖实时数据验证。
4. Session memory 保留上下文连续性，persistent memory 保留可复用知识，二者职责不同。

### Layer Assessment

当前分层可以继续保留，不建议回退成单一 memory 文件，也不建议一开始就接一个外部全局 memory cloud。

合理点：

- `session memory` 解决“这轮做到哪了”，不承担长期知识库职责。
- `user memory` 解决“用户长期偏好是什么”，应该短小且稳定。
- `research memory` 解决“之前对某个标的/主题研究过什么”，应该按需搜索，不默认注入。
- `long-term memory` 解决“agent 自己应该怎么做得更好”，可以保留流程规则和质量 checklist。

需要约束的点：

- `research memory` 不能保存无时间戳的强结论。
- `long-term memory` 不能变成新 system prompt，不能覆盖项目规则和工具事实。
- `user memory` 不应自动推断敏感画像，只保存用户明确表达或强稳定偏好。
- `session memory` 的历史结论不能直接当作当前市场事实。

结论：这个 layer 适合 FinancePi，而且比 Hermes 原始思路更贴金融场景，因为它显式区分“偏好、研究、流程、当前事实”。后续增强重点不是增加更多层，而是增强召回质量、写入策略和审计治理。

## Architecture Overview

```text
User request
    |
    v
Agentic planning loop
    |
    +-- short prompt snapshot
    |      |
    |      +-- finance/user       always
    |      +-- finance/memory     summary
    |      +-- finance/long_term  summary
    |
    +-- on-demand recall
    |      |
    |      +-- memory_search/read
    |      +-- memory_session_search
    |      +-- provider prefetch/tool calls
    |
    +-- current facts
    |      |
    |      +-- finance/crypto tools
    |      +-- web search/open
    |      +-- artifact/resource read
    |
    v
Natural financial analysis
    |
    +-- optional durable write
           |
           +-- memory_write
           +-- memory_promote_session
           +-- memory_research_report
           +-- memory_compact
```

核心原则：prompt snapshot 只给模型“稳定背景”；历史研究和外部 provider 召回由模型按需调用；当前事实必须走 finance/crypto/web/artifact。

## Core Integration Plan

如果从 core 一步到位实现，推荐保持现在这个方向，不把 memory 写死进 finance extension：

```text
Extension registry
    |
    +-- registerMemoryNamespace(createFinanceMemoryNamespace())
    +-- registerMemoryProvider(optional Hermes-style adapter)
    |
    v
AgentSession
    |
    +-- MemoryManager
    |      +-- MemoryStore                 local markdown curated memory
    |      +-- MemoryTools                 memory_* tools
    |      +-- MemoryContext               short prompt snapshot
    |      +-- MemoryProvider lifecycle    external memory adapters
    |
    v
Tool registry + prompt builder + turn sync
```

核心抽象只关心 namespace、target、tool 和 provider lifecycle；Finance 只提供 namespace 配置和 prompt guideline。这样后续 coding/research/ops agent 可以复用同一套 substrate。

## Current Implementation Map

| 能力 | 状态 | 代码/文件 |
| --- | --- | --- |
| Core memory 类型 | 已有 | `packages/coding-agent/src/core/memory/memory-types.ts` |
| 本地 Markdown store | 已有 | `packages/coding-agent/src/core/memory/memory-store.ts` |
| 写入安全扫描 | 已有 | `packages/coding-agent/src/core/memory/memory-security.ts` |
| Memory tools | 已有 | `packages/coding-agent/src/core/memory/memory-tools.ts` |
| Prompt snapshot | 已有 | `packages/coding-agent/src/core/memory/memory-context.ts` |
| Manager / lifecycle | 已有 | `packages/coding-agent/src/core/memory/memory-manager.ts` |
| Hermes-style provider interface | 已有 | `packages/coding-agent/src/core/memory/memory-provider.ts` |
| Finance namespace | 已有 | `packages/coding-agent/src/core/memory/namespace-registry.ts` |
| Session search | 已有轻量版 | `packages/coding-agent/src/core/memory/memory-session-search.ts` |
| Research report 落盘 | 已有 | `memory_research_report` |
| Session-to-curated memory | 已有 | `memory_promote_session` |
| Provider audit | 已有 | `memory_provider_audit` |
| Duplicate/stale audit / dedupe | 已有 | `memory_audit`、`memory_write` |
| FTS / embedding recall | 待增强 | 【待确认】后续设计 |
| UI memory 管理 | 未覆盖 | 【待确认】后续产品需求 |

## Finance Namespace

Finance namespace 当前由 `createFinanceMemoryNamespace()` 注册：

| target | layer | file | injectPolicy | charLimit | 说明 |
| --- | --- | --- | --- | ---: | --- |
| `user` | `user` | `USER.md` | `always` | 1800 | 用户偏好、风险偏好、输出偏好 |
| `memory` | `long_term` | `MEMORY.md` | `summary` | 2200 | agent operational notes |
| `watchlist` | `domain` | `WATCHLIST.md` | `search_only` | 4000 | 用户关注资产、主题和市场 |
| `symbol_notes` | `domain` | `SYMBOL_NOTES.md` | `search_only` | 6000 | 标的 thesis、风险、跟踪 checklist |
| `research` | `domain` | `RESEARCH.md` | `search_only` | 8000 | 研究摘要、source path、open questions |
| `long_term` | `long_term` | `LONG_TERM.md` | `summary` | 3000 | 长期流程规则和 reusable checklist |

证据：`packages/coding-agent/src/core/memory/namespace-registry.ts`

## Agentic Loop

FinancePi 回答金融问题时，memory 不应变成固定模板，而应进入模型自主决策 loop：

1. 理解用户问题和标的。
2. 判断是否需要历史偏好或 prior research。
3. 如需要，调用 `memory_search(namespace="finance", query=...)`。
4. 如命中重要内容，再调用 `memory_read(...)` 读取必要片段。
5. `memory_search` 会按 delimiter-separated entry 召回多行 curated memory，适合 symbol/thesis/risk 分布在多行的研究条目。
6. 判断是否需要当前市场事实。
7. 按任务调用 finance/crypto/web/resource 工具。
8. 检查 `asOf/latestAt`、`sourceHealth`、`degradedReasons`、artifact path。
9. 必要时继续读 artifact、web search 或做比较分析。
10. 自然输出分析，不强制固定模板。
11. 如果长期价值来自历史 session，先 `memory_session_search` 找证据，再 `memory_promote_session` 写入带 `sourceSession` 的 compact memory；sourceSession 必须指向真实 `.jsonl` user/assistant message 行。无法映射到真实 source line 的历史上下文不会作为 session search 结果返回。
12. 只有当用户明确要求“记住”，或本轮产生可复用偏好/thesis/workflow lesson 时，才调用 `memory_write` 或 `memory_research_report`。

关键原则：

- Memory 影响“该怎么分析”，不替代“当前事实验证”。
- Search-only research 不自动注入 prompt。
- 完整数据走 artifact path，不走 memory content。

## Write Policy

### 可以写入

- 用户明确要求“记住”。
- 稳定用户偏好：数据源偏好、市场范围、输出偏好、风险偏好。
- Watchlist：用户持续关注的 symbol/theme。
- 研究摘要：带 `asOf` 或 `createdAt` 的 thesis、risk、source path。
- 长期流程经验：例如 degraded source 处理规则、crypto/equity 数据路径隔离规则。

### 不应写入

- 当前价格作为永久事实。
- 新闻标题列表。
- 原始 quote/chart/facts JSON。
- 大段 CSV、网页正文或 SEC 原始 facts。
- API key、token、cookie、个人凭据。
- 未注明时间和来源的强投资结论。

### 市场敏感内容格式

建议 market-sensitive memory 至少包含：

```text
symbol=NVDA | asOf=2026-06-21 | thesis=... | risks=... | sourcePaths=.pi/artifacts/...
```

## Core Components

### `MemoryStore`

职责：

- 管理本地 Markdown memory 文件。
- 支持 list/read/search/write/compact/audit。
- 限制 namespace root 必须在项目 cwd 内。
- 限制 target file 不能路径逃逸。
- 执行容量限制和基础安全扫描。

证据：`packages/coding-agent/src/core/memory/memory-store.ts`

### `MemoryContext`

职责：

- 构建 core memory prompt block。
- 只注入 `always` 和 `summary` 内容。
- 对长内容截断，并提示模型用 `memory_search/read` 按需读取。
- 明确提示 memory 不是当前市场数据源。

证据：`packages/coding-agent/src/core/memory/memory-context.ts`

### `MemoryTools`

职责：

- 暴露通用 memory tools。
- 让模型按需搜索、读取、写入、审计和压缩 memory。
- 保持工具返回 compact，避免 JSON flush 污染上下文。

证据：`packages/coding-agent/src/core/memory/memory-tools.ts`

### `MemoryManager`

职责：

- 聚合 extension 注册的 namespace/provider。
- 创建 core tools 和 provider tools。
- 构建 prompt block。
- 管理 provider lifecycle。
- 记录 provider 错误供 `memory_provider_audit` 查看。

证据：`packages/coding-agent/src/core/memory/memory-manager.ts`

### `MemoryProvider`

职责：

- 作为 Hermes-style 外部 memory adapter 接口。
- 支持 initialize/systemPromptBlock/prefetch/syncTurn/onSessionEnd/shutdown。
- 当当前 session 只有一个 memory namespace 时，`MemoryManager` 会默认把该 namespace 注入 provider lifecycle ctx，方便外部 adapter 按 finance/coding/research 隔离索引和召回。
- 可注册 provider-owned tools。
- Provider-owned tools 的 `handleToolCall()` 会收到 `cwd`、`sessionId` 和当前单 namespace，避免外部记忆工具跨项目或跨 namespace 混读混写。
- Provider tool 与 core memory tool 同名时会被跳过，并进入 `memory_provider_audit`。
- 只有 provider、没有本地 namespace 时，仍可暴露 `memory_provider_audit`，但不会注入 `CORE MEMORY CONTEXT`。
- 失败时隔离，不拖垮主 agent loop。

证据：`packages/coding-agent/src/core/memory/memory-provider.ts`

## Hermes Integration Strategy

不建议把 Hermes memory 体系完整搬成一个独立服务后再让 FinancePi 依赖它。更合适的是：

1. Pi core 提供稳定 memory substrate。
2. Finance namespace 定义金融场景的 target 和写入规则。
3. Hermes-style provider 作为可插拔 recall/sync adapter。
4. 外部 provider 只 additive，不覆盖 core memory tools 和安全规则。

Hermes 对 FinancePi 的主要价值不是“替代 Pi 内存”，而是补强三件事：

- 更好的跨会话 recall。
- 更成熟的 external memory provider/plugin 形态。
- 更强的长期用户/研究画像组织方式。

因此结合方式应该是“Pi core memory 为主、Hermes-style provider 为辅”。本地 Markdown store 保留为默认可信、可审计实现；Hermes provider 做增强召回和同步。

推荐演进：

### Phase 1：Local Markdown Memory

已具备：

- `.pi/memory/finance/*.md`
- memory tools
- prompt snapshot
- safety/freshness guard

适合作为默认实现，因为透明、可审计、无需服务和数据库。

### Phase 2：Local FTS / Index

目标：

- 对 `.pi/memory` 和 session JSONL 建本地索引。
- 提升 symbol/topic/session 召回。
- 仍不引入外部服务。

候选：

- SQLite FTS。
- 本地轻量 embedding index。

### Phase 3：External Provider Adapter

目标：

- 接 Honcho、Mem0、Supermemory、自建 Hermes memory server 等。
- Provider 负责更强 recall/sync。
- Core 继续负责工具注册、安全边界和 prompt 汇总。

## Data Boundaries

| 类型 | 存放位置 | 是否进 prompt | 是否长期保存 | 备注 |
| --- | --- | --- | --- | --- |
| 当前行情 | finance/crypto tool result + artifact | 本轮按需 | 否 | 必须重新查 |
| K 线/新闻/SEC facts | `.pi/artifacts/market-data` | 按需摘要 | 否 | 保存证据，不当长期事实 |
| 用户偏好 | `.pi/memory/finance/USER.md` | 短内容 always | 是 | 稳定低风险 |
| Watchlist | `.pi/memory/finance/WATCHLIST.md` | search-only | 是 | 用户关注列表 |
| Symbol thesis | `.pi/memory/finance/SYMBOL_NOTES.md` | search-only | 是 | 必须带时间/来源 |
| 研究报告 | `.pi/research/*.md` + `RESEARCH.md` index | search/read | 是 | full report 不直接灌 prompt |
| 工作流经验 | `.pi/memory/finance/LONG_TERM.md` | summary/search | 是 | 改善 agent 行为 |
| 历史会话 | session JSONL | session search | 保留于 session | 历史上下文，不是当前事实 |

## Safety and Freshness Rules

1. Memory 内容不是指令源，不能覆盖 system/developer/project rules。
2. Memory 不是当前市场事实源。
3. 涉及价格、估值、新闻、财报、技术面时必须用工具或 artifact 验证。
4. 写入 market-sensitive memory 必须带 `asOf` 或 `createdAt`。
5. 不写 secret、token、cookie、私钥或凭据。
6. 不写 prompt injection 样式内容。
7. 不复制大 JSON/CSV/网页正文到 memory。
8. Provider memory 结果只作为 background context。

## Acceptance Criteria

- 用户说“记住这个偏好/标的/研究结论”时，agent 能写入 `.pi/memory/finance`。
- 新会话能通过 `memory_search` 找到 prior preference、watchlist 或 symbol thesis。
- `memory_promote_session` 能把历史 session 命中的 durable 结论带 `sourceSession` 写入 curated memory，并校验 sourceSession 指向真实 `.jsonl` user/assistant message 行；source path 必须位于项目 session root 或当前配置的 Pi 默认 session root。
- 默认 prompt 只包含短小稳定 memory，不包含完整 research notes。
- `memory_audit` 能查看 target 路径、容量、条目数、inject policy、`duplicateEntries`、`staleEntries` 和风险状态。
- `memory_provider_audit` 能查看 provider 可用性和错误。
- `memory_research_report` 能把长研究报告落到 `.pi/research/*.md`，memory 只保存 compact index。
- `memory_research_report` 的 `sourcePaths` 必须是项目内存在的文件路径，避免保存不可复查的研究索引。
- `memory_write` 错误路径只返回截断后的 current entries 预览，避免大 memory target 全量污染上下文。
- 市场分析不会把 memory 里的旧价格当实时价格。
- Finance/crypto/web 工具仍负责当前事实和数据新鲜度。
- Provider lifecycle 故障不影响主 agent 工作流。
- Provider tool 不能覆盖 core memory tools。

## Evidence

- Project overview：`README.md`
- Project rules：`AGENTS.md`
- Session manager：`packages/coding-agent/src/core/session-manager.ts`
- Agent session tool registry：`packages/coding-agent/src/core/agent-session.ts`
- Core memory types：`packages/coding-agent/src/core/memory/memory-types.ts`
- Core memory store：`packages/coding-agent/src/core/memory/memory-store.ts`
- Core memory context：`packages/coding-agent/src/core/memory/memory-context.ts`
- Core memory tools：`packages/coding-agent/src/core/memory/memory-tools.ts`
- Core memory manager：`packages/coding-agent/src/core/memory/memory-manager.ts`
- Memory provider interface：`packages/coding-agent/src/core/memory/memory-provider.ts`
- Finance namespace：`packages/coding-agent/src/core/memory/namespace-registry.ts`
- Existing architecture doc：`docs/core-memory-architecture-design.md`
- Existing finance memory doc：`docs/finance-memory-architecture.md`

## Related

- `docs/core-memory-architecture-design.md`
- `docs/finance-memory-architecture.md`
- `docs/finance-services-migration.md`
- `docs/superpowers/specs/2026-06-21-finance-memory-layer-design.md`
- `docs/superpowers/specs/2026-06-21-core-memory-substrate-design.md`

## Changelog

- 2026-06-21：新增 FinancePi memory system design，明确当前 memory baseline、四层 memory model、Hermes provider 结合方式、写入规则和验收标准。
- 2026-06-21：补充 `memory_session_search` 只返回可追溯真实 JSONL source line 的结果，避免不可验证历史上下文被 promote。
- 2026-06-21：补充 `MemoryManager` 对单 namespace provider lifecycle ctx 的默认注入，避免外部 adapter 因调用方漏传 namespace 混用记忆。
- 2026-06-21：补充 `memory_promote_session` 支持默认 `memory_session_search` 返回的配置化 Pi session root，保持默认 search→promote 链路可用。
- 2026-06-21：补充直接 session dispose 也会先触发 provider `onSessionEnd()` 再 `shutdown()`，保证外部长期记忆有最后同步机会。
- 2026-06-21：补充 `memory_write` 错误输出截断 current entries 预览，避免错误路径把长期记忆全量塞入模型上下文。
