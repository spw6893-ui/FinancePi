# Core Memory Substrate Design

## 目标

在 Pi core 中实现一套 Hermes-style memory substrate，让 Pi 不只依赖 session JSONL 续聊，而是具备可扩展、可命名空间化、可按需召回的长期记忆能力。

FinancePi 是第一个使用方，但 memory 不能写死为 finance-only。Core 提供通用能力，Finance 注册自己的 namespace 和 targets。

最终目标：

- 保留 Pi 现有 session / continue / resume / compaction 能力。
- 新增 curated user memory、domain research memory、long-term procedural memory。
- 支持本地文件 store 作为第一实现。
- 预留 provider 接口，后续可接 Honcho、Mem0、Supermemory、SQLite FTS 或本地向量库。
- 避免上下文污染：默认只注入短 snapshot，长内容通过工具搜索/读取。

## 当前 Pi 的内存现状

当前 Pi 已有的是 session memory，不是长期 curated memory。

### Session JSONL

核心文件：

```text
packages/coding-agent/src/core/session-manager.ts
```

会话存储为 append-only JSONL，包含：

- `SessionHeader`
- `SessionMessageEntry`
- `ThinkingLevelChangeEntry`
- `ModelChangeEntry`
- `CompactionEntry`
- `BranchSummaryEntry`
- `CustomEntry`
- `CustomMessageEntry`
- `LabelEntry`
- `SessionInfoEntry`

默认 session 目录：

```text
~/.pi/agent/sessions/<encoded-cwd>/*.jsonl
```

这支持：

- `continue`
- `resume`
- branch
- compaction
- session title
- 历史消息恢复

### Extension custom entries

Pi 已有扩展状态入口：

- `CustomEntry`：写入 session 文件，不进入 LLM context。
- `CustomMessageEntry`：写入 session 文件，会进入 LLM context。

这适合保存 extension runtime state，但不适合作为跨项目、跨 session 的长期记忆主存储。

### Compaction summary

`CompactionEntry` 和 `BranchSummaryEntry` 是上下文压缩/分支摘要，不是 user profile 或长期研究记忆。

### Finance artifacts

FinancePi 当前已有：

```text
.pi/artifacts/market-data/*.csv
.pi/artifacts/web/*.txt
```

这是证据层，不是记忆层。它保存行情、K 线、新闻、SEC facts、web text 等可复查数据。

### Finance continuation loop

`AgentSession` 里已有 market research continuation：

- 市场工具返回后插入 synthetic user message。
- 提醒模型检查 artifact、degraded source、缺口和下一步。

这是 runtime/session-level 工作记忆，不是长期 memory。

## 设计原则

1. **core 通用，namespace 领域化**
   - Core 不知道 finance 的具体语义。
   - Finance 通过 namespace 注册 targets、容量和 prompt guidance。

2. **四层模型**
   - Runtime / Session Memory
   - User Profile Memory
   - Domain / Research Memory
   - Long-term / Procedural Memory

3. **短 snapshot + 按需召回**
   - 只有短小、稳定、高价值 memory 进入 system prompt。
   - 研究记录和长笔记通过 `memory_search` / `memory_read` 按需召回。

4. **写入显式可控**
   - LLM 必须通过工具写 memory。
   - 支持 add / replace / remove / batch。
   - 成功不回显全文，失败才返回 current entries。

5. **记忆不是事实源**
   - Memory 可以保存偏好、历史观点和研究线索。
   - 市场事实仍必须通过数据工具、artifact、文件或用户提供数据验证。

6. **本地优先，provider 后置**
   - 第一版使用文件 store。
   - Provider 接口先设计好，但不强制接外部服务。

## 四层 memory model

### 1. Runtime / Session Memory

**定位**

当前 run / 当前 session 内的临时工作记忆。

**已有基础**

- session messages
- tool results
- compaction summary
- extension `CustomEntry`
- finance market continuation

**Core 设计**

第一版不新增持久文件。MemoryManager 只需要识别它是已有 session system 的一部分。

后续可以增加 runtime summary hook：

```ts
interface RuntimeMemorySummary {
  taskGoal?: string;
  toolResultSummaries: string[];
  artifactPaths: string[];
  gaps: string[];
  nextSteps: string[];
}
```

这类内容默认不写入 long-term memory。

### 2. User Profile Memory

**定位**

