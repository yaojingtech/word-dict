// ==========================================
// 智能生成单词条目模块 (ai_generate.js)
// 依赖: ai_config.js (AI_CONFIG), utils.js (escapeHtml)
// 全局变量: allData, headers, visibleColumns (main.js), renderPages, initColumnControls (render/columns.js)
// ==========================================

const GEN_BATCH_SIZE = 50; // 每批并发数

let _genResults = []; // { word, status, phonetic, definition, brief, phrases, error }
let _genAborted = false;

// --- 模态框开关 ---
function openGenModal() {
    const overlay = document.getElementById('genModalOverlay');
    if (!overlay) return;
    _genResults = [];
    _genAborted = false;
    document.getElementById('genWordsInput').value = '';
    document.getElementById('genProgress').innerHTML = '';
    document.getElementById('genProgress').style.display = 'none';
    document.getElementById('genFooter').style.display = 'none';
    document.getElementById('genStatusText').textContent = '';
    const startBtn = document.getElementById('genStartBtn');
    if (startBtn) { startBtn.disabled = false; startBtn.textContent = '🚀 开始生成'; }
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('genWordsInput')?.focus(), 50);
}

function closeGenModal() {
    _genAborted = true;
    const overlay = document.getElementById('genModalOverlay');
    if (overlay) {
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
}

// --- 单词解析：支持换行、英文逗号、中文逗号 ---
function parseWordsInput(text) {
    return text
        .split(/[\n,，]+/)
        .map(w => w.trim())
        .filter(w => w.length > 0)
        .filter((w, i, arr) => arr.findIndex(x => x.toLowerCase() === w.toLowerCase()) === i);
}

// --- AI 请求：为单个单词生成结构化词条 ---
async function fetchWordEntry(word) {
    const prompt = `你是一位专业的青少年英汉词典编辑。请为英文单词 "${word}" 生成一条标准词典条目。

严格按照以下 JSON 格式返回，不要有任何多余的文字、代码块标记或解释：
{
  "phonetic": "美式音标，格式如 / wɜːrd /",
  "definition": "英文释义，简明扼要，1-2句话",
  "brief": "中文释义，包含词性标注，例如：n. 单词；词语 v. 措辞，表达",
  "phrases": "精选2-3个最常用短语搭配，格式：英文短语: 中文释义 | 英文短语: 中文释义（若无常用搭配则填空字符串）"
}`;

    console.group(`🤖 AI生成词条 · ${word}`);
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
            stream: false,
            max_tokens: 450,
            temperature: 0.3,
        }),
    });

    if (!res.ok) { console.groupEnd(); throw new Error(`HTTP ${res.status} ${res.statusText}`); }

    const data = await res.json();
    const content = (data.choices?.[0]?.message?.content || '').trim();

    console.log('%c📥 Response', 'color:#2ea043;font-weight:bold');
    console.log(content);
    console.groupEnd();

    // 容忍 markdown 代码块包裹
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 未返回有效 JSON，请重试');
    return JSON.parse(jsonMatch[0]);
}

// --- 进度条目 DOM 操作 ---
function createProgressItem(word, index) {
    const item = document.createElement('div');
    item.className = 'gen-item gen-item-pending';
    item.dataset.index = index;
    item.innerHTML = `
        <div class="gen-item-header">
            <span class="gen-item-word">${escapeHtml(word)}</span>
            <span class="gen-item-status">⏳ 等待中</span>
        </div>
        <div class="gen-item-preview"></div>`;
    return item;
}

function getItemEl(progressEl, index) {
    return progressEl.querySelector(`[data-index="${index}"]`);
}

function setItemLoading(itemEl) {
    itemEl.classList.remove('gen-item-pending', 'gen-item-done', 'gen-item-error');
    itemEl.classList.add('gen-item-loading');
    itemEl.querySelector('.gen-item-status').textContent = '生成中…';
    itemEl.querySelector('.gen-item-preview').innerHTML = '';
}

// --- 选中状态管理 ---
function getSelectedIndices() {
    return Array.from(
        document.querySelectorAll('#genProgress .gen-item-done.gen-item-selected')
    ).map(el => parseInt(el.dataset.index, 10));
}

