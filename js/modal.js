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
            </div>
            <div class="wm-body">
                <div class="wm-block">
                    <div class="wm-label-row">
                        <div class="wm-label">📖 英文释义</div>
                        ${phonetic ? `<div class="wm-phonetic">${escapeHtml(phonetic)}</div>` : ''}
                    </div>
                    <div class="wm-text">${def || '—'}</div>
                </div>
                <div class="wm-block"><div class="wm-label">✨ 简明释义</div><div class="wm-text">${brief || '—'}</div></div>
                <div class="wm-block wm-ai-block">
                    <div class="wm-label-row">
                        <div class="wm-label">🤖 AI 儿童讲解</div>
                        <button type="button" class="wm-ai-regen-btn" style="display:none;" disabled>↺ 重新生成</button>
                    </div>
                    <div class="wm-ai-tabs">
                        ${AI_ROLES.map((r, i) => `<div class="wm-ai-tab${i === 0 ? ' active' : ''}" data-role="${r.id}" data-state="loading">${escapeHtml(r.label)}</div>`).join('')}
                    </div>
                    <div class="wm-ai-panels">
                        ${AI_ROLES.map((r, i) => `<div class="wm-ai-panel${i === 0 ? ' active' : ''}" data-role="${r.id}" data-state="loading"><div class="wm-ai-text"></div></div>`).join('')}
                    </div>
                </div>
            </div>
        </div>`;
}

// --- AI 讲解生成 ---
function formatAiText(text) {
    return text.split('\n').map(line => {
        if (!line.trim()) return '<div class="wm-ai-gap"></div>';
        const escaped = escapeHtml(line.trim());
        if (/^[💡🎬🗣🏃🎮🧠]/.test(line.trim())) {
            return `<div class="wm-ai-section">${escaped}</div>`;
        }
        return `<div class="wm-ai-line">${escaped}</div>`;
    }).join('');
}

// 设置标签页及面板的状态，并同步更新重新生成按钮可见性
function setTabState(block, roleId, state) {
    const tab = block.querySelector(`.wm-ai-tab[data-role="${roleId}"]`);
    const panel = block.querySelector(`.wm-ai-panel[data-role="${roleId}"]`);
    if (tab)   tab.setAttribute('data-state', state);
    if (panel) panel.setAttribute('data-state', state);

    const activeTab = block.querySelector('.wm-ai-tab.active');
    if (activeTab?.getAttribute('data-role') === roleId) {
        const regenBtn = block.querySelector('.wm-ai-regen-btn');
        if (regenBtn) {
            const done = state === 'done' || state === 'error';
            regenBtn.style.display = done ? '' : 'none';
            regenBtn.disabled = !done;
        }
    }
}

// 切换标签页并同步重新生成按钮状态
function switchAiTab(block, roleId) {
    block.querySelectorAll('.wm-ai-tab').forEach(t =>
        t.classList.toggle('active', t.getAttribute('data-role') === roleId));
    block.querySelectorAll('.wm-ai-panel').forEach(p =>
        p.classList.toggle('active', p.getAttribute('data-role') === roleId));

    const panel = block.querySelector(`.wm-ai-panel[data-role="${roleId}"]`);
    const state = panel?.getAttribute('data-state') ?? 'loading';
    const regenBtn = block.querySelector('.wm-ai-regen-btn');
    if (regenBtn) {
        const done = state === 'done' || state === 'error';
        regenBtn.style.display = done ? '' : 'none';
        regenBtn.disabled = !done;
    }
}

// 针对某一角色启动（或强制重新）生成
function startRoleGeneration(block, word, phonetic, def, brief, roleId, forceRegen = false) {
    const panel = block.querySelector(`.wm-ai-panel[data-role="${roleId}"]`);
    if (!panel) return;
    const textEl = panel.querySelector('.wm-ai-text');

    // 命中缓存则直接渲染
    if (!forceRegen) {
        const cached = getCachedResult(word, roleId);
        if (cached) {
            textEl.innerHTML = formatAiText(cached);
            setTabState(block, roleId, 'done');
            return;
        }
    }

    setTabState(block, roleId, 'loading');
    textEl.textContent = '';
    const cursor = document.createElement('span');
    cursor.className = 'wm-ai-cursor';
    textEl.appendChild(cursor);

    let buffer = '';
    fetchAiExplanation({
        word, phonetic, def, brief, roleId,
        onChunk(delta) {
            buffer += delta;
            textEl.textContent = buffer;
            textEl.appendChild(cursor);
        },
        onDone() {
            textEl.innerHTML = formatAiText(buffer);
            setCachedResult(word, roleId, buffer);
            setTabState(block, roleId, 'done');
        },
        onError(err) {
            cursor.remove();
            textEl.innerHTML = `<span class="wm-ai-error">生成失败：${escapeHtml(err.message)}</span>`;
            setTabState(block, roleId, 'error');
        },
    });
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

    // 提取原始词条数据
    let aiWord = '', aiPhonetic = '', aiDef = '', aiBrief = '';
    displayColumns.forEach(col => {
        if (col.type === 'wordPhonetic') {
            aiWord = (rowData[col.wordIdx] || '').trim();
            aiPhonetic = (rowData[col.phoneticIdx] || '').trim();
        } else if (col.type === 'combined') {
            aiDef = (rowData[col.defIdx] || '').trim();
            aiBrief = (rowData[col.briefIdx] || '').trim();
        }
    });

    const aiBlock = contentEl.querySelector('.wm-ai-block');
    if (aiBlock) {
        // 并发触发所有角色生成
        AI_ROLES.forEach(role => {
            startRoleGeneration(aiBlock, aiWord, aiPhonetic, aiDef, aiBrief, role.id);
        });

        // 标签页切换
        aiBlock.querySelectorAll('.wm-ai-tab').forEach(tab => {
            tab.addEventListener('click', () => switchAiTab(aiBlock, tab.getAttribute('data-role')));
        });

        // 重新生成（仅针对当前激活标签）
        const regenBtn = aiBlock.querySelector('.wm-ai-regen-btn');
        if (regenBtn) {
            regenBtn.addEventListener('click', () => {
                const activeTab = aiBlock.querySelector('.wm-ai-tab.active');
                const roleId = activeTab?.getAttribute('data-role');
                if (roleId) startRoleGeneration(aiBlock, aiWord, aiPhonetic, aiDef, aiBrief, roleId, true);
            });
        }
    }
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