保存关于用户的稳定信息和偏好。

**全局路径**

```text
~/.pi/memory/user/PROFILE.md
```

**项目/领域路径**

```text
.pi/memory/<namespace>/USER.md
```

Finance namespace 示例：

```text
.pi/memory/finance/USER.md
```

**内容**

- 交流风格。
- 输出偏好。
- 工具/数据源偏好。
- 投研风险偏好。
- 用户明确要求记住的稳定信息。

**注入策略**

- 全局 user profile 可以短注入。
- namespace user profile 可以在相关 namespace 激活时短注入。
- 超出容量时只注入 summary，完整内容靠工具读取。

### 3. Domain / Research Memory

**定位**

领域内可复用的研究状态。

Finance namespace 示例：

```text
.pi/memory/finance/WATCHLIST.md
.pi/memory/finance/SYMBOL_NOTES.md
.pi/memory/finance/RESEARCH.md
```

Coding namespace 未来可以是：

```text
.pi/memory/coding/PROJECT_NOTES.md
.pi/memory/coding/CONVENTIONS.md
.pi/memory/coding/BUG_HISTORY.md
```

**特点**

- 默认不注入 system prompt。
- 用 search/read 召回。
- 可以引用 artifact path，但不复制 artifact 内容。
- 对时间敏感内容必须带 `asOf` 或 `createdAt`。

### 4. Long-term / Procedural Memory

**定位**

长期流程经验、可复用 checklist、agent 行为改进。

路径：

```text
~/.pi/memory/LONG_TERM.md
.pi/memory/<namespace>/LONG_TERM.md
```

Finance 示例：

```text
FinancePi 不要在第一个 quote 工具返回后直接输出；先检查 artifact/sourceHealth/degradedReasons，再决定是否补充数据源或 web_search。
```

**注入策略**

- 只注入短小核心条目。
- 超出限制后通过 search/read。

## Core 文件结构

新增：

```text
packages/coding-agent/src/core/memory/
  memory-types.ts
  memory-store.ts
  memory-manager.ts
  memory-tools.ts
  memory-context.ts
  memory-security.ts
  memory-provider.ts
  namespace-registry.ts
```

### `memory-types.ts`

核心类型：

```ts
export type MemoryLayer = "session" | "user" | "domain" | "long_term";

export interface MemoryNamespaceConfig {
  namespace: string;
  root: string;
  description: string;
  targets: MemoryTargetConfig[];
  promptGuidelines?: string[];
}

export interface MemoryTargetConfig {
  target: string;
  layer: MemoryLayer;
  file: string;
  charLimit: number;
  injectPolicy: "always" | "summary" | "search_only" | "never";
  description: string;
}

export interface MemoryEntryOperation {
  action: "add" | "replace" | "remove";
  content?: string;
  oldText?: string;
}
```

### `memory-store.ts`

本地文件 store。

职责：

- target 到文件路径映射。
- `§` entry delimiter。
- add / replace / remove / batch。
- 容量限制。
- exact duplicate skip。
- substring matching。
- 原子写入。
- list / read / search。

设计约束：

- 权威内容是 Markdown 文件，用户可直接查看。
- `index.json` 可以作为派生索引，但不能作为权威数据。
- 成功写入不回显所有 entries。
- 超限失败返回 current entries。

### `memory-security.ts`

基础扫描：

- API key/token 形态。
- `Authorization: Bearer`。
- `OPENAI_API_KEY=` 等 env secret。
- prompt injection 片段。
- hidden unicode。
- 大段 raw data。

第一版做 lightweight pattern，不引入复杂安全引擎。

### `memory-context.ts`

生成 system prompt block。

输入：

- namespace configs。
- local store snapshots。
- char budgets。

输出：

```text
MEMORY CONTEXT:
Global user memory ...
Namespace finance memory ...
Available memory tools ...
```

关键规则：

- snapshot 在 agent start 时固定。
- session 中途 memory write 只落盘，不刷新当前 system prompt。
- 工具返回 live state，下一 session 才进入 prompt snapshot。

### `memory-manager.ts`

生命周期协调器。

第一版能力：

```ts
class MemoryManager {
  registerNamespace(config: MemoryNamespaceConfig): void;
  buildSystemPromptBlock(): Promise<string>;
  list(...): Promise<MemoryListResult>;
  read(...): Promise<MemoryReadResult>;
  search(...): Promise<MemorySearchResult>;
  write(...): Promise<MemoryWriteResult>;
}
```

