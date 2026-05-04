// ==========================================
// 图片识别单词模块 (ai_ocr.js)
// 依赖: ai_config.js (AI_CONFIG), utils.js (escapeHtml)
// ==========================================

const OCR_VISION_MODEL = 'PaddlePaddle/PaddleOCR-VL-1.5';
const OCR_CLEAN_MODEL = AI_CONFIG.model;

const OCR_VISION_PROMPT = `请仔细观察图片，识别其中出现的所有文本内容，将识别到的完整文本返回给我。`;

const OCR_CLEAN_PROMPT = `你是英文学习词汇筛选助手。请根据我提供的OCR原文，提取有学习价值的英文单词。

筛选规则：
1) 仅保留英文单词（可包含连字符或撇号），忽略数字、符号、网址等。
2) 优先保留有学习价值的实词（名词、动词、形容词、副词等），忽略 a/the/is/of/to/and 等常见功能词。
3) 去重（大小写不敏感）。
4) 每行仅输出一个单词，不加序号、不加解释、不加标点。
5) 如果无法提取有效英文单词，返回空字符串。`;

// ==========================================
// 图片文件 → base64
// ==========================================
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result); // data:image/...;base64,...
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// dataURL → { base64, mimeType }
function splitDataUrl(dataUrl) {
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error('无效的图片数据');
    return { mimeType: m[1], base64: m[2] };
}

// ==========================================
// 调用视觉模型（PaddleOCR-VL）提取完整文本
// ==========================================
async function callVisionApi(dataUrl) {
    const { mimeType, base64 } = splitDataUrl(dataUrl);

    console.group(`🤖 AI图片识别 · ${OCR_VISION_MODEL}`);
    console.log('%c📤 Prompt', 'color:#667eea;font-weight:bold');
    console.log(OCR_VISION_PROMPT);
    console.log(`📎 图片：${mimeType}，base64长度 ${base64.length} 字符`);

    const res = await fetch(AI_CONFIG.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
        },
        body: JSON.stringify({
            model: OCR_VISION_MODEL,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: { url: `data:${mimeType};base64,${base64}` }
                    },
                    { type: 'text', text: OCR_VISION_PROMPT }
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

// ==========================================
// 调用文本模型（Qwen2.5-7B）清洗 OCR 原文
// ==========================================
async function callTextCleanApi(rawText) {
    console.group(`🧹 OCR文本清洗 · ${OCR_CLEAN_MODEL}`);
    console.log('%c📤 Prompt', 'color:#667eea;font-weight:bold');
    console.log(OCR_CLEAN_PROMPT);
    console.log('%c📝 OCR Raw Text', 'color:#667eea;font-weight:bold');
    console.log(rawText);

    const res = await fetch(AI_CONFIG.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
        },
        body: JSON.stringify({
            model: OCR_CLEAN_MODEL,
            messages: [
                { role: 'system', content: OCR_CLEAN_PROMPT },
                {
                    role: 'user',
                    content: `以下是OCR原文，请按规则输出结果：\n\n${rawText}`
                }
            ],
            stream: false,
            max_tokens: 500,
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

// ==========================================
// 解析 OCR 返回，提取纯单词列表
// ==========================================
function parseOcrWords(text) {
    return text
        .split('\n')
        .map(l => l.replace(/^\d+[\.\、\)]\s*/, '').trim())  // 去掉可能的序号
        .filter(w => /^[a-zA-Z][a-zA-Z\-']*$/.test(w))       // 仅保留英文单词
        .filter((w, i, arr) => arr.findIndex(x => x.toLowerCase() === w.toLowerCase()) === i);
}

// ==========================================
// 处理图片（展示预览 + 调用 API + 填入 textarea）
// ==========================================
async function processImage(dataUrl) {
    const previewEl = document.getElementById('genOcrPreview');
    const imgEl     = document.getElementById('genOcrImg');
    const statusEl  = document.getElementById('genOcrStatus');

    // 显示预览
    if (imgEl)     imgEl.src = dataUrl;
    if (previewEl) previewEl.style.display = '';
    if (statusEl)  { statusEl.textContent = '⏳ 识别中…'; statusEl.className = 'gen-ocr-status'; }

    try {
        const raw = await callVisionApi(dataUrl);
        const cleaned = await callTextCleanApi(raw);
        const words = parseOcrWords(cleaned);

        if (words.length === 0) {
            if (statusEl) { statusEl.textContent = '⚠️ 未识别到有效英文单词，请换张图片'; statusEl.className = 'gen-ocr-status error'; }
            return;
        }

        // 追加到 textarea（已有内容则逗号分隔，新识别词也用逗号连接）
        const textarea = document.getElementById('genWordsInput');
        if (textarea) {
            const existing = textarea.value.trim();
            const newText  = words.join(', ');
            textarea.value = existing ? existing + ', ' + newText : newText;
        }

        if (statusEl) {
            statusEl.textContent = `✅ 识别到 ${words.length} 个单词，已填入下方`;
            statusEl.className = 'gen-ocr-status done';
        }
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = `❌ 识别失败：${err.message}`;
            statusEl.className = 'gen-ocr-status error';
        }
    }
}

// ==========================================
// 本地文件上传
// ==========================================
function openLocalFile() {
    document.getElementById('genFileInput')?.click();
}

// ==========================================
// 事件绑定
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 单一入口：由系统决定拍照/相册/文件
    document.getElementById('genOcrUploadBtn')?.addEventListener('click', openLocalFile);

    document.getElementById('genFileInput')?.addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';               // 允许重复选同一文件
        const dataUrl = await fileToBase64(file);
        processImage(dataUrl);
    });

});
