// ==========================================
// 深度语法讲解模块 (deep_analysis.js)
// 依赖: ai_config.js (AI_CONFIG), utils.js (escapeHtml)
// ==========================================

let _deepPageDiv   = null;       // 来源页的 .page 元素
let _deepSelected  = new Set();  // 当前选中的单词
let _deepAllWords  = [];         // 本页全部单词（随机池）

// ==========================================
// 从 .page 元素提取词表单词（仅第一列词汇，不含释义中的可点击词）
// ==========================================
function getWordsFromPage(pageDiv) {
    const seen  = new Set();
    const words = [];
    // 合并列：.cell-word[data-word]（单词+音标合并格内的单词 div）
    // 独立列：td.col-word[data-word]（独立单词列的 td）
    pageDiv.querySelectorAll('.cell-word[data-word], td.col-word[data-word]').forEach(el => {
        const w = el.getAttribute('data-word').trim();
        if (w && !seen.has(w.toLowerCase())) {
            seen.add(w.toLowerCase());
            words.push(w);
        }
    });
    return words;
}

// ==========================================
// 构建 Prompt
// ==========================================
function buildDeepPrompt(words, roleValue) {
    const difficulty = roleValue === 'age9'
        ? '中国初中生（中考英语水平，B1级别）'
        : '中国小学生（小学高年级，A1-A2水平）';

    return `【角色设定】
你是一位拥有10年经验的"剑桥英语/中考英语教材首席教研员"和"极其严苛的母语级英文校对专家"。你的专长是将零散的单词，巧妙且【极其地道、自然地】融合进实用语境中。

【生死红线与工作流】（必须以生命起誓严格遵守！）
1. 逻辑与地道至上（最高优先级）： 绝对严禁为了把所有单词凑进一句话，而生造出毫无逻辑、语法错乱的中式英语（Chinglish）！像 "I live why I can..." 这种病句是绝对不被允许的。
2. 开启"逃生通道"： 如果提供的单词组合起来关联性极弱（极度违和），千万不要强行塞进一个简单句！你可以采取以下合法方案：
   - 方案 A：造一个包含主从句或并列句的复合长句（例如用 because, but 桥接）。
   - 方案 B：造一个极其简短的 A与B 的日常对话（Dialogue）。
   - 方案 C：如果某个单词实在无法融入，允许你【合理舍弃 1 个】最不搭的单词，确保整个句子像纯正英美母语者说的话。
3. 中英绝对对应： 你提供的中文翻译，必须与你写出的英文原句【字面意思完全对应】。严禁英文是一个意思，中文翻译自己疯狂"加戏"或脑补。
4. 明确的语法骨架： 句子必须包含【一个】清晰的核心语法考点。

【输出结构】（请严格按此格式输出，保留所有 Emoji 和标点）

📖 **【Sentence 经典锚点句】**
[写出你构造的地道英文原句或对话，并将我提供的目标单词加粗]

💡 [提供精准、自然且与英文完全对应的中文翻译]

📝 **【语法笔记】**
[用一句话说明本句应用的核心语法，例如：时间状语从句 | 过去进行时 | 不定式作宾语]
* **语法解析**：[用大白话解释这个句子里为什么用这个语法结构]
* **串联词汇的释义与用法**：
  - [串联单词1]：[解释该单词在本句中的释义与典型用法/搭配]
  - [串联单词2]：[解释该单词在本句中的释义与典型用法/搭配]
  - ...
【本次需要串联的单词】
${words.join(', ')}

目标受众难度：[${difficulty}]`;
}

