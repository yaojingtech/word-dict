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

【输出结构】（请严格保留前缀表情和冒号，照格式填空）

💡 一句话导入：${word}，就是[用不超过20个字的大白话解释核心意思]。

🎬 生活小剧场：[设定一个6岁孩子熟悉的生活日常、玩耍、运动场景，1句话描述]。

🗣️ 老师怎么讲：[用第一人称对孩子说话。先带读发音，再用上面的场景解释单词。语气要生动，字数80字以内]。

🏃‍♂️ 动作与全句：[设计一个肢体动作]。要求孩子一边做动作，一边大声说出完整的纯英文句子：[此处必须是一句纯英文，且包含 ${word}]！

🎮 场景替换小测试：[给出一个新场景，引导孩子替换刚才英文句子里的人或物]。请孩子大声说出新的纯英文句子：[此处必须是一句全新的纯英文句子]！

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
请按以下结构为我提供的单词输出讲解方案：

💡 秒懂释义： [用一句精炼的中文大白话，直接点明核心意思，不绕弯子。]

🎬 校园/生活剧场： [设定一个9岁孩子非常感兴趣的场景]

🗣️ 导师怎么讲： [用平等的、像朋友一样的口吻进行讲解。带读发音，用刚才设定的场景把单词的逻辑解释清楚。语气要酷一点、幽默一点。字数控制在120字以内。]

🧠 记忆外挂 & KET例句： [给出一个帮助记忆的小窍门（如：词根词缀的简单拆解、谐音、或者一个微小的习惯动作）。紧接着给出一句 KET 水平的实用地道英文例句，要求孩子大声朗读。]

🎮 升级挑战： [抛出一个与他们生活相关的问题，要求孩子用英文简短回答，或者用刚才的例句结构造个新句子。]

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

let _aiLogBuffer = ''; // accumulate stream for console logging

async function fetchAiExplanation({ word, phonetic, def, brief, roleId, onChunk, onDone, onError }) {
    _aiLogBuffer = '';
    try {
        const role = AI_ROLES.find(r => r.id === roleId) || AI_ROLES[0];
        const prompt = role.buildPrompt(word, phonetic, def, brief);

        console.group(`🤖 AI讲解 · ${word} [${roleId}]`);
        console.log('%c📤 Prompt', 'color:#667eea;font-weight:bold');
        console.log(prompt);

        const res = await fetch(AI_CONFIG.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
            },
            body: JSON.stringify({
                model: AI_CONFIG.model,
                messages: [{ role: 'user', content: prompt }],
                stream: true,
                max_tokens: 900,
                temperature: 0.7,
            }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            for (const line of text.split('\n')) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                    console.log('%c📥 Response', 'color:#2ea043;font-weight:bold');
                    console.log(_aiLogBuffer);
                    console.groupEnd();
                    _aiLogBuffer = '';
                    onDone?.();
                    return;
                }
                try {
                    const json = JSON.parse(data);
                    const delta = json.choices?.[0]?.delta?.content;
                    if (delta) { _aiLogBuffer += delta; onChunk(delta); }
                } catch { /* skip malformed SSE line */ }
            }
        }
        console.log('%c📥 Response', 'color:#2ea043;font-weight:bold');
        console.log(_aiLogBuffer);
        console.groupEnd();
        _aiLogBuffer = '';
        onDone?.();
    } catch (err) {
        console.error('❌ AI Error:', err);
        console.groupEnd();
        onError?.(err);
    }
}
