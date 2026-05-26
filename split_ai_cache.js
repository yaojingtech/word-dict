#!/usr/bin/env node
/**
 * 将单体 ai_cache JSON 按词表顺序切分为多个 chunk + manifest
 * 前端只加载 manifest（~1KB），打开单词时按需加载对应分片（~200-300KB）
 *
 * 用法:
 *   node split_ai_cache.js
 *   node split_ai_cache.js date/word(2800).json
 *   node split_ai_cache.js date/word(2800).json --chunk-size 500
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CHUNK_SIZE = 500;

function parseArgs(argv) {
    const opts = { chunkSize: DEFAULT_CHUNK_SIZE, vocabPath: null, cachePath: null };
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--chunk-size') opts.chunkSize = Math.max(50, parseInt(argv[++i], 10) || DEFAULT_CHUNK_SIZE);
        else if (arg.startsWith('--')) throw new Error(`未知参数: ${arg}`);
        else positional.push(arg);
    }
    if (positional[0]) opts.vocabPath = path.resolve(positional[0]);
    if (positional[1]) opts.cachePath = path.resolve(positional[1]);
    return opts;
}

function defaultPaths(vocabPath) {
    const dir = path.dirname(vocabPath);
    const base = path.basename(vocabPath).replace(/\.json$/i, '');
    return {
        vocabPath,
        cachePath: path.join(dir, `ai_cache_${base}.json`),
        baseName: `ai_cache_${base}`,
        dir,
    };
}

function splitAiCache(vocabPath, cachePath, chunkSize = DEFAULT_CHUNK_SIZE) {
    if (!fs.existsSync(vocabPath)) throw new Error(`词表不存在: ${vocabPath}`);
    if (!fs.existsSync(cachePath)) throw new Error(`缓存不存在: ${cachePath}`);

    const paths = defaultPaths(vocabPath);
    const { baseName, dir } = paths;
    cachePath = cachePath || paths.cachePath;

    const vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const entries = cache.entries || cache;

    const wordToIndex = new Map();
    (vocab.data || []).forEach((row, i) => {
        const w = (row[0] || '').trim().toLowerCase();
        if (w && !wordToIndex.has(w)) wordToIndex.set(w, i);
    });

    const chunks = new Map();
    let orphan = 0;

    for (const [key, value] of Object.entries(entries)) {
        const word = key.split('|')[0];
        const idx = wordToIndex.get(word);
        if (idx === undefined) {
            orphan++;
            continue;
        }
        const chunkId = Math.floor(idx / chunkSize);
        if (!chunks.has(chunkId)) chunks.set(chunkId, {});
        chunks.get(chunkId)[key] = value;
    }

    const chunkIds = [...chunks.keys()].sort((a, b) => a - b);
    const files = [];

    for (const id of chunkIds) {
        const chunkFile = path.join(dir, `${baseName}.chunk-${String(id).padStart(3, '0')}.json`);
        fs.writeFileSync(chunkFile, JSON.stringify({ entries: chunks.get(id) }, null, 2), 'utf8');
        const kb = (fs.statSync(chunkFile).size / 1024).toFixed(1);
        const count = Object.keys(chunks.get(id)).length;
        files.push({ file: path.basename(chunkFile), kb, count });
    }

    const manifest = {
        version: 1,
        vocab: path.basename(vocabPath),
        baseName,
        chunkSize,
        chunkCount: chunkIds.length,
        entryCount: Object.keys(entries).length,
        updatedAt: new Date().toISOString(),
    };
    const manifestPath = path.join(dir, `${baseName}.manifest.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    return { manifest, manifestPath, files, orphan, baseName };
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    const vocabPath = opts.vocabPath || path.join(__dirname, 'date/word(2800).json');
    const paths = defaultPaths(vocabPath);
    const cachePath = opts.cachePath || paths.cachePath;

    const { manifest, manifestPath, files, orphan } = splitAiCache(vocabPath, cachePath, opts.chunkSize);

    console.log(`manifest: ${manifestPath}`);
    console.log(`分片: ${manifest.chunkCount} 个, 每片最多 ${manifest.chunkSize} 词, 共 ${manifest.entryCount} 条`);
    files.forEach(f => console.log(`  ${f.file}  ${f.kb} KB  (${f.count} 条)`));
    if (orphan) console.warn(`警告: ${orphan} 条未匹配词表，已跳过`);
}

if (require.main === module) {
    main();
}

module.exports = { splitAiCache, DEFAULT_CHUNK_SIZE };
