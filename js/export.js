// ==========================================
// 单词表排版工具 - 导出模块 (PDF / PNG / ZIP)
// 依赖: utils.js (parsePageRange, dataUrlToU8), domtoimage, 可选 fflate
// ==========================================

function exportSinglePage(pageEl, pageNum, totalPages, triggerBtn) {
    if (typeof domtoimage === 'undefined') return alert('导出库加载中…');
    if (!pageEl) return;

    if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.textContent = '导出中…';
    }

    domtoimage.toPng(pageEl, { scale: 5 })
        .then(dataUrl => {
            const link = document.createElement('a');
            link.download = `单词表_第${pageNum}页_共${totalPages}页.png`;
            link.href = dataUrl;
            link.click();
        })
        .catch(err => alert('导出失败：' + err))
        .finally(() => {
            if (triggerBtn) {
                triggerBtn.disabled = false;
                triggerBtn.textContent = '导出';
            }
        });
}

document.addEventListener('DOMContentLoaded', () => {
    const previewArea = document.getElementById('preview-area');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const exportAllBtn = document.getElementById('exportAllBtn');

    // JSON 导出：保持与 word(2800).json 完全一致的格式
    document.getElementById('exportJsonCopyBtn')?.addEventListener('click', () => {
        if (!allData || allData.length === 0) return alert('暂无数据，请先上传文件或生成词条。');
        const json = JSON.stringify({ headers, data: allData }, null, 2);
        navigator.clipboard.writeText(json).then(() => {
            const btn  = document.getElementById('exportJsonCopyBtn');
            const name = btn?.querySelector('.export-menu-name');
            if (name) {
                const orig = name.textContent;
                name.textContent = '已复制！';
                setTimeout(() => { name.textContent = orig; }, 1800);
            }
            // 关闭菜单
            document.getElementById('exportMenuPanel')?.classList.remove('show');
        }).catch(() => alert('复制失败，请手动使用 JSON 导出'));
    });

    document.getElementById('exportJsonBtn')?.addEventListener('click', () => {
        if (!allData || allData.length === 0) return alert('暂无数据，请先上传文件或生成词条。');

        const json = JSON.stringify({ headers, data: allData }, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const date = new Date().toISOString().slice(0, 10);
        const a = document.createElement('a');
        a.href = url;
        a.download = `词表_${allData.length}条_${date}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // PDF 导出：选择范围后打开浏览器打印面板
    exportPdfBtn?.addEventListener('click', () => {
        const wraps = previewArea?.querySelectorAll('.page-export-wrap');
        if (!wraps?.length) return alert('暂无页面，请先上传文件。');

        // 关闭所有可能遮挡打印的浮层
        document.getElementById('exportMenuPanel')  ?.classList.remove('show');
        document.getElementById('exportMenuBackdrop')?.classList.remove('show');
        document.getElementById('exportMenuBtn')    ?.classList.remove('active');
        document.getElementById('wordModalOverlay') ?.classList.remove('show');
        document.getElementById('deepModalOverlay') ?.classList.remove('show');
        document.getElementById('genModalOverlay')  ?.classList.remove('show');
        document.getElementById('advSettingsPanel') ?.classList.remove('show');
        document.getElementById('advSettingsBackdrop')?.classList.remove('show');
        document.getElementById('pageActionsPopover')?.style.setProperty('display', 'none');
        document.body.style.overflow = '';

        // 等浮层隐藏后再弹 prompt / 打印
        requestAnimationFrame(() => {
        const input = prompt(`导出为 PDF 的页面范围\n示例：1-5 或 1,3,5 或 全部\n当前共 ${wraps.length} 页`, '全部');
        if (input === null) return;

        const range = parsePageRange(input, wraps.length);
        if (!range.length) return alert('未识别到有效页面范围，请重试。');

        const hidden = [];
        const previewWrapper = document.getElementById('preview-area-wrapper');
        const singlePageBtn = document.getElementById('singlePageBtn');
        const wasSinglePageMode = !!previewWrapper?.classList.contains('single-page-mode');
        const prevPreviewTransform = previewArea?.style.transform || '';

        // 打印前临时退出单页模式，否则可能只渲染当前屏的一页
        if (wasSinglePageMode && previewWrapper) {
            previewWrapper.classList.remove('single-page-mode');
            if (singlePageBtn) {
                singlePageBtn.classList.remove('active');
                singlePageBtn.textContent = '单页模式';
            }
            previewArea?.querySelectorAll('.page').forEach(page => {
                page.style.transform = '';
            });
        }
        if (previewArea) previewArea.style.transform = '';

        wraps.forEach((wrap, i) => {
            if (!range.includes(i + 1)) {
                wrap.style.display = 'none';
                hidden.push(wrap);
            }
        });

        let restored = false;
        const restoreAfterPrint = () => {
            if (restored) return;
            restored = true;
            hidden.forEach(el => el.style.display = '');
            if (wasSinglePageMode && previewWrapper) {
                previewWrapper.classList.add('single-page-mode');
                if (singlePageBtn) {
                    singlePageBtn.classList.add('active');
                    singlePageBtn.textContent = '取消单页';
                }
            }
            if (previewArea) previewArea.style.transform = prevPreviewTransform;
            window.onafterprint = null;
        };

        window.onafterprint = restoreAfterPrint;
        window.print();
        // 某些浏览器可能不触发 onafterprint，兜底恢复
        setTimeout(restoreAfterPrint, 1200);
        }); // end requestAnimationFrame
    });

    // 导出全部：PNG 单张或多张打包 ZIP
    exportAllBtn?.addEventListener('click', () => {
        if (typeof domtoimage === 'undefined') return alert('请稍候，导出库加载中…');

        const pages = Array.from(previewArea?.querySelectorAll('.page') || []);
        if (!pages.length) return alert('暂无页面可导出，请先上传文件。');

        const input = prompt(`导出页面范围\n示例：1-5 或 1,3,5 或 全部\n当前共 ${pages.length} 页`, '全部');
        if (input === null) return;

        const range = parsePageRange(input, pages.length);
        if (!range.length) return alert('未识别到有效页面范围，请重试。');

        exportAllBtn.disabled = true;
        exportAllBtn.textContent = '导出中…';

        const toCapture = range.map(p => pages[p - 1]);
        Promise.all(toCapture.map(el => domtoimage.toPng(el, { scale: 3 })))
            .then(dataUrls => {
                if (range.length === 1) {
                    const link = document.createElement('a');
                    link.download = `单词表_第${range[0]}页_共${pages.length}页.png`;
                    link.href = dataUrls[0];
                    link.click();
                } else {
                    if (typeof fflate === 'undefined') {
                        alert('压缩库未加载，将逐个下载。');
                        range.forEach((p, i) => {
                            const a = document.createElement('a');
                            a.download = `单词表_第${p}页.png`;
                            a.href = dataUrls[i];
                            a.click();
                        });
                    } else {
                        const files = {};
                        range.forEach((p, i) => {
                            files[`单词表_第${p}页.png`] = [dataUrlToU8(dataUrls[i]), { level: 6 }];
                        });
                        const zipBytes = fflate.zipSync(files, { level: 6 });
                        const blob = new Blob([zipBytes], { type: 'application/zip' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = '单词表_导出.zip';
                        a.click();
                        URL.revokeObjectURL(url);
                    }
                }
            })
            .catch(err => alert('导出失败：' + err))
            .finally(() => {
                exportAllBtn.disabled = false;
                exportAllBtn.textContent = '导出全部';
            });
    });
});
