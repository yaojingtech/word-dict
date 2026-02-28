// ==========================================
// AI 配置与请求模块 (ai_config.js)
// ==========================================

const AI_CONFIG = {
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    apiKey: 'sk-pqhajqrvfsyeufdproqvkjcsyykggprmtflahbidbptfvzul',
    model: 'Qwen/Qwen2.5-7B-Instruct',
};

// --- 多角色讲解方案 ---
const AI_ROLES = [
    {
        id: 'sentences',
        label: '例句达人',
        buildPrompt(word, phonetic, def, brief) {
            const entry = buildEntry(word, phonetic, def, brief);

            return `你是英语例句老师。请为目标词生成 4 条 A1-A2 难度例句，供中国学生学习。

【目标词】
${word}

【输入词条】
${entry}

【生成规则】
- 每句都要自然、完整、语法正确，像真实英语母语者会说的话。
- 每句包含目标词 ${word}（允许自然搭配，不要生硬堆词）。
- 每句 5-10 词，语法正确，可朗读。
- 必须基于真实英语生活场景：家庭、校园、公共场所、朋友交流。
- 严禁魔法、外星人、超能力、未来科幻等虚构设定。
- 翻译自然简洁，不要直译腔。
- 仅把目标词（或必要变形）加粗，其他词不加粗。

【输出格式（必须完全一致）】
🏠 **【家庭场景】**
1. English sentence.（中文翻译）

🏫 **【校园场景】**
2. English sentence.（中文翻译）

🛒 **【公共场景】**
3. English sentence.（中文翻译）

💬 **【社交场景】**
4. English sentence?（中文翻译）

【输出前自检】
- 必须有 1-4 共 4 句。
- 不要输出解释、备注或多余标题。
- 如果发现任一句不自然，先修正再输出最终版本。`;
        }
    },
    {
        id: 'age6',
        label: '小学生',
        buildPrompt(word, phonetic, def, brief) {
            const entry = buildEntry(word, phonetic, def, brief);
            return `【角色设定】
你是一位专业且极具亲和力的"6岁儿童英语启蒙老师"。你的任务是将英文释义转化为贴近儿童生活的场景，结合肢体动作进行教学。

【核心原则】（小模型必须严格遵守）
1. 拒绝抽象：不讲语法！把单词变成孩子能看到、做出的画面。
2. 讲解带英文：在讲解过程中，必须出现该【英文单词】及其发音，不能只说中文。
3. 纯英文口语输出（生死红线）：在最后两个环节要求孩子说出的完整句子，【必须且只能是纯英文】，绝对严禁让孩子输出中文句子！英文句子要极简（3-5个词，主谓宾/主系表）。

【输出结构】
- 禁止输出任何方括号 []、提示词或占位符。
- 严格保留以下 5 行前缀并直接填充内容：

💡 一句话导入：${word}，就是（20字内大白话解释）。
🎬 生活小剧场：（1句真实儿童日常场景）。
🗣️ 老师怎么讲：（第一人称，生动口吻，80字内，包含英文单词与发音）。
🏃‍♂️ 动作与全句：（动作说明）+ 1句纯英文句子（必须包含 ${word}）。
🎮 场景替换小测试：（新场景引导）+ 1句全新纯英文句子。

【待讲解的单词词条】
${entry}`;
        }
    },
    {
        id: 'age9',
        label: '初中生',
        buildPrompt(word, phonetic, def, brief) {
            const entry = buildEntry(word, phonetic, def, brief);
            return `【角色设定】
你是一位幽默、有梗且懂孩子心理的"9岁儿童英语培优导师（对标剑桥KET/A2水平）"。你的任务是将字典释义转化为符合9岁孩子认知深度、贴近他们兴趣的讲解。

【核心原则】
1. 拒绝低幼与尴尬： 绝对禁止使用"魔法"、"小仙女"、"过家家"或夸张幼稚的肢体动作。9岁孩子觉得这些很尴尬。
2. 兴趣场景代入： 运用9岁孩子真正关心的生活、学习、运动场景.
3. 允许适度抽象与逻辑： 9岁可以理解抽象词汇（如 economy, management），但必须用"生活中的系统或规则"来打比方。
4. KET 级别语料输出： 英文例句必须符合 KET (A2) 水平，句子长度在 5-10 个词之间。可以包含简单的过去时、将来时、because/but 等连词。句式要实用，是日常真正会说的话。

【输出结构】
- 禁止输出任何方括号 []、提示词或占位符。
- 严格按下列 5 行输出并直接填充内容：

💡 秒懂释义：（1句中文大白话，点明核心意思。）
🎬 校园/生活剧场：（1句真实场景设定。）
🗣️ 导师怎么讲：（平等口吻，120字内，带读发音并解释清楚。）
🧠 记忆外挂 & KET例句：（记忆技巧 + 1句KET实用英文句。）
🎮 升级挑战：（与生活相关的问题，引导学生英文回答或仿句。）

【待讲解的单词词条】
${entry}`;
        }
    },
];

