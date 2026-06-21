# Finance Memory Layer Design

## 目标

为 FinancePi 增加分层长期记忆能力，让 agent 能跨会话记住用户偏好、关注资产、研究结论和长期投研知识，同时避免把行情快照、新闻噪声或大 JSON 长期污染上下文。

设计参考 Hermes Agent 的 memory 思路：

- 短小 curated memory 常驻或半常驻。
- 大量历史内容按需搜索/读取，不直接塞进 prompt。
- 写入需要显式工具、容量约束和安全过滤。
- 记忆更新落盘，但当前 session 不强制刷新 system prompt，避免破坏缓存和上下文稳定性。

FinancePi 不直接照搬 Hermes 的外部 provider 体系，第一版先做本地文件型 memory，后续再扩展到向量检索或外部 memory provider。

## 设计原则

1. **分层记忆，不混存**
   - session memory、用户 memory、研究 memory、long-term memory 分开存储、分开召回。
   - 行情 artifact 和 memory 分开，市场数据仍走 `.pi/artifacts/market-data`。

2. **按需召回，不全量灌入**
   - system prompt 只注入短小、稳定、低风险的 memory summary。
   - 研究笔记、symbol thesis、历史判断通过工具搜索/读取。

3. **事实带时间，观点带来源**
   - 任何和市场判断有关的 memory 必须包含 `asOf` 或 `createdAt`。
   - 涉及价格、估值、新闻、财报的数据不作为永久事实写入，只能作为带时间戳的研究记录。

4. **写入可控**
   - LLM 可以主动写 memory，但必须通过工具。
   - 工具需要容量限制、重复检测、substring replace/remove、批量原子更新。
   - 后续可加 approval gate；第一版默认直接写本地文件。

5. **避免记忆污染**
   - 不记 API key、token、个人凭据。
   - 不记一时行情、未验证传言、完整工具结果、大段网页或 CSV。
   - 对 prompt injection、隐藏 Unicode、密钥形态做基础扫描。

## 四层记忆模型

### 1. Session Memory

**定位**

当前会话内的短期工作状态，不追求长期稳定。它用于让 agent 在一轮或多轮工具调用中知道自己刚做了什么、还缺什么。

**现状**

Pi 已经有 session / continue / resume 能力，并且 FinancePi 已有 market research continuation 逻辑：

- 市场工具返回后插入 continuation 消息。
- 提醒模型检查 artifact、degraded source、缺口和下一步。

**第一版策略**

不新增独立存储。复用现有 session manager 与 continuation。

可补充的 session-level memory summary：

- 当前任务目标。
- 本轮已调用的数据源。
- 已获得 artifact path。
- 已知缺口。
- 下一步候选动作。

这部分不写入 `.pi/memory/finance`，除非模型判断有可复用价值。

**不保存**

- 当前工具调用临时输出。
- 一次性 debug 状态。
- 尚未验证的模型推断。

### 2. 用户 Memory

**定位**

长期保存用户的金融偏好和交互偏好。它回答：“这个用户通常怎么做投资研究、偏好什么市场、讨厌什么输出方式？”

**存储**

```text
.pi/memory/finance/USER.md
```

**典型内容**

- 用户关注市场：美股、ETF、crypto。
- 用户关注资产：BTC、NVDA、TSLA 等。
- 用户风险偏好：不重仓、不杠杆、偏分批建仓。
- 用户分析偏好：喜欢先给结论还是先列证据。
- 数据偏好：免费源优先、Binance crypto 优先、不使用 Bloomberg 等付费源。
- 输出偏好：不要固定模板、不要大 JSON、给 artifact path 即可。

**示例 entry**

```text
用户偏好免费公开数据源；US equity 使用 Yahoo chart/news + SEC，crypto 使用 Binance public data，不默认使用 Bloomberg 等付费 MCP。
§
用户不喜欢固定金融分析模板，偏好 agent 自主判断是否查数据、读 artifact、web search，再自然输出。
§
用户关注 FinancePi 的 CLI-first 体验，要求工具结果 compact，完整数据落盘为 CSV/TXT artifact。
```

