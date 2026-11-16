"""
build_wordlist.py
合併 vChewing + libchewing 詞庫，輸出 data/wordlist.json

來源一：vChewing VanguardLexicon（從 GitHub 下載，主要來源）
來源二：libchewing tsi.csv（從 GitHub 下載，補充 vChewing 沒有的詞）

輸出格式：[{"w":"詞語","z":"每字注音 空格分隔（含聲調，1聲省略）","p":frequency}]
  p：使用頻率（越高越常用）

版權：libchewing Core Team (LGPL-2.1-or-later)、vChewing Project
"""
import urllib.request
import json
import os
from datetime import datetime, timezone

LIBCHEWING_URL = "https://raw.githubusercontent.com/chewing/libchewing-data/master/dict/chewing/tsi.csv"

VCHEWING_BASE = "https://raw.githubusercontent.com/vChewing/vChewing-VanguardLexicon/main/Sources/LibVanguardChewingData/Resources/components/cht"
VCHEWING_FILES = [
    "phrases-moe-cht.txt",
    "phrases-tabe-cht.txt",
    "phrases-vchewing-cht.txt",
]

OUTPUT = os.path.join(os.path.dirname(__file__), "..", "data", "wordlist.json")

def is_cjk(s):
    return all('一' <= c <= '鿿' or '㐀' <= c <= '䶿' for c in s)

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as r:
        return r.read().decode("utf-8")

def load_vchewing(merged):
    print(f"下載 vChewing（{len(VCHEWING_FILES)} 個檔案）...", flush=True)
    added = updated = skipped = 0
    for fname in VCHEWING_FILES:
        url = f"{VCHEWING_BASE}/{fname}"
        print(f"  {fname}", flush=True)
        content = fetch(url)
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split(" ")
            if len(parts) < 3:
                continue
            word = parts[0]
            if len(word) < 2 or not is_cjk(word):
                skipped += 1; continue
            try:
                freq = int(parts[1])
            except ValueError:
                skipped += 1; continue
            syllables = parts[2:]
            if len(syllables) != len(word):
                skipped += 1; continue
            z = " ".join(syllables)
            if word not in merged:
                added += 1
            else:
                updated += 1
            merged[word] = {"w": word, "z": z, "p": freq}
    print(f"  vChewing：新增 {added}，覆蓋更新 {updated}，略過格式錯誤 {skipped}")

def load_libchewing(merged):
    print("下載 libchewing tsi.csv...", flush=True)
    content = fetch(LIBCHEWING_URL)
    print(f"下載完成 {len(content):,} bytes", flush=True)

    added = skipped = 0
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(",", 2)
        if len(parts) < 3:
            continue
        word, freq_str, zhuyin_str = parts[0], parts[1], parts[2].strip()
        if len(word) < 2 or not is_cjk(word):
            skipped += 1; continue
        try:
            freq = int(freq_str)
        except ValueError:
            skipped += 1; continue
        syllables = zhuyin_str.split()
        if len(syllables) != len(word):
            skipped += 1; continue
        z = " ".join(syllables)
        # vChewing 已存在的詞保持不動，只補 libchewing 獨有的詞
        if word not in merged:
            merged[word] = {"w": word, "z": z, "p": freq}
            added += 1
        else:
            skipped += 1
    print(f"  libchewing：新增 {added}（補充），略過重複 {skipped}")

def main():
    merged = {}
    load_vchewing(merged)   # 主要來源：vChewing（詞、注音、詞頻皆以此為準）
    load_libchewing(merged) # 補充來源：只填入 vChewing 沒有的詞

    result = list(merged.values())
    print(f"\n合計：{len(result):,} 詞")

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    json_str = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(json_str)

    # 切成 10 個 chunk（NDJSON，每行一條）供分批載入
    import math
    chunk_size = math.ceil(len(result) / 10)
    chunks = 0
    for i in range(10):
        chunk = result[i*chunk_size:(i+1)*chunk_size]
        path = os.path.join(os.path.dirname(OUTPUT), f"wordlist-c{i:02d}.json")
        with open(path, "w", encoding="utf-8") as f:
            for entry in chunk:
                f.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")
        chunks += 1
        print(f"輸出：{path}（{len(chunk):,} 詞）")

    # meta：版本號（ISO 時間戳）供前端 IndexedDB 快取比對
    version = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta_path = os.path.join(os.path.dirname(OUTPUT), "wordlist-meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({"version": version, "chunks": chunks, "total": len(result)}, f)
    print(f"輸出：{meta_path}（version: {version}）")

    size_kb = os.path.getsize(OUTPUT) / 1024
    print(f"輸出：{OUTPUT}")
    print(f"檔案大小：{size_kb:.1f} KB ({size_kb/1024:.1f} MB)")

if __name__ == "__main__":
    main()