// ==========================================
// 流式 AI 调用
// ==========================================
async function streamDeepAnalysis(prompt, onChunk, onDone, onError) {
    console.group('🤖 AI深度讲解');
    console.log('%c📤 Prompt', 'color:#667eea;font-weight:bold');
    console.log(prompt);

    let _deepLogBuffer = '';
    try {
        const res = await fetch(AI_CONFIG.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
            },
            body: JSON.stringify({
                model: AI_CONFIG.model,
                messages: [{ role: 'user', content: prompt }],
                stream: true,
                max_tokens: 1200,
                temperature: 0.7,
            }),
        });

        if (!res.ok) { console.groupEnd(); throw new Error(`HTTP ${res.status} ${res.statusText}`); }

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of decoder.decode(value, { stream: true }).split('\n')) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                    console.log('%c📥 Response', 'color:#2ea043;font-weight:bold');
                    console.log(_deepLogBuffer);
                    console.groupEnd();
                    onDone?.();
                    return;
                }
                try {
                    const delta = JSON.parse(data).choices?.[0]?.delta?.content;
                    if (delta) { _deepLogBuffer += delta; onChunk(delta); }
                } catch { /* skip malformed chunk */ }
            }
        }
        console.log('%c📥 Response', 'color:#2ea043;font-weight:bold');
        console.log(_deepLogBuffer);
        console.groupEnd();
        onDone?.();
    } catch (err) {
        console.error('❌ AI Error:', err);
        console.groupEnd();
        onError?.(err);
    }
}

// ==========================================
// 输出格式化（Markdown-lite）
// ==========================================
function formatDeepLine(raw) {
    // Escape HTML first, then restore bold markup
    let html = escapeHtml(raw).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return html;
}

function renderDeepOutput(text) {
    const lines = text.split('\n');
    return lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '<div class="da-gap"></div>';

        const html = formatDeepLine(trimmed);

        // Emoji section headers: 📖 📝 💡
        if (/^[📖📝💡]/.test(trimmed)) {
            return `<div class="da-section">${html}</div>`;
        }
        // Primary bullet (* text)
        if (/^\*\s/.test(trimmed)) {
            const inner = formatDeepLine(trimmed.slice(2));
            return `<div class="da-bullet">${inner}</div>`;
        }
        // Sub-bullet (  - text, with leading spaces)
        if (/^\s{2,}-\s/.test(line)) {
            const inner = formatDeepLine(trimmed.slice(2));
            return `<div class="da-sub-bullet">${inner}</div>`;
        }
        return `<div class="da-line">${html}</div>`;
    }).join('');
}

// ==========================================
// 单词 Chip 渲染
// ==========================================
function renderChips(words) {
    const container = document.getElementById('deepWordChips');
    if (!container) return;
    container.innerHTML = '';

    words.forEach(word => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'da-chip' + (_deepSelected.has(word) ? ' selected' : '');
        chip.textContent = word;
        chip.dataset.word = word;
        chip.addEventListener('click', () => {
            if (_deepSelected.has(word)) {
                _deepSelected.delete(word);
                chip.classList.remove('selected');
            } else {
                _deepSelected.add(word);
                chip.classList.add('selected');
            }
            updateGenBtn();
        });
        container.appendChild(chip);
    });
}

function updateGenBtn() {
    const btn = document.getElementById('deepGenBtn');
    if (!btn) return;
    const n = _deepSelected.size;
    btn.disabled = n === 0;
    btn.textContent = n > 0 ? `✨ 开始讲解（${n} 个单词）` : '✨ 开始讲解';
}

