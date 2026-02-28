// ==========================================
// 字号配置与自适应逻辑
// ==========================================
(function () {
    function getFontConfigFileName(vocabFileName) {
        if (!vocabFileName) {
            console.log('No vocab file name provided');
            return null;
        }
        return vocabFileName.replace(/\.json$/i, '.font-config.json');
    }

    async function loadFontConfig(configFileName) {
        if (!configFileName) {
            console.log('No config file name provided');
            return null;
        }
        const fullPath = 'date/' + configFileName + '?t=' + Date.now();
        console.log('Loading font config:', fullPath);
        try {
            const response = await fetch(fullPath);
            console.log('Config response status:', response.status);
            if (!response.ok) {
                console.log('Config file not found:', fullPath);
                return null;
            }
            const config = await response.json();
            console.log('Config loaded:', config);
            if (config.version === 1 && Array.isArray(config.pageFonts)) {
                console.log('Config valid, pages:', config.pageFonts.length);
                return config;
            }
            console.log('Config format invalid');
            return null;
        } catch (err) {
            console.log('Error loading config:', err.message);
            return null;
        }
    }

    function applyFontConfig(config, previewArea) {
        console.log('Applying font config...');
        if (!previewArea) {
            console.log('Preview area not found');
            return false;
        }
        if (!config || !config.pageFonts || !config.pageFonts.length) {
            console.log('Config is empty or invalid');
            return false;
        }

        const wraps = previewArea.querySelectorAll('.page-export-wrap');
        console.log('Pages:', wraps.length, 'Config pages:', config.pageFonts.length);
        if (!wraps.length) {
            console.log('No pages to apply config');
            return false;
        }

        wraps.forEach((wrap, idx) => {
            const pageEl = wrap.querySelector('.page');
            const valueSpan = wrap.querySelector('.page-font-value');
            const fontSize = config.pageFonts[idx];
            if (pageEl && fontSize) {
                console.log('Page', idx + 1, 'font size:', fontSize);
                pageEl.style.setProperty('--table-font-size', fontSize + 'px');
                pageEl.setAttribute('data-font-size', fontSize);
                if (valueSpan) valueSpan.textContent = fontSize + 'px';
            }
        });

        console.log('Font config applied');
        return true;
    }

    async function saveFontConfig(previewArea, currentVocabFileName) {
        if (!previewArea) {
            alert('Preview area not found');
            return;
        }
        const wraps = previewArea.querySelectorAll('.page-export-wrap');
        if (!wraps.length) {
            alert('No pages to save config');
            return;
        }

        const pageFonts = [];
        wraps.forEach(wrap => {
            const pageEl = wrap.querySelector('.page');
            const fontSize = pageEl?.getAttribute('data-font-size');
            pageFonts.push(fontSize ? parseFloat(fontSize) : 14);
        });

        const configFileName = getFontConfigFileName(currentVocabFileName) || 'word.font-config.json';
        const sourceFileName = currentVocabFileName || 'unknown.json';
        const config = {
            version: 1,
            sourceFile: sourceFileName,
            createdAt: new Date().toISOString(),
            pageFonts: pageFonts
        };

        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = configFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert('Font config saved: ' + configFileName + '\nPages: ' + pageFonts.length);
    }

    function adaptAllPages(previewArea, triggerBtn) {
        if (!previewArea) return;
        const wraps = previewArea.querySelectorAll('.page-export-wrap');
        if (!wraps.length) return alert('No pages');

        if (triggerBtn) {
            triggerBtn.disabled = true;
            triggerBtn.textContent = 'Adapting...';
        }

        let idx = 0;
        const adaptOne = () => {
            if (idx >= wraps.length) {
                if (triggerBtn) {
                    triggerBtn.disabled = false;
                    triggerBtn.textContent = 'Adaptive';
                }
                return;
            }

            const pageEl = wraps[idx].querySelector('.page');
            const valueSpan = wraps[idx].querySelector('.page-font-value');
            let px = 8;
            let best = 8;

            const setAndCheck = (size) => {
                pageEl.style.setProperty('--table-font-size', size + 'px');
                pageEl.setAttribute('data-font-size', size);
                pageEl.offsetHeight;
                updatePageBriefClamp(pageEl);
                return pageEl.classList.contains('page-brief-clamped');
            };

            while (px <= 24) {
                if (setAndCheck(px)) {
                    best = Math.max(8, Math.round((px - 0.1) * 10) / 10);
                    setAndCheck(best);
                    break;
                }
                best = px;
                px = Math.round((px + 0.1) * 10) / 10;
            }

            if (valueSpan) valueSpan.textContent = best + 'px';
            idx++;
            requestAnimationFrame(adaptOne);
        };

        adaptOne();
    }

    function bindFontFitButtons(previewArea, getCurrentVocabFileName) {
        const adaptiveFontBtn = document.getElementById('adaptiveFontBtn');
        adaptiveFontBtn?.addEventListener('click', function () {
            adaptAllPages(previewArea, this);
        });

        document.getElementById('exportFontConfigBtn')?.addEventListener('click', () => {
            const exportMenuPanel = document.getElementById('exportMenuPanel');
            const exportMenuBackdrop = document.getElementById('exportMenuBackdrop');
            if (exportMenuPanel) {
                exportMenuPanel.classList.remove('show');
                exportMenuPanel.setAttribute('aria-hidden', 'true');
            }
            if (exportMenuBackdrop) {
                exportMenuBackdrop.classList.remove('show');
            }
            const fileName = typeof getCurrentVocabFileName === 'function' ? getCurrentVocabFileName() : '';
            saveFontConfig(previewArea, fileName);
        });
    }

    window.FontFit = {
        getFontConfigFileName: getFontConfigFileName,
        loadFontConfig: loadFontConfig,
        applyFontConfig: applyFontConfig,
        saveFontConfig: saveFontConfig,
        adaptAllPages: adaptAllPages,
        bindButtons: bindFontFitButtons
    };
})();
