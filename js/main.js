// ==========================================
// 单词表排版工具 - 主业务逻辑
// ==========================================

// --- 状态管理 ---
let allData = [];
let headers = [];
let visibleColumns = [];

// --- DOM 元素获取 ---
const fileInput = document.getElementById('fileInput');
const layoutSelect = document.getElementById('layoutSelect');
const pageSizeInput = document.getElementById('pageSizeInput');
const fontSizeInput = document.getElementById('fontSizeInput');
const previewArea = document.getElementById('preview-area');
const columnToggles = document.getElementById('columnToggles');
const rootStyles = document.documentElement.style;

// --- 初始化与数据加载 ---
function loadFromJson(json) {
    if (!json || !json.headers || !Array.isArray(json.data)) return false;
    headers = json.headers;
    allData = json.data.filter(r => r && r.length > 1);
    if (allData.length === 0) return false;
    visibleColumns = headers.map((_, i) => i);
    initColumnControls();
    requestAnimationFrame(() => { renderPages(); });
    return true;
}

fetch('date/word(2800).json')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(json => { if (loadFromJson(json)) { /* 加载成功 */ } })
    .catch(() => { /* 文件不存在或 CORS，保持默认空状态 */ });

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            if (file.name.toLowerCase().endsWith('.json')) {
                // JSON 格式：{ headers: [...], data: [[...], ...] }
                const json = JSON.parse(event.target.result);
                if (!loadFromJson(json)) throw new Error('JSON 格式不符，需包含 headers 和 data 字段');
            } else {
                // CSV 格式
                const rows = parseCSV(event.target.result);
                if (rows.length === 0) return;
                headers = rows[0];
                allData = rows.slice(1).filter(r => r.length > 1);
                visibleColumns = headers.map((_, i) => i);
                initColumnControls();
                requestAnimationFrame(() => { renderPages(); });
            }
        } catch (err) {
            console.error(err);
            alert('解析文件出错：' + (err.message || err));
        }
    };
    reader.readAsText(file, 'utf-8');
});

// 列配置逻辑已抽离到 columns.js（initColumnControls / buildDisplayColumns 等）
// 渲染逻辑已抽离到 render.js（renderPages / updatePageBriefClamp）

// --- 事件监听绑定 ---
// 模态框/发音逻辑已抽离至 modal.js，此处仅调用 openWordModal(rowData, layoutClass, displayColumns) 和 playAudio(word)
layoutSelect.addEventListener('change', renderPages);
pageSizeInput.addEventListener('input', renderPages);
fontSizeInput.addEventListener('input', renderPages);

function spawnRipple(el, e) {
    const rect = el.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'cell-click-ripple';
    ripple.style.left = (e.clientX - rect.left) + 'px';
    ripple.style.top  = (e.clientY - rect.top)  + 'px';
    el.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

previewArea.addEventListener('click', (e) => {
    // 页脚点击 → 弹出字号/导出操作面板
    const footer = e.target.closest('.page-footer');
    if (footer) {
        const pageDiv = footer.closest('.page');
        if (pageDiv && typeof openPageActionsPopover === 'function') {
            openPageActionsPopover(footer, pageDiv);
        }
        return;
    }

    // 整个单词+音标格（含空白和音标区域）→ 水波纹 + 发音
    const combinedTd = e.target.closest('td.col-word-phonetic-combined');
    if (combinedTd) {
        spawnRipple(combinedTd, e);
        const cellWord = combinedTd.querySelector('.cell-word');
        if (cellWord) return playAudio(cellWord.getAttribute('data-word') || cellWord.textContent);
        return;
    }

    // 其他可发音元素（独立单词列、释义中高亮词）
    const wordEl = e.target.closest('.col-word.word-speak, .def-word');
    if (wordEl) return playAudio(wordEl.getAttribute('data-word') || wordEl.textContent);

    const td = e.target.closest('td');
    if (td && !td.classList.contains('col-word-phonetic-combined')) {
        const tr = td.closest('tr');
        const pageWrap = td.closest('.page-export-wrap');
        if (tr && pageWrap) {
            const pageIndex = parseInt(pageWrap.querySelector('.page').getAttribute('data-page-index'), 10);
            const pageSize = Math.min(50, Math.max(5, parseInt(pageSizeInput.value, 10) || 10));
            const globalIndex = pageIndex * pageSize + parseInt(tr.getAttribute('data-row-index'), 10);
            if (allData[globalIndex]) openWordModal(allData[globalIndex], layoutSelect.value, buildDisplayColumns(), {
                    data: allData,
                    index: globalIndex,
                    getLayout: () => layoutSelect.value,
                    getColumns: () => buildDisplayColumns(),
                });
        }
    }
});

// 跳转页面 — 由 jump_modal.js 接管，此处仅保留入口触发
document.getElementById('goToPageBtn')?.addEventListener('click', () => {
    const wraps = previewArea.querySelectorAll('.page-export-wrap');
    if (!wraps.length) return alert('暂无页面，请先上传文件。');
    openJumpModal(wraps.length);
});

// 自适应字号
document.getElementById('adaptiveFontBtn')?.addEventListener('click', function() {
    const wraps = previewArea.querySelectorAll('.page-export-wrap');
    if (!wraps.length) return alert('暂无页面，请先上传文件。');
    this.disabled = true;
    this.textContent = '适应中…';
    
    let idx = 0;
    const adaptOne = () => {
        if (idx >= wraps.length) {
            this.disabled = false;
            this.textContent = '自适应';
            return;
        }
        const pageEl = wraps[idx].querySelector('.page');
        const valueSpan = wraps[idx].querySelector('.page-font-value');
        let px = 8, best = 8;
        
        const setAndCheck = (size) => {
            pageEl.style.setProperty('--table-font-size', size + 'px');
            pageEl.setAttribute('data-font-size', size);
            pageEl.offsetHeight; // force reflow
            updatePageBriefClamp(pageEl);
            return pageEl.classList.contains('page-brief-clamped');
        };
        
        while (px <= 24) {
            if (setAndCheck(px)) {
                best = Math.max(8, Math.round((px - 0.1) * 10) / 10);
                setAndCheck(best);
                break;
            }
            best = px;
            px = Math.round((px + 0.1) * 10) / 10;
        }
        if (valueSpan) valueSpan.textContent = best + 'px';
        idx++;
        requestAnimationFrame(adaptOne);
    };
    adaptOne();
});

// PDF 导出、PNG/ZIP 导出已抽离至 export.js