"""
merge_corelib.py
將小麥注音 data-plain-bpmf.txt 中缺少在 core library.txt 的字，補進冷僻區。

步驟：
  1. 修正 core library 格式錯誤（補齊缺少的 ｜- 第三區）
  2. 將 core library 的冷僻區若有字移到一般區（保險措施）
  3. 解析小麥注音，轉換聲調格式
  4. 對比兩個字庫，將小麥獨有的字補進冷僻區

輸出：core library.txt（直接覆蓋原檔，建議先備份）
"""
import re
import sys

CORELIB_PATH = "/Users/Shared/Claude/Lucky Hawaii/data/core library.txt"
XIAMAI_PATH  = "/Users/will/Downloads/data-plain-bpmf.txt"

# 小麥聲調符號 → 數字
TONE_MAP = {'ˊ': '2', 'ˇ': '3', 'ˋ': '4', '˙': '5'}

def is_cjk(c):
    return '一' <= c <= '鿿' or '㐀' <= c <= '䶿'

def xiamai_to_key(zhuyin):
    """ㄅㄚˊ → ㄅㄚ2，ㄅㄚ（無聲調）→ ㄅㄚ1"""
    if zhuyin and zhuyin[-1] in TONE_MAP:
        return zhuyin[:-1] + TONE_MAP[zhuyin[-1]]
    return zhuyin + '1'

# ── 解析 core library ──────────────────────────────────────────────
def parse_corelib(text):
    """回傳 list of (key, common, normal, rare) 保持原始順序"""
    entries = []
    for m in re.finditer(r"'([^']+)':'([^']*)'", text):
        key = m.group(1)
        val = m.group(2)
        parts = val.split('｜')
        # 修正格式：補齊缺少的區間
        while len(parts) < 3:
            parts.append('-')
        common, normal, rare = parts[0], parts[1], parts[2]
        entries.append([key, common, normal, rare])
    return entries

def chars_in_entry(entry):
    """回傳該 entry 所有區間已有的字集合"""
    _, common, normal, rare = entry
    result = set()
    for section in (common, normal, rare):
        if section and section != '-':
            result.update(c for c in section if is_cjk(c))
    return result

# ── 解析小麥注音 ───────────────────────────────────────────────────
def parse_xiamai(path):
    """回傳 dict: key（如 ㄅㄚ1）→ list of chars（保留小麥原始順序）"""
    data = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or line.startswith('_'):
                continue
            parts = line.split(' ')
            if len(parts) < 2:
                continue
            zy_raw, char = parts[0], parts[1]
            # 只處理單一 CJK 字元
            if len(char) != 1 or not is_cjk(char):
                continue
            key = xiamai_to_key(zy_raw)
            data.setdefault(key, []).append(char)
    return data

# ── 主流程 ────────────────────────────────────────────────────────
def main():
    text = open(CORELIB_PATH, encoding='utf-8').read()
    entries = parse_corelib(text)
    xiamai  = parse_xiamai(XIAMAI_PATH)

    # 建立 key → entry 的索引
    entry_map = {e[0]: e for e in entries}

    step1_fixed   = 0  # 格式修正
    step2_moved   = 0  # 冷僻→一般（保險）
    added_chars   = 0  # 補進冷僻區的新字
    new_keys      = 0  # 小麥有但 core library 完全沒有的 key

    for entry in entries:
        key, common, normal, rare = entry
        # Step 1：格式修正（parse 時已補齊，這裡計數）
        if len(key) == 0:
            step1_fixed += 1
        # Step 2：冷僻區若有字，移到一般區尾端（保險）
        if rare and rare != '-':
            rare_chars = ''.join(c for c in rare if is_cjk(c))
            if rare_chars:
                normal = (normal if normal != '-' else '') + rare_chars
                rare   = '-'
                entry[2], entry[3] = normal, rare
                step2_moved += 1

    # Step 3：小麥獨有的字補進冷僻區
    for key, chars in xiamai.items():
        if key in entry_map:
            entry   = entry_map[key]
            have    = chars_in_entry(entry)
            missing = [c for c in chars if c not in have]
            if missing:
                cur_rare = entry[3]
                existing_rare = '' if cur_rare == '-' else cur_rare
                entry[3] = existing_rare + ''.join(missing)
                added_chars += len(missing)
        else:
            # core library 完全沒有這個 key → 新增，全放冷僻區
            rare_str = ''.join(c for c in chars if is_cjk(c))
            if rare_str:
                entries.append([key, '-', '-', rare_str])
                entry_map[key] = entries[-1]
                new_keys += 1
                added_chars += len(rare_str)

    # ── 重建輸出 ────────────────────────────────────────────────────
    lines = ['const rhymeDict = {']
    for entry in entries:
        key, common, normal, rare = entry
        common = common if common else '-'
        normal = normal if normal else '-'
        rare   = rare   if rare   else '-'
        lines.append(f"    '{key}':'{common}｜{normal}｜{rare}',")
    lines.append('}')

    out = '\n'.join(lines) + '\n'
    with open(CORELIB_PATH, 'w', encoding='utf-8') as f:
        f.write(out)

    print(f"格式修正：{step1_fixed} 條")
    print(f"冷僻→一般：{step2_moved} 條")
    print(f"新增冷僻字：{added_chars} 個字，涵蓋 {new_keys} 個新注音 key")
    print(f"輸出：{CORELIB_PATH}")

if __name__ == '__main__':
    main()
