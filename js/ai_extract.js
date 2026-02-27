// ==========================================
// 图片选词提取模块 (ai_extract.js)
// 使用 PaddlePaddle/PaddleOCR-VL 模型提取图片中的所有英文单词
// 依赖: ai_config.js (AI_CONFIG), utils.js (escapeHtml)
// ==========================================

const EXTRACT_MODEL = 'PaddlePaddle/PaddleOCR-VL';

const EXTRACT_PROMPT = `请仔细观察图片，识别其中出现的所有文本内容，将识别到的完整文本返回给我。`;

// 存储当前选中的单词（按位置索引）
let _selectedIndices = new Set();
let _wordElements = [];

// 保存最后一次AI返回的原始文本和选中的单词
let _lastExtractedText = '';
let _lastSelectedWords = [];

// ==========================================
// 图片文件 → base64
// ==========================================
function fileToBase64Extract(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// dataURL → { base64, mimeType }
function splitDataUrlExtract(dataUrl) {
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error('无效的图片数据');
    return { mimeType: m[1], base64: m[2] };
}

// ==========================================
// 调用 PaddleOCR-VL 视觉模型
// ==========================================
async function callExtractVisionApi(dataUrl) {
    const { mimeType, base64 } = splitDataUrlExtract(dataUrl);

    console.group(`🔍 选词提取 · ${EXTRACT_MODEL}`);
    console.log('%c📤 Prompt', 'color:#667eea;font-weight:bold');
    console.log(EXTRACT_PROMPT);
    console.log(`📎 图片：${mimeType}，base64长度 ${base64.length} 字符`);

    const res = await fetch(AI_CONFIG.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
        },
        body: JSON.stringify({
            model: EXTRACT_MODEL,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: { url: `data:${mimeType};base64,${base64}` }
                    },
                    { type: 'text', text: EXTRACT_PROMPT }
                ]
            }],
            stream: false,
            max_tokens: 800,
            temperature: 0.1,
        }),
    });

    if (!res.ok) { console.groupEnd(); throw new Error(`HTTP ${res.status} ${res.statusText}`); }
    const data    = await res.json();
    const content = (data.choices?.[0]?.message?.content || '').trim();

    console.log('%c📥 Response', 'color:#2ea043;font-weight:bold');
    console.log(content);
    console.groupEnd();
    return content;
}

// HTML转义函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// 将原始文本转换为可点击的单词HTML
// ==========================================
function createClickableText(text) {
    // 将文本分割为单词和非单词部分
    const parts = text.split(/([a-zA-Z][a-zA-Z\-'']*)/g);
    let wordIndex = 0;
    
    return parts.map(part => {
        if (/^[a-zA-Z][a-zA-Z\-'']*$/.test(part)) {
            // 是单词，包装成可点击元素
            const index = wordIndex++;
            return `<span class="extract-text-word" data-index="${index}">${escapeHtml(part)}</span>`;
        }
        // 非单词部分（空格、标点等），直接返回
        return escapeHtml(part);
    }).join('');
}

// ==========================================
// 选词弹窗相关函数
// ==========================================
function openExtractSelectModal() {
    const overlay = document.getElementById('extractSelectOverlay');
    if (!overlay) return;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
}

