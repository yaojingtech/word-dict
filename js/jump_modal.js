// ==========================================
// 页码跳转模态框 (jump_modal.js)
// ==========================================

const JUMP_PAGES_PER_TAB = 50;

let _jumpTotal    = 0;
let _jumpActiveTab = 0;
let _jumpCurrent  = 1;  // 当前可见页（高亮用，1-based）

// --- 工具 ---
function padPage(n) { return n.toString().padStart(3, '0'); }

// --- 执行跳转 ---
function jumpToPage(idx) {
    const wraps = document.querySelectorAll('#preview-area .page-export-wrap');
    wraps[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (typeof notifyJumpToPage === 'function') notifyJumpToPage(idx);
    closeJumpModal();
}

// --- 渲染标签栏 ---
function renderJumpTabs(total) {
    const tabsEl   = document.getElementById('jumpModalTabs');
    tabsEl.innerHTML = '';
    const tabCount = Math.ceil(total / JUMP_PAGES_PER_TAB);

    for (let i = 0; i < tabCount; i++) {
        const start = i * JUMP_PAGES_PER_TAB + 1;
        const end   = Math.min((i + 1) * JUMP_PAGES_PER_TAB, total);
        const btn   = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'jump-tab-btn' + (i === _jumpActiveTab ? ' active' : '');
        btn.textContent = `${padPage(start)}–${padPage(end)}`;
        btn.addEventListener('click', () => {
            _jumpActiveTab = i;
            tabsEl.querySelectorAll('.jump-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderJumpGrid(total, i);
        });
        tabsEl.appendChild(btn);
    }
}

// --- 渲染页码格子 ---
function renderJumpGrid(total, tabIndex) {
    const gridEl = document.getElementById('jumpModalGrid');
    gridEl.innerHTML = '';

    const start = tabIndex * JUMP_PAGES_PER_TAB + 1;
    const end   = Math.min((tabIndex + 1) * JUMP_PAGES_PER_TAB, total);

    for (let p = start; p <= end; p++) {
        const idx = p - 1;
        const btn = document.createElement('button');
        btn.type        = 'button';
        btn.className   = 'jump-page-item' + (p === _jumpCurrent ? ' current' : '');
        btn.textContent = padPage(p);
        btn.title       = `跳转到第 ${p} 页`;
        btn.addEventListener('click', () => jumpToPage(idx));
        gridEl.appendChild(btn);
    }

    gridEl.querySelector('.jump-page-item.current')
        ?.scrollIntoView({ block: 'nearest' });
}

// --- 打开 ---
function openJumpModal(totalPages) {
    _jumpTotal = totalPages;

    // 检测当前视口最近的页
    const wraps = document.querySelectorAll('#preview-area .page-export-wrap');
    let nearest = 0, minDist = Infinity;
    wraps.forEach((el, i) => {
        const dist = Math.abs(el.getBoundingClientRect().top);
        if (dist < minDist) { minDist = dist; nearest = i; }
    });
    _jumpCurrent   = nearest + 1;
    _jumpActiveTab = Math.floor(nearest / JUMP_PAGES_PER_TAB);

    renderJumpTabs(totalPages);
    renderJumpGrid(totalPages, _jumpActiveTab);

    document.getElementById('jumpModalTabs')
        ?.querySelector('.jump-tab-btn.active')
        ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });

    const overlay = document.getElementById('jumpModalOverlay');
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

// --- 关闭 ---
function closeJumpModal() {
    const overlay = document.getElementById('jumpModalOverlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

// --- 事件绑定 ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('jumpModalBackdrop')?.addEventListener('click', closeJumpModal);
    document.getElementById('jumpModalClose')?.addEventListener('click', closeJumpModal);

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('jumpModalOverlay');
            if (overlay?.classList.contains('show')) closeJumpModal();
        }
    });
});
