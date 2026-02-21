#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将单词列表按每 20 个一组切分，每组前增加一空行和 unit 单元名（unit1, unit2, ...），生成新 txt。
"""
import os

INPUT_FILE = os.path.join(os.path.dirname(__file__), "2800词（全入库）.txt")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "2800词（全入库）_分单元.txt")
LINES_PER_UNIT = 20


def main():
    for enc in ("utf-16", "utf-16-le", "utf-8"):
        try:
            with open(INPUT_FILE, "r", encoding=enc) as f:
                lines = [line.rstrip("\n\r") for line in f]
            break
        except UnicodeDecodeError:
            continue
    else:
        raise SystemExit("无法识别文件编码，请将 2800词（全入库）.txt 转为 UTF-8 后重试。")

    out_parts = []
    n = 0
    while n < len(lines):
        unit_num = (n // LINES_PER_UNIT) + 1
        unit_name = f"unit {unit_num}"
        chunk = lines[n : n + LINES_PER_UNIT]
        if out_parts:
            out_parts.append("")  # 从第二组起，每组前一行空行
        out_parts.append(unit_name)
        out_parts.extend(chunk)
        n += LINES_PER_UNIT

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(out_parts))
        if out_parts and not out_parts[-1].endswith("\n"):
            f.write("\n")

    print(f"已生成: {OUTPUT_FILE}")
    print(f"共 {unit_num} 个单元，每组 {LINES_PER_UNIT} 条。")


if __name__ == "__main__":
    main()
