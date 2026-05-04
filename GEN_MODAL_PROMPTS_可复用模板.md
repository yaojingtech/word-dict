# GEN_MODAL Prompts 可复用模板

本文件整理了“智能生成单词词条”相关的全部核心 Prompt，支持你在新项目直接复制使用。

---

## 1) 单词词条生成 Prompt（`ai_generate.js`）

用途：针对单个单词生成结构化词典条目（音标、英文释义、简明释义、短语）。

### 1.1 变量

- `{{word}}`：目标英文单词

### 1.2 User Prompt（原样可用）

```text
你是一位专业的青少年英汉词典编辑。请为英文单词 "{{word}}" 生成一条标准词典条目。

严格按照以下 JSON 格式返回，不要有任何多余的文字、代码块标记或解释：
{
  "phonetic": "美式音标，格式如 / wɜːrd /",
  "definition": "英文释义，简明扼要，1-2句话",
  "brief": "中文释义，包含词性标注，例如：n. 单词；词语 v. 措辞，表达",
  "phrases": "精选2-3个最常用短语搭配，格式：英文短语: 中文释义 | 英文短语: 中文释义（若无常用搭配则填空字符串）"
}
```

### 1.3 推荐参数

- `temperature`: `0.2 ~ 0.35`
- `max_tokens`: `350 ~ 500`
- `stream`: `false`

### 1.4 解析容错建议

- 允许模型返回 markdown 代码块，先提取首个 `{ ... }` 再 JSON 解析。

---

## 2) AI 图片识词（自动清洗）Prompts（`ai_ocr.js`）

该链路为两阶段：

1. 视觉模型提取完整文本
2. 文本模型按规则筛单词

## 2.1 视觉阶段 Prompt（`OCR_VISION_PROMPT`）

```text
请仔细观察图片，识别其中出现的所有文本内容，将识别到的完整文本返回给我。
```

推荐参数：

- `temperature`: `0.1`
- `max_tokens`: `700 ~ 1000`

## 2.2 文本清洗阶段 Prompt（`OCR_CLEAN_PROMPT`）

```text
你是英文学习词汇筛选助手。请根据我提供的OCR原文，提取有学习价值的英文单词。

筛选规则：
1) 仅保留英文单词（可包含连字符或撇号），忽略数字、符号、网址等。
2) 优先保留有学习价值的实词（名词、动词、形容词、副词等），忽略 a/the/is/of/to/and 等常见功能词。
3) 去重（大小写不敏感）。
4) 每行仅输出一个单词，不加序号、不加解释、不加标点。
5) 如果无法提取有效英文单词，返回空字符串。
```

User 消息内容模板：

```text
以下是OCR原文，请按规则输出结果：

{{raw_text}}
```

推荐参数：

- `temperature`: `0.1`
- `max_tokens`: `400 ~ 600`

---

## 3) OCR 手动选词 Prompt（`ai_extract.js`）

用途：只抽取“完整原文”，后续由用户手工点选单词。

### 3.1 Prompt（`EXTRACT_PROMPT`）

```text
请仔细观察图片，识别其中出现的所有文本内容，将识别到的完整文本返回给我。
```

推荐参数：

- `temperature`: `0.1`
- `max_tokens`: `700 ~ 1000`

说明：

- 这个模式不要让模型筛词，保持“原文最大保真”。

---

## 4) 可选：统一 System Prompt（增强稳定性）

如果你的接口支持 `system`，建议给词条生成附加以下系统约束：

```text
你只输出严格 JSON，不输出解释、注释、Markdown 代码块或额外文本。
如果不确定，也必须给出字段齐全的 JSON，字段缺失时填空字符串。
```

---

## 5) 输出 JSON 结构约束（建议固定）

用于词条生成的标准 Schema：

```json
{
  "phonetic": "string",
  "definition": "string",
  "brief": "string",
  "phrases": "string"
}
```

字段规则建议：

- `phonetic`：形如 `/ ... /`
- `definition`：英文 1-2 句
- `brief`：中文 + 词性
- `phrases`：`英文: 中文 | 英文: 中文`

---

## 6) 多语言/年级版本 Prompt 管理建议

建议你在新项目按文件拆分：

- `prompts/entry.generate.txt`
- `prompts/ocr.vision.txt`
- `prompts/ocr.clean.txt`
- `prompts/extract.vision.txt`

这样后续 AB 测试、版本回滚更方便。

---

## 7) 快速接入伪代码

```js
const prompt = entryGeneratePrompt.replace('{{word}}', word);

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 450,
    stream: false
  })
});
```

---

## 8) 最小可复制 Prompt 包（纯文本）

你至少复制以下 3 段即可跑通：

1. 词条生成 Prompt（第 1 节）
2. OCR 视觉 Prompt（第 2.1 节）
3. OCR 清洗 Prompt（第 2.2 节）

---

如果你要，我可以下一步再给你一份“`prompts.js` 可直接 import 的常量文件版本”，把这些模板整理成 JS 对象并带占位符替换函数。
