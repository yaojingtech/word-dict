# 智能生成单词词条逻辑说明（可跨项目照搬）

本文完整梳理当前项目中“智能生成单词词条”模块（`genModal`）的产品逻辑与实现结构，适用于在新项目 1:1 复刻。

---

## 1. 模块目标

在一个统一弹窗里完成以下能力：

1. 输入单词（手工输入 / 图片识别导入 / OCR手动选词）
2. 批量调用 AI 生成结构化词条
3. 可视化进度、逐词成功/失败、结果勾选
4. 将选中结果写回主词库（替换或叠加）

---

## 2. 关键文件与职责

- `index.html`
  - 提供 `genModal` 结构、OCR 区、进度区、底部操作区、选词弹窗结构。
- `js/ai_generate.js`
  - 主控制器：开关弹窗、解析输入、调用 AI 生成词条、渲染进度、替换/叠加词库。
- `js/ai_ocr.js`
  - AI 智能识词（两阶段）：视觉 OCR -> 文本清洗 -> 写入输入框。
- `js/ai_extract.js`
  - OCR 手动选词：识别原文 -> 逐词可点选 -> 确认后写入输入框。
- `js/ai_config.js`
  - AI 接口配置（`endpoint`、`apiKey`、`model`）。
- `js/main.js` / `js/columns.js` / `js/render.js`
  - 提供词库全局变量与页面刷新能力（`allData`、`headers`、`visibleColumns`、`renderPages`、`initColumnControls`）。

---

## 3. UI 结构（DOM ID）

### 3.1 主弹窗

- `#genModalOverlay`：最外层遮罩
- `#genModalBackdrop`：背景板（点击关闭）
- `#genModalBox`：弹窗主体
- `#genModalClose`：关闭按钮

### 3.2 输入与启动

- `#genWordsInput`：单词输入框（支持换行/逗号）
- `#genStartBtn`：开始生成
- `#genStatusText`：状态文字
- `#genProgress`：结果列表容器
- `#genFooter`：底部操作区（仅有成功结果时显示）

### 3.3 OCR 区

- `#genOcrUploadBtn`：AI智能识词入口（`ai_ocr.js`）
- `#genOcrExtractBtn`：OCR手动选词入口（`ai_extract.js`）
- `#genFileInput`：AI识词文件选择
- `#genExtractFileInput`：手动选词文件选择
- `#genOcrPreview` / `#genOcrImg` / `#genOcrStatus`：预览与状态
- `#genReExtractBtn`：重新选词（手动选词路径）

### 3.4 结果选择与写入

- `#genSelectAll` / `#genClearAll`：全选/取消全选（成功项）
- `#genSelectedCount`：已选统计
- `#genReplaceBtn`：替换词库
- `#genAppendBtn`：叠加词库（插入顶部）

### 3.5 手动选词子弹窗（`ai_extract.js`）

- `#extractSelectOverlay`、`#extractSelectBackdrop`、`#extractSelectClose`
- `#extractRawText`：识别原文（单词可点击）
- `#extractSelectAllBtn`、`#extractClearBtn`、`#extractConfirmBtn`
- `#extractSelectedCount`

---

## 4. 全链路流程

## A) 打开与重置

触发：点击 `#genWordsBtn`（拍照识词按钮）

`openGenModal()` 会：

1. 清空输入框、进度区、状态区
2. 重置内部状态：
   - `_genResults = []`
   - `_genAborted = false`
3. 隐藏底部操作区
4. 恢复开始按钮文案
5. 显示弹窗并禁用页面滚动

关闭触发：

- `#genModalBackdrop` 点击
- `#genModalClose` 点击
- `Esc`（仅弹窗打开时）

关闭动作 `closeGenModal()`：

- `_genAborted = true`（中断后续批次）
- 隐藏弹窗，恢复页面滚动

---

## B) 单词输入来源（三种）

### 1) 手工输入

- 用户在 `#genWordsInput` 输入
- `parseWordsInput()` 支持分隔符：
  - 换行
  - 英文逗号 `,`
  - 中文逗号 `，`
- 自动 trim + 去空 + 大小写去重

### 2) AI智能识词（`ai_ocr.js`）

流程：

