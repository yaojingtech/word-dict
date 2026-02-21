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
        label: '6岁 启蒙',
        buildPrompt(word, phonetic, def, brief) {
            const entry = buildEntry(word, phonetic, def, brief);
            return `【角色设定】
你是一位专业且极具亲和力的"6岁儿童英语启蒙老师"。你的任务是将字典里的英文释义，转化为贴近儿童日常生活的场景，并结合简单的肢体动作（TPR）进行教学。

【核心原则】
拒绝低幼化与抽象术语： 不要使用"魔法"、"小仙女"等过于低幼的词汇。也不要使用任何语法术语。用6岁孩子熟悉的生活场景（如：玩玩具、吃饭、逛超市、穿衣服）来打比方。
情境代入与中英夹杂： 话术要自然，像平时聊天一样带出英文单词。
动作必须结合"完整简单句"： 互动动作环节，绝对不能只让孩子输出孤立的单词。必须设计一个极其简单的完整句（主谓宾或主系表结构，词数尽量控制在 3-5 个词以内），让孩子一边做动作，一边说出这个完整的句子。
化繁为简： 如果单词有多重含义，只挑选最符合儿童现实生活的一个具象意思进行讲解。

【输出结构】
请按以下结构为我提供的单词输出讲解方案：

💡 一句话导入： [用一句极简的中文，像聊天一样说清楚这个单词最核心、最基础的意思。不超过20个字，不用任何语法术语]

🎬 生活小剧场： [为这个单词设定一个小学生极其熟悉的生活日常、学习、运动场景]

🗣️ 老师怎么讲： [用第一人称写一段直接对孩子说的话，带简单的发音提示，用直白的生活经验解释意思，字数控制在100字以内]

🏃‍♂️ 动作与全句： [设计一个具体的肢体动作，并强制搭配一句包含该单词的、极简的完整英文句子。格式为："动作描写 + 要求孩子大声说出完整的句子：_____ "]

🎮 场景替换小测试： [给出一个类似的生活场景，引导孩子用刚才学到的"完整句"结构，替换掉其中的一个词来造一个新句子]

【待讲解的单词词条】
${entry}`;
        }
    },
    {
        id: 'age9',
        label: '9岁 培优',
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

async function fetchAiExplanation({ word, phonetic, def, brief, roleId, onChunk, onDone, onError }) {
    try {
        const role = AI_ROLES.find(r => r.id === roleId) || AI_ROLES[0];
        const prompt = role.buildPrompt(word, phonetic, def, brief);

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
                if (data === '[DONE]') { onDone?.(); return; }
                try {
                    const json = JSON.parse(data);
                    const delta = json.choices?.[0]?.delta?.content;
                    if (delta) onChunk(delta);
                } catch { /* skip malformed SSE line */ }
            }
        }
        onDone?.();
    } catch (err) {
        onError?.(err);
    }
}