function updateSelectedCount() {
    const total    = document.querySelectorAll('#genProgress .gen-item-done').length;
    const selected = document.querySelectorAll('#genProgress .gen-item-done.gen-item-selected').length;
    const el = document.getElementById('genSelectedCount');
    if (el) el.textContent = `已选 ${selected} / ${total}`;
    const replBtn = document.getElementById('genReplaceBtn');
    const appBtn  = document.getElementById('genAppendBtn');
    if (replBtn) replBtn.textContent = `替换词库（${selected} 个）`;
    if (appBtn)  appBtn.textContent  = `叠加词库（${selected} 个）`;
}

function toggleItemSelected(itemEl) {
    if (!itemEl.classList.contains('gen-item-done')) return;
    itemEl.classList.toggle('gen-item-selected');
    updateSelectedCount();
}

function setItemDone(itemEl, result) {
    itemEl.classList.remove('gen-item-loading');
    itemEl.classList.add('gen-item-done', 'gen-item-selected'); // 默认选中
    itemEl.querySelector('.gen-item-status').textContent = '✅ 完成';
    const preview = itemEl.querySelector('.gen-item-preview');
    preview.innerHTML = `
        ${result.phonetic ? `<span class="gen-item-phonetic">${escapeHtml(result.phonetic)}</span>` : ''}
        ${result.brief    ? `<span class="gen-item-brief">${escapeHtml(result.brief)}</span>` : ''}
        ${result.phrases  ? `<span class="gen-item-phrases">${escapeHtml(result.phrases)}</span>` : ''}`;
}

function setItemError(itemEl, errMsg) {
    itemEl.classList.remove('gen-item-loading');
    itemEl.classList.add('gen-item-error');
    itemEl.querySelector('.gen-item-status').textContent = '❌ 失败';
    itemEl.querySelector('.gen-item-preview').innerHTML =
        `<span class="gen-item-error-msg">${escapeHtml(errMsg)}</span>`;
}

// --- 更新顶部状态文字 ---
function updateStatusText(statusEl, total) {
    const done  = _genResults.filter(r => r.status === 'done').length;
    const error = _genResults.filter(r => r.status === 'error').length;
    const running = done + error;
    statusEl.textContent = `进度：${running} / ${total}（成功 ${done}，失败 ${error}）`;
}

// --- 生成主流程（批量并发） ---
async function startGeneration() {
    const inputEl   = document.getElementById('genWordsInput');
    const startBtn  = document.getElementById('genStartBtn');
    const statusEl  = document.getElementById('genStatusText');
    const progressEl = document.getElementById('genProgress');
    const footerEl  = document.getElementById('genFooter');

    const words = parseWordsInput(inputEl.value);
    if (words.length === 0) { alert('请至少输入一个单词'); return; }

    _genResults = words.map(w => ({ word: w, status: 'pending' }));
    _genAborted = false;

    startBtn.disabled = true;
    startBtn.textContent = '⏳ 生成中…';
    progressEl.innerHTML = '';
    progressEl.style.display = '';
    footerEl.style.display = 'none';
    statusEl.textContent = `共 ${words.length} 个单词，开始生成…`;

    // 创建全部进度条目（预先占位）
    words.forEach((word, i) => progressEl.appendChild(createProgressItem(word, i)));

    // 分批并发，每批 GEN_BATCH_SIZE 个
    for (let batchStart = 0; batchStart < words.length; batchStart += GEN_BATCH_SIZE) {
        if (_genAborted) break;

        const batchEnd = Math.min(batchStart + GEN_BATCH_SIZE, words.length);
        const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, j) => batchStart + j);

        // 批内全部标记为"生成中"
        batchIndices.forEach(i => setItemLoading(getItemEl(progressEl, i)));

        // 并发执行本批
        await Promise.allSettled(
            batchIndices.map(i => {
                const word = words[i];
                const itemEl = getItemEl(progressEl, i);

                return fetchWordEntry(word)
                    .then(result => {
                        _genResults[i] = { word, status: 'done', ...result };
                        setItemDone(itemEl, result);
                    })
                    .catch(err => {
                        _genResults[i] = { word, status: 'error', error: err.message };
                        setItemError(itemEl, err.message);
                    })
                    .finally(() => updateStatusText(statusEl, words.length));
            })
        );
    }

    startBtn.disabled = false;
    startBtn.textContent = '🚀 重新生成';

    const successCount = _genResults.filter(r => r.status === 'done').length;
    if (successCount > 0) {
        footerEl.style.display = '';
        updateSelectedCount();
    } else {
        statusEl.textContent += ' · 所有单词生成失败，请检查网络或 API 配置';
    }
}

