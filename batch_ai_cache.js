#!/usr/bin/env node
/**
 * 批量预生成 AI 单词讲解，写入 date/ai_cache_<词表名>.json
 * 前端加载词表时会自动读取该文件，用户「重新生成」会覆盖写入 localStorage。
 *
 * 用法:
 *   node batch_ai_cache.js                          # 默认 word(2800).json
 *   node batch_ai_cache.js date/word(2800).json
 *   node batch_ai_cache.js date/word(2800).json --limit 10 --roles sentences
 *   node batch_ai_cache.js --concurrency 3 --delay 300
 *   node batch_ai_cache.js --timeout 45          # 单次 API 超时秒数，默认 45
 *   node batch_ai_cache.js --no-retry            # 不自动重试失败项
 *
 * 环境变量:
 *   SILICONFLOW_API_KEY  优先使用；否则从 js/ai_config.js 读取 apiKey
 *
 * Prompt 逻辑与 js/ai_config.js 保持一致；修改 prompt 时请同步两处。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { splitAiCache } = require('./split_ai_cache');

const ROLE_IDS = ['sentences', 'age6', 'age9'];

function parseArgs(argv) {
    const opts = {
        vocabPath: null,
        outPath: null,
        roles: ROLE_IDS.slice(),
        concurrency: 15,
        delayMs: 400,
        offset: 0,
        limit: Infinity,
        resume: true,
        timeoutMs: 45000,
        autoRetry: true,
    };
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--roles') opts.roles = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
        else if (arg === '--concurrency') opts.concurrency = Math.max(1, parseInt(argv[++i], 10) || 2);
        else if (arg === '--delay') opts.delayMs = Math.max(0, parseInt(argv[++i], 10) || 0);
        else if (arg === '--offset') opts.offset = Math.max(0, parseInt(argv[++i], 10) || 0);
        else if (arg === '--limit') opts.limit = Math.max(1, parseInt(argv[++i], 10) || 1);
        else if (arg === '--timeout') opts.timeoutMs = Math.max(5, parseInt(argv[++i], 10) || 45) * 1000;
        else if (arg === '--no-resume') opts.resume = false;
        else if (arg === '--no-retry') opts.autoRetry = false;
        else if (arg.startsWith('--')) throw new Error(`未知参数: ${arg}`);
        else positional.push(arg);
    }
    if (positional[0]) opts.vocabPath = positional[0];
    if (positional[1]) opts.outPath = positional[1];
    return opts;
}

function loadAiModule() {
    const file = path.join(__dirname, 'js/ai_config.js');
    let src = fs.readFileSync(file, 'utf8');
    // 去掉浏览器端缓存与 fetchAiExplanation，保留 prompt 与校验逻辑
    src = src.replace(/\/\/ --- 结果缓存 ---[\s\S]*?let _aiLogBuffer = '';\s*/s, '');
    src = src.replace(/async function fetchAiExplanation[\s\S]*$/s, '');
    const sandbox = { module: { exports: {} }, console };
    vm.runInNewContext(`${src}\nmodule.exports = { AI_CONFIG, AI_ROLES, buildEntry, validateSentencesOutput };`, sandbox);
    return sandbox.module.exports;
}

function getApiKey(aiConfig) {
    if (process.env.SILICONFLOW_API_KEY) return process.env.SILICONFLOW_API_KEY;
    if (aiConfig?.AI_CONFIG?.apiKey) return aiConfig.AI_CONFIG.apiKey;
    throw new Error('请设置环境变量 SILICONFLOW_API_KEY，或在 js/ai_config.js 中配置 apiKey');
}

function cacheKey(word, roleId) {
    return `${String(word).toLowerCase().trim()}|${roleId}`;
}

function defaultOutPath(vocabPath) {
    const base = path.basename(vocabPath).replace(/\.json$/i, '');
    return path.join(path.dirname(vocabPath), `ai_cache_${base}.json`);
}

function loadOutput(outPath) {
    if (!fs.existsSync(outPath)) {
        return { meta: {}, entries: {} };
    }
    const json = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    if (json && json.entries && typeof json.entries === 'object') return json;
    return { meta: {}, entries: json || {} };
}

