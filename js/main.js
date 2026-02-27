// ==========================================
// 单词表排版工具 - 主业务逻辑
// ==========================================

// --- 状态管理 ---
let allData = [];
let headers = [];
let visibleColumns = [];
let currentFontConfig = null; // 当前字号配置
let isDefaultWord2800Loaded = false; // 是否加载了默认的 word(2800).json

// --- DOM 元素获取 ---
const layoutSelect = document.getElementById('layoutSelect');
const pageSizeInput = document.getElementById('pageSizeInput');
const fontSizeInput = document.getElementById('fontSizeInput');
const previewArea = document.getElementById('preview-area');
const columnToggles = document.getElementById('columnToggles');
const rootStyles = document.documentElement.style;

// --- 字号配置管理 ---
const FONT_CONFIG_FILE = 'date/word(2800).font-config.json';

// 加载字号配置
async function loadFontConfig() {
    try {
        const response = await fetch(FONT_CONFIG_FILE);
        if (!response.ok) return null;
        const config = await response.json();
        if (config.version === 1 && Array.isArray(config.pageFonts)) {
            return config;
        }
        return null;
    } catch {
        return null;
    }
}

// 应用字号配置到页面
function applyFontConfig(config) {
    if (!config || !config.pageFonts || !config.pageFonts.length) return false;
    
    const wraps = previewArea.querySelectorAll('.page-export-wrap');
    if (!wraps.length) return false;
    
    wraps.forEach((wrap, idx) => {
        const pageEl = wrap.querySelector('.page');
        const valueSpan = wrap.querySelector('.page-font-value');
        const fontSize = config.pageFonts[idx];
        
        if (pageEl && fontSize) {
            pageEl.style.setProperty('--table-font-size', fontSize + 'px');
            pageEl.setAttribute('data-font-size', fontSize);
            if (valueSpan) valueSpan.textContent = fontSize + 'px';
        }
    });
    
    return true;
}

// 保存当前字号配置
async function saveFontConfig() {
    const wraps = previewArea.querySelectorAll('.page-export-wrap');
    if (!wraps.length) {
        alert('暂无页面，无法保存配置。');
        return;
    }
    
    const pageFonts = [];
    wraps.forEach(wrap => {
        const pageEl = wrap.querySelector('.page');
        const fontSize = pageEl?.getAttribute('data-font-size');
        pageFonts.push(fontSize ? parseFloat(fontSize) : 14);
    });
    
    const config = {
        version: 1,
        sourceFile: 'word(2800).json',
        createdAt: new Date().toISOString(),
        pageFonts: pageFonts
    };
    
    // 下载配置文件
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'word(2800).font-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`✅ 已保存字号配置！\n共 ${pageFonts.length} 页，请手动将下载的文件放到 date 文件夹中。`);
}

// --- 初始化与数据加载 ---
function loadFromJson(json) {
    if (!json || !json.headers || !Array.isArray(json.data)) return false;
    headers = json.headers;
    allData = json.data.filter(r => r && r.length > 1);
    if (allData.length === 0) return false;
    visibleColumns = headers.map((_, i) => i);
    initColumnControls();
    requestAnimationFrame(() => { 
        renderPages();
        // 如果是默认词表，尝试加载并应用字号配置
        if (isDefaultWord2800Loaded && currentFontConfig) {
            setTimeout(() => {
                if (applyFontConfig(currentFontConfig)) {
                    console.log('✅ 已应用保存的字号配置');
                }
            }, 100);
        }
    });
    return true;
}

// 加载默认词表和配置
async function initDefaultData() {
    try {
        // 先加载字号配置
        currentFontConfig = await loadFontConfig();
        
        // 加载词表数据
        const response = await fetch('date/word(2800).json');
        if (!response.ok) throw new Error('加载失败');
        const json = await response.json();
        
        if (loadFromJson(json)) {
            isDefaultWord2800Loaded = true;
            // 显示保存配置按钮
            const saveBtn = document.getElementById('saveFontConfigBtn');
            if (saveBtn) saveBtn.style.display = '';
        }
    } catch (err) {
        console.log('默认词表加载失败或不存在，保持空状态');
    }
}

initDefaultData();


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

// 保存字号配置按钮
document.getElementById('saveFontConfigBtn')?.addEventListener('click', saveFontConfig);

// PDF 导出、PNG/ZIP 导出已抽离至 export.js