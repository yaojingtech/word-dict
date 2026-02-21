// ==========================================
// 单词表排版工具 - 列配置引擎 (columns.js)
// ==========================================

function getDefinitionBriefIndices() {
    let defIdx = -1, briefIdx = -1;
    headers.forEach((h, i) => {
        if (getColumnRole(h) === 'definition') defIdx = i;
        if (getColumnRole(h) === 'brief') briefIdx = i;
    });
    return { defIdx, briefIdx };
}

function getWordPhoneticIndices() {
    let wordIdx = -1, phoneticIdx = -1;
    headers.forEach((h, i) => {
        if (getColumnRole(h) === 'word') wordIdx = i;
        if (getColumnRole(h) === 'phonetic') phoneticIdx = i;
    });
    return { wordIdx, phoneticIdx };
}

function getPhraseColIndex() {
    const idx = headers.findIndex(h => (h || '').trim() === '精选短语');
    return idx >= 0 && visibleColumns.includes(idx) ? idx : -1;
}

function initColumnControls() {
    columnToggles.innerHTML = '';
    const { defIdx, briefIdx } = getDefinitionBriefIndices();
    const { wordIdx, phoneticIdx } = getWordPhoneticIndices();
    const hasDefBrief = defIdx >= 0 && briefIdx >= 0;
    const hasWordPhonetic = wordIdx >= 0 && phoneticIdx >= 0;
    const used = new Set();
    if (hasDefBrief) used.add(defIdx).add(briefIdx);
    if (hasWordPhonetic) used.add(wordIdx).add(phoneticIdx);

    headers.forEach((header, index) => {
        if (used.has(index)) return;
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = visibleColumns.includes(index);
        checkbox.onchange = () => {
            if (checkbox.checked) {
                if (!visibleColumns.includes(index)) visibleColumns.push(index);
            } else {
                visibleColumns = visibleColumns.filter(i => i !== index);
            }
            visibleColumns.sort((a, b) => a - b);
            renderPages(); // 触发重新渲染
        };
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(header || `列 ${index + 1}`));
        columnToggles.appendChild(label);
    });

    if (hasWordPhonetic) {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.onchange = () => {
            if (checkbox.checked) {
                if (!visibleColumns.includes(wordIdx)) visibleColumns.push(wordIdx);
                if (!visibleColumns.includes(phoneticIdx)) visibleColumns.push(phoneticIdx);
            } else {
                visibleColumns = visibleColumns.filter(i => i !== wordIdx && i !== phoneticIdx);
            }
            visibleColumns.sort((a, b) => a - b);
            renderPages();
        };
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode('单词+音标'));
        columnToggles.appendChild(label);
    }

    if (hasDefBrief) {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.onchange = () => {
            if (checkbox.checked) {
                if (!visibleColumns.includes(defIdx)) visibleColumns.push(defIdx);
                if (!visibleColumns.includes(briefIdx)) visibleColumns.push(briefIdx);
            } else {
                visibleColumns = visibleColumns.filter(i => i !== defIdx && i !== briefIdx);
            }
            visibleColumns.sort((a, b) => a - b);
            renderPages();
        };
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode('释义 (definition + 简明释义)'));
        columnToggles.appendChild(label);
    }
}

function buildDisplayColumns() {
    if (!headers || headers.length === 0) return visibleColumns.map((colIndex) => ({ type: 'single', index: colIndex, header: (headers && headers[colIndex]) || ('列' + (colIndex + 1)) }));
    const { defIdx, briefIdx } = getDefinitionBriefIndices();
    const { wordIdx, phoneticIdx } = getWordPhoneticIndices();
    const phraseIdx = getPhraseColIndex();
    const mergeDefBrief = defIdx >= 0 && briefIdx >= 0 && visibleColumns.includes(defIdx) && visibleColumns.includes(briefIdx);
    const mergeWordPhonetic = wordIdx >= 0 && phoneticIdx >= 0 && visibleColumns.includes(wordIdx) && visibleColumns.includes(phoneticIdx);
    const result = [];
    let mergedDefBrief = false, mergedWordPhonetic = false;

    visibleColumns.forEach(colIndex => {
        if ((headers[colIndex] || '').trim() === '精选短语') return;
        if (mergeWordPhonetic && colIndex === phoneticIdx && mergedWordPhonetic) return;
        if (mergeDefBrief && colIndex === briefIdx && mergedDefBrief) return;
        if (mergeWordPhonetic && colIndex === wordIdx) {
            result.push({ type: 'wordPhonetic', wordIdx, phoneticIdx, header: '单词/音标' });
            mergedWordPhonetic = true;
            return;
        }
        if (mergeWordPhonetic && colIndex === phoneticIdx) return;
        if (mergeDefBrief && colIndex === defIdx) {
            result.push({ type: 'combined', defIdx, briefIdx, phraseIdx, header: '释义' });
            mergedDefBrief = true;
            return;
        }
        if (mergeDefBrief && colIndex === briefIdx) return;
        result.push({ type: 'single', index: colIndex, header: headers[colIndex] });
    });
    return result;
}