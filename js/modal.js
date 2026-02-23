// ==========================================
// 单词表排版工具 - 模态框与发音模块 (modal.js)
// 依赖: utils.js (用于 HTML 转义等纯工具函数)
// ==========================================

let currentAudio = null;
let _autoPlayTimer = null;
let _modalNavContext = null;  // { data, index, getLayout, getColumns }

function navigateModal(delta) {
    if (!_modalNavContext) return;
    const newIndex = _modalNavContext.index + delta;
    if (newIndex < 0 || newIndex >= _modalNavContext.data.length) return;
    openWordModal(
        _modalNavContext.data[newIndex],
        _modalNavContext.getLayout(),
        _modalNavContext.getColumns(),
        { ..._modalNavContext, index: newIndex }
    );
}

function spawnHeroRipple(el, ev) {
    const ripple = document.createElement('span');
    ripple.className = 'wm-hero-ripple';
    if (ev) {
        const rect = el.getBoundingClientRect();
        ripple.style.left = (ev.clientX - rect.left) + 'px';
        ripple.style.top  = (ev.clientY - rect.top)  + 'px';
    } else {
        ripple.style.left = '50%';
        ripple.style.top  = '50%';
    }
    el.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

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
    let phrases = [];

    displayColumns.forEach(col => {
        if (col.type === 'wordPhonetic') {
            rawWord = (row[col.wordIdx] || '').trim();
            phonetic = (row[col.phoneticIdx] || '').trim();
        } else if (col.type === 'combined') {
            def = (row[col.defIdx] || '').trim();
            brief = (row[col.briefIdx] || '').trim();
            if (col.phraseIdx >= 0) {
                phrases = parseAllPhrases(row[col.phraseIdx]);
            }
        }
    });

    def = wrapDefWordsForModal(escapeHtml(def));
    brief = wrapBriefPosForModal(escapeHtml(brief));

    // 将短语中每个单词包成独立可点击 span
    function wrapPhraseWords(raw) {
        return raw.split(/(\s+)/).map(token => {
            if (/^\s+$/.test(token)) return token;
            const word = token.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, '');
            const display = escapeHtml(token);
            if (!word) return display;
            return `<span class="wm-phrase-word" data-word="${escapeHtml(word)}" title="点击发音">${display}</span>`;
        }).join('');
    }

    const phraseBlockHtml = phrases.length ? `
                <div class="wm-block wm-phrase-block">
                    <div class="wm-label">📌 短语搭配</div>
                    <div class="wm-phrase-list">
                        ${phrases.map(p => `<div class="wm-phrase-item">
                                <span class="wm-phrase-en">${wrapPhraseWords(p.en)}</span>
                                ${p.zh ? `<span class="wm-phrase-zh">${escapeHtml(p.zh)}</span>` : ''}
                            </div>`).join('')}
                    </div>
                </div>` : '';

    return `
        <div class="wm-card">
            <div class="wm-hero" ${rawWord ? `title="点击发音"` : ''}>
                <div class="wm-word" ${rawWord ? `data-word="${escapeHtml(rawWord)}"` : ''}>${escapeHtml(rawWord) || '&nbsp;'}</div>
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
                        <div class="wm-label">🤖 AI 单词讲解</div>
                        <button type="button" class="wm-ai-regen-btn" style="display:none;" disabled>↺ 重新生成</button>
                    </div>
                    <div class="wm-ai-tabs">
                        ${AI_ROLES.map((r, i) => `<div class="wm-ai-tab${i === 0 ? ' active' : ''}" data-role="${r.id}" data-state="loading">${escapeHtml(r.label)}</div>`).join('')}
                    </div>
                    <div class="wm-ai-panels">
                        ${AI_ROLES.map((r, i) => `<div class="wm-ai-panel${i === 0 ? ' active' : ''}" data-role="${r.id}" data-state="loading"><div class="wm-ai-text"></div></div>`).join('')}
                    </div>
                </div>
                ${phraseBlockHtml}
            </div>
        </div>`;
}

