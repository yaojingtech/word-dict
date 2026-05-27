// ==========================================
// 单词表排版工具 - 主业务逻辑
// ==========================================

// --- 状态管理 ---
let allData = [];
let headers = [];
let visibleColumns = [];
let currentVocabFileName = ''; // 当前加载的词表文件名

function getVocabWordIndex(word) {
    const w = String(word || '').toLowerCase().trim();
    if (!w) return -1;
    return allData.findIndex(row => (row[0] || '').trim().toLowerCase() === w);
}
window.getVocabWordIndex = getVocabWordIndex;

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
        loadBundledAiCache(currentVocabFileName);
        loadKidsDefSidecar(currentVocabFileName);
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

// 启动引导：首屏选择词表（不再默认自动加载）
async function loadBuiltinVocab(path, sourceFileName) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Load failed: ${path}`);
    const json = await response.json();
    if (!loadFromJson(json, sourceFileName)) {
        throw new Error(`Invalid vocab format: ${sourceFileName}`);
    }
    await ensureBundledAiCacheReady();
    await ensureKidsDefReady();
}

async function loadShanghaiVocab() {
    // 优先尝试简短文件名，不存在时回退到当前项目文件名
    try {
        await loadBuiltinVocab('date/沪教三年级.json', '沪教三年级（下）.json');
    } catch (_) {
        await loadBuiltinVocab('date/沪教三年级（下）.json', '沪教三年级（下）.json');
    }
}

function initVocabPicker() {
    const overlay = document.getElementById('startupVocabOverlay');
    const pickBtn = document.getElementById('pickVocabBtn');
    const ngslBtn = document.getElementById('startupPickNgslBtn');
    const shBtn   = document.getElementById('startupPickShanghaiBtn');
    const newBtn  = document.getElementById('startupPickNewBtn');

    if (!overlay || !ngslBtn || !shBtn || !newBtn) return;

    const openPicker = () => {
        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');
    };

    const closePicker = () => {
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
    };

    const closePickerAndGenModal = () => {
        closePicker();
        if (typeof closeGenModal === 'function') closeGenModal();
    };

    pickBtn?.addEventListener('click', openPicker);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePicker();
    });

    const bindLoadAction = (btn, loader) => {
        btn.addEventListener('click', async () => {
            if (btn.disabled) return;
            btn.disabled = true;
            try {
                await loader();
                closePickerAndGenModal();
            } catch (err) {
                console.log('Builtin vocab load failed:', err.message);
                alert(`加载失败：${err.message}`);
            } finally {
                btn.disabled = false;
            }
        });
    };

    bindLoadAction(ngslBtn, () => loadBuiltinVocab('date/word(2800).json', 'word(2800).json'));
    bindLoadAction(shBtn, loadShanghaiVocab);

    newBtn.addEventListener('click', () => {
        closePickerAndGenModal();
    });
}

async function loadDefaultVocabOnStartup() {
    try {
        await loadBuiltinVocab('date/word(2800).json', 'word(2800).json');
    } catch (err) {
        console.log('Default vocab load failed:', err.message);
        alert(`默认词表加载失败：${err.message}`);
    }
}

initVocabPicker();
loadDefaultVocabOnStartup();

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