**召回方式**

- USER.md 的短小条目可以在 FinancePi 启动时注入 system prompt。
- 超过阈值时只注入摘要，完整内容通过 `finance_memory_read` 读取。

### 3. 研究 Memory

**定位**

保存可复用的研究状态，而不是实时行情。它回答：“我们之前为什么关注这个标的？有哪些 thesis、风险、待验证问题？”

**存储**

```text
.pi/memory/finance/RESEARCH.md
.pi/memory/finance/SYMBOL_NOTES.md
.pi/memory/finance/WATCHLIST.md
```

**内容类型**

`WATCHLIST.md`

- 标的。
- 市场类别：US equity / ETF / crypto。
- 关注原因。
- 用户给出的优先级。
- 最近一次研究时间。

`SYMBOL_NOTES.md`

- 单一标的长期 thesis。
- 核心驱动。
- 长期风险。
- 需要持续跟踪的指标。
- 关联 artifact 或 research note path。

`RESEARCH.md`

- 跨标的或主题研究记录。
- 研究问题。
- 使用过的数据源。
- 主要结论。
- 未解决问题。
- `asOf` / `createdAt` / `sourcePaths`。

**示例 entry**

```text
symbol=NVDA | type=US equity | asOf=2026-06-21 | 用户关注 AI infrastructure 长期逻辑；研究时应重点检查 data center revenue、gross margin、Blackwell 出货、云厂商 capex、出口管制和估值敏感性。
§
symbol=BTCUSDT | type=crypto | asOf=2026-06-21 | 用户希望 crypto 使用 Binance public data，分析时优先检查 spot price、recent candles、volume、funding/open interest 如可得，并明确数据 freshness。
```

**召回方式**

- 默认不全量注入。
- 模型遇到标的或主题时，优先调用 `finance_memory_search(query="NVDA")` 或 `finance_memory_search(query="BTC")`。
- 搜到后再用 `finance_memory_read(target=..., offset, limit)` 读取必要片段。

**写入规则**

可以写：

- 用户明确要求“记住这个标的/观点”。
- 一个研究任务结束后，有稳定、可复用的 thesis/risk/checklist。
- 用户纠正了某个研究偏好或 symbol 关注原因。

不能写：

- “NVDA 当前价格 210.69”这类快照作为永久事实。
- 新闻标题列表。
- 完整 CSV 内容。
- 没有来源和时间的强结论。

### 4. Long-term Memory

**定位**

更长期、更抽象的投资研究知识、工作流和 agent 自我改进记录。它回答：“FinancePi 以后应该如何更好地做研究？”

**存储**

```text
.pi/memory/finance/LONG_TERM.md
```

**典型内容**

- 稳定的研究流程经验。
- 数据源 fallback 策略。
- 用户长期反复强调的质量标准。
- 某类任务的分析 checklist。
- 工具缺陷和 workaround。

**示例 entry**

```text
FinancePi 研究流程：不要在第一个市场工具返回后立即输出；先检查 degradedReasons、artifact path、asOf/latestAt，必要时读取 CSV 或补 web_search，再输出事实与推断。
§
Crypto 分析默认不和 US equity 混用数据路径；Binance public data 独立作为 crypto source，结果仍落盘到 market-data artifact，但 memory 只保留研究偏好和长期观察点。
```

**召回方式**

- 少量核心 LONG_TERM 条目可以注入 system prompt。
- 其余通过 search/read 召回。

**未来扩展**

Long-term memory 是后续接向量库或外部 memory provider 的最佳入口，而不是一开始就引入数据库。

## 文件结构

第一版使用纯本地文件，不引入 FastAPI、MongoDB、Redis 或常驻服务。

```text
.pi/
  memory/
    finance/
      USER.md
      MEMORY.md
      WATCHLIST.md
      SYMBOL_NOTES.md
      RESEARCH.md
      LONG_TERM.md
      index.json
```