// --- AI 讲解生成 ---
function applyBold(escaped) {
    // **text** → <strong>text</strong>
    return escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // 英文例句（中文翻译）→ 翻译部分用淡色 span
        .replace(/（([^）]+)）/, '&thinsp;<span class="wm-ai-translation">（$1）</span>');
}

function formatAiText(text) {
    return text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '<div class="wm-ai-gap"></div>';
        const escaped = escapeHtml(trimmed);
        const html    = applyBold(escaped);

        // 章节标题行：以 emoji 开头（🎯🏫✨🎤💡🎬🗣🏃🎮🧠🌟 等）
        if (/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u.test(trimmed)) {
            return `<div class="wm-ai-section">${html}</div>`;
        }
        // 编号例句行：1. / 2. 等
        if (/^\d+\./.test(trimmed)) {
            return `<div class="wm-ai-sentence">${html}</div>`;
        }
        return `<div class="wm-ai-line">${html}</div>`;
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
function openWordModal(rowData, layoutClass, displayColumns, navCtx = null) {
    _modalNavContext = navCtx;
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

    // 前/后导航按钮（位于 overlay 层，modal box 外侧）
    const prevBtn = document.getElementById('wordModalPrev');
    const nextBtn = document.getElementById('wordModalNext');
    if (prevBtn && nextBtn) {
        if (navCtx) {
            prevBtn.style.visibility = '';
            nextBtn.style.visibility = '';
            prevBtn.disabled = navCtx.index <= 0;
            nextBtn.disabled = navCtx.index >= navCtx.data.length - 1;
            prevBtn.onclick = () => navigateModal(-1);
            nextBtn.onclick = () => navigateModal(+1);
        } else {
            prevBtn.style.visibility = 'hidden';
            nextBtn.style.visibility = 'hidden';
            prevBtn.onclick = null;
            nextBtn.onclick = null;
        }
    }

    // 绑定模态框内部的单词发音点击事件（.wm-hero 整块可点击发音，附带波纹效果）
    contentEl.querySelectorAll('.wm-hero, .wm-def-word, .wm-phrase[data-word], .wm-phrase-en[data-word], .wm-phrase-word[data-word]').forEach(el => {
        el.addEventListener('click', (ev) => {
            let word = '';
            if (el.classList.contains('wm-hero')) {
                const wmWord = el.querySelector('.wm-word');
                word = wmWord?.getAttribute('data-word') || wmWord?.textContent || '';
                if (wmWord) spawnHeroRipple(wmWord, ev);
            } else {
                word = el.getAttribute('data-word') || el.textContent;
            }
            if (word) playAudio(word, ev);
        });
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

    // 1 秒后自动朗读单词，同时触发 hero 波纹
    if (_autoPlayTimer) clearTimeout(_autoPlayTimer);
    if (aiWord) {
        _autoPlayTimer = setTimeout(() => {
            playAudio(aiWord);
            const wmWord = contentEl.querySelector('.wm-word');
            if (wmWord) spawnHeroRipple(wmWord);
        }, 1000);
    }

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

        // 默认激活用户在工具栏选择的讲解角色
        const preferredRole = document.getElementById('roleSelect')?.value || AI_ROLES[0]?.id;
        if (preferredRole) switchAiTab(aiBlock, preferredRole);

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
    if (_autoPlayTimer) { clearTimeout(_autoPlayTimer); _autoPlayTimer = null; }
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
    if (e.key === 'Escape')     closeWordModal();
    if (e.key === 'ArrowLeft')  navigateModal(-1);
    if (e.key === 'ArrowRight') navigateModal(+1);
}

// 页面加载后自动绑定背景板和关闭按钮事件
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('wordModalBackdrop')?.addEventListener('click', closeWordModal);
    document.getElementById('wordModalClose')?.addEventListener('click', closeWordModal);
});