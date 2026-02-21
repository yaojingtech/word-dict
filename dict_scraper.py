import sys
import time
import threading
import webbrowser
import requests
from flask import Flask, request, jsonify, render_template_string
from bs4 import BeautifulSoup

# --- 配置 ---
PORT = 2618
HOST = '127.0.0.1'
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
}

app = Flask(__name__)

# --- 核心爬虫逻辑 (API版) ---
def scrape_single_word(word):
    word = word.strip()
    if not word: return None
    
    url = f"https://m.youdao.com/result?word={word}&lang=en"
    
    # 结果字典
    data = {
        'word': word,
        'uk_ipa': '',
        'us_ipa': '',
        'meaning_html': '',   # 用于网页展示
        'meaning_csv': '',    # 用于导出
        'phrases_html': '',
        'phrases_csv': '',
        'status': 'success'
    }
    
    try:
        response = requests.get(url, headers=HEADERS, timeout=5)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 1. 音标
        per_phones = soup.select('.per-phone')
        for p in per_phones:
            txt = p.get_text()
            ipa_tag = p.select_one('.phonetic')
            if ipa_tag:
                ipa_str = ipa_tag.get_text(strip=True)
                if '英' in txt: data['uk_ipa'] = ipa_str
                elif '美' in txt: data['us_ipa'] = ipa_str
        
        # 2. 简明释义 (核心修改：按词性分组 + 限制数量)
        # 逻辑：使用字典记录每个词性的出现次数
        pos_counts = {} 
        meanings_html_list = []
        meanings_csv_list = []
        
        basic_list = soup.select('.basic .word-exp')
        
        for item in basic_list:
            pos_tag = item.select_one('.pos')
            trans_tag = item.select_one('.trans')
            
            if trans_tag:
                # 获取词性，如果没有则标记为 'unknown'
                pos = pos_tag.get_text(strip=True) if pos_tag else "其他"
                # 初始化计数器
                if pos not in pos_counts:
                    pos_counts[pos] = 0
                
                # 如果该词性已经取了3个，跳过
                if pos_counts[pos] >= 3:
                    continue
                
                # 获取释义并清洗（去掉太长的部分，比如括号里的补充说明）
                raw_trans = trans_tag.get_text(strip=True)
                # 简单截断：如果释义含有分号，只取前两个分号的内容，避免太长
                split_trans = raw_trans.split('；')
                clean_trans = "；".join(split_trans[:2]) 
                
                # 计数+1
                pos_counts[pos] += 1
                
                # 存入列表
                meanings_html_list.append(f"<span class='badge bg-light text-dark border'>{pos}</span> {clean_trans}")
                meanings_csv_list.append(f"{pos} {clean_trans}")
        
        # 兜底：如果没抓到，试网络释义
        if not meanings_html_list:
            web_trans = soup.select('.web_trans .col2 p')
            if web_trans:
                txt = web_trans[0].get_text(strip=True).split('；')[0] # 网络释义也只取第一段
                meanings_html_list.append(f"<span class='badge bg-warning text-dark'>网络</span> {txt}")
                meanings_csv_list.append(f"[网络] {txt}")

        data['meaning_html'] = "<br>".join(meanings_html_list)
        data['meaning_csv'] = " ".join(meanings_csv_list) # CSV里用空格连接不同词性

        # 3. 短语 (保持原样，只取前3)
        phrases_html = []
        phrases_csv = []
        phrs_module = soup.select('.phrs .trans-container li')
        for item in phrs_module[:3]: 
            point = item.select_one('.point')
            phr_trans = item.select_one('.phr_trans')
            if point and phr_trans:
                p_txt = point.get_text(strip=True)
                t_txt = phr_trans.get_text(strip=True)
                phrases_html.append(f"<b>{p_txt}</b>: {t_txt}")
                phrases_csv.append(f"{p_txt}: {t_txt}")
                
        data['phrases_html'] = "<br>".join(phrases_html)
        data['phrases_csv'] = " | ".join(phrases_csv)

    except Exception as e:
        data['status'] = 'error'
        data['meaning_html'] = f"<span class='text-danger'>Error: {str(e)}</span>"
    
    return data

# --- 路由 ---
@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/api/scrape', methods=['POST'])
def api_scrape():
    # 接收单个单词请求
    content = request.json
    word = content.get('word', '')
    result = scrape_single_word(word)
    return jsonify(result)