function saveOutput(outPath, payload) {
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestAi({ endpoint, apiKey, model, messages, timeoutMs }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                stream: false,
                max_tokens: 900,
                temperature: 0.25,
                top_p: 0.85,
                presence_penalty: 0,
                frequency_penalty: 0.2,
            }),
            signal: controller.signal,
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`);
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

async function fetchRoleExplanation(ai, apiKey, task, timeoutMs) {
    const { word, phonetic, def, brief, roleId } = task;
    const role = ai.AI_ROLES.find(r => r.id === roleId);
    if (!role) throw new Error(`未知 role: ${roleId}`);
    const prompt = role.buildPrompt(word, phonetic, def, brief);
    const { endpoint, model } = ai.AI_CONFIG;
    const req = (messages) => requestAi({ endpoint, apiKey, model, messages, timeoutMs });

    let fullText = await req([{ role: 'user', content: prompt }]);
    if (!fullText) throw new Error('空响应');

    if (roleId === 'sentences') {
        const check = ai.validateSentencesOutput(fullText, word);
        if (!check.ok) {
            fullText = await req([
                { role: 'user', content: prompt },
                { role: 'assistant', content: fullText },
                {
                    role: 'user',
                    content:
                        '你上一版有格式或语法问题。请只输出修正后的最终版本：保留 1-4 编号、每句含中文全角括号翻译、句子语法自然，不要任何解释。',
                },
            ]);
            if (!fullText) throw new Error('修正后空响应');
        }
    }
    return fullText;
}

function extractWordRow(row) {
    return {
        word: (row[0] || '').trim(),
        phonetic: (row[1] || '').trim(),
        def: (row[2] || '').trim(),
        brief: (row[3] || '').trim(),
    };
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
                await worker(task, i);
                ok++;
            } catch (err) {
                failed.push(task);
                console.error(`[FAIL] ${task.label}: ${err.message}`);
            }
        }
    }

    const workers = Array.from({ length: concurrency }, () => runner());
    await Promise.all(workers);
    return { ok, fail: failed.length, failed };
}

async function runBatch(tasks, opts, ai, apiKey, payload, outPath, label) {
    if (tasks.length === 0) return { ok: 0, fail: 0, failed: [] };

    console.log(`\n--- ${label}: ${tasks.length} 条 (并发 ${opts.concurrency}, 超时 ${opts.timeoutMs / 1000}s) ---`);
    const started = Date.now();
    let done = 0;

    const result = await runPool(tasks, opts.concurrency, async (task) => {
        if (opts.delayMs > 0) await sleep(opts.delayMs);
        const text = await fetchRoleExplanation(ai, apiKey, task, opts.timeoutMs);
        payload.entries[task.key] = text;
        done++;
        if (done % 5 === 0 || done === tasks.length) saveOutput(outPath, payload);
        const pct = ((done / tasks.length) * 100).toFixed(1);
        console.log(`[${done}/${tasks.length}] ${pct}% ${task.label}`);
    });

    const sec = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`${label} 完成: 成功 ${result.ok}, 失败 ${result.fail}, 耗时 ${sec}s`);
    return result;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const ai = loadAiModule();
    const apiKey = getApiKey(ai);

    const vocabPath = opts.vocabPath
        ? path.resolve(opts.vocabPath)
        : path.join(__dirname, 'date/word(2800).json');
    const outPath = opts.outPath ? path.resolve(opts.outPath) : defaultOutPath(vocabPath);

    const vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
    if (!vocab?.data?.length) throw new Error(`词表无数据: ${vocabPath}`);

    const rows = vocab.data.slice(opts.offset, opts.offset + opts.limit);
    const payload = loadOutput(outPath);
    payload.meta = {
        vocab: path.basename(vocabPath),
        roles: opts.roles,
        updatedAt: new Date().toISOString(),
    };

    const tasks = [];
    for (const row of rows) {
        const entry = extractWordRow(row);
        if (!entry.word) continue;
        for (const roleId of opts.roles) {
            const key = cacheKey(entry.word, roleId);
            if (opts.resume && payload.entries[key]) continue;
            tasks.push({ ...entry, roleId, key, label: `${entry.word} [${roleId}]` });
        }
    }

    console.log(`词表: ${vocabPath} (${rows.length} 词)`);
    console.log(`输出: ${outPath}`);
    console.log(`待生成: ${tasks.length} 条 (并发 ${opts.concurrency}, 间隔 ${opts.delayMs}ms, 超时 ${opts.timeoutMs / 1000}s)`);
    if (tasks.length === 0) {
        console.log('无需生成，已全部缓存。');
        try {
            const split = splitAiCache(vocabPath, outPath);
            console.log(`已切分缓存: ${split.manifest.chunkCount} 片`);
        } catch (e) {
            console.warn('缓存切分跳过:', e.message);
        }
        return;
    }

    const started = Date.now();
    let result = await runBatch(tasks, opts, ai, apiKey, payload, outPath, '首轮');

    if (result.failed.length && opts.autoRetry) {
        result = await runBatch(result.failed, opts, ai, apiKey, payload, outPath, '重试失败项');
    }

    if (result.failed.length) {
        console.log('\n仍未成功的条目:');
        result.failed.forEach(t => console.log(`  - ${t.label}`));
    }

    payload.meta.updatedAt = new Date().toISOString();
    payload.meta.entryCount = Object.keys(payload.entries).length;
    saveOutput(outPath, payload);

    try {
        const split = splitAiCache(vocabPath, outPath);
        console.log(`\n已切分缓存: ${split.manifest.chunkCount} 片 → ${split.baseName}.chunk-*.json`);
    } catch (e) {
        console.warn('缓存切分跳过:', e.message);
    }

    const sec = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\n总计耗时 ${sec}s，缓存条目: ${Object.keys(payload.entries).length}`);
}

main().catch(err => {
    console.error(err.message || err);
    process.exit(1);
});