预留 Hermes-style provider lifecycle：

```ts
prefetch(query: string): Promise<string>;
syncTurn(user: string, assistant: string): Promise<void>;
onSessionEnd(messages: AgentMessage[]): Promise<void>;
shutdown(): Promise<void>;
```

第一版可以不启用自动 prefetch/sync，避免误写 memory。

### `memory-provider.ts`

外部 provider 抽象。

```ts
export interface MemoryProvider {
  name: string;
  isAvailable(): boolean | Promise<boolean>;
  initialize(ctx: MemoryProviderInitContext): Promise<void>;
  systemPromptBlock?(): Promise<string>;
  prefetch?(query: string, ctx: MemoryRecallContext): Promise<string>;
  syncTurn?(turn: MemoryTurn, ctx: MemorySyncContext): Promise<void>;
  onSessionEnd?(messages: AgentMessage[], ctx: MemorySessionContext): Promise<void>;
  getToolDefinitions?(): MemoryProviderTool[];
  handleToolCall?(toolName: string, args: unknown): Promise<unknown>;
  shutdown?(): Promise<void>;
}
```

规则：

- 同一 namespace 第一版只允许一个 external provider。
- 本地 file store 始终可用。
- Provider 只能 additive，不能覆盖 core memory rules。

### `memory-tools.ts`

注册 core generic tools：

```text
memory_list
memory_read
memory_search
memory_write
```

#### `memory_list`

```ts
{
  namespace?: string;
  layer?: "user" | "domain" | "long_term";
  target?: string;
}
```

#### `memory_read`

```ts
{
  namespace: string;
  target: string;
  offset?: number;
  limit?: number;
}
```

#### `memory_search`

```ts
{
  query: string;
  namespace?: string;
  target?: string;
  layer?: "user" | "domain" | "long_term";
  literal?: boolean;
  ignoreCase?: boolean;
  limit?: number;
  context?: number;
}
```

#### `memory_write`

```ts
{
  namespace: string;
  target: string;
  action?: "add" | "replace" | "remove";
  content?: string;
  oldText?: string;
  operations?: MemoryEntryOperation[];
}
```

Tool result 规则：

- list/search/read 输出 compact text。
- write success 输出 `usage`、`entryCount`、`message`。
- write error 输出可修复原因，必要时给 current entries。

## Namespace registry

Core 内置一个 registry。

```ts
registerMemoryNamespace({
  namespace: "finance",
  root: ".pi/memory/finance",
  description: "Finance research memory",
  targets: [...]
});
```

Finance namespace：

```ts
{
  namespace: "finance",
  root: ".pi/memory/finance",
  targets: [
    { target: "user", layer: "user", file: "USER.md", charLimit: 1800, injectPolicy: "always" },
    { target: "memory", layer: "long_term", file: "MEMORY.md", charLimit: 2200, injectPolicy: "summary" },
    { target: "watchlist", layer: "domain", file: "WATCHLIST.md", charLimit: 4000, injectPolicy: "search_only" },
    { target: "symbol_notes", layer: "domain", file: "SYMBOL_NOTES.md", charLimit: 6000, injectPolicy: "search_only" },
    { target: "research", layer: "domain", file: "RESEARCH.md", charLimit: 8000, injectPolicy: "search_only" },
    { target: "long_term", layer: "long_term", file: "LONG_TERM.md", charLimit: 3000, injectPolicy: "summary" }
  ]
}
```

未来可新增：

```text
namespace=coding
namespace=personal
namespace=research
```

## System prompt 集成

Pi 当前已有：

```text
packages/coding-agent/src/core/system-prompt.ts
```

和 extension hook：

```ts
pi.on("before_agent_start", ...)
```

实施路线：

1. Core `buildSystemPrompt` 增加可选 memory block 拼接点。
2. Finance extension 注册 namespace，并在 `before_agent_start` 确保 finance memory block 可用。
3. 第一阶段允许 extension 调 `MemoryManager.buildSystemPromptBlock(["finance"])` append，避免一次性改动过多启动路径。
4. 第二阶段将 memory block 提升到 core 统一拼接点。

最终拼接顺序：

```text
base system prompt
+ project context
+ memory context
+ extension prompts
```

