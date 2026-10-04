"""每個詞庫包的「刪除報告」：給人看的 REPORT.md 與機器讀的 stats.json（D1、LEX-05）。

兩個檔都放在 tools/lexicon/reports/<id>/，不在 data/ 底下，網站不會讀取。
輸出可重現：排序固定、樣本用 random.Random('<id>:<版本>:<規則>') 抽、沒有時間戳（只有 meta.built）。
"""
import json
import random
import re
from pathlib import Path

from . import DEFAULT_BATCH, estimate_tokens
from .pack import _write_text
from .parse import R0_REASONS

SAMPLES_PER_RULE = 20
TOP_CHARS = 20
MULTI_ROWS = 50
CHINA_KEPT_FREQ_NOTE = 100

# 規則 id → 白話說明（報告的表格用）
RULE_LABELS = dict(
    R0_REASONS,
    **{
        'R1-simplified': '含簡體字',
        'R2-rare-char': '含罕用字（不在教育部常用／次常用字與 Big5 內）',
        'R3-china-term': '中國用語（與對照表完全吻合，且在這個來源詞頻低於 100）',
        'R5-ai-incomprehensible': 'AI 判斷：一般讀者難以理解（灰色詞經 AI 判斷後刪除）',
        'G-single-source': '灰色：只有一個詞庫包收錄',
        'G-zero-freq': '灰色：所有來源詞頻都是 0',
        'G-china-term': '灰色：可能是中國用語但拿不準（r3-gray 清單）',
    })

_CHAR_IN_REASON = re.compile('「(.)」')


def _row_key(r):
    return (r['w'], r.get('z', ''), r.get('rule', ''))


def pick_samples(rows, k, seed):
    """從 rows 抽最多 k 筆樣本：先依詞排序再用 random.Random(seed) 抽，顯示時再依詞排序（可重現，Pitfall 16）。"""
    rows = sorted(rows, key=_row_key)
    if len(rows) <= k:
        return rows
    picked = random.Random(seed).sample(rows, k)
    return sorted(picked, key=_row_key)


def top_chars(removed_rows, k=TOP_CHARS):
    """造成最多 R1／R2 刪除的字：[[字, 筆數], ...]，筆數大到小、同數量依字排序。"""
    counts = {}
    for r in removed_rows:
        if r['rule'] in ('R1-simplified', 'R2-rare-char'):
            m = _CHAR_IN_REASON.search(r['reason'])
            if m:
                counts[m.group(1)] = counts.get(m.group(1), 0) + 1
    ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [[c, n] for c, n in ordered[:k]]


def build_stats(cfg, meta, removed_rows, gray_rows, multi_rows, china_kept_rows):
    """報告的機器版數字；verify 會用它對照詞庫包本身（T-06-28）。"""
    pstats = meta.get('stats', {})
    by_rule = {}
    for r in removed_rows:
        by_rule[r['rule']] = by_rule.get(r['rule'], 0) + 1
    gray_by_rule = {}
    for r in gray_rows:
        gray_by_rule[r['rule']] = gray_by_rule.get(r['rule'], 0) + 1
    pending = meta.get('gray_pending', len(gray_rows))
    judged_keep = sum(1 for r in gray_rows if r.get('verdict') == 'K')
    judged_del = sum(1 for r in gray_rows if r.get('verdict') == 'D')
    return {
        'id': cfg['id'],
        'version': meta['version'],
        'rules_version': meta['rules_version'],
        'in_scope': pstats.get('in_scope', meta['entries'] + len(removed_rows)),
        'kept': meta['entries'],
        'removed': len(removed_rows),
        'by_rule': dict(sorted(by_rule.items())),
        'gray': len(gray_rows),
        'gray_pending': pending,
        'gray_keep': judged_keep,
        'gray_deleted': judged_del,
        'judged_with': list(meta.get('judged_with', [])),
        'gray_by_rule': dict(sorted(gray_by_rule.items())),
        'skipped_single': pstats.get('skipped_single', 0),
        'merged_lines': pstats.get('merged_lines', 0),
        'multi_reading': len(multi_rows),
        'china_kept': len(china_kept_rows),
        'top_chars': top_chars(removed_rows),
        'est': dict(estimate_tokens(pending, DEFAULT_BATCH), batch=DEFAULT_BATCH),
    }


def _n(x):
    return '{:,}'.format(x)


def _table(headers, rows):
    out = ['| ' + ' | '.join(headers) + ' |', '| ' + ' | '.join('---' for _ in headers) + ' |']
    for r in rows:
        out.append('| ' + ' | '.join(str(c) for c in r) + ' |')
    return out