# --- 前端代码 (含JS逻辑) ---
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>单词助手 (实时流式版)</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background-color: #f8f9fa; font-family: "Segoe UI", Roboto, Arial, sans-serif; }
        .main-container { 
            width: 70%; 
            min-width: 800px;
            margin: 40px auto; 
            background: white; 
            padding: 30px; 
            border-radius: 12px; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.08); 
        }
        .table-custom th { background-color: #f1f3f5; vertical-align: middle; color: #555; }
        .word-cell { font-weight: bold; font-size: 1.1rem; color: #0d6efd; }
        .ipa-cell { color: #6c757d; font-family: monospace; font-size: 0.9rem; }
        .meaning-cell { line-height: 1.6; font-size: 0.95rem; }
        .badge { margin-right: 5px; min-width: 25px; }
        
        /* 进度条动画 */
        .progress { height: 20px; margin-top: 15px; display: none; }
        .spinner-loading { display: inline-block; width: 1rem; height: 1rem; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spinner-border .75s linear infinite; }
    </style>
</head>
<body>
    <div class="main-container">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h3 class="m-0">⚡ 单词助手 <small class="text-muted fs-6">Real-time</small></h3>
            <button id="btn-export" class="btn btn-success" disabled onclick="exportCSV()">📥 导出 CSV</button>
        </div>
        
        <div class="mb-3">
            <textarea class="form-control" id="input-words" rows="5" placeholder="请输入单词，每行一个..."></textarea>
        </div>
        <button id="btn-start" class="btn btn-primary w-100" onclick="startScraping()">🚀 开始抓取</button>

        <div class="progress" id="progress-container">
            <div class="progress-bar progress-bar-striped progress-bar-animated" id="progress-bar" role="progressbar" style="width: 0%">0%</div>
        </div>
        <div id="status-text" class="text-center mt-2 text-muted small"></div>

        <div class="mt-4">
            <table class="table table-hover table-bordered table-custom" id="result-table">
                <thead>
                    <tr>
                        <th width="15%">单词</th>
                        <th width="12%">英音</th>
                        <th width="12%">美音</th>
                        <th width="35%">简明释义 (Top 3)</th>
                        <th width="26%">精选短语</th>
                    </tr>
                </thead>
                <tbody id="table-body">
                    </tbody>
            </table>
        </div>
    </div>

    <script>
        // 全局存储结果数据，用于导出 CSV
        let globalResults = [];

        async function startScraping() {
            const input = document.getElementById('input-words').value;
            const words = input.split('\\n').map(w => w.trim()).filter(w => w);
            
            if (words.length === 0) {
                alert("请输入至少一个单词！");
                return;
            }

            // 1. 初始化界面
            const tableBody = document.getElementById('table-body');
            tableBody.innerHTML = ''; // 清空旧数据
            globalResults = []; // 清空结果缓存
            document.getElementById('btn-export').disabled = true;
            document.getElementById('btn-start').disabled = true;
            
            // 2. 显示进度条
            const progressContainer = document.getElementById('progress-container');
            const progressBar = document.getElementById('progress-bar');
            const statusText = document.getElementById('status-text');
            progressContainer.style.display = 'flex';
            progressBar.style.width = '0%';
            progressBar.innerHTML = '0%';

            // 3. 立即创建占位符行 (Placeholder)
            words.forEach((word, index) => {
                const row = document.createElement('tr');
                row.id = `row-${index}`;
                row.innerHTML = `
                    <td class="word-cell">${word}</td>
                    <td colspan="4" class="text-center text-muted">
                        <span class="spinner-loading"></span> 待处理...
                    </td>
                `;
                tableBody.appendChild(row);
            });

            // 4. 逐个请求 (串行处理以防封IP，也可以改为 Promise.all 并发)
            for (let i = 0; i < words.length; i++) {
                const word = words[i];
                statusText.innerText = `正在处理: ${word} (${i+1}/${words.length})`;
                
                try {
                    // 发送请求给 Python 后端
                    const response = await fetch('/api/scrape', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({word: word})
                    });
                    const data = await response.json();
                    
                    // 保存数据用于导出
                    globalResults.push(data);

                    // 更新表格行
                    const row = document.getElementById(`row-${i}`);
                    if (row) {
                        row.innerHTML = `
                            <td class="word-cell">${data.word}</td>
                            <td class="ipa-cell">${data.uk_ipa}</td>
                            <td class="ipa-cell">${data.us_ipa}</td>
                            <td class="meaning-cell">${data.meaning_html}</td>
                            <td class="meaning-cell">${data.phrases_html}</td>
                        `;
                    }

                } catch (err) {
                    console.error(err);
                    const row = document.getElementById(`row-${i}`);
                    row.innerHTML = `<td class="word-cell">${word}</td><td colspan="4" class="text-danger">请求失败</td>`;
                }

                // 更新进度条
                const percent = Math.round(((i + 1) / words.length) * 100);
                progressBar.style.width = `${percent}%`;
                progressBar.innerHTML = `${percent}%`;
            }

            // 5. 完成
            statusText.innerText = "处理完成！";
            progressBar.classList.remove('progress-bar-animated');
            document.getElementById('btn-export').disabled = false;
            document.getElementById('btn-start').disabled = false;
        }

        // 纯前端导出 CSV
        function exportCSV() {
            if (globalResults.length === 0) return;

            // 添加 BOM 防止 Excel 乱码
            let csvContent = "\\uFEFF"; 
            csvContent += "单词,英音,美音,简明释义,精选短语\\n";

            globalResults.forEach(row => {
                // 处理 CSV 特殊字符 (逗号换行等需要用引号包起来)
                const escape = (txt) => {
                    if (!txt) return "";
                    let clean = txt.replace(/"/g, '""'); // 双引号转义
                    return `"${clean}"`;
                };

                const line = [
                    escape(row.word),
                    escape(row.uk_ipa),
                    escape(row.us_ipa),
                    escape(row.meaning_csv),
                    escape(row.phrases_csv)
                ].join(",");
                csvContent += line + "\\n";
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "words_export.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    </script>
</body>
</html>
"""

def open_browser():
    time.sleep(1.5)
    webbrowser.open(f"http://{HOST}:{PORT}")

if __name__ == '__main__':
    threading.Thread(target=open_browser).start()
    print(f"--- 服务启动: http://{HOST}:{PORT} ---")
    app.run(host=HOST, port=PORT, debug=False)