// ==========================================
// 图片识别单词模块 (ai_ocr.js)
// 依赖: ai_config.js (AI_CONFIG), utils.js (escapeHtml)
// ==========================================

const OCR_MODEL = 'Qwen/Qwen3-VL-8B-Instruct';

const OCR_PROMPT = `请仔细观察图片，识别其中出现的所有英文单词（包括标题、正文、标注等）。
从中筛选出有学习价值的重点词汇（名词、动词、形容词、副词等实词，忽略 a/the/is 等功能词）。
如果图片里没有单词，则基于当前图片的场景为其提供10个描述当前图片场景的英语单词。
输出要求：每行仅输出一个单词，不加序号、不加解释、不加标点，只输出单词本身。`;

let _cameraStream = null;  // 当前摄像头流

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
// 调用视觉大模型
// ==========================================
async function callVisionApi(dataUrl) {
    const { mimeType, base64 } = splitDataUrl(dataUrl);

    console.group(`🤖 AI图片识别 · ${OCR_MODEL}`);
    console.log('%c📤 Prompt', 'color:#667eea;font-weight:bold');
    console.log(OCR_PROMPT);
    console.log(`📎 图片：${mimeType}，base64长度 ${base64.length} 字符`);

    const res = await fetch(AI_CONFIG.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
        },
        body: JSON.stringify({
            model: OCR_MODEL,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: { url: `data:${mimeType};base64,${base64}` }
                    },
                    { type: 'text', text: OCR_PROMPT }
                ]
            }],
            stream: false,
            max_tokens: 600,
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
        const raw   = await callVisionApi(dataUrl);
        const words = parseOcrWords(raw);

        if (words.length === 0) {
            if (statusEl) { statusEl.textContent = '⚠️ 未识别到有效英文单词，请换张图片'; statusEl.className = 'gen-ocr-status error'; }
            return;
        }

        // 追加到 textarea（已有内容则换行分隔）
        const textarea = document.getElementById('genWordsInput');
        if (textarea) {
            const existing = textarea.value.trim();
            textarea.value = existing ? existing + '\n' + words.join('\n') : words.join('\n');
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
// 摄像头拍照
// ==========================================
async function openCamera() {
    // 优先用 getUserMedia（桌面 + 现代移动端）
    if (navigator.mediaDevices?.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
            });
            showCameraOverlay(stream);
            return;
        } catch { /* 权限被拒或设备不支持，回退到 file input */ }
    }
    // 回退：直接调用系统相机
    document.getElementById('genCaptureInput')?.click();
}

function showCameraOverlay(stream) {
    _cameraStream = stream;
    const overlay = document.getElementById('cameraOverlay');
    const video   = document.getElementById('cameraVideo');
    if (!overlay || !video) return;

    video.srcObject = stream;
    overlay.style.display = '';
    document.body.style.overflow = 'hidden';
}

function closeCameraOverlay() {
    if (_cameraStream) {
        _cameraStream.getTracks().forEach(t => t.stop());
        _cameraStream = null;
    }
    const overlay = document.getElementById('cameraOverlay');
    const video   = document.getElementById('cameraVideo');
    if (video)   video.srcObject = null;
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
}

function capturePhoto() {
    const video  = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    if (!video || !canvas) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    closeCameraOverlay();
    processImage(dataUrl);
}

// ==========================================
// 事件绑定
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 本地文件
    document.getElementById('genOcrUploadBtn')?.addEventListener('click', openLocalFile);

    document.getElementById('genFileInput')?.addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';               // 允许重复选同一文件
        const dataUrl = await fileToBase64(file);
        processImage(dataUrl);
    });

    // 系统相机回退输入
    document.getElementById('genCaptureInput')?.addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        const dataUrl = await fileToBase64(file);
        processImage(dataUrl);
    });

    // getUserMedia 拍照
    document.getElementById('genOcrCameraBtn')?.addEventListener('click', openCamera);
    document.getElementById('cameraCaptureBtn')?.addEventListener('click', capturePhoto);
    document.getElementById('cameraCloseBtn')?.addEventListener('click', closeCameraOverlay);

    // 点击覆层背景关闭相机
    document.getElementById('cameraOverlay')?.addEventListener('click', e => {
        if (e.target === document.getElementById('cameraOverlay')) closeCameraOverlay();
    });

});
