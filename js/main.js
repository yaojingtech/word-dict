// ==========================================
// 单词表排版工具 - 主业务逻辑
// ==========================================

// --- 状态管理 ---
let allData = [];
let headers = [];
let visibleColumns = [];
let currentVocabFileName = ''; // 当前加载的词表文件名

// --- DOM 元素获取 ---
const layoutSelect = document.getElementById('layoutSelect');
const pageSizeInput = document.getElementById('pageSizeInput');
const fontSizeInput = document.getElementById('fontSizeInput');
const previewArea = document.getElementById('preview-area');
const columnToggles = document.getElementById('columnToggles');
const rootStyles = document.documentElement.style;

// --- 字号配置管理 ---
const fontFit = window.FontFit || null;

// --- 初始化与数据加载 ---
function loadFromJson(json, fileName) {
    console.log('loadFromJson called with file:', fileName);
    if (!json || !json.headers || !Array.isArray(json.data)) {
        console.log('Invalid JSON format');
        return false;
    }
    headers = json.headers;
    allData = json.data.filter(r => r && r.length > 1);
    if (allData.length === 0) {
        console.log('No valid data');
        return false;
    }
    visibleColumns = headers.map((_, i) => i);
    
    if (fileName) {
        currentVocabFileName = fileName;
        console.log('Current vocab file:', currentVocabFileName);
    }
    
    initColumnControls();
    requestAnimationFrame(() => { 
        console.log('Rendering pages...');
        renderPages();
        console.log('Pages rendered');
        
        // 尝试加载并应用字号配置
        if (currentVocabFileName && fontFit) {
            const configFileName = fontFit.getFontConfigFileName(currentVocabFileName);
            console.log('Config file name:', configFileName);
            if (configFileName) {
                console.log('Loading font config...');
                fontFit.loadFontConfig(configFileName).then(config => {
                    if (config) {
                        const applied = fontFit.applyFontConfig(config, previewArea);
                        console.log('Config applied:', applied);
                    } else {
                        console.log('No config found, using default font size');
                    }
                }).catch(err => {
                    console.log('Error loading config:', err);
                });
            }
        } else if (!currentVocabFileName) {
            console.log('No vocab file name, skipping font config');
        } else {
            console.log('FontFit not loaded, skipping font config');
        }
    });
    return true;
}

// 加载默认词表和配置
async function initDefaultData() {
    try {
        const response = await fetch('date/word(2800).json');
        if (!response.ok) throw new Error('Load failed');
        const json = await response.json();
        
        if (loadFromJson(json, 'word(2800).json')) {
            console.log('Default vocab loaded');
        }
    } catch (err) {
        console.log('Default vocab load failed:', err.message);
    }
}

initDefaultData();

// 列配置逻辑已抽离到 columns.js
// 渲染逻辑已抽离到 render.js

// --- 事件监听绑定 ---
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
    const footer = e.target.closest('.page-footer');
    if (footer) {
        const pageDiv = footer.closest('.page');
        if (pageDiv && typeof openPageActionsPopover === 'function') {
            openPageActionsPopover(footer, pageDiv);
        }
        return;
    }

    const combinedTd = e.target.closest('td.col-word-phonetic-combined');
    if (combinedTd) {
        spawnRipple(combinedTd, e);
        const cellWord = combinedTd.querySelector('.cell-word');
        if (cellWord) return playAudio(cellWord.getAttribute('data-word') || cellWord.textContent);
        return;
    }

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

// 跳转页面
document.getElementById('goToPageBtn')?.addEventListener('click', () => {
    const wraps = previewArea.querySelectorAll('.page-export-wrap');
    if (!wraps.length) return alert('No pages');
    openJumpModal(wraps.length);
});

// 字号按钮逻辑已抽离到 font_fit.js
if (fontFit) {
    fontFit.bindButtons(previewArea, () => currentVocabFileName);
}

// PDF export functions are in export.js
