// ==========================================
// 单页模式 (single_page.js)
// ==========================================

const singlePagePreviewArea = document.getElementById('preview-area');
const previewWrapper = document.getElementById('preview-area-wrapper');
const singlePageBtn = document.getElementById('singlePageBtn');
const prevBtn = document.getElementById('singlePagePrev');
const nextBtn = document.getElementById('singlePageNext');

let singlePageActive = false;

function isSinglePageMode() {
    return singlePageActive;
}

function updatePageScale() {
    if (!previewWrapper?.classList.contains('single-page-mode')) return;
    const wraps = singlePagePreviewArea?.querySelectorAll('.page-export-wrap');
    if (!wraps?.length) return;

    const firstWrap = wraps[0];
    const pageEl = firstWrap.querySelector('.page');
    if (!pageEl) return;

    const availW = singlePagePreviewArea.clientWidth - 40;
    const availH = singlePagePreviewArea.clientHeight - 40;
    const rect = pageEl.getBoundingClientRect();
    const pageW = rect.width;
    const pageH = rect.height;
    if (pageW <= 0 || pageH <= 0) return;

    const scale = Math.min(availW / pageW, availH / pageH, 1);
    document.documentElement.style.setProperty('--single-page-scale', String(scale));
}

function applyScaleToPages() {
    if (!previewWrapper?.classList.contains('single-page-mode')) return;
    const wraps = singlePagePreviewArea?.querySelectorAll('.page-export-wrap');
    wraps?.forEach(wrap => {
        const page = wrap.querySelector('.page');
        if (page) {
            const scale = getComputedStyle(document.documentElement).getPropertyValue('--single-page-scale').trim() || '1';
            page.style.transform = `translate(-50%, -50%) scale(${scale})`;
        }
    });
}

function updateNavButtons() {
    const wraps = singlePagePreviewArea?.querySelectorAll('.page-export-wrap');
    const n = wraps?.length || 0;
    if (!prevBtn || !nextBtn) return;
    if (n <= 1) {
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
    }
    const scrollTop = singlePagePreviewArea.scrollTop;
    const wrapHeight = singlePagePreviewArea.clientHeight || 1;
    const currentIndex = Math.round(scrollTop / wrapHeight);
    prevBtn.disabled = currentIndex <= 0;
    nextBtn.disabled = currentIndex >= n - 1;
}

function goToPageIndex(idx) {
    const wraps = singlePagePreviewArea?.querySelectorAll('.page-export-wrap');
    if (!wraps?.[idx]) return;
    wraps[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleSinglePageMode() {
    const wraps = singlePagePreviewArea?.querySelectorAll('.page-export-wrap');
    if (!wraps.length) {
        alert('暂无页面，请先上传文件。');
        return;
    }

    singlePageActive = !singlePageActive;
    previewWrapper.classList.toggle('single-page-mode', singlePageActive);
    singlePageBtn.classList.toggle('active', singlePageActive);
    singlePageBtn.textContent = singlePageActive ? '取消单页' : '单页模式';

    if (singlePageActive) {
        updatePageScale();
        applyScaleToPages();
        singlePagePreviewArea.scrollTo(0, 0);
        updateNavButtons();
    } else {
        document.documentElement.style.removeProperty('--single-page-scale');
        wraps.forEach(wrap => {
            const page = wrap.querySelector('.page');
            if (page) page.style.transform = '';
        });
    }
}

function initSinglePageMode() {
    singlePageBtn?.addEventListener('click', () => {
        toggleSinglePageMode();
    });

    prevBtn?.addEventListener('click', () => {
        if (!singlePageActive) return;
        const wraps = singlePagePreviewArea?.querySelectorAll('.page-export-wrap');
        const n = wraps?.length || 0;
        if (n <= 1) return;
        const wrapHeight = singlePagePreviewArea.clientHeight;
        const currentIndex = Math.round(singlePagePreviewArea.scrollTop / wrapHeight);
        const prevIndex = Math.max(0, currentIndex - 1);
        goToPageIndex(prevIndex);
    });

    nextBtn?.addEventListener('click', () => {
        if (!singlePageActive) return;
        const wraps = singlePagePreviewArea?.querySelectorAll('.page-export-wrap');
        const n = wraps?.length || 0;
        if (n <= 1) return;
        const wrapHeight = singlePagePreviewArea.clientHeight;
        const currentIndex = Math.round(singlePagePreviewArea.scrollTop / wrapHeight);
        const nextIndex = Math.min(n - 1, currentIndex + 1);
        goToPageIndex(nextIndex);
    });

    singlePagePreviewArea?.addEventListener('scroll', () => {
        if (singlePageActive) updateNavButtons();
    });

    window.addEventListener('resize', () => {
        if (singlePageActive) {
            updatePageScale();
            applyScaleToPages();
            updateNavButtons();
        }
    });
}

// 供 jump_modal 调用：跳转后刷新单页模式下的导航按钮状态
window.notifyJumpToPage = function notifyJumpToPage(idx) {
    if (singlePageActive) {
        requestAnimationFrame(() => updateNavButtons());
    }
};

// 需要在 renderPages 后重新应用单页模式的 scale
function onPagesRendered() {
    if (singlePageActive) {
        updatePageScale();
        applyScaleToPages();
        updateNavButtons();
    }
}
window.onPagesRendered = onPagesRendered;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSinglePageMode);
} else {
    initSinglePageMode();
}
