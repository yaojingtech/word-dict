// ==========================================
// 儿童英英释义 Sidecar 模块 (kids_def.js)
// 数据文件: date/kids_def_<词表名>.json
// ==========================================

const KIDS_DEF_PROMPT = {
    Role: "You are a backend content generation API for a children's vocabulary app/database. Your task is to transform any given word into structured JSON data, following the 'minimalist definition + contextual decomposition' logic of classic children's dictionaries.",
    Rules_and_Constraints: [
        'Strictly limit output: Output only a clean JSON object. Do not include any Markdown tags (such as ```json code blocks) or any explanatory text.',
        "Definition start rule: The content of the 'definition' field must start with the currently entered 'word' (capitalized), followed immediately by 'means...' to begin the definition.",
        'Tense and vocabulary: The definitions and example sentences must use the simple present tense and extremely simple core vocabulary while creating a clear visual picture.',
    ],
    Output_JSON_Structure: {
        word: '[Input Word]',
        definition: '[Input Word (Capitalized)] means...',
        contextual_layout: {
            prefix: 'If you say ',
            highlight_green: '[A simple, real-life example sentence using the word]',
            transition: ', it means ',
            normal_text: '[A plain-English paraphrase of the scene or meaning of the green example sentence]',
        },
    },
    Example: {
        Input: 'tomato',
        Output: {
            word: 'tomato',
            definition: 'Tomato means a round, soft fruit with red skin and many seeds inside.',
            contextual_layout: {
                prefix: 'If you say ',
                highlight_green: 'I like to eat tomato soup.',
                transition: ', it means ',
                normal_text: 'you enjoy drinking a warm, red liquid made from this fruit.',
            },
        },
    },
};

const _KIDS_DEF_USER_LS_KEY = 'word_dict_kids_def_user_v1';
let _kidsDefEntries = {};
let _kidsDefPromise = null;
let _userKidsDef = null;

function _kidsDefKey(word) {
    return String(word || '').toLowerCase().trim();
}

function _loadUserKidsDef() {
    if (_userKidsDef) return _userKidsDef;
    _userKidsDef = {};
    try {
        const raw = localStorage.getItem(_KIDS_DEF_USER_LS_KEY);
        if (raw) Object.assign(_userKidsDef, JSON.parse(raw));
    } catch { /* ignore */ }
    return _userKidsDef;
}

function setUserKidsDef(word, entry) {
    const cache = _loadUserKidsDef();
    cache[_kidsDefKey(word)] = entry;
    try {
        const keys = Object.keys(cache);
        if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(k => delete cache[k]);
        localStorage.setItem(_KIDS_DEF_USER_LS_KEY, JSON.stringify(cache));
    } catch (e) {
        console.warn('Kids def user cache write failed:', e.message);
    }
}

function getKidsDefFileName(vocabFileName) {
    const base = String(vocabFileName || '').replace(/\.json$/i, '');
    if (!base) return null;
    return `kids_def_${base}.json`;
}

async function loadKidsDefSidecar(vocabFileName) {
    _kidsDefEntries = {};
    _kidsDefPromise = (async () => {
        const fileName = getKidsDefFileName(vocabFileName);
        if (!fileName) return;
        try {
            const res = await fetch(`date/${encodeURIComponent(fileName)}?t=${Date.now()}`);
            if (!res.ok) {
                console.log(`Kids 英英释义 sidecar 未找到: date/${fileName}`);
                return;
            }
            const json = await res.json();
            _kidsDefEntries = json.entries || json;
            const count = Object.keys(_kidsDefEntries).length;
            console.log(`Kids 英英释义已加载: date/${fileName} (${count} 条)`);
        } catch (e) {
            console.warn('Kids 英英释义加载失败:', e.message);
        }
    })();
    return _kidsDefPromise;
}

async function ensureKidsDefReady() {
    if (_kidsDefPromise) await _kidsDefPromise;
}

function getKidsDefEntry(word) {
    const key = _kidsDefKey(word);
    const user = _loadUserKidsDef()[key];
    if (user) return user;
    return _kidsDefEntries[key] ?? null;
}

function _wrapDefWordsPlain(escapedText, greenFirstWord = false) {
    if (!escapedText) return '';
    let isFirst = true;
    return escapedText.replace(/\b([A-Za-z][A-Za-z'-]*)\b/g, (m, w) => {
        const green = greenFirstWord && isFirst;
        isFirst = false;
        const cls = green ? 'wm-def-word wm-kids-highlight-green' : 'wm-def-word';
        return `<span class="${cls}" data-word="${escapeHtml(w)}" title="点击发音">${m}</span>`;
    });
}

function formatKidsDefHtml(entry) {
    if (!entry || !entry.definition) return '';

    const ctx = entry.contextual_layout || {};
    let html = _wrapDefWordsPlain(escapeHtml(entry.definition), true);

    const hasContext = ctx.highlight_green || ctx.normal_text;
    if (hasContext) {
        html += '<div class="wm-kids-def-context">';
        html += escapeHtml(ctx.prefix || '');
        if (ctx.highlight_green) {
            const greenInner = _wrapDefWordsPlain(escapeHtml(ctx.highlight_green));
            html += `<span class="wm-kids-highlight-green">${greenInner}</span>`;
        }
        html += escapeHtml(ctx.transition || '');
        html += _wrapDefWordsPlain(escapeHtml(ctx.normal_text || ''));
        html += '</div>';
    }

    return html;
}

function getKidsDefDisplayHtml(word, fallbackDefHtml) {
    const entry = getKidsDefEntry(word);
    if (entry) return formatKidsDefHtml(entry);
    return fallbackDefHtml || '';
}

function buildKidsDefPrompt(word, originalDef, brief) {
    return JSON.stringify({
        ...KIDS_DEF_PROMPT,
        Task: `Generate JSON for the input word "${word}".`,
        Reference_from_dictionary: {
            original_definition: originalDef || '',
            brief_chinese: brief || '',
        },
    }, null, 2);
}

function parseKidsDefResponse(text, word) {
    let s = String(text || '').trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const obj = JSON.parse(s);
    if (!obj.definition || typeof obj.definition !== 'string') {
        throw new Error('missing definition');
    }
    const cl = obj.contextual_layout;
    if (!cl || typeof cl.highlight_green !== 'string') {
        throw new Error('missing contextual_layout.highlight_green');
    }
    return {
        word: obj.word || word,
        definition: obj.definition.trim(),
        contextual_layout: {
            prefix: cl.prefix ?? 'If you say ',
            highlight_green: cl.highlight_green.trim(),
            transition: cl.transition ?? ', it means ',
            normal_text: (cl.normal_text || '').trim(),
        },
    };
}

async function fetchKidsDefRegeneration({ word, def, brief }) {
    const prompt = buildKidsDefPrompt(word, def, brief);
    const res = await fetch(AI_CONFIG.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${AI_CONFIG.apiKey}`,
        },
        body: JSON.stringify({
            model: AI_CONFIG.model,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            max_tokens: 500,
            temperature: 0.3,
        }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const json = await res.json();
    const raw = (json.choices?.[0]?.message?.content || '').trim();
    return parseKidsDefResponse(raw, word);
}