`index.json` 不是权威数据，只是可选索引：

```json
{
  "version": 1,
  "updatedAt": "2026-06-21T00:00:00.000Z",
  "files": {
    "USER.md": { "entries": 3, "chars": 420 },
    "WATCHLIST.md": { "entries": 2, "chars": 360 }
  }
}
```

权威内容始终是 Markdown 文件，方便用户直接查看和编辑。

## 工具设计

### `finance_memory`

用于写入、替换、删除记忆。

参数：

```ts
{
  target: "user" | "memory" | "watchlist" | "symbol_notes" | "research" | "long_term";
  action?: "add" | "replace" | "remove";
  content?: string;
  oldText?: string;
  operations?: Array<{
    action: "add" | "replace" | "remove";
    content?: string;
    oldText?: string;
  }>;
}
```

规则：

- 推荐 batch `operations`，一次完成删除、合并、新增。
- `replace/remove` 使用唯一 substring 匹配，不引入复杂 ID。
- 成功后只返回 usage、entry_count、message，不回显全文。
- 失败时返回 current_entries，帮助模型合并。

### `finance_memory_list`

列出 memory 文件和容量。

参数：

```ts
{
  target?: "all" | "user" | "memory" | "watchlist" | "symbol_notes" | "research" | "long_term";
}
```

输出：

```text
finance_memory listed: count=6
user | .pi/memory/finance/USER.md | entries=3 | chars=420/1800
research | .pi/memory/finance/RESEARCH.md | entries=8 | chars=1700/6000
```

### `finance_memory_read`

读取指定 memory 文件片段。

参数：

```ts
{
  target: "user" | "memory" | "watchlist" | "symbol_notes" | "research" | "long_term";
  offset?: number;
  limit?: number;
}
```

### `finance_memory_search`

搜索 finance memory。

参数：

```ts
{
  query: string;
  target?: "all" | "user" | "memory" | "watchlist" | "symbol_notes" | "research" | "long_term";
  literal?: boolean;
  ignoreCase?: boolean;
  limit?: number;
  context?: number;
}
```

输出格式复用 `finance_search_resources` 风格，返回命中 path、line、context。

## System Prompt 注入

FinancePi 启动时追加一个短 memory block，而不是全量内容。

建议策略：

- `USER.md`：默认注入，限制 1800 chars。
- `MEMORY.md`：默认注入，限制 2200 chars。
- `LONG_TERM.md`：只注入前 N 条或压缩 summary，限制 1500 chars。
- `WATCHLIST.md`、`SYMBOL_NOTES.md`、`RESEARCH.md`：默认不注入，只提示可通过工具搜索。

示例：

```text
FINANCE MEMORY:
- Stable user preferences and long-term finance notes may exist in .pi/memory/finance.
- Use finance_memory_search before asking the user to repeat known watchlist, symbol thesis, or prior research context.
- Do not treat memory as fresh market data. Any market-sensitive memory must be checked against current tools before use.
```

如果注入实际条目，必须带容量标识：

```text
FINANCE USER MEMORY [420/1800 chars]
...
```

## Agent 行为规则

1. 用户问某个标的时：
   - 如果问题涉及历史偏好、关注原因、之前观点，先 `finance_memory_search(symbol)`。
   - 如果问题涉及当前价格/新闻/技术面，仍需调用 market data 工具。

2. 用户明确说“记住”：
   - 调用 `finance_memory` 写入合适 target。
   - 如果是偏好，写 `user`。
   - 如果是标的关注，写 `watchlist` 或 `symbol_notes`。
   - 如果是研究流程经验，写 `long_term`。

3. 研究任务结束后：
   - 只有当结论可复用时，才写 `research` 或 `symbol_notes`。
   - 必须压缩成短条目，包含 `asOf` 和关键 source path。

4. 输出时：
   - 如果使用了 memory，要说明“基于此前记忆/偏好”，但不能把 memory 当实时事实。
   - 对市场结论仍要引用工具 source/asOf/latestAt。