def render_report(cfg, meta, stats, removed_rows, gray_rows, multi_rows, china_kept_rows):
    """組出 REPORT.md 的文字（繁體中文）。"""
    pid = cfg['id']
    seed = '%s:%s' % (pid, meta['version'])
    L = []
    L.append('# %s（%s）刪除報告' % (cfg['name'], pid))
    L.append('')
    L.append('- 版本：%s' % meta['version'])
    L.append('- 建置日期：%s' % meta['built'])
    L.append('- 清洗規則版本：%s' % meta['rules_version'])
    L.append('- 灰色政策：%s' % meta.get('gray_policy', 'p1'))
    L.append('')
    L.append('## 總覽')
    L.append('')
    L += _table(['項目', '筆數'], [
        ['範圍內的詞（2 字以上）', _n(stats['in_scope'])],
        ['保留', _n(stats['kept'])],
        ['刪除', _n(stats['removed'])],
        ['灰色（判斷前一律保留；AI 判為難以理解才刪）', _n(stats['gray'])],
        ['　其中 AI 判斷保留', _n(stats['gray_keep'])],
        ['　其中 AI 判斷刪除（已含在刪除裡）', _n(stats['gray_deleted'])],
        ['待 AI 判斷', _n(stats['gray_pending'])],
        ['略過的單字（不在範圍內）', _n(stats['skipped_single'])],
        ['合併的重複詞行（同一詞多個讀音或多個檔案）', _n(stats['merged_lines'])],
        ['多讀音詞（保留的詞裡）', _n(stats['multi_reading'])],
    ])
    L.append('')
    L.append('保留 + 刪除 = 範圍內的詞（%s + %s = %s）。' % (
        _n(stats['kept']), _n(stats['removed']), _n(stats['kept'] + stats['removed'])))
    L.append('')
    L.append('## 各原因統計')
    L.append('')
    if stats['by_rule']:
        L += _table(['規則', '說明', '筆數'],
                    [[r, RULE_LABELS.get(r, ''), _n(n)] for r, n in stats['by_rule'].items()])
    else:
        L.append('沒有任何詞被刪除。')
    L.append('')
    L.append('## 各原因樣本')
    L.append('')
    L.append('每種原因最多 %d 筆，抽樣方式固定（同一版本每次重建都抽到同樣的詞），讓你可以抽查有沒有誤刪。' % SAMPLES_PER_RULE)
    for rule in stats['by_rule']:
        rows = [r for r in removed_rows if r['rule'] == rule]
        picked = pick_samples(rows, SAMPLES_PER_RULE, '%s:%s' % (seed, rule))
        L.append('')
        L.append('### %s：%s（共 %s 筆，列出 %d 筆）' % (rule, RULE_LABELS.get(rule, ''), _n(len(rows)), len(picked)))
        L.append('')
        L += _table(['詞', '注音', '詞頻', '原因', '來源數'],
                    [[r['w'], r['z'], r['p'], r['reason'], r['n']] for r in picked])
    L.append('')
    L.append('## 灰色地帶（待 AI 判斷）')
    L.append('')
    L.append('灰色的詞是只有一個詞庫包收錄、或拿不準是不是中國用語的詞。AI 判斷（`npm run lexicon:judge`）之前它們都**保留**'
             '在詞庫包裡、標成「待 AI 判斷」；判斷之後，被判為一般讀者難以理解的才會刪（規則 R5），其餘保留。'
             '沒有 AI 金鑰時它們一律保留。')
    if stats['judged_with']:
        L.append('')
        L.append('已判斷的模型：%s。' % '、'.join(stats['judged_with']))
    L.append('')
    est = stats['est']
    L += _table(['項目', '數量'], [
        ['灰色總數', _n(stats['gray'])],
        ['待 AI 判斷', _n(stats['gray_pending'])],
        ['估算請求次數（每次 %d 個詞）' % est['batch'], _n(est['requests'])],
        ['估算輸入 token', _n(est['in_tokens'])],
        ['估算輸出 token', _n(est['out_tokens'])],
    ] + [['其中「%s」' % RULE_LABELS.get(k, k), _n(v)] for k, v in stats['gray_by_rule'].items()])
    cg = [r for r in gray_rows if r['rule'] == 'G-china-term']
    if cg:
        L.append('')
        L.append('可能是中國用語、拿不準而標成灰色的詞（全部列出；清單在 `tools/lexicon/rules/r3-gray.json`）：')
        L.append('')
        L += _table(['詞', '注音', '詞頻', 'AI 判斷'],
                    [[r['w'], r['z'], r['p'], {'K': '保留', 'D': '刪除'}.get(r.get('verdict'), '待判斷')]
                     for r in sorted(cg, key=_row_key)])
    others = [r for r in gray_rows if r['rule'] != 'G-china-term' and 'verdict' not in r]
    picked = pick_samples(others, SAMPLES_PER_RULE, '%s:gray' % seed)
    if picked:
        L.append('')
        L.append('待判斷的灰色樣本（最多 %d 筆）：' % SAMPLES_PER_RULE)
        L.append('')
        L += _table(['詞', '注音', '詞頻', '規則'], [[r['w'], r['z'], r['p'], r['rule']] for r in picked])
    L.append('')
    L.append('## 最常造成刪除的字')
    L.append('')
    L.append('簡體字（R1）與罕用字（R2）刪詞時，被點名的字出現最多的前 %d 個。台灣其實正常使用的字'
             '（人名、地名、小吃…），可以加進 `tools/lexicon/rules/char-allow.txt` 讓規則放過它。' % TOP_CHARS)
    L.append('')
    if stats['top_chars']:
        example = {}
        for r in sorted(removed_rows, key=_row_key):
            if r['rule'] in ('R1-simplified', 'R2-rare-char'):
                m = _CHAR_IN_REASON.search(r['reason'])
                if m:
                    example.setdefault(m.group(1), r['w'])
        L += _table(['字', '造成刪除的詞數', '例子'],
                    [[c, _n(n), example.get(c, '')] for c, n in stats['top_chars']])
    else:
        L.append('沒有。')
    L.append('')
    L.append('## 中國用語對照表吻合但保留（本來源詞頻 ≥ %d）' % CHINA_KEPT_FREQ_NOTE)
    L.append('')
    L.append('這些詞和 OpenCC 的中國用語對照表完全吻合，但在這個來源裡詞頻夠高（台灣也天天在用），所以不刪。共 %s 筆。'
             % _n(len(china_kept_rows)))
    L.append('')
    if china_kept_rows:
        L += _table(['詞', '注音', '詞頻', '對照表的台灣說法'],
                    [[r['w'], r['z'], r['p'], r['tw']] for r in sorted(china_kept_rows, key=_row_key)])
    else:
        L.append('沒有。')
    L.append('')
    L.append('## 多讀音詞選用的讀音')
    L.append('')
    L.append('網站每個詞只存一個讀音；來源有多個讀音時，依 `data/polyphonic-order.json` 的名次選一個'
             '（也可用 `tools/lexicon/rules/reading-overrides.json` 人工指定）。共 %s 個詞，列出最多 %d 筆。'
             % (_n(len(multi_rows)), MULTI_ROWS))
    L.append('')
    L.append('注意：詞庫包保留辭典原本的聲調，例如「一下」在詞庫包裡是「ㄧ ㄒㄧㄚˋ」，'
             'v0.96 現行詞庫則是「ㄧˊ ㄒㄧㄚˋ」（變調後的念法）。押韻比對不看聲調，所以不影響查詢結果。')
    L.append('')
    picked = pick_samples([dict(r, rule='') for r in multi_rows], MULTI_ROWS, '%s:multi' % seed)
    if picked:
        L += _table(['詞', '選用讀音', '其他讀音'], [[r['w'], r['z'], '、'.join(r['others'])] for r in picked])
    else:
        L.append('沒有。')
    L.append('')
    L.append('## 誤刪怎麼救回')
    L.append('')
    L.append('在專案資料夾執行（把「詞」換成被誤刪的詞，可一次寫多個）：')
    L.append('')
    L.append('```')
    L.append('python3 -B tools/lexicon/build.py rescue 詞')
    L.append('```')
    L.append('')
    L.append('它會把詞加進 `tools/lexicon/rules/keep.json`（之後每次重建都一定保留），並印出可以貼進 '
             '`data/wordlist-overrides.json` 的 `added` 裡、讓網站立刻看到這個詞的那一行（`{"w":…,"z":…,"p":…}`）。'
             '執行 `npm run lexicon:build` 之後，詞就回到詞庫包裡。')
    L.append('')
    L.append('完整的被刪詞清單（每行一個詞，含原因）在同資料夾的 `removed.ndjson`。')
    L.append('')
    L.append('本報告只給人看，網站不會讀取。')
    return '\n'.join(L) + '\n'


def write_report(out_dir, cfg, meta, stats, removed_rows, gray_rows, multi_rows, china_kept_rows):
    """寫 stats.json（縮排 2、鍵排序）與 REPORT.md；內容沒變就不動檔案。"""
    out_dir = Path(out_dir)
    _write_text(out_dir / 'stats.json', json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True) + '\n')
    _write_text(out_dir / 'REPORT.md',
                render_report(cfg, meta, stats, removed_rows, gray_rows, multi_rows, china_kept_rows))
