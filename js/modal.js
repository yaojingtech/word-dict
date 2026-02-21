// ==========================================
// 单词表排版工具 - 模态框与发音模块 (modal.js)
// 依赖: utils.js (用于 HTML 转义等纯工具函数)
// ==========================================

let currentAudio = null;

// --- 发音核心功能 ---
function playAudio(word, ev = null) {
    if (ev) ev.stopPropagation();
    word = (word || '').trim();
    if (!word) return;
    
    const accentSelect = document.getElementById('accentSelect');
    const type = (accentSelect && accentSelect.value) || '1'; // 1: 英音, 2: 美音
    const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;
    
    if (currentAudio) currentAudio.pause();
    currentAudio = new Audio(url);
    currentAudio.play().catch(() => {
        console.warn('浏览器可能限制了自动播放');
    });
}

// --- 模态框 HTML 构建 ---
function buildModalCardHtml(row, displayColumns) {
    let rawWord = '', phonetic = '', def = '', brief = '';
    let phrEn = '', phrZh = '';
    
    displayColumns.forEach(col => {
        if (col.type === 'wordPhonetic') {
            rawWord = (row[col.wordIdx] || '').trim();
            phonetic = (row[col.phoneticIdx] || '').trim();
        } else if (col.type === 'combined') {
            def = (row[col.defIdx] || '').trim();
            brief = (row[col.briefIdx] || '').trim();
            if (col.phraseIdx >= 0) {
                const phr = parseFirstPhrase(row[col.phraseIdx]);
                phrEn = phr.en;
                phrZh = phr.zh;
            }
        }
    });
    
    def = wrapDefWordsForModal(escapeHtml(def));
    if (phrEn) def += ` <span class="wm-phrase" data-word="${escapeHtml((phrEn.split(/\s+/)[0] || phrEn).trim())}" title="点击发音">${escapeHtml(phrEn)}</span>`;
    brief = wrapBriefPosForModal(escapeHtml(brief));
    if (phrZh) brief += ` <span class="wm-phrase">${escapeHtml(phrZh)}</span>`;
    
    return `
        <div class="wm-card">
            <div class="wm-hero">
                <div class="wm-word" ${rawWord ? `data-word="${escapeHtml(rawWord)}" title="点击发音"` : ''}>${escapeHtml(rawWord) || '&nbsp;'}</div>
                ${phonetic ? `<div class="wm-phonetic">${escapeHtml(phonetic)}</div>` : ''}
            </div>
            <div class="wm-body">
                <div class="wm-block"><div class="wm-label">📖 英文释义</div><div class="wm-text">${def || '—'}</div></div>
                <div class="wm-block"><div class="wm-label">✨ 简明释义</div><div class="wm-text">${brief || '—'}</div></div>
            </div>
        </div>`;
}

// --- 模态框交互控制 ---
// 接收行数据、布局方式、列配置，实现解耦
function openWordModal(rowData, layoutClass, displayColumns) {
    const overlay = document.getElementById('wordModalOverlay');
    const box = document.getElementById('wordModalBox');
    const contentEl = document.getElementById('wordModalContent');
    if (!overlay || !box || !contentEl) return;

    contentEl.innerHTML = buildModalCardHtml(rowData, displayColumns);
    box.classList.toggle('landscape', layoutClass === 'a4-landscape');
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    
    document.addEventListener('keydown', onWordModalKeydown);

    // 绑定模态框内部的单词发音点击事件
    contentEl.querySelectorAll('.wm-word, .wm-def-word, .wm-phrase[data-word]').forEach(el => {
        el.addEventListener('click', (ev) => playAudio(ev.currentTarget.getAttribute('data-word') || ev.currentTarget.textContent, ev));
    });
}

function closeWordModal() {
    const overlay = document.getElementById('wordModalOverlay');
    if (overlay) {
        if (document.activeElement && overlay.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        document.removeEventListener('keydown', onWordModalKeydown);
    }
}

function onWordModalKeydown(e) { 
    if (e.key === 'Escape') closeWordModal(); 
}

// 页面加载后自动绑定背景板和关闭按钮事件
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('wordModalBackdrop')?.addEventListener('click', closeWordModal);
    document.getElementById('wordModalClose')?.addEventListener('click', closeWordModal);
});