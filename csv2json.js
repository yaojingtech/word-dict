#!/usr/bin/env node
/**
 * 将 CSV 转为 JSON（供 index.html 默认加载）
 * 用法: node csv2json.js [输入.csv] [输出.json]
 * 默认: 2800词（全）.csv -> word(2800).json
 */

const fs = require('fs');
const path = require('path');

const defaultInput = path.join(__dirname, '2800词（全）.csv');
const defaultOutput = path.join(__dirname, 'word(2800).json');

const inputPath = process.argv[2] || defaultInput;
const outputPath = process.argv[3] || defaultOutput;

function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let insideQuote = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (insideQuote && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                insideQuote = !insideQuote;
            }
        } else if (char === ',' && !insideQuote) {
            currentRow.push(currentCell.trim());
            currentCell = '';
        } else if ((char === '\n' || char === '\r') && !insideQuote) {
            if (currentCell || currentRow.length > 0) {
                currentRow.push(currentCell.trim());
                rows.push(currentRow);
            }
            currentRow = [];
            currentCell = '';
            if (char === '\r' && nextChar === '\n') i++;
        } else {
            currentCell += char;
        }
    }
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
    }
    return rows;
}

try {
    const text = fs.readFileSync(inputPath, 'utf-8');
    const rows = parseCSV(text);
    if (rows.length === 0) {
        console.error('CSV 文件为空');
        process.exit(1);
    }

    const headers = rows[0];
    const data = rows.slice(1).filter(r => r.length > 1);

    const result = { headers, data };
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`已生成: ${outputPath} (${data.length} 条)`);
} catch (err) {
    console.error('错误:', err.message);
    process.exit(1);
}