Memory context 要明确：

```text
- Memory is persistent background context, not fresh data.
- Use memory_search before asking the user to repeat known preferences or prior research.
- Verify market-sensitive memory against current tools before making market claims.
```

## 和现有 session-manager 的关系

Memory substrate 不替代 session-manager。

职责划分：

| 能力 | 现有 session-manager | 新 memory substrate |
|---|---|---|
| 当前对话恢复 | 是 | 否 |
| continue/resume | 是 | 否 |
| branch | 是 | 否 |
| compaction summary | 是 | 可读取但不替代 |
| extension runtime state | 是，CustomEntry | 可辅助 |
| 用户长期偏好 | 否 | 是 |
| domain research notes | 否 | 是 |
| long-term procedural memory | 否 | 是 |
| provider recall | 否 | 预留 |

## 和 artifacts 的关系

Artifacts 是证据，memory 是索引/偏好/研究状态。

规则：

- Memory 可以引用 artifact path。
- Memory 不复制完整 artifact 内容。
- 市场数值必须从 artifact/tool/source 验证。
- 旧 memory 里的市场判断需要用当前数据刷新。

## 和 FinancePi 的结合

Finance extension 做三件事：

1. 注册 finance namespace。
2. 在 finance prompt 中说明 memory 使用策略。
3. 在 market continuation 中补一句：

```text
If the user stated a reusable preference, watchlist item, or durable thesis, consider memory_write(namespace="finance"). Do not save current prices, raw news lists, or unsourced claims.
```

用户问标的时推荐流程：

```text
user asks about NVDA
→ memory_search(namespace="finance", query="NVDA")
→ finance_symbol_context("NVDA") / web_search if current facts needed
→ optionally memory_read for relevant prior thesis
→ answer with old preference/research separated from fresh sourced facts
```

## 安全边界

1. 不读取项目外 memory path。
2. 不写密钥、token、`.env`、Authorization header。
3. 不接受包含明显 prompt injection 的 memory entry。
4. 不自动把 tool result 写入 memory。
5. 不默认把所有 assistant response 自动 sync 成 memory。
6. Provider 输出必须当作 data/context，不当作 instruction。

## 实现阶段

### Phase 1：Core file memory MVP

- `memory-types.ts`
- `memory-store.ts`
- `memory-security.ts`
- `memory-tools.ts`
- 单元测试覆盖 list/read/search/write。

### Phase 2：MemoryManager + namespace registry

- `memory-manager.ts`
- `namespace-registry.ts`
- finance namespace 注册。
- system prompt memory block。

### Phase 3：Finance integration

- Finance prompt memory guidance。
- market continuation memory hint。
- 测试 finance namespace 和工具行为。

### Phase 4：Provider hooks

- `memory-provider.ts`
- provider lifecycle 空实现。
- 支持 single external provider per namespace。

### Phase 5：Session search

- 借鉴 Hermes SQLite FTS5。
- 不把所有历史注入 prompt。
- 提供 `session_search` 或统一到 `memory_search(scope="sessions")`。

## 测试计划

新增测试：

```text
packages/coding-agent/test/memory/memory-store.test.ts
packages/coding-agent/test/memory/memory-tools.test.ts
packages/coding-agent/test/memory/memory-context.test.ts
packages/coding-agent/test/finance/finance-memory-namespace.test.ts
```

覆盖：

- namespace path resolution。
- outside project/root 拒绝。
- add / replace / remove / batch。
- duplicate skip。
- char limit overflow。
- safety scan。
- list/read/search compact output。
- system prompt snapshot 不因 mid-session write 改变。
- finance namespace targets。

## 非目标

第一版不做：

- 外部 memory cloud。
- 自动 summary 全部 session。
- embedding/vector search。
- memory UI。
- approval queue。
- 跨设备同步。
- 将行情 artifact 自动变 memory。

## 验收标准

- Core 能注册至少一个 namespace。
- LLM 可通过 generic memory tools 操作 namespace memory。
- Finance namespace 可保存用户偏好、watchlist、symbol notes、research notes、long-term rules。
- 默认 prompt 不被研究笔记全文污染。
- 旧市场 memory 不会被当作实时行情。
- 所有 memory 文件路径可解释、可手工查看、可 gitignore。
- 测试覆盖核心读写、搜索、安全、容量和 prompt snapshot。