// ==========================================
// 打开 / 关闭模态框
// ==========================================
function openDeepModal(pageDiv) {
    _deepPageDiv  = pageDiv;
    _deepSelected.clear();

    const words = getWordsFromPage(pageDiv);
    _deepAllWords = words;

    // 随机数输入框：上限 = 本页单词数，默认值 min(5, 总数)
    const randNumEl = document.getElementById('deepRandNum');
    if (randNumEl) {
        randNumEl.max   = words.length;
        randNumEl.value = Math.min(parseInt(randNumEl.value, 10) || 5, words.length);
    }

    // 同步全局 roleSelect → 模态内下拉（用户可在模态里再手动改）
    const globalRole     = document.getElementById('roleSelect')?.value || 'age6';
    const deepRoleSelect = document.getElementById('deepRoleSelect');
    if (deepRoleSelect) deepRoleSelect.value = globalRole;

    // 重置输出区
    const outputArea = document.getElementById('deepOutputArea');
    const outputContent = document.getElementById('deepOutputContent');
    if (outputArea)    outputArea.style.display = 'none';
    if (outputContent) outputContent.innerHTML  = '';

    // 先渲染所有 chips（全部未选中），再执行随机选择作为默认状态
    renderChips(words);
    applyRandomSelection();
    updateGenBtn();

    const overlay = document.getElementById('deepModalOverlay');
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeDeepModal() {
    const overlay = document.getElementById('deepModalOverlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

// ==========================================
// 生成逻辑
// ==========================================
async function startDeepGeneration() {
    const words = [..._deepSelected];
    if (words.length === 0) return;

    const genBtn      = document.getElementById('deepGenBtn');
    const outputArea  = document.getElementById('deepOutputArea');
    const outputEl    = document.getElementById('deepOutputContent');
    const roleVal     = document.getElementById('deepRoleSelect')?.value || 'age6';

    genBtn.disabled    = true;
    genBtn.textContent = '⏳ 生成中…';
    outputEl.innerHTML = '';
    outputArea.style.display = '';

    // 光标
    const cursor = document.createElement('span');
    cursor.className = 'da-cursor';
    outputEl.appendChild(cursor);

    let buffer = '';

    await streamDeepAnalysis(
        buildDeepPrompt(words, roleVal),
        delta => {
            buffer += delta;
            outputEl.textContent = buffer;
            outputEl.appendChild(cursor);
            outputEl.parentElement.scrollTop = outputEl.parentElement.scrollHeight;
        },
        () => {
            cursor.remove();
            outputEl.innerHTML = renderDeepOutput(buffer);
        },
        err => {
            cursor.remove();
            outputEl.innerHTML = `<div class="da-error">生成失败：${escapeHtml(err.message)}</div>`;
        }
    );

    genBtn.disabled    = false;
    genBtn.textContent = '↺ 重新生成';
}

// ==========================================
// 随机选择
// ==========================================
function applyRandomSelection() {
    const randNumEl = document.getElementById('deepRandNum');
    let n = parseInt(randNumEl?.value, 10) || 5;
    n = Math.max(1, Math.min(n, _deepAllWords.length));
    if (randNumEl) randNumEl.value = n;

    // Fisher-Yates 洗牌，取前 n 个
    const pool = [..._deepAllWords];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picked = new Set(pool.slice(0, n));

    _deepSelected.clear();
    picked.forEach(w => _deepSelected.add(w));

    // 仅更新 chip 样式，不重建 DOM
    document.querySelectorAll('#deepWordChips .da-chip').forEach(chip => {
        chip.classList.toggle('selected', _deepSelected.has(chip.dataset.word));
    });
    updateGenBtn();
}

function adjustRandNum(delta) {
    const el = document.getElementById('deepRandNum');
    if (!el) return;
    let v = (parseInt(el.value, 10) || 5) + delta;
    v = Math.max(1, Math.min(v, _deepAllWords.length || 50));
    el.value = v;
}

// ==========================================
// 事件绑定
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('deepModalBackdrop')?.addEventListener('click', closeDeepModal);
    document.getElementById('deepModalClose')   ?.addEventListener('click', closeDeepModal);
    document.getElementById('deepGenBtn')        ?.addEventListener('click', startDeepGeneration);

    // 随机控件
    document.getElementById('deepRandMinus')?.addEventListener('click', () => adjustRandNum(-1));
    document.getElementById('deepRandPlus') ?.addEventListener('click', () => adjustRandNum(+1));
    document.getElementById('deepRandBtn')  ?.addEventListener('click', applyRandomSelection);

    document.getElementById('deepSelectAll')?.addEventListener('click', () => {
        document.querySelectorAll('#deepWordChips .da-chip').forEach(chip => {
            chip.classList.add('selected');
            _deepSelected.add(chip.dataset.word);
        });
        updateGenBtn();
    });

    document.getElementById('deepClearAll')?.addEventListener('click', () => {
        document.querySelectorAll('#deepWordChips .da-chip').forEach(chip => {
            chip.classList.remove('selected');
        });
        _deepSelected.clear();
        updateGenBtn();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('deepModalOverlay');
            if (overlay?.classList.contains('show')) closeDeepModal();
        }
    });
});
