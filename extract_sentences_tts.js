#!/usr/bin/env node
/**
 * 从 AI 缓存中提取「例句达人」全部英文例句，供后续批量 TTS 使用。
 * 提取逻辑与 js/modal.js 中 extractSentenceForTts / data-sentence 一致。
 *
 * 用法:
 *   node extract_sentences_tts.js
 *   node extract_sentences_tts.js date/ai_cache_word(2800).json
 *   node extract_sentences_tts.js date/ai_cache_word(2800).json --out date/sentences_tts.json
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
    const opts = { cachePath: null, outPath: null };
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--out') opts.outPath = argv[++i];
        else if (arg.startsWith('--')) throw new Error(`未知参数: ${arg}`);
        else positional.push(arg);
    }
    if (positional[0]) opts.cachePath = positional[0];
    return opts;
}

function defaultCachePath() {
    return path.join(__dirname, 'date/ai_cache_word(2800).json');
}

function defaultOutPath(cachePath) {
    const base = path.basename(cachePath).replace(/^ai_cache_/, '').replace(/\.json$/i, '');
    return path.join(path.dirname(cachePath), `sentences_tts_${base}.json`);
}

/** 与 js/modal.js extractSentenceForTts 保持一致 */
function extractSentenceForTts(line) {
    let s = line.replace(/^\d+\.\s*/, '');
    s = s.replace(/\*\*(.+?)\*\*/g, '$1');
    s = s.replace(/\s*[（(][^）)]*[）)]\s*$/, '').trim();
    return s;
}

function parseScene(line) {
    const m = String(line || '').match(/【([^】]+)】/);
    return m ? m[1].trim() : '';
}

function extractFromSentencesText(word, text) {
    const lines = String(text || '').split('\n');
    const items = [];
    let currentScene = '';

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;

        if (/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u.test(line) || /【[^】]+】/.test(line)) {
            const scene = parseScene(line);
            if (scene) currentScene = scene;
            continue;
        }

        if (!/^\d+\.\s+/.test(line)) continue;

        const numMatch = line.match(/^(\d+)\./);
        const lineNo = numMatch ? parseInt(numMatch[1], 10) : items.length + 1;
        const sentence = extractSentenceForTts(line);
        if (!sentence) continue;

        items.push({
            key: `${word}|sentences|${lineNo}`,
            word,
            line: lineNo,
            scene: currentScene,
            sentence,
        });
    }

    return items;
}

function loadCacheEntries(cachePath) {
    const json = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return json.entries || json;
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    const cachePath = opts.cachePath
        ? path.resolve(opts.cachePath)
        : defaultCachePath();
    const outPath = opts.outPath
        ? path.resolve(opts.outPath)
        : defaultOutPath(cachePath);

    if (!fs.existsSync(cachePath)) {
        console.error(`缓存文件不存在: ${cachePath}`);
        process.exit(1);
    }

    console.log(`读取: ${cachePath}`);
    const entries = loadCacheEntries(cachePath);

    const items = [];
    const words = new Set();

    for (const [key, text] of Object.entries(entries)) {
        if (!key.endsWith('|sentences')) continue;
        const word = key.slice(0, -('|sentences'.length));
        words.add(word);
        items.push(...extractFromSentencesText(word, text));
    }

    items.sort((a, b) => {
        if (a.word !== b.word) return a.word.localeCompare(b.word);
        return a.line - b.line;
    });

    const sentences = items.map(it => it.sentence);

    const output = {
        meta: {
            source: path.relative(__dirname, cachePath),
            role: 'sentences',
            wordCount: words.size,
            sentenceCount: items.length,
            extractedAt: new Date().toISOString(),
            note: 'items 含 word/line/scene 便于回绑 🔊 按钮；sentences 为纯英文例句数组，一行一条。',
        },
        items,
        sentences,
    };

    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

    console.log(`单词数: ${words.size}`);
    console.log(`例句数: ${items.length}`);
    console.log(`已写入: ${outPath}`);
    if (items.length) {
        console.log('示例:');
        items.slice(0, 3).forEach(it => {
            console.log(`  [${it.word} #${it.line}] ${it.sentence}`);
        });
    }
}

main();