1. 选图后 `file -> base64 dataURL`
2. `callVisionApi(dataUrl)` 使用视觉模型 `PaddleOCR-VL` 提取完整文本
3. `callTextCleanApi(rawText)` 使用文本模型按规则筛选英文学习词
4. `parseOcrWords(cleaned)` 行级提词 + 正则校验 + 去重
5. 结果以逗号拼接写入 `#genWordsInput`

特点：

- 自动模式，快
- 适合拍照后直接得到可生成单词

### 3) OCR手动选词（`ai_extract.js`）

流程：

1. 视觉模型识别完整原文
2. 将原文中英文词包装成可点击 span
3. 弹出选词面板，支持逐词点选/全选/取消全选
4. 确认后按出现顺序取词并去重，写入 `#genWordsInput`

特点：

- 可控性最高
- 适合文本较杂、需要人工筛选的图片

---

## C) 批量生成词条（核心）

入口：`startGeneration()`

### 1) 预处理

1. 从输入框解析单词数组
2. 为空则 `alert`
3. 初始化 `_genResults`（每词 `pending`）
4. 构建全部进度占位卡片（每词一条）

### 2) 并发策略

- 常量：`GEN_BATCH_SIZE = 50`
- 采用“分批 + 批内并发”：
  - 外层按 50 个一批循环
  - 每批 `Promise.allSettled` 并发请求
- 如果中途关闭弹窗，`_genAborted` 为 `true`，后续批次不再执行

### 3) 单词生成请求

`fetchWordEntry(word)` 请求 AI，要求返回 JSON：

```json
{
  "phonetic": "...",
  "definition": "...",
  "brief": "...",
  "phrases": "..."
}
```

实现细节：

- 请求参数：
  - `model: AI_CONFIG.model`
  - `max_tokens: 450`
  - `temperature: 0.3`
- 容忍模型返回 markdown 代码块，通过正则提取 `{...}` 再 `JSON.parse`
- 失败时记录错误信息并标记该词条失败

### 4) 进度与选择

每个词条有状态：

- `pending` -> `loading` -> `done` / `error`

UI 行为：

- 成功项默认加上 `gen-item-selected`
- 点击成功项可切换选中
- 顶部统计实时更新：
  - 已完成数
  - 成功数
  - 失败数
  - 已选数

---

## D) 写回主词库（替换/叠加）

### 1) 结果转行

`buildNewRows()` 将成功且选中的结果映射成数组行。

映射规则按表头名兼容：

- `单词` <- `word`
- `美音` / `英音` / `音标` <- `phonetic`
- `definition` <- `definition`
- `简明释义` <- `brief`
- `精选短语` <- `phrases`

### 2) 替换词库

`replaceWordsToList()`：

- 清空 `allData`
- 写入新行
- `renderPages()`
- 关闭弹窗 + toast 提示

### 3) 叠加词库

`appendWordsToList()`：

- `allData.unshift(...newRows)`（插入顶部）
- `renderPages()`
- 关闭弹窗 + toast 提示

---

## 5. 与 `genModalBackdrop` 的关系（你提到的点）

`#genModalBackdrop` 是主弹窗关闭控制的关键触点：

- 绑定在 `ai_generate.js` 的 `DOMContentLoaded` 中
- 点击后执行 `closeGenModal()`
- `closeGenModal()` 会设置 `_genAborted = true`
- 因此“关闭弹窗”不仅是 UI 关闭，也会停止后续批次生成（已发出的本批请求会自然结束）

这能避免用户关闭后后台继续大量请求。

---

## 6. 对外依赖契约（迁移必须满足）

新项目要复用该产品，至少保证：

1. 全局变量
   - `allData`
   - `headers`
   - `visibleColumns`
2. 全局函数
   - `renderPages()`
   - `initColumnControls()`
3. 工具函数
   - `escapeHtml()`
4. AI 配置
   - `AI_CONFIG.endpoint`
   - `AI_CONFIG.apiKey`
   - `AI_CONFIG.model`
5. 相关 DOM ID 与结构存在
6. 页面通过 `http/https` 本地服务运行（避免 `file://` CORS）

---

## 7. 错误处理策略（现状）