function buildEntry(word, phonetic, def, brief) {
    return [
        `单词：${word}`,
        phonetic ? `音标：${phonetic}` : '',
        def      ? `英文释义：${def}` : '',
        brief    ? `中文释义：${brief}` : '',
    ].filter(Boolean).join('\n');
}

// --- 结果缓存（内存 + localStorage 持久化）---
const _AI_CACHE_LS_KEY = 'word_dict_ai_v1';
let _aiCache = null;

function _loadCache() {
    if (_aiCache) return _aiCache;
    try {
        const raw = localStorage.getItem(_AI_CACHE_LS_KEY);
        _aiCache = raw ? JSON.parse(raw) : {};
    } catch { _aiCache = {}; }
    return _aiCache;
}

function getCachedResult(word, roleId) {
    return _loadCache()[`${word.toLowerCase().trim()}|${roleId}`] ?? null;
}

function setCachedResult(word, roleId, content) {
    const cache = _loadCache();
    const key = `${word.toLowerCase().trim()}|${roleId}`;
    cache[key] = content;
    try {
        const keys = Object.keys(cache);
        if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(k => delete cache[k]);
        localStorage.setItem(_AI_CACHE_LS_KEY, JSON.stringify(cache));
    } catch (e) {
        console.warn('AI cache write failed:', e.message);
    }
}

let _aiLogBuffer = ''; // for console logging

function validateSentencesOutput(fullText, word) {
    if (!fullText) return { ok: false, reason: 'empty' };

    const numberedLines = fullText
        .split('\n')
        .map(s => s.trim())
        .filter(s => /^\d+\.\s+/.test(s));

    if (numberedLines.length < 4) return { ok: false, reason: 'missing_numbered_lines' };

    const hasAllNumbers = Array.from({ length: 4 }, (_, i) => i + 1)
        .every(n => numberedLines.some(line => line.startsWith(`${n}.`)));
    if (!hasAllNumbers) return { ok: false, reason: 'missing_1_to_4' };

    const hasCnBrackets = numberedLines.slice(0, 4).every(line => line.includes('（') && line.includes('）'));
    if (!hasCnBrackets) return { ok: false, reason: 'missing_translation_brackets' };

    const linesLower = numberedLines.slice(0, 4).map(line => line.toLowerCase());
    const target = String(word || '').toLowerCase().trim();
    if (target && !linesLower.every(line => line.includes(target))) {
        return { ok: false, reason: 'target_word_missing' };
    }

    // Lightweight bad pattern detection for typical broken "the" outputs.
    if (/\b(i|we|you|he|she|they)\s+the\s+[a-z]+/i.test(fullText)) {
        return { ok: false, reason: 'unnatural_the_pattern' };
    }

    return { ok: true };
}

async function fetchAiExplanation({ word, phonetic, def, brief, roleId, onDone, onError }) {
    _aiLogBuffer = '';
    try {
        const role = AI_ROLES.find(r => r.id === roleId) || AI_ROLES[0];
        const prompt = role.buildPrompt(word, phonetic, def, brief);

        console.group(`🤖 AI讲解 · ${word} [${roleId}]`);
        console.log('%c📤 Prompt', 'color:#667eea;font-weight:bold');
        console.log(prompt);

        const requestAi = async (messages) => {
            const res = await fetch(AI_CONFIG.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
                },
                body: JSON.stringify({
                    model: AI_CONFIG.model,
                    messages,
                    stream: false,
                    max_tokens: 900,
                    temperature: 0.25,
                    top_p: 0.85,
                    presence_penalty: 0,
                    frequency_penalty: 0.2,
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
            const json = await res.json();
            return (json.choices?.[0]?.message?.content || '').trim();
        };

        let fullText = await requestAi([{ role: 'user', content: prompt }]);

        // For "例句达人", perform one automatic repair retry if output is malformed.
        if (role.id === 'sentences') {
            const check = validateSentencesOutput(fullText, word);
            if (!check.ok) {
                console.warn('Sentences validation failed, retrying once:', check.reason);
                fullText = await requestAi([
                    { role: 'user', content: prompt },
                    { role: 'assistant', content: fullText },
                    {
                        role: 'user',
                        content:
                            '你上一版有格式或语法问题。请只输出修正后的最终版本：保留 1-4 编号、每句含中文全角括号翻译、句子语法自然，不要任何解释。'
                    }
                ]);
            }
        }

        _aiLogBuffer = fullText;
        console.log('%c📥 Response', 'color:#2ea043;font-weight:bold');
        console.log(_aiLogBuffer);
        console.groupEnd();
        _aiLogBuffer = '';

        onDone?.(fullText);
    } catch (err) {
        console.error('❌ AI Error:', err);
        console.groupEnd();
        onError?.(err);
    }
}
