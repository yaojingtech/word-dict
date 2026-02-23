// ==========================================
// 单词表排版工具 - 渲染引擎 (render.js)
// ==========================================

function renderPages() {
    if (!allData || allData.length === 0) return;
    try {
        previewArea.innerHTML = '';
        const pageSize = Math.min(50, Math.max(5, parseInt(pageSizeInput.value, 10) || 10));
        const layoutClass = layoutSelect.value;
        const totalPages = Math.ceil(allData.length / pageSize);
        const displayColumns = buildDisplayColumns();

        rootStyles.setProperty('--table-font-size', (fontSizeInput.value || 14) + 'px');

        for (let i = 0; i < totalPages; i++) {
            const pageData = allData.slice(i * pageSize, (i + 1) * pageSize);
            const pageDiv = document.createElement('div');
            pageDiv.className = `page ${layoutClass}`;
            pageDiv.setAttribute('data-page-index', String(i));

            let tableHtml = '<div class="page-content"><table class="print-table"><thead><tr>';

            displayColumns.forEach(col => {
                const role = col.type === 'single' ? getColumnRole(col.header) : '';
                const cls = col.type === 'wordPhonetic' ? 'col-word-phonetic-combined' : col.type === 'combined' ? 'col-definition-combined' : getColumnClass(role, false, false);
                const headerText = col.type === 'wordPhonetic' ? '单词/音标' : col.type === 'combined' ? col.header : col.header;
                tableHtml += `<th class="${cls}">${escapeHtml(headerText)}</th>`;
            });
            tableHtml += '</tr></thead><tbody>';

            pageData.forEach((row, rowIdx) => {
                tableHtml += '<tr data-row-index="' + rowIdx + '">';
                displayColumns.forEach(col => {
                    if (col.type === 'wordPhonetic') {
                        const rawWord = (row[col.wordIdx] || '').trim();
                        const w = escapeHtml(rawWord);
                        const p = escapeHtml(row[col.phoneticIdx] || '').trim();
                        tableHtml += '<td class="col-word-phonetic-combined"><div class="cell-word-phonetic-wrap">';
                        if (w) tableHtml += `<div class="cell-word" data-word="${escapeHtml(rawWord)}" title="点击发音">${w}</div>`;
                        if (p) tableHtml += `<div class="cell-phonetic">${p}</div>`;
                        if (!w && !p) tableHtml += '<div class="cell-word">&nbsp;</div>';
                        tableHtml += '</div></td>';
                    } else if (col.type === 'combined') {
                        let def = escapeHtml(row[col.defIdx] || '').trim();
                        def = wrapDefWords(def);
                        let brief = escapeHtml(row[col.briefIdx] || '').trim();
                        const phrase = col.phraseIdx >= 0 ? parseFirstPhrase(row[col.phraseIdx]) : null;
                        if (phrase && (phrase.en || phrase.zh)) {
                            if (phrase.en) def += '<span class="phrase-append">' + escapeHtml(phrase.en) + '</span>';
                            if (phrase.zh) brief += '<span class="phrase-append">' + escapeHtml(phrase.zh) + '</span>';
                        }
                        brief = wrapBriefPos(brief);
                        tableHtml += '<td class="col-definition-combined">';
                        if (def) tableHtml += `<div class="def-block">${def}</div>`;
                        if (brief) tableHtml += `<div class="brief-block">${brief}</div>`;
                        if (!def && !brief) tableHtml += '<div class="def-block">&nbsp;</div>';
                        tableHtml += '</td>';
                    } else {
                        const role = getColumnRole(col.header);
                        const cls = getColumnClass(role, false, false);
                        let content = escapeHtml(row[col.index] || '');
                        const rawVal = (row[col.index] || '').trim();
                        if (role === 'pos' && content && content.length < 12) {
                            content = '<span class="pos-tag">' + content + '</span>';
                        }
                        const wordSpeakClass = role === 'word' && rawVal ? ' word-speak' : '';
                        const dataWord = role === 'word' && rawVal ? ` data-word="${escapeHtml(rawVal)}" title="点击发音"` : '';
                        tableHtml += `<td class="${cls}${wordSpeakClass}"${dataWord}>${content}</td>`;
                    }
                });
                tableHtml += '</tr>';
            });

            tableHtml += '</tbody></table></div>';
            var unitNum = Math.ceil((i + 1) / 2);
            var subNum = (i % 2) + 1;
            var unitLabel = 'U' + unitNum + '-' + subNum;
            tableHtml += `<div class="page-footer">${unitLabel} &nbsp; - 第 ${i + 1} 页 / 共 ${totalPages} 页 -</div>`;

            pageDiv.innerHTML = tableHtml;
            var baseFontSize = parseFloat(fontSizeInput.value, 10) || 14;
            pageDiv.style.setProperty('--table-font-size', baseFontSize + 'px');
            pageDiv.setAttribute('data-font-size', baseFontSize);

            var wrap = document.createElement('div');
            wrap.className = 'page-export-wrap';
            wrap.appendChild(pageDiv);
            previewArea.appendChild(wrap);

            requestAnimationFrame(() => requestAnimationFrame(() => updatePageBriefClamp(pageDiv)));
        }
        if (typeof onPagesRendered === 'function') onPagesRendered();
    } catch (err) {
        console.error(err);
        previewArea.innerHTML = `<div class="page" style="color:#c00; padding:20px;">渲染出错：${err.message || err}</div>`;
    }
}

function updatePageBriefClamp(pageEl) {
    if (!pageEl || !pageEl.querySelector) return;
    var content = pageEl.querySelector('.page-content');
    if (!content) return;
    pageEl.classList.remove('page-brief-clamped');
    content.offsetHeight;
    var maxH = parseFloat(getComputedStyle(content).maxHeight);
    if (!maxH || isNaN(maxH)) return;
    var needClamp = content.scrollHeight > maxH;
    if (needClamp) pageEl.classList.add('page-brief-clamped');
}