- 输入为空：弹窗提示
- API HTTP 非 2xx：显示 `HTTP xxx`
- AI 返回非 JSON：该词条标记失败
- 批量生成中局部失败不影响整体（`allSettled`）
- 全部失败时，底部“替换/叠加”不显示
- OCR 失败在状态区显示错误文案

---

## 8. 你可直接复刻的最小实现步骤

1. 复制 `genModal` HTML（主弹窗 + OCR 区 + 进度区 + footer）
2. 复制 `ai_generate.js` 并接入你项目的数据层接口
3. 复制 `ai_ocr.js`（自动识词）
4. 复制 `ai_extract.js`（手动选词）
5. 准备 `ai_config.js`
6. 补齐样式（`controls.css` 中 `gen-*`、`extract-*` 样式）
7. 验证三条主链路：
   - 手输 -> 生成 -> 叠加
   - AI识词 -> 生成 -> 替换
   - 手动选词 -> 生成 -> 叠加

---

## 9. 生产化建议（强烈建议）

1. 不要前端明文放 `apiKey`（改后端代理）
2. 为生成接口加超时与重试（尤其移动端网络）
3. 降低并发上限（50 在弱机上压力较大，可改 10-20）
4. 给关闭弹窗增加“是否确认中止”提示（可选）
5. 统一日志开关（生产环境关闭大段 console 输出）

---

## 10. 当前实现中的核心常量与参数

- 生成并发批次：`GEN_BATCH_SIZE = 50`
- 词条生成模型：`AI_CONFIG.model`
- 词条生成温度：`0.3`
- OCR 视觉模型：`PaddlePaddle/PaddleOCR-VL`
- OCR 清洗模型：`AI_CONFIG.model`

---

如需，我可以下一步再给你一版「跨项目精简版」：
- 把当前 3 个 JS 文件合并成一个 `word-entry-generator.js`
- 提供 `initWordEntryGenerator({ onReplace, onAppend, aiConfig })` 的标准化 API
- 你新项目只需传回调即可接入。

---

## 11. Prompts 附录（可直接复用）

以下为当前产品可直接照搬的 Prompt 模板。

### 11.1 新项目词条生成 Prompt（仅输出 `英文 - 中文`）

你的新项目目标格式是“每行一条”：

```text
get up - 起床
have breakfast - 吃早餐
...
```

变量：

- `{{words}}`：待处理单词/短语列表（可换行）

User Prompt（可直接用）：

```text
你是一位小学英语词表整理助手。请把我提供的英文词/短语整理成中英对照清单。

严格输出规则：
1) 每行仅输出一条，格式必须是：英文 - 中文
2) 英文保持原样（大小写、空格、标点尽量保持输入形式）
3) 中文给出最常用、最适合小学生的释义
4) 不要输出音标、词性、例句、编号、标题、解释
5) 不要输出代码块标记，不要输出多余空行
6) 如果某条有多个常见义项，用中文分号分隔（如：刷牙；刷洗）
7) 若输入包含感叹句（如 Good night, kids!），按原样保留英文并给中文

待处理词条：
{{words}}
```

建议参数：

- `temperature`: `0.1 ~ 0.3`
- `max_tokens`: 按词条数量动态设置（一般 `300 ~ 1200`）

解析建议：

- 直接按换行切分，再按第一个 ` - ` 分割成 `en` 和 `zh`。
- 若模型偶发输出空行，过滤空行即可。

### 11.2 AI 图片识词 Prompt（`ai_ocr.js`）

两阶段：视觉 OCR 提取原文 -> 文本模型清洗词汇。

视觉阶段 Prompt（`OCR_VISION_PROMPT`）：

```text
请仔细观察图片，识别其中出现的所有文本内容，将识别到的完整文本返回给我。
```

清洗阶段 Prompt（`OCR_CLEAN_PROMPT`）：

```text
你是英文学习词汇筛选助手。请根据我提供的OCR原文，提取有学习价值的英文单词。

筛选规则：
1) 仅保留英文单词（可包含连字符或撇号），忽略数字、符号、网址等。
2) 优先保留有学习价值的实词（名词、动词、形容词、副词等），忽略 a/the/is/of/to/and 等常见功能词。
3) 去重（大小写不敏感）。
4) 每行仅输出一个单词，不加序号、不加解释、不加标点。
5) 如果无法提取有效英文单词，返回空字符串。
```

