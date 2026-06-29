# FinancePi 使用文档

FinancePi 是面向公开市场研究的 Pi 发行版。本项目仍保留 Pi 的终端交互、模型切换、session、skill、prompt template 和 extension 能力，但默认目标是金融研究，而不是通用 coding。

本文档面向日常使用，不覆盖内部架构设计。

## 快速启动

在仓库根目录开发运行：

```bash
npm install --ignore-scripts
./pi-test.sh
```

非交互式单次提问：

```bash
./pi-test.sh -p "研究一下 NVDA 最近的基本面变化"
```

继续最近一次会话：

```bash
./pi-test.sh -c
```

选择历史会话：

```bash
./pi-test.sh -r
```

已安装为全局 `pi` 后，可以把上面的 `./pi-test.sh` 换成 `pi`。

## 模型和 API Key

FinancePi 支持 Pi 原有的 provider 体系。常用方式有三种。

### 1. 交互登录

```text
/login
```

适合 OpenAI Codex、Claude、GitHub Copilot 等订阅/OAuth 场景。凭据会保存在 `~/.pi/agent/auth.json`。

### 2. 环境变量

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://example.com/v1
./pi-test.sh --provider openai --model gpt-5.5
```

OpenAI-compatible proxy 可使用 `OPENAI_BASE_URL`。如果 base URL 没有 `/v1`，Pi 会按 OpenAI 兼容接口自动归一化。

### 3. 项目 `.env`

FinancePi 启动时会读取项目 `.env`，只填充当前 shell 中缺失的环境变量。适合把金融数据源 key、OpenAI-compatible endpoint 等放在项目里。

不要把真实 key 写进文档、session、memory、research report 或 git 提交。

## 常用交互命令

在 TUI 里输入 `/` 可以打开命令补全。

| 命令 | 用途 |
|---|---|
| `/model` | 切换模型 |
| `/login` / `/logout` | 登录或退出 provider |
| `/settings` | 调整 thinking、主题、消息投递方式 |
| `/session` | 查看当前 session 文件、ID、token、费用 |
| `/resume` | 选择历史 session |
| `/tree` | 在当前 session 树中跳转和分支 |
| `/compact` | 压缩上下文 |
| `/reload` | 重新加载 skills、prompts、extensions、context files |
| `/copy` | 复制上一条 assistant 回复 |
| `/export <file>` | 导出 HTML |
| `/quit` | 退出 |

## FinancePi 工作流命令

FinancePi 内置了金融研究专用 workflow。

### `/plan`

进入金融计划模式。适合复杂研究前先定研究路径。

```text
/plan
我想系统研究 CRWV，先给我一个研究计划
```

Plan mode 会阻止写文件、写 memory、改 goal 等持久化行为。确认计划后：

```text
/plan execute
```

### `/invest`

进入投资建模/决策协作模式。适合“我想买/卖/建模/配置仓位”类问题。

```text
/invest SOXL
```

它会更主动地和你一起定义：

- 投资目标
- 时间周期
- 仓位和最大可接受损失
- 关键数据
- bull/base/bear 情景
- thesis breaker
- 加仓、减仓、退出规则

兼容别名：

```text
/superpower
/grill
/grill-me
```

### `/goal`

创建跨 turn 的金融目标。

```text
/goal 研究 AI 电力链中最值得跟踪的公司
```

常用子命令：

```text
/goal status
/goal pause
/goal resume
/goal complete
/goal clear
```

## 金融数据能力

FinancePi 会优先使用本地免费/公开数据工具，再根据需要使用用户配置的数据源。

默认可用方向：

- 美股/ETF：价格、历史 K 线、新闻、SEC company facts、比较、market brief
- 期权定位：基于公开 options chain 的 put-call ratio、call wall、put wall、max pain、估算 gamma exposure
- Crypto：Binance spot/futures、funding、open interest 等
- SEC EDGAR：公开财报和 company facts
- Yahoo chart/news：公开市场上下文
- FRED / Finnhub / Alpha Vantage 等：如果项目环境变量已配置，可作为补充源
- 用户配置 MCP：通过 `.pi/finance-mcp.json` 接入外部或自托管金融数据工具

使用金融数据时必须注意：

- `asOf` / `latestAt` / `filed` 是数据新鲜度，不等于实时行情。
- 免费价格通常是 latest-available chart bar，不保证实时 NBBO。
- 免费期权链不是专业实时订单流；open interest 通常滞后，customer/dealer 方向未知，gamma exposure 只是公开链估算，不等于 dealer book。
- 财务数字要看 fiscal period、GAAP/Non-GAAP、币种、合并口径和 filed date。
- 一个工具返回不代表研究完成；重要结论要检查缺口、artifact 和来源健康状态。

## Skills

项目级 skills 放在 `.pi/skills/`。启动时会显示已加载 skills，也可以用 `/skill:name` 强制加载。

### `/skill:finance-superpowers`

投资建模和研究方法 skill。适合：

- “我想投资 SOXL，要从哪些角度分析？”
- “帮我构建 CRWV 的投资模型”
- “这个 thesis 最大问题在哪里？”
- “应该跟踪哪些数据？”

它不会强制输出固定模板，而是把这些作为思考工具：

- 信息丰富度 A/B/C
- AI 分析置信度 vs 投资确定性
- 段永平、巴菲特、芒格、李录四个视角
- 镜子测试
- 快速否决清单
- 反向 DCF / 三情景估值

### `/skill:pdf-research`

PDF 研究 skill。适合：

- 10-K / 10-Q PDF
- investor deck
- 招股书
- 研报
- 表格很多的 PDF

用法：

```text
/skill:pdf-research 分析这个 PDF：<path-or-url>
```

该 skill 会用内置 extractor 生成：

```text
.pi/artifacts/pdf/<slug>/summary.json
.pi/artifacts/pdf/<slug>/text.md
.pi/artifacts/pdf/<slug>/pages/page-001.txt
.pi/artifacts/pdf/<slug>/tables/table-001.csv
```

结论应引用页码，而不是把整份 PDF 原文塞进回复。

### `/skill:institutional-holdings`

机构持仓 skill。适合：

- “谁在买 CRWV？”
- “看一下 MSTR 的机构持仓变化”
- “13F 显示哪些基金加仓？”
- “这个 13D 是不是激进投资者信号？”
- “put/call 持仓怎么看？”

重点规则：

- 13F 是季度、滞后的持仓快照，不是实时买卖流。
- 13F 主要覆盖 long positions 和部分 listed options，不覆盖完整空头和衍生品。
- 13D/13G 是 beneficial ownership，不是普通组合明细。
- 13D/A 的 Item 4 如果出现战略计划、董事会、融资、交易提案，信号强度更高。
- 被动 ETF、指数基金、AUM 变化和主动基金加仓要分开看。
- 必须写清楚 report period、filed date、amendment、share class/CUSIP。

## Prompt templates

项目 prompt templates 放在 `.pi/prompts/`，可以直接用 slash command 调用。

常用：

| Prompt | 用途 |
|---|---|
| `/sector` | 行业/主题研究 |
| `/comps` | 可比公司分析 |
| `/competitive-analysis` | 竞争格局 |
| `/earnings` | 财报复盘 |
| `/earnings-preview` | 财报前瞻 |
| `/dcf` | DCF 框架 |
| `/thesis` | 投资 thesis |
| `/catalysts` | 催化剂 |
| `/screen` | 标的筛选 |
| `/morning-note` | 市场早报 |

示例：

```text
/thesis CRWV
/comps NVDA AMD AVGO MRVL
/sector AI data center power chain
```

## Memory 和研究产物

FinancePi 把“记忆”和“证据”分开。

### Memory

路径：

```text
.pi/memory/finance/
```

适合保存：

- 用户稳定偏好
- watchlist
- 长期 thesis 摘要
- 研究报告路径
- 工作流经验

不适合保存：

- 当前价格
- 原始新闻列表
- 大 CSV / 大 JSON
- API key
- 未验证市场结论

常见 memory 工具：

- `memory_search`
- `memory_index_search`
- `memory_read`
- `memory_write_policy`
- `memory_write`
- `memory_research_report`
- `memory_audit`

用户通常不需要手动调用工具，但可以直接要求：

```text
把这个 MSTR 长期 thesis 存进 memory
把今天这次 CRWV 研究写成 research report
以后研究半导体时记得先看存储、HBM、foundry 三条链
```

### Research reports

长研究报告放在：

```text
.pi/research/
```

适合保存：

- 带来源的公司研究
- 行业研究
- 情景模型
- 重要 CSV / Markdown 结论

Memory 里只保存 compact summary 和 report path，避免长期上下文被大文档污染。

### Artifacts

市场数据、PDF 提取结果等证据放在：

```text
.pi/artifacts/
```

常见路径：

```text
.pi/artifacts/market-data/
.pi/artifacts/pdf/
.pi/artifacts/web/
```

回答里如果涉及关键数字，应尽量引用 source/asOf/latestAt/filed date 或 artifact path。

## 推荐使用方式

### 如何让 FinancePi 调研一只股票

FinancePi 不应该把股票研究压缩成固定报告模板。你可以把它当成一个金融研究伙伴：先给出你的真实决策背景，再让它围绕关键问题自然展开。

最简单的问法：

```text
研究一下 OUST，这家公司现在值不值得买？
```

更好的问法：

```text
/invest OUST
我想判断 OUST 是否值得建仓。不要只看技术面，重点展开产业链位置、客户采购逻辑、商业化进展、财务压力、估值隐含预期和 thesis breaker。
```

如果你想要深度研究，要明确告诉 Pi 不要 quick take：

```text
给我深度研究，不要 quick take。先查当前数据和已有 memory，然后自己判断应该展开哪些角度。不要按固定模板机械输出，重点讲清楚这家公司到底靠什么赚钱、在产业链里能不能留住利润、市场现在可能 priced in 了什么。
```

#### Pi 会怎样展开

FinancePi 会先判断你的问题属于哪种决策：买入、持有、卖出、突发波动归因、交易计划、行业研究、估值复核，还是 thesis 压力测试。然后它会按需要选择合适的分析镜头，而不是固定套用所有标题。

例如单只股票研究通常会自然展开这些问题：

- 这家公司到底是什么生意，客户为什么付钱。
- 它处在产业链哪一环，上游、下游、渠道、系统集成商、OEM/Tier-1 或平台方谁更有议价权。
- 增长来自真实需求、周期、价格、订单、客户扩张，还是市场叙事。
- 财务质量是否支持这个故事：收入、毛利、现金流、债务、稀释、capex、营运资金。
- 当前估值已经隐含了什么增长、利润率、资金成本和终局假设。
- 哪些事实会让 thesis 变强，哪些事实会直接破坏 thesis。
- 如果是买入决策，什么条件适合买，什么条件应该等，错了怎么退出。

这些不是输出目录，而是研究时应该被想清楚的问题。Pi 的回答可以是一篇连贯判断，也可以是情景分析、交易计划、反向 DCF、产业链拆解或风险备忘录，取决于你的问题。

#### 让 Pi 不要变短的提示词

如果你发现回答太短，可以直接加这些约束：

```text
不要短答，按深度研究展开。不要只给结论，要解释判断链条、证据、反证、关键变量和下一步要查的数据。
```

```text
不要固定模板。你自己判断这个标的最重要的 3-5 个问题是什么，然后展开讲透。
```

```text
把技术面放最后。先讲公司、产业链、客户、竞争、财务、估值和风险。
```

```text
我不是要 summary，我要 investment memo 风格的研究。可以有明确判断，但必须说明为什么、错在哪里、什么数据会改变结论。
```

#### 常见追问方式

一轮研究之后，最好继续追问，让 Pi 把薄弱环节补深：

```text
你刚才讲得太表面了，重新从产业链利润池角度分析。
```

```text
这个公司真正的客户是谁？采购周期和预算 owner 是谁？
```

```text
如果我是空头，我会怎么反驳这个 thesis？
```

```text
当前价格到底 priced in 了什么？做一个反向估值。
```

```text
给我 bull/base/bear，但不要机械列点，要讲每个情景最关键的变量。
```

```text
如果我要买，什么信号出现再买更合理？如果买错，什么条件必须退出？
```

```text
把这次研究整理成 research report，并把路径存进 finance memory。
```

#### 什么时候用 `/invest`

当你不是单纯想了解公司，而是真的在考虑买、卖、加仓、减仓、建模或配置仓位时，优先用：

```text
/invest <ticker>
```

`/invest` 会让 Pi 更主动地围绕决策展开：目标、周期、风险预算、仓位、买点、卖点、关键数据、情景假设和 thesis breaker。它不代表 Pi 会执行交易，也不是投资建议；它只是把研究从“介绍股票”推进到“支持决策”。

#### 什么时候用 `/plan`

如果你要研究的是复杂主题，例如 AI 电力链、半导体设备链、机器人产业链、多个股票横向比较，先用：

```text
/plan
我想系统研究 AI 电力链，先帮我设计研究路径。
```

确认计划之后再执行：

```text
/plan execute
```

这样可以避免 Pi 一上来就给一个浅答案。

### 单公司深度研究

```text
/invest CRWV
我想研究这家公司是不是值得买，不要只看技术面，重点看业务质量、客户、capex、债务、估值隐含预期和风险。
```

### 突发波动归因

```text
MU 昨天盘前为什么跌？SOXL 为什么跟着跌？请按时间线和半导体链条做归因。
```

重点不是“查到新闻”，而是把以下因素串起来：

- 直接标的
- 相关权重股
- ETF/index 暴露
- 同窗口新闻/财报/指引/分析师动作
- 宏观和 sector tape
- 确认、可能、仅相关的证据分级

### ETF / 杠杆 ETF

```text
/invest SOXL
我想知道 SOXL 适不适合持有 1-3 个月，帮我建模。
```

FinancePi 应覆盖：

- underlying index
- 权重和成分股
- daily reset leverage
- path dependency
- volatility drag
- drawdown/recovery math
- 仓位和退出规则

### 期权定位 / 短线供需

```text
NVDA 财报前看一下期权定位：put-call ratio、gamma exposure、call wall、put wall 在哪里？这些会怎么影响财报后走势？
```

```text
SOXL 这周会不会被期权墙影响？看一下 call wall、put wall、max pain 和 gamma exposure，但不要把它当成长线 thesis。
```

FinancePi 会把 options positioning 当成短线供需和风险管理证据，而不是公司长期价值判断。适合用于：

- 财报、CPI/FOMC、产品发布、重大新闻前后的 event risk。
- pinning、squeeze/unwind、关键 strike 附近的加速或失速风险。
- put-call ratio 反映的拥挤度、保护性需求或投机热度。
- call wall / put wall 附近的潜在磁吸、压力、支撑或空气口袋。
- gamma exposure 与 expiration concentration 对短线波动的影响。

需要注意：

- Yahoo/Cboe/free options chain 不是专业实时流；Cboe 是 delayed options 数据。
- open interest 是滞后的，成交方向也不等于客户方向。
- 估算 gamma exposure 不是 dealer book，只能当公开链推导的定位线索。
- 期权定位只改变 timing、仓位、止损和事件处理；长期买入理由仍要回到公司、财务、估值、竞争和管理层。

### 机构持仓

```text
/skill:institutional-holdings
看一下 CRWV 最近机构持仓有没有值得注意的变化。
```

结论应区分：

- 13F 滞后持仓
- 13D/13G 大股东/激进信号
- 被动 ETF/指数买入
- 主动基金增减仓
- put/call 报告口径
- 对 thesis 的真实影响

### PDF 财报/研报

```text
/skill:pdf-research
分析这个 investor deck：./downloads/company-deck.pdf
```

输出应优先基于页码证据，不应靠 PDF 文件名或摘要猜结论。

## 常见问题

### 为什么有时回答会说数据不够？

金融研究必须区分“有数据”和“能下结论”。缺少当前价格、最新财报、ownership filed date、guidance、估值口径时，FinancePi 应明确说缺口，而不是编数字。

### 为什么不能只看技术面？

技术面只是 timing 和风险管理辅助。单公司投资结论必须回到生意、财务、管理层、资本配置、估值和风险。

### 记忆里的旧结论能直接用吗？

不能。Memory 是背景线索，不是实时市场事实。涉及价格、新闻、财报、估值、机构持仓变化时，要重新查当前数据。

### 机构持仓是不是聪明钱信号？

不一定。13F 有滞后；被动 ETF 可能只是指数/资金流；manager-level 13F 也可能是多账户聚合。13D/13D-A 通常比普通 13F 更可能改变 thesis，但仍要看 Item 4 和公司基本面。

### 如何减少上下文污染？

- 大文件进 `.pi/artifacts/` 或 `.pi/research/`
- memory 只存 compact summary 和路径
- 当前行情不要写 memory
- 研究前先 search memory，关键结论再查 fresh data

## 开发者常用命令

```bash
npm install --ignore-scripts
./pi-test.sh
./pi-test.sh -p "Say exactly: ok"
npm run check
./test.sh
```

不要用 `npm test` 跑全量测试，仓库规则要求非 e2e 用 `./test.sh`，或从具体 package 跑指定 vitest 文件。
