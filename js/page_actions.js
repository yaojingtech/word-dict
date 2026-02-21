// ==========================================
// 页脚点击操作面板 (page_actions.js)
// 依赖: export.js (exportSinglePage), render.js (updatePageBriefClamp)
// ==========================================

let _papPageDiv   = null;  // 当前绑定的 .page 元素
let _papTotalPages = 0;    // 总页数（用于导出文件名）

// --- 打开 ---
function openPageActionsPopover(footerEl, pageDiv) {
    const pop = document.getElementById('pageActionsPopover');
    if (!pop) return;

    _papPageDiv = pageDiv;

    // 计算总页数（懒查询）
    _papTotalPages = document.querySelectorAll('#preview-area .page-export-wrap').length;

    // 页码标签
    const labelEl = document.getElementById('papLabel');
    if (labelEl) labelEl.textContent = footerEl.textContent.trim();

    // 字号同步
    syncFontValue();

    // 先显示再定位（需要真实尺寸）
    pop.style.visibility = 'hidden';
    pop.style.display    = '';

    positionPopover(pop, footerEl);
    pop.style.visibility = '';

    // 点击外部关闭
    requestAnimationFrame(() => {
        document.addEventListener('click', onOutsideClick, { capture: true, once: true });
    });
}

// --- 定位：优先显示在页脚上方，靠近点击处居中 ---
function positionPopover(pop, footerEl) {
    const rect  = footerEl.getBoundingClientRect();
    const popH  = pop.offsetHeight;
    const popW  = pop.offsetWidth;
    const margin = 8;

    // 水平：与页脚居中对齐，不超出视口
    let left = rect.left + (rect.width - popW) / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - popW - margin));

    // 垂直：优先显示在页脚上方
    let top = rect.top - popH - margin;
    if (top < margin) top = rect.bottom + margin;   // 上方空间不足则显示在下方

    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';
}

// --- 关闭 ---
function closePageActionsPopover() {
    const pop = document.getElementById('pageActionsPopover');
    if (pop) pop.style.display = 'none';
    _papPageDiv = null;
    document.removeEventListener('click', onOutsideClick, { capture: true });
}

function onOutsideClick(e) {
    const pop = document.getElementById('pageActionsPopover');
    if (pop && !pop.contains(e.target)) {
        closePageActionsPopover();
    } else {
        // 点在 popover 内，重新挂钩以保持打开
        document.addEventListener('click', onOutsideClick, { capture: true, once: true });
    }
}

// --- 字号 ---
function syncFontValue() {
    if (!_papPageDiv) return;
    const fs = parseFloat(_papPageDiv.getAttribute('data-font-size')) || 14;
    const el = document.getElementById('papFontValue');
    if (el) el.textContent = fs.toFixed(1).replace(/\.0$/, '') + 'px';
}

function adjustPapFontSize(delta) {
    if (!_papPageDiv) return;
    let px = parseFloat(_papPageDiv.getAttribute('data-font-size')) || 14;
    px = Math.max(8, Math.min(24, Math.round((px + delta) * 10) / 10));
    _papPageDiv.style.setProperty('--table-font-size', px + 'px');
    _papPageDiv.setAttribute('data-font-size', px);
    syncFontValue();
    if (typeof updatePageBriefClamp === 'function') {
        requestAnimationFrame(() => updatePageBriefClamp(_papPageDiv));
    }
}

// --- 导出 ---
function papExport() {
    if (!_papPageDiv || typeof exportSinglePage !== 'function') return;

    const btn = document.getElementById('papExportBtn');
    const pageIndex = parseInt(_papPageDiv.getAttribute('data-page-index'), 10) + 1;

    // 临时替换 textContent setter 以匹配 exportSinglePage 期望的 triggerBtn 格式
    const proxyBtn = {
        get disabled()  { return btn.disabled; },
        set disabled(v) { btn.disabled = v; },
        get textContent() { return btn.textContent; },
        set textContent(v) { btn.textContent = v || '📥 导出此页'; }
    };

    exportSinglePage(_papPageDiv, pageIndex, _papTotalPages, proxyBtn);
}

// --- 事件绑定 ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('papFontSmaller')?.addEventListener('click', () => adjustPapFontSize(-0.5));
    document.getElementById('papFontBigger') ?.addEventListener('click', () => adjustPapFontSize(+0.5));
    document.getElementById('papExportBtn')  ?.addEventListener('click', papExport);

    document.getElementById('papDeepBtn')?.addEventListener('click', () => {
        const pageDiv = _papPageDiv;
        closePageActionsPopover();
        if (pageDiv && typeof openDeepModal === 'function') openDeepModal(pageDiv);
    });
});
