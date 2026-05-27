#!/usr/bin/env node
/**
 * 批量生成儿童英英释义 sidecar → date/kids_def_<词表名>.json
 *
 * 用法:
 *   node batch_kids_def.js
 *   node batch_kids_def.js date/word(2800).json --limit 10
 *   node batch_kids_def.js --offset 10 --limit 100 --concurrency 5 --timeout 45
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

function parseArgs(argv) {
    const opts = {
        vocabPath: null,
        outPath: null,
        concurrency: 5,
        delayMs: 300,
        offset: 0,
        limit: Infinity,
        resume: true,
        timeoutMs: 45000,
        autoRetry: true,
    };
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--concurrency') opts.concurrency = Math.max(1, parseInt(argv[++i], 10) || 5);
        else if (arg === '--delay') opts.delayMs = Math.max(0, parseInt(argv[++i], 10) || 0);
        else if (arg === '--offset') opts.offset = Math.max(0, parseInt(argv[++i], 10) || 0);
        else if (arg === '--limit') opts.limit = Math.max(1, parseInt(argv[++i], 10) || 1);
        else if (arg === '--timeout') opts.timeoutMs = Math.max(5, parseInt(argv[++i], 10) || 45) * 1000;
        else if (arg === '--no-resume') opts.resume = false;
        else if (arg === '--no-retry') opts.autoRetry = false;
        else if (arg.startsWith('--')) throw new Error(`未知参数: ${arg}`);
        else positional.push(arg);
    }
    if (positional[0]) opts.vocabPath = path.resolve(positional[0]);
    if (positional[1]) opts.outPath = path.resolve(positional[1]);
    return opts;
}

function loadAiConfig() {
    const file = path.join(__dirname, 'js/ai_config.js');
    let src = fs.readFileSync(file, 'utf8');
    src = src.replace(/\/\/ --- 结果缓存 ---[\s\S]*$/s, '');
    const sandbox = { module: { exports: {} }, console };
    vm.runInNewContext(`${src}\nmodule.exports = { AI_CONFIG };`, sandbox);
    return sandbox.module.exports;
}

function getApiKey(ai) {
    if (process.env.SILICONFLOW_API_KEY) return process.env.SILICONFLOW_API_KEY;
    if (ai?.AI_CONFIG?.apiKey) return ai.AI_CONFIG.apiKey;
    throw new Error('请设置 SILICONFLOW_API_KEY 或在 js/ai_config.js 配置 apiKey');
}

function defaultOutPath(vocabPath) {
    const base = path.basename(vocabPath).replace(/\.json$/i, '');
    return path.join(path.dirname(vocabPath), `kids_def_${base}.json`);
}

function entryKey(word) {
    return String(word).toLowerCase().trim();
}

function loadOutput(outPath) {
    if (!fs.existsSync(outPath)) return { meta: {}, entries: {} };
    const json = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    if (json?.entries) return json;
    return { meta: {}, entries: json || {} };
}

function saveOutput(outPath, payload) {
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function buildPrompt(word, originalDef, brief) {
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
    const cap = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    if (!obj.definition.trim().toLowerCase().startsWith(word.toLowerCase())
        && !obj.definition.trim().startsWith(cap)) {
        throw new Error('definition must start with word + means');
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

async function requestAi(ai, apiKey, prompt, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(ai.AI_CONFIG.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: ai.AI_CONFIG.model,
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                max_tokens: 500,
                temperature: 0.3,
            }),
            signal: controller.signal,
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
        }
        const json = await res.json();
        return (json.choices?.[0]?.message?.content || '').trim();
    } catch (err) {
        if (err.name === 'AbortError') throw new Error(`超时 (${Math.round(timeoutMs / 1000)}s)`);
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

async function runPool(tasks, concurrency, worker) {
    let index = 0;
    let ok = 0;
    const failed = [];
    async function runner() {
        while (true) {
            const i = index++;
            if (i >= tasks.length) return;
            const task = tasks[i];
            try {
                await worker(task);
                ok++;
            } catch (err) {
                failed.push(task);
                console.error(`[FAIL] ${task.label}: ${err.message}`);
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, () => runner()));
    return { ok, fail: failed.length, failed };
}

function extractRow(row) {
    return {
        word: (row[0] || '').trim(),
        phonetic: (row[1] || '').trim(),
        def: (row[2] || '').trim(),
        brief: (row[3] || '').trim(),
    };
}

async function runBatch(tasks, opts, ai, apiKey, payload, outPath, label) {
    if (!tasks.length) return { ok: 0, fail: 0, failed: [] };
    console.log(`\n--- ${label}: ${tasks.length} 条 (并发 ${opts.concurrency}, 超时 ${opts.timeoutMs / 1000}s) ---`);
    const started = Date.now();
    let done = 0;
    const result = await runPool(tasks, opts.concurrency, async (task) => {
        if (opts.delayMs > 0) await sleep(opts.delayMs);
        const raw = await requestAi(ai, apiKey, buildPrompt(task.word, task.def, task.brief), opts.timeoutMs);
        payload.entries[task.key] = parseKidsDefResponse(raw, task.word);
        done++;
        if (done % 5 === 0 || done === tasks.length) saveOutput(outPath, payload);
        console.log(`[${done}/${tasks.length}] ${task.label}`);
    });
    console.log(`${label} 完成: 成功 ${result.ok}, 失败 ${result.fail}, 耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return result;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const ai = loadAiConfig();
    const apiKey = getApiKey(ai);
    const vocabPath = opts.vocabPath || path.join(__dirname, 'date/word(2800).json');
    const outPath = opts.outPath || defaultOutPath(vocabPath);
    const vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
    const rows = vocab.data.slice(opts.offset, opts.offset + opts.limit);
    const payload = loadOutput(outPath);
    payload.meta = { vocab: path.basename(vocabPath), updatedAt: new Date().toISOString() };

    const tasks = [];
    for (const row of rows) {
        const { word, def, brief } = extractRow(row);
        if (!word) continue;
        const key = entryKey(word);
        if (opts.resume && payload.entries[key]) continue;
        tasks.push({ word, def, brief, key, label: word });
    }

    console.log(`词表: ${vocabPath}`);
    console.log(`输出: ${outPath}`);
    console.log(`待生成: ${tasks.length} 条`);
    if (!tasks.length) {
        console.log('无需生成，已全部缓存。');
        return;
    }

    const started = Date.now();
    let result = await runBatch(tasks, opts, ai, apiKey, payload, outPath, '首轮');
    if (result.failed.length && opts.autoRetry) {
        result = await runBatch(result.failed, opts, ai, apiKey, payload, outPath, '重试失败项');
    }
    if (result.failed.length) {
        console.log('\n仍未成功:');
        result.failed.forEach(t => console.log(`  - ${t.label}`));
    }

    payload.meta.updatedAt = new Date().toISOString();
    payload.meta.entryCount = Object.keys(payload.entries).length;
    saveOutput(outPath, payload);
    console.log(`\n总计耗时 ${((Date.now() - started) / 1000).toFixed(1)}s，条目: ${payload.meta.entryCount}`);
}

main().catch(err => {
    console.error(err.message || err);
    process.exit(1);
});