## 安全和质量控制

### 基础扫描

写入前拦截：

- `sk-...`、常见 API key/token 形态。
- `OPENAI_API_KEY=`、`Authorization: Bearer` 等凭据片段。
- prompt injection 语句：ignore previous instructions、system override、do not tell user 等。
- 隐形 Unicode：zero width、directional isolate。

### 容量限制

建议第一版：

| target | limit |
|---|---:|
| user | 1800 chars |
| memory | 2200 chars |
| watchlist | 4000 chars |
| symbol_notes | 6000 chars |
| research | 8000 chars |
| long_term | 3000 chars |

超过限制时不自动截断，返回错误和 current_entries，让模型合并后重试。

### 原子写入

- 写临时文件，再 rename。
- 写入前读取最新文件，避免覆盖并发修改。
- 保留 `.bak.<timestamp>` 可选备份，用于异常恢复。

## 与现有 FinancePi 的关系

### 和 artifacts 的边界

`.pi/artifacts/market-data`：

- 保存行情、K 线、新闻、SEC facts、比较数据、web page text。
- 是证据层。

`.pi/memory/finance`：

- 保存偏好、研究笔记、长期 thesis、流程经验。
- 是召回层。

Memory 可以引用 artifact path，但不复制 artifact 内容。

### 和 finance resource tools 的关系

现有：

- `finance_list_resources`
- `finance_read_resource`
- `finance_search_resources`

新增：

- `finance_memory_list`
- `finance_memory_read`
- `finance_memory_search`
- `finance_memory`

两套工具保持分离：

- resource tools 面向数据证据和项目文档。
- memory tools 面向用户/研究/长期状态。

## 实现计划草案

1. 新增 memory store helper
   - 路径：`packages/coding-agent/src/core/finance-memory-store.ts`
   - 负责 target 映射、读写、delimiter、容量限制、安全扫描、原子写入。

2. 在 finance extension 注册 memory tools
   - 路径：`packages/coding-agent/src/core/finance-agent-extension.ts`
   - 新增四个工具定义。

3. system prompt 接入
   - 启动时读取短 memory block。
   - 加入 memory 使用规则。

4. 测试
   - 新增 `packages/coding-agent/test/finance/finance-memory.test.ts`
   - 覆盖 add/replace/remove/batch、容量溢出、安全扫描、list/read/search、路径隔离、prompt 注入。

5. 文档
   - 更新 `docs/finance-services-migration.md` 或新增 `docs/finance-memory.md`。

## MVP 不做

- 不做向量库。
- 不做外部 Honcho/Mem0/Supermemory provider。
- 不做自动总结全部 session。
- 不做 web UI memory 管理。
- 不做跨项目全局 memory。
- 不把行情 artifact 自动转成 long-term memory。

## 后续扩展

1. **Session search**
   - 借鉴 Hermes 的 SQLite FTS5 session search。
   - 用于“我们上周聊过 NVDA 吗？”这类问题。

2. **Research note artifacts**
   - 对完成的深度研究生成 `.pi/research/*.md`。
   - memory 只保存摘要和 path。

3. **External provider adapter**
   - 定义 `FinanceMemoryProvider` 接口：
     - `prefetch(query)`
     - `syncTurn(user, assistant)`
     - `search(query)`
     - `write(entry)`
   - 后续可接 Honcho/Mem0/Supermemory，但第一版本地文件优先。

4. **Approval gate**
   - 用户可配置 memory 写入是否需要确认。
   - CLI 中可以显示 pending memory writes。

## 验收标准

- agent 能把用户明确要求记住的金融偏好写入本地 memory。
- agent 能在后续会话按标的或关键词搜索 prior research。
- 当前市场分析不会因为 memory 里的旧价格而误报实时行情。
- memory 工具输出 compact，不回显大段全文。
- 所有 memory 文件都在项目 `.pi/memory/finance` 下，不读取或写入项目外路径。
- 单元测试覆盖核心读写、搜索、安全和容量行为。