// --- 确保 headers/visibleColumns 已初始化 ---
function ensureDataInitialized() {
    const DEFAULT_HEADERS = ['单词', '美音', 'definition', '简明释义', '精选短语'];

    // headers 未设置时，用默认值初始化
    if (!headers || headers.length === 0) {
        headers = DEFAULT_HEADERS.slice();
    }

    // visibleColumns 未设置时，全列可见
    if (!visibleColumns || visibleColumns.length === 0) {
        visibleColumns = headers.map((_, i) => i);
    }

    // 更新列控件（含"显示列"复选框区域）
    if (typeof initColumnControls === 'function') initColumnControls();
}

// --- 将生成结果转为行数组（仅选中项）---
function buildNewRows() {
    ensureDataInitialized();
    const selectedIdx = new Set(getSelectedIndices());
    return _genResults
        .filter((r, i) => r.status === 'done' && selectedIdx.has(i))
        .map(r => {
            const row = new Array(headers.length).fill('');
            headers.forEach((h, idx) => {
                switch (h) {
                    case '单词':                              row[idx] = r.word        || ''; break;
                    case '美音': case '英音': case '音标':   row[idx] = r.phonetic    || ''; break;
                    case 'definition':                        row[idx] = r.definition  || ''; break;
                    case '简明释义':                          row[idx] = r.brief       || ''; break;
                    case '精选短语':                          row[idx] = r.phrases     || ''; break;
                }
            });
            return row;
        });
}

function showGenNotice(text) {
    const notice = document.createElement('div');
    notice.className = 'gen-notice';
    notice.textContent = text;
    document.body.appendChild(notice);
    setTimeout(() => {
        notice.style.transition = 'opacity 0.4s';
        notice.style.opacity = '0';
        setTimeout(() => notice.remove(), 400);
    }, 2600);
}

// --- 替换词库 ---
function replaceWordsToList() {
    const newRows = buildNewRows();
    if (newRows.length === 0) return;
    allData.length = 0;
    allData.push(...newRows);
    if (typeof renderPages === 'function') renderPages();
    closeGenModal();
    showGenNotice(`✅ 已生成 ${newRows.length} 个词条（原词库已替换）`);
}

// --- 叠加词库（插入顶部）---
function appendWordsToList() {
    const newRows = buildNewRows();
    if (newRows.length === 0) return;
    ensureDataInitialized();
    allData.unshift(...newRows);
    if (typeof renderPages === 'function') renderPages();
    closeGenModal();
    showGenNotice(`✅ 已叠加 ${newRows.length} 个词条到列表顶部`);
}

// --- 事件绑定 ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('genWordsBtn')?.addEventListener('click', openGenModal);
    document.getElementById('genModalBackdrop')?.addEventListener('click', closeGenModal);
    document.getElementById('genModalClose')?.addEventListener('click', closeGenModal);
    document.getElementById('genStartBtn')?.addEventListener('click', startGeneration);
    document.getElementById('genReplaceBtn')?.addEventListener('click', replaceWordsToList);
    document.getElementById('genAppendBtn') ?.addEventListener('click', appendWordsToList);

    // 点击 gen-item 切换选中态
    document.getElementById('genProgress')?.addEventListener('click', (e) => {
        const item = e.target.closest('.gen-item');
        if (item) toggleItemSelected(item);
    });

    // 全选 / 取消全选
    document.getElementById('genSelectAll')?.addEventListener('click', () => {
        document.querySelectorAll('#genProgress .gen-item-done').forEach(el => el.classList.add('gen-item-selected'));
        updateSelectedCount();
    });
    document.getElementById('genClearAll')?.addEventListener('click', () => {
        document.querySelectorAll('#genProgress .gen-item-done').forEach(el => el.classList.remove('gen-item-selected'));
        updateSelectedCount();
    });

    // Ctrl/Cmd + Enter 触发生成
    document.getElementById('genWordsInput')?.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            startGeneration();
        }
    });

    // Escape 关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('genModalOverlay');
            if (overlay?.classList.contains('show')) closeGenModal();
        }
    });
});