清洗阶段 User 内容模板：

```text
以下是OCR原文，请按规则输出结果：

{{raw_text}}
```

建议参数：

- `temperature`: `0.1`
- `max_tokens`: `400 ~ 600`

### 11.3 OCR 手动选词 Prompt（`ai_extract.js`）

用途：只抽取完整原文，由用户手动点选单词。

```text
请仔细观察图片，识别其中出现的所有文本内容，将识别到的完整文本返回给我。
```

建议参数：

- `temperature`: `0.1`
- `max_tokens`: `700 ~ 1000`

### 11.4 可选 System Prompt（简化输出专用）

```text
你只输出纯文本行，不输出解释、注释、Markdown 代码块或额外文本。
每行必须是“英文 - 中文”。
```

### 11.5 新项目输出格式规范（固定）

```text
english phrase - 中文释义
```

规则建议：

- 左侧：英文词或短语（保留原输入）
- 连接符：固定半角 ` - `（空格-空格）
- 右侧：中文释义（必要时用 `；` 分隔多个义项）
- 一行一条，不加序号，不加标题

示例：

```text
go to school - 上学
have lunch - 吃午餐
o'clock - （表示整点）……点钟
Good night, kids! - 晚安，孩子们！
```

---

## 12. OCR 识词交互与“移除中文”逻辑（重点）

你新项目如果要照搬当前产品，OCR 部分建议保持“两条入口 + 双层过滤”：

1. AI 智能识词（自动）
2. OCR 手动选词（人工可控）

### 12.1 入口交互（与当前产品一致）

- `AI智能识词（手写体友好）`：一键识别并自动清洗，结果直接回填输入框
- `OCR手动选词（印刷体友好）`：先识别原文，再由用户点击选择单词

共享交互：

- 识别中状态：`⏳`
- 成功状态：`✅`
- 失败状态：`❌`
- 预览图显示：`#genOcrImg`
- 结果写回：`#genWordsInput`

### 12.2 自动模式如何“移除中文”

自动模式并不是只靠一个正则，而是 **Prompt 约束 + 本地解析二次过滤** 两层：

#### 第一层：清洗 Prompt 约束

在 `OCR_CLEAN_PROMPT` 中明确要求：

- 仅保留英文单词（可含连字符或撇号）
- 忽略数字、符号、网址
- 忽略常见功能词（a/the/is/of/to/and）
- 每行一个词
- 无有效词返回空字符串

这一步已经会把大量中文、标点、噪声剔除。

#### 第二层：本地正则兜底

`parseOcrWords()` 里做了三件事：

1. 去掉行首编号（如 `1.`、`2)`）
2. 仅保留匹配 `^[a-zA-Z][a-zA-Z\\-']*$` 的 token
3. 大小写不敏感去重

这意味着：

- 中文会被直接过滤掉
- 纯数字/中英混杂噪声会被过滤
- 重复词只保留一个

### 12.3 手动选词模式如何“移除中文”

手动模式设计思路是：**只让英文词变成可点击节点**，中文天然不可选。

在 `createClickableText()` 中使用分割规则：

- 仅将 `[a-zA-Z][a-zA-Z\\-']*` 识别为“可点击单词”
- 其他内容（中文、标点、空格）只作为普通文本显示

结果：

- 用户只能点英文 token
- 中文无法进入选中集合
- 最终确认时再做一次大小写去重，保证输出干净

### 12.4 你新项目推荐的统一输出策略

无论自动还是手动，最后统一把词条写成：

- 输入框中：`word1, word2, word3`
- 生成后输出：`英文 - 中文`（每行一条）

建议在写回前再做一次统一过滤：

1. trim
2. 过滤空字符串
3. 过滤非英文 token
4. 小写去重

### 12.5 常见边界与建议

- `o'clock`：应保留（含撇号，正则允许）
- `T-shirt`：应保留（含连字符，正则允许）
- `Good night, kids!`：在 OCR 阶段会被拆成多个词；若你需要保留整句，建议走“手输/词条清单”而非 OCR 自动抽词
- 专有名词大小写（如 `Miss`）：去重建议用小写比较，但保留首个原始大小写展示