function closeExtractSelectModal() {
    const overlay = document.getElementById('extractSelectOverlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
}

function updateExtractSelectedCount() {
    const countEl = document.getElementById('extractSelectedCount');
    if (countEl) {
        countEl.textContent = `已选 ${_selectedIndices.size} 个`;
    }
}

function toggleWordSelection(index) {
    const el = document.querySelector(`.extract-text-word[data-index="${index}"]`);
    if (!el) return;
    
    if (_selectedIndices.has(index)) {
        _selectedIndices.delete(index);
        el.classList.remove('selected');
    } else {
        _selectedIndices.add(index);
        el.classList.add('selected');
    }
    updateExtractSelectedCount();
}

function renderExtractSelectModal(rawText, restoreSelection = false) {
    _wordElements = [];
    
    // 如果不是恢复模式，清空之前的选择
    if (!restoreSelection) {
        _selectedIndices.clear();
    }

    const rawTextEl = document.getElementById('extractRawText');

    if (rawTextEl) {
        // 显示可点击的原文
        rawTextEl.innerHTML = createClickableText(rawText);
        // 绑定点击事件
        rawTextEl.querySelectorAll('.extract-text-word').forEach(el => {
            const index = parseInt(el.dataset.index);
            _wordElements.push({ index, word: el.textContent });
            
            // 如果是恢复模式，恢复之前的选中状态
            if (restoreSelection && _selectedIndices.has(index)) {
                el.classList.add('selected');
            }
            
            el.addEventListener('click', () => {
                toggleWordSelection(index);
            });
        });
    }

    updateExtractSelectedCount();
    openExtractSelectModal();
}

function confirmExtractSelection() {
    if (_selectedIndices.size === 0) {
        closeExtractSelectModal();
        return;
    }

    // 按原文顺序获取选中的单词，并去重（只保留第一个出现的）
    const selectedWords = [];
    const seenWords = new Set();
    _wordElements.forEach(({ index, word }) => {
        if (_selectedIndices.has(index)) {
            const lowerWord = word.toLowerCase();
            if (!seenWords.has(lowerWord)) {
                seenWords.add(lowerWord);
                selectedWords.push(word);
            }
        }
    });

    // 保存选中的单词
    _lastSelectedWords = [...selectedWords];

    // 替换 textarea 中的内容
    const textarea = document.getElementById('genWordsInput');
    if (textarea) {
        textarea.value = selectedWords.join(', ');
    }

    // 更新状态显示
    const statusEl = document.getElementById('genOcrStatus');
    const wordCountEl = document.getElementById('genOcrWordCount');
    if (statusEl) {
        statusEl.textContent = `✅ 已添加 ${selectedWords.length} 个单词`;
        statusEl.className = 'ocr-preview-status done';
    }
    if (wordCountEl) {
        wordCountEl.textContent = `共识别 ${_wordElements.length} 个单词，已选 ${selectedWords.length} 个`;
        wordCountEl.style.display = '';
    }

    // 显示重新选词按钮
    const reExtractBtn = document.getElementById('genReExtractBtn');
    if (reExtractBtn) {
        reExtractBtn.style.display = 'inline-flex';
    }

    closeExtractSelectModal();
}

// 重新选词 - 恢复之前的选中页面
function reExtractWords() {
    if (!_lastExtractedText) return;
    
    // 恢复之前的选择状态
    _selectedIndices.clear();
    _wordElements.forEach(({ index, word }) => {
        const lowerWord = word.toLowerCase();
        if (_lastSelectedWords.some(w => w.toLowerCase() === lowerWord)) {
            _selectedIndices.add(index);
        }
    });
    
    // 重新渲染弹窗，恢复选中状态
    renderExtractSelectModal(_lastExtractedText, true);
}

// ==========================================
// 处理图片（展示预览 + 调用 API + 显示选择弹窗）
// ==========================================
async function processExtractImage(dataUrl, isReExtract = false) {
    const previewEl = document.getElementById('genOcrPreview');
    const imgEl     = document.getElementById('genOcrImg');
    const statusEl  = document.getElementById('genOcrStatus');
    const reExtractBtn = document.getElementById('genReExtractBtn');

    // 显示预览
    if (imgEl)     imgEl.src = dataUrl;
    if (previewEl) previewEl.style.display = '';
    if (statusEl)  { statusEl.textContent = '⏳ 提取中…'; statusEl.className = 'ocr-preview-status'; }
    if (reExtractBtn) reExtractBtn.style.display = 'none';

    try {
        // 如果是重新选词且已有保存的文本，直接使用
        let raw;
        if (isReExtract && _lastExtractedText) {
            raw = _lastExtractedText;
            if (statusEl) {
                statusEl.textContent = `✅ 识别完成，请点击选择单词`;
                statusEl.className = 'ocr-preview-status done';
            }
        } else {
            // 新的导入，清空之前的数据
            _lastExtractedText = '';
            _lastSelectedWords = [];
            _selectedIndices.clear();
            
            raw = await callExtractVisionApi(dataUrl);
            _lastExtractedText = raw;
            
            if (statusEl) {
                statusEl.textContent = `✅ 识别完成，请点击选择单词`;
                statusEl.className = 'ocr-preview-status done';
            }
        }

        // 显示选择弹窗
        renderExtractSelectModal(raw, isReExtract);
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = `❌ 提取失败：${err.message}`;
            statusEl.className = 'ocr-preview-status error';
        }
    }
}

// ==========================================
// 本地文件上传
// ==========================================
function openExtractLocalFile() {
    document.getElementById('genExtractFileInput')?.click();
}

// ==========================================
// 摄像头拍照：直接调起系统原生相机
// ==========================================
function openExtractCamera() {
    document.getElementById('genExtractCaptureInput')?.click();
}

// ==========================================
// 事件绑定
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 选词按钮点击 - 调起系统原生相机
    document.getElementById('genOcrExtractBtn')?.addEventListener('click', openExtractCamera);

    // 本地文件选择
    document.getElementById('genExtractFileInput')?.addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        const dataUrl = await fileToBase64Extract(file);
        processExtractImage(dataUrl);
    });

    // 相机拍照选择
    document.getElementById('genExtractCaptureInput')?.addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        const dataUrl = await fileToBase64Extract(file);
        processExtractImage(dataUrl);
    });

    // 重新选词按钮
    document.getElementById('genReExtractBtn')?.addEventListener('click', () => {
        reExtractWords();
    });

    // 选词弹窗事件
    document.getElementById('extractSelectBackdrop')?.addEventListener('click', closeExtractSelectModal);
    document.getElementById('extractSelectClose')?.addEventListener('click', closeExtractSelectModal);

    // 全选按钮 - 选中所有单词
    document.getElementById('extractSelectAllBtn')?.addEventListener('click', () => {
        _wordElements.forEach(({ index }) => {
            _selectedIndices.add(index);
        });
        document.querySelectorAll('.extract-text-word').forEach(el => {
            el.classList.add('selected');
        });
        updateExtractSelectedCount();
    });

    // 取消全选按钮
    document.getElementById('extractClearBtn')?.addEventListener('click', () => {
        _selectedIndices.clear();
        document.querySelectorAll('.extract-text-word').forEach(el => {
            el.classList.remove('selected');
        });
        updateExtractSelectedCount();
    });

    // 确定按钮
    document.getElementById('extractConfirmBtn')?.addEventListener('click', confirmExtractSelection);

    // Escape 关闭弹窗
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('extractSelectOverlay');
            if (overlay?.classList.contains('show')) closeExtractSelectModal();
        }
    });
});
