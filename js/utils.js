// ==========================================
// 单词表排版工具 - 核心工具库 (纯函数)
// ==========================================

// 1. CSV 解析逻辑
function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let insideQuote = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (insideQuote && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                insideQuote = !insideQuote;
            }
        } else if (char === ',' && !insideQuote) {
            currentRow.push(currentCell.trim());
            currentCell = '';
        } else if ((char === '\n' || char === '\r') && !insideQuote) {
            if (currentCell || currentRow.length > 0) {
                currentRow.push(currentCell.trim());
                rows.push(currentRow);
            }
            currentRow = [];
            currentCell = '';
            if (char === '\r' && nextChar === '\n') i++;
        } else {
            currentCell += char;
        }
    }
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
    }
    return rows;
}

// 2. 列类型与样式识别
function getColumnRole(headerText) {
    const h = (headerText || '').trim().toLowerCase();
    const hzh = (headerText || '').trim();
    if (h === 'word' || hzh === '单词' || h === 'word ') return 'word';
    if (h === 'phonetic' || h === 'pronunciation' || hzh.includes('音标') || hzh === '美音' || hzh === '英音') return 'phonetic';
    if (h === 'pos' || hzh.includes('词性') || h.includes('part of speech')) return 'pos';
    if (h === 'definition' || hzh === 'definition') return 'definition';
    if (hzh === '简明释义' || hzh.includes('简明释义')) return 'brief';
    return 'default';
}

function getColumnClass(role, isCombinedDef, isCombinedWordPhonetic) {
    if (isCombinedWordPhonetic) return 'col-word-phonetic-combined';
    if (isCombinedDef) return 'col-definition-combined';
    if (role === 'word') return 'col-word';
    if (role === 'phonetic') return 'col-phonetic';
    if (role === 'pos') return 'col-pos';
    return 'col-default';
}

// 3. 字符串与短语处理
function parseFirstPhrase(raw) {
    if (!raw || !String(raw).trim()) return { en: '', zh: '' };
    const first = String(raw).split(/\s*\|\s*/)[0].trim();
    const idx = first.search(/[：:]/);
    if (idx < 0) return { en: first, zh: '' };
    return { en: first.slice(0, idx).trim(), zh: first.slice(idx + 1).trim() };
}

function parseAllPhrases(raw) {
    if (!raw || !String(raw).trim()) return [];
    return String(raw).split(/\s*\|\s*/).map(entry => {
        entry = entry.trim();
        if (!entry) return null;
        const idx = entry.search(/[：:]/);
        if (idx < 0) return { en: entry, zh: '' };
        return { en: entry.slice(0, idx).trim(), zh: entry.slice(idx + 1).trim() };
    }).filter(Boolean);
}

function escapeHtml(text) {
    if (text == null) return '';
    const s = String(text);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapDefWords(html) {
    if (!html) return html;
    return html.replace(/\b([a-zA-Z][a-zA-Z0-9']*)\b/g, (_, word) => `<span class="def-word" data-word="${escapeHtml(word)}" title="点击发音">${_}</span>`);
}

function wrapBriefPos(html) {
    if (!html) return html;
    const posList = 'pron|adj|adv|det|n|v|prep|conj|interj|aux|art|num|int|vi|vt|pl|abbr';
    const re = new RegExp('\\b(' + posList + '\\.)(\\s*)', 'g');
    return html.replace(re, (_, posDot, space) => `<span class="brief-pos">${posDot}</span>${space}`);
}

function wrapDefWordsForModal(html) {
    if (!html) return html;
    return html.replace(/\b([a-zA-Z][a-zA-Z0-9']*)\b/g, (_, word) => `<span class="wm-def-word" data-word="${escapeHtml(word)}" title="点击发音">${_}</span>`);
}

function wrapBriefPosForModal(html) {
    if (!html) return html;
    const posList = 'pron|adj|adv|det|n|v|prep|conj|interj|aux|art|num|int|vi|vt|pl|abbr';
    const re = new RegExp('\\b(' + posList + '\\.)(\\s*)', 'g');
    return html.replace(re, (_, posDot, space) => `<span class="wm-brief-pos">${posDot}</span>${space}`);
}

// 4. 导出工具
function parsePageRange(input, total) {
    var s = (input || '').trim().toLowerCase();
    if (s === '全部' || s === 'all' || s === '*') {
        var arr = [];
        for (var i = 1; i <= total; i++) arr.push(i);
        return arr;
    }
    var pages = [];
    var parts = s.split(/[,，、\s]+/);
    for (var j = 0; j < parts.length; j++) {
        var p = parts[j].trim();
        var dash = p.indexOf('-');
        if (dash >= 0) {
            var start = parseInt(p.slice(0, dash), 10);
            var end = parseInt(p.slice(dash + 1), 10);
            if (!isNaN(start) && !isNaN(end)) {
                for (var k = Math.max(1, start); k <= Math.min(total, end); k++) pages.push(k);
            }
        } else {
            var n = parseInt(p, 10);
            if (!isNaN(n) && n >= 1 && n <= total) pages.push(n);
        }
    }
    return pages.filter((v, i, a) => a.indexOf(v) === i).sort((a,b) => a-b);
}

function dataUrlToU8(dataUrl) {
    var base64 = dataUrl.split(',')[1];
    if (!base64) return new Uint8Array(0);
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}