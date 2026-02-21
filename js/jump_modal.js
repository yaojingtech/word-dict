// ==========================================
// 页码跳转模态框 (jump_modal.js)
// ==========================================

const JUMP_PAGES_PER_TAB = 50;

let _jumpTotal = 0;       // 总页数
let _jumpCurrent = 1;     // 当前所在页（高亮用）
let _jumpActiveTab = 0;   // 当前激活的标签组索引

// --- 工具：将数字补零为 3 位 ---
function padPage(n) {
    return n.toString().padStart(3, '0');
}

// --- 执行跳转 ---
function jumpToPage(page) {
    const wraps = document.querySelectorAll('#preview-area .page-export-wrap');
    if (!wraps[page - 1]) return;
    wraps[page - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
    _jumpCurrent = page;
    closeJumpModal();
}

// --- 渲染标签栏 ---
function renderJumpTabs(total) {
    const tabsEl = document.getElementById('jumpModalTabs');
    tabsEl.innerHTML = '';
    const tabCount = Math.ceil(total / JUMP_PAGES_PER_TAB);

    for (let i = 0; i < tabCount; i++) {
        const start = i * JUMP_PAGES_PER_TAB + 1;
        const end   = Math.min((i + 1) * JUMP_PAGES_PER_TAB, total);
        const btn   = document.createElement('button');
        btn.type    = 'button';
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
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'jump-page-item' + (p === _jumpCurrent ? ' current' : '');
        btn.textContent = padPage(p);
        btn.title = `第 ${p} 页`;
        btn.addEventListener('click', () => jumpToPage(p));
        gridEl.appendChild(btn);
    }

    // 如果当前页在本标签组内，滚动到可见位置
    const currentBtn = gridEl.querySelector('.jump-page-item.current');
    currentBtn?.scrollIntoView({ block: 'nearest' });
}

// --- 打开 ---
function openJumpModal(totalPages) {
    _jumpTotal = totalPages;

    // 自动定位到当前页所在标签组
    const wraps = document.querySelectorAll('#preview-area .page-export-wrap');
    // 找出最接近视口顶部的页
    let nearest = 0;
    let minDist = Infinity;
    wraps.forEach((el, i) => {
        const dist = Math.abs(el.getBoundingClientRect().top);
        if (dist < minDist) { minDist = dist; nearest = i; }
    });
    _jumpCurrent  = nearest + 1;
    _jumpActiveTab = Math.floor(nearest / JUMP_PAGES_PER_TAB);

    // 同步 footer 输入框上限
    const input = document.getElementById('jumpPageInput');
    if (input) { input.max = totalPages; input.value = ''; }

    renderJumpTabs(totalPages);
    renderJumpGrid(totalPages, _jumpActiveTab);

    // 滚动标签到激活位置
    const tabsEl = document.getElementById('jumpModalTabs');
    tabsEl.querySelector('.jump-tab-btn.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });

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

    // Footer 直接输入跳转
    const confirmBtn = document.getElementById('jumpPageConfirm');
    const pageInput  = document.getElementById('jumpPageInput');

    function doInputJump() {
        const val = parseInt(pageInput.value, 10);
        if (isNaN(val) || val < 1 || val > _jumpTotal) {
            pageInput.classList.add('jump-input-error');
            setTimeout(() => pageInput.classList.remove('jump-input-error'), 600);
            return;
        }
        jumpToPage(val);
    }

    confirmBtn?.addEventListener('click', doInputJump);
    pageInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doInputJump(); });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('jumpModalOverlay');
            if (overlay?.classList.contains('show')) closeJumpModal();
        }
    });
});
