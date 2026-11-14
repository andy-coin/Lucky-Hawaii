        // ===== 底部面板：情境 & 標籤 =====
        function toggleRecentPanel() {
            const panel = document.getElementById('recentPanel');
            panel.classList.toggle('collapsed');
            lhSet('recentPanelCollapsed', panel.classList.contains('collapsed'));
        }

        // 一次可以加好幾個：頓號、逗號、分號、空白、# 都當分隔；去掉空的與重複的（Andy 1-d）
        // 和「從歌詞自動生成」解析 AI 回覆的標籤用同一套分隔
        function lhParseTags(str) {
            const out = [];
            for (const t of String(str || '').split(/[,，、;；\s#＃]+/)) {
                const tag = t.trim();
                if (tag && !out.includes(tag)) out.push(tag);
            }
            return out;
        }

        // 回傳實際新增了幾個（已經有的不重複加）
        function addHashtag(tagValue) {
            const song = curSong();
            if (!song) return 0;
            const fresh = lhParseTags(tagValue).filter(t => !song.hashtags.includes(t));
            if (!fresh.length) return 0;
            song.hashtags.push(...fresh);
            markDirty(song.id);
            flushSongs();
            renderHashtags();
            return fresh.length;
        }

        // 標籤輸入直接在板塊上（不再彈視窗）。+ 鈕：框裡有字就加進去，沒字就展開板塊並把游標放進框
        function openHashtagPopup() {
            const input = document.getElementById('hashtagInput');
            if (!input) return;
            if (input.value.trim()) { commitHashtagInput(); return; }
            const s = document.getElementById('contextSection');
            if (s && s.classList.contains('collapsed')) toggleContextSection();
            input.focus();
        }

        function commitHashtagInput() {
            const input = document.getElementById('hashtagInput');
            if (!input) return;
            const n = addHashtag(input.value);
            input.value = '';
            if (n > 1) lhAnnounce('已新增 ' + n + ' 個標籤');
        }

        document.getElementById('hashtagInput')?.addEventListener('keydown', e => {
            if (e.isComposing || e.keyCode === 229) return;   // 組字中的 Enter 是選字
            if (e.key === 'Enter') { e.preventDefault(); commitHashtagInput(); }
            else if (e.key === 'Escape') { e.target.value = ''; }
        });

        function removeHashtag(tag) {
            const song = curSong();
            if (!song) return;
            song.hashtags = song.hashtags.filter(t => t !== tag);
            markDirty(song.id);
            flushSongs();
            renderHashtags();
        }

        // 標籤是使用者（或匯入檔）給的字串：只用 textContent 與事件監聽，不拼 HTML、不拼 onclick 字串（T-08-01）
        function renderHashtags() {
            const container = document.getElementById('hashtagChips');
            if (!container) return;
            const song = curSong();
            const tags = song ? song.hashtags : [];
            if (tags.length === 0) {
                const empty = document.createElement('span');
                empty.textContent = '新增標籤來引導 AI 建議';
                empty.style.color = 'var(--text-secondary)';
                empty.style.fontSize = '0.85rem';
                container.replaceChildren(empty);
                if (typeof lhAiRefRefresh === 'function') lhAiRefRefresh();
                return;
            }
            container.replaceChildren(...tags.map(t => {
                const chip = document.createElement('span');
                chip.className = 'hashtag-chip';
                chip.append('#' + t);
                const x = document.createElement('span');
                x.className = 'chip-remove';
                x.textContent = '×';
                x.addEventListener('click', () => removeHashtag(t));
                chip.appendChild(x);
                return chip;
            }));
            if (typeof lhAiRefRefresh === 'function') lhAiRefRefresh();
        }

        // ===== 左側面板：歌詞段落 =====
        function toggleLeftPanel() {
            const panel = document.getElementById('leftPanel');
            panel.classList.toggle('collapsed');
            lhSet('leftPanelCollapsed', panel.classList.contains('collapsed'));
            // 剛打開的是左邊：放不下兩個面板時，收起的是右邊
            syncCenterPanel(panel.classList.contains('collapsed') ? undefined : 'left');
        }

        // ===== 段落 toggle（標題列點擊與 ⋮⋮ 排序都在 js/sections.js 事件委派）=====
        function toggleLyricsSection(i) {
            const song = curSong();
            const sec = song && song.sections[i];
            if (!sec) return;
            sec.collapsed = !sec.collapsed;
            // 只換 class 與箭頭，不重畫：輸入框留在原地（游標、組字不被打斷）
            const section = document.querySelector(`.lyrics-section[data-index="${i}"]`);
            if (section) {
                section.classList.toggle('collapsed', sec.collapsed);
                const chev = section.querySelector('.section-chevron');
                if (chev) chev.style.transform = sec.collapsed ? 'rotate(-90deg)' : '';
            }
            markDirty(song.id);
            flushSongs();
        }

        // ===== 情境＆標籤 / 保留池 收納 =====
        function toggleContextSection() {
            const s = document.getElementById('contextSection');
            const ch = document.getElementById('contextChevron');
            const col = s.classList.toggle('collapsed');
            if (ch) ch.style.transform = col ? 'rotate(-90deg)' : '';
            lhSet('contextSectionCollapsed', col);
        }
        function toggleSavedPool() {
            const s = document.getElementById('savedPoolSection');
            const ch = document.getElementById('savedPoolChevron');
            const col = s.classList.toggle('collapsed');
            if (ch) ch.style.transform = col ? 'rotate(-90deg)' : '';
            lhSet('savedPoolCollapsed', col);
        }

        function addLyricsSection() {
            let newId = null;
            // 依前一段猜一個常見的下一段（Verse → Pre-Chorus → Chorus → Verse），再一次重算所有名稱（B6、B2）
            lhSecApply('add', song => {
                const last = song.sections[song.sections.length - 1];
                const s = makeEmptySection(lhNextSecType(last && last.type));
                newId = s.id;
                song.sections.push(s);
            }, { dom: 'render' });
            const el = newId && lhSecEl(newId);
            if (!el) return;
            // 滑鼠裝置直接把游標放進新段落；觸控不聚焦（避免鍵盤自己彈出來遮住畫面）（D-13）
            if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
                const ta = el.querySelector('.section-textarea');
                if (ta) ta.focus({ preventScroll: true });
            }
            if (!(typeof lhCanvasReveal === 'function' && lhCanvasReveal(el))) el.scrollIntoView({ block: 'nearest' });   // 自由畫布只捲畫布本身
        }

        // 整個編輯器依目前這首歌重畫（開機、切歌、匯入後）
        function renderActiveSong() {
            // 換歌、刪歌、別的分頁更新都會走到這裡：上一首歌選取的字不能帶到這一首（WR-06）
            lastLyricsSelection = '';
            renderLyricsSections();
            renderHashtags();
            const ctx = document.getElementById('contextDescription');
            const song = curSong();
            if (ctx && song) ctx.value = song.context;
            if (typeof lhAiRefRefresh === 'function') lhAiRefRefresh();
        }

        // 用 createElement / textContent / .value 組節點，歌詞與名稱不經過 HTML 解析（T-08-01）
        // class 與 data-index 維持原樣（版型與測試依賴），另加 data-id：編輯一律用 id 找區塊（B4）
        function renderLyricsSections() {
            lhSecAbortInteractions();   // 重畫前先收掉進行中的拖曳（舊節點會被換掉）
            const container = document.getElementById('lyricsSections');
            const song = curSong();
            if (!container || !song) return;
            _lhComposing = false;   // 輸入框被換掉時不會收到 compositionend／focusout，旗標不能卡在 true
            container.replaceChildren(...song.sections.map((s, i) => {
                const el = document.createElement('div');
                el.className = 'lyrics-section' + (s.collapsed ? ' collapsed' : '');
                el.dataset.index = String(i);
                el.dataset.id = s.id;
                el.dataset.type = s.type;
                lhSecApplyColor(el, s.color);
                if (s.align) el.dataset.align = s.align;

                const header = document.createElement('div');
                header.className = 'lyrics-section-header';
                header.title = '點一下收合／展開；抓著標題列拖曳可以移動，右鍵有更多選項';

                // ⋮⋮ 排序把手：只有它能拖（Pointer Events 在 js/sections.js），選字、按名稱鈕都不會誤拖
                const grip = document.createElement('button');
                grip.type = 'button';
                grip.className = 'section-handle';
                grip.title = '拖曳排序（也可以直接抓標題列）';
                grip.textContent = '⋮⋮';
                grip.setAttribute('aria-label', lhSecHandleLabel(s.label));
                grip.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
                header.appendChild(grip);

                const chev = document.createElement('span');
                chev.className = 'section-chevron';
                chev.textContent = '▾';
                if (s.collapsed) chev.style.transform = 'rotate(-90deg)';
                header.appendChild(chev);

                // 名稱是按鈕：點一下換下一種類型（js/sections.js 委派）；模型的 label 永遠是目前顯示名稱（A3）
                const typeBtn = document.createElement('button');
                typeBtn.type = 'button';
                typeBtn.className = 'section-type';
                typeBtn.setAttribute('aria-describedby', 'secTypeHint');
                lhSecFillTypeBtn(typeBtn, s.label);
                header.appendChild(typeBtn);

                // 押韻結構字母條（js/rhyme-map.js 的 lhMapPaint 填內容與顯示／隱藏）：預設藏著、沒有子節點；點它開統計，不收合段落
                const rhy = document.createElement('button');
                rhy.type = 'button';
                rhy.className = 'section-rhyme';
                rhy.hidden = true;
                header.appendChild(rhy);

                // 字數：先建好一個 Text node，之後只改 .data（不增減節點，打字與組字都不會重畫，E2）
                const cnt = document.createElement('span');
                cnt.className = 'section-count';
                cnt.appendChild(document.createTextNode(''));
                header.appendChild(cnt);

                // 每段都有 −（第一段也能刪）；只剩一段時藏起來（C5）
                const rm = document.createElement('button');
                rm.className = 'section-remove';
                rm.title = '刪除這個段落';
                rm.setAttribute('aria-label', '刪除「' + s.label + '」');
                rm.textContent = '−';
                rm.hidden = song.sections.length === 1;
                header.appendChild(rm);

                const body = document.createElement('div');
                body.className = 'section-body';
                // 韻腳地圖的鏡像層（js/rhyme-map.js）：先於輸入框建好、之後只換它的子節點，輸入框完全不動
                const mirror = document.createElement('div');
                mirror.className = 'rhyme-mirror';
                mirror.setAttribute('aria-hidden', 'true');
                body.appendChild(mirror);
                const ta = document.createElement('textarea');
                ta.className = 'section-textarea';
                ta.placeholder = i === 0 ? '在這裡輸入或貼上歌詞…' : '在這裡輸入歌詞…';
                ta.value = s.text;
                body.appendChild(ta);
                if (s.cols && s.cols.length) lhSecBuildCols(body, s, ta);

                el.append(header, body);   // 拉高度的把手已拿掉：段落跟著內容自動長高（lhSecFit）
                _lhSecFitRO.observe(ta);
                return el;
            }));
            if (typeof lhCanvasApply === 'function') lhCanvasApply();   // 自由畫布：先套排版，鏡像層才量得到最後的寬度（canvas.js 較晚載入）
            if (typeof lhRolesRefresh === 'function') lhRolesRefresh();   // 換歌、別分頁更新：角色顏色變數跟著這首歌
            lhSecCountAll();
            lhHistEnsure(song, true);   // 每次重畫（開機、換歌、別的分頁更新）先把「現在」記成歷史的起點
            lhHistSyncButtons();
        }

        // ===== 編輯器事件（B1、B2）：掛在不會被重畫的容器上，重畫只換子節點 =====
        // 輸入只改記憶體裡的模型；組字中（compositionstart～compositionend）完全不存檔，
        // 確認後立刻存；一般打字 300 毫秒後存一次；離開欄位立刻存
        // _lhComposing 宣告在 songs.js（flushSongs 也要看）

        // 用 data-id 找到區塊（不是用順序）；只寫模型，絕不回頭寫畫面（寫 .value 會打斷組字）
        function syncFromField(el) {
            const song = curSong();
            if (!song || !el) return;
            if (el.id === 'contextDescription') {
                song.context = el.value;
                markDirty(song.id);
                return;
            }
            const secEl = el.closest && el.closest('.lyrics-section');
            const sec = secEl && song.sections.find(x => x.id === secEl.dataset.id);
            if (!sec) return;
            if (el.classList.contains('section-textarea')) {
                // 角色標記跟著這次編輯平移：selectionEnd 就是編輯後插入文字的尾端（重複字也分得出插在哪）
                if (sec.marks) lhSecSetMarks(sec, lhMarksShift(sec.marks, sec.text, el.value, el.selectionEnd));
                sec.text = el.value;
            }
            else if (el.classList.contains('section-col-ta') || el.classList.contains('sec-role-name')) {
                // 角色欄：換新陣列（歷史快照是淺拷貝，不能就地改）
                const k = +el.dataset.col, isName = el.classList.contains('sec-role-name');
                if (isName && k === 0) { const v = el.value.trim().slice(0, LH_SEC_ROLE_MAX); if (v) sec.role = v; else delete sec.role; }
                else if (sec.cols && sec.cols[k - 1]) sec.cols = sec.cols.map((c, j) => j === k - 1 ? { ...c, [isName ? 'name' : 'text']: isName ? el.value.trim().slice(0, LH_SEC_ROLE_MAX) : el.value } : c);
                else return;
            }
            else return;
            markDirty(song.id);
        }

        ['lyricsSections', 'contextDescription'].forEach(id => {
            const area = document.getElementById(id);
            if (!area) return;
            area.addEventListener('compositionstart', () => { _lhComposing = true; clearTimeout(_saveTimer); });
            area.addEventListener('compositionend', e => {
                _lhComposing = false; syncFromField(e.target); flushSongs(); lhSecCountFrom(e.target);
                if (e.target.classList.contains('section-col-ta')) lhSecColTyped(e.target);
                // 一個確認的詞算一步（組字中不記）
                if (e.target.classList.contains('section-textarea')) lhHistTyping(curSong(), e.target.closest('.lyrics-section').dataset.id, e.target.selectionStart);
            });
            area.addEventListener('input', e => {
                syncFromField(e.target);
                // Firefox 在 compositionend 之後還會送最後一個 input，所以兩個旗標都看
                if (!_lhComposing && !e.isComposing) {
                    scheduleSave(); lhSecCountFrom(e.target);
                    if (e.target.classList.contains('section-col-ta')) lhSecColTyped(e.target);
                    if (e.target.classList.contains('section-textarea')) lhHistTyping(curSong(), e.target.closest('.lyrics-section').dataset.id, e.target.selectionStart);
                }
            });
            area.addEventListener('focusout', () => { _lhComposing = false; flushSongs(); });
        });


        // ===== 完整歌詞編輯器（R2）：大的浮動面板 =====
        // 不另做一份：打開時把左側的「歌詞區」（工具列、標籤＆情境、新增段落、段落列表）整塊搬進 #lyricsEditorBody、
        // 「匯出」鈕搬到分頁列右邊，關閉時搬回原位（用註解節點佔位）。
        // 事件都掛在 #lyricsSections 等容器本身，跟著節點走；捲動容器由 lhSecScroller 往上找，搬家後自然換成浮動面板裡的。
        // 浮動面板 z-index 低於選單、浮動列、提示（10000）與對話框，所以那些照常疊在上面。
        let _lhEdMoved = null;    // 打開中：[[節點, 佔位註解]…]
        let _lhEdOpener = null;   // 關閉後焦點要回去的元素（滑鼠裝置）
        const _lhEdMouse = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

        // 0.98.03 起平板、電腦不再用浮動面板：「展開」＝歌詞面板貼著原本的邊拉寬到接近全螢幕（body.lp-full）；
        // 面板夠寬（不管是展開還是拖交界拉寬）就是完整編輯器（body.lp-wide）：歌曲分頁、自由／吸附、畫布縮放才出現。手機（≤ 900）照舊用浮動面板
        // 歌詞面板寬到整個畫面的一半以上，才算完整編輯器（Andy 0.98.04；原本是歌詞欄 44rem）
        let _lhLpWide = false;
        function lhEditorIsOpen() { return !!_lhEdMoved || _lhLpWide; }
        function _lhLpSync() {
            const lp = document.getElementById('leftPanel'), main = lp && lp.querySelector('.lyrics-main');
            if (!main) return;
            if (lp.classList.contains('collapsed') || lhIsSheetMode()) document.body.classList.remove('lp-full');
            const wide = !_lhEdMoved && !lhIsSheetMode() && !lp.classList.contains('collapsed') && lp.getBoundingClientRect().width >= document.documentElement.clientWidth / 2;
            _lhLpBtn();
            if (wide === _lhLpWide) return;
            _lhLpWide = wide;
            document.body.classList.toggle('lp-wide', wide);
            lhEditorRenderTabs();
            if (typeof lhCanvasApply === 'function') lhCanvasApply();
            if (typeof lhMapRenderAll === 'function') lhMapRenderAll();
        }
        function _lhLpBtn() {
            const b = document.getElementById('editorOpenBtn'), full = document.body.classList.contains('lp-full');
            if (!b) return;
            b.setAttribute('aria-pressed', String(full));
            b.setAttribute('aria-label', full ? '收回歌詞面板' : '展開完整歌詞編輯器');
            b.title = full ? '收回歌詞面板（Esc）' : '展開完整歌詞編輯器（也可以雙擊歌詞）';
            const l = b.querySelector('.btn-label');
            if (l) l.textContent = full ? '收回' : '展開';
        }
        function lhLpFull(on, after) {
            const lp = document.getElementById('leftPanel');
            if (on && lp.classList.contains('collapsed')) toggleLeftPanel();
            document.body.classList.add('lp-anim');   // 只有展開／收回這一下有動畫（平常拖交界不做 transition）
            document.body.classList.toggle('lp-full', on);
            clearTimeout(lhLpFull.t);
            lhLpFull.t = setTimeout(() => { document.body.classList.remove('lp-anim'); _lhLpSync(); if (typeof lhMapRenderAll === 'function') lhMapRenderAll(); if (after) after(); }, 420);
            _lhLpSync();
        }
        function lhEditorToggle() {
            if (document.body.classList.contains('lp-full')) lhLpFull(false); else lhEditorOpen();
        }
        {
            const lp = document.getElementById('leftPanel');
            if (lp) {
                new ResizeObserver(() => _lhLpSync()).observe(lp);
                new MutationObserver(() => _lhLpSync()).observe(lp, { attributes: true, attributeFilter: ['class'] });
                LH_MQ_SHEET.addEventListener('change', () => _lhLpSync());
            }
        }

        // 搬節點會讓 textarea 的捲動歸零、焦點丟掉：先記下來，搬完放回去
        function _lhEdMove(fn) {
            const ae = document.activeElement;
            if (_lhComposing && ae && ae.blur) ae.blur();   // 組字中先失焦（瀏覽器會把組字確認掉），再搬
            const tas = [...document.querySelectorAll('#lyricsSections .section-textarea')].map(t => [t, t.scrollTop]);
            lhSecAbortInteractions();   // 拖曳、拉高度、段落選單、韻腳選單先收乾淨
            fn();
            for (const [t, top] of tas) t.scrollTop = top;
            if (typeof lhMapRenderAll === 'function') lhMapRenderAll();   // 寬度變了：鏡像層重新對齊
        }

        // ta／sel：觸控點歌詞或雙擊打開時，把游標放回同一段、同一個位置
        function lhEditorOpen(ta, sel) {
            if (_lhEdMoved) return;
            if (!lhIsSheetMode()) {   // 平板、電腦：歌詞面板拉寬，不開浮動面板
                if (ta && ta.isConnected) { ta.focus({ preventScroll: true }); if (sel) ta.setSelectionRange(sel[0], sel[1]); }
                lhLpFull(true, () => {   // 拉寬、排好版之後再把那一段露出來（自由畫布只捲畫布）
                    const card = ta && ta.isConnected && ta.closest('.lyrics-section');
                    if (card) if (!(typeof lhCanvasReveal === 'function' && lhCanvasReveal(card))) card.scrollIntoView({ block: 'nearest' });
                });
                return;
            }
            const layout = document.querySelector('#leftPanel .lyrics-layout');
            const box = document.getElementById('lyricsEditorBody');
            const exp = document.getElementById('exportToggle');
            if (!layout || !box) return;
            _lhEdOpener = ta || document.activeElement;
            _lhEdMove(() => {
                _lhEdMoved = [[layout, box], [exp, document.querySelector('#lyricsEditor .editor-close')]].filter(([n]) => n).map(([n, to]) => {
                    const ph = document.createComment('lyrics-editor');
                    n.before(ph);
                    if (to === box) box.appendChild(n); else to.before(n);
                    return [n, ph];
                });
            });
            document.getElementById('lyricsEditor').hidden = false;
            document.body.classList.add('editor-open');
            if (typeof lhCanvasApply === 'function') lhCanvasApply();   // 自由畫布：這首歌是自由模式就套上
            _lhTagPh('phFull');   // 觸控沒有 hover 提示，展開編輯器時改顯示完整說明
            lhEditorRenderTabs();
            if (ta && ta.isConnected) {
                ta.focus({ preventScroll: true });
                if (sel) ta.setSelectionRange(sel[0], sel[1]);
                const card = ta.closest('.lyrics-section');
                if (card) if (!(typeof lhCanvasReveal === 'function' && lhCanvasReveal(card))) card.scrollIntoView({ block: 'nearest' });
            } else {
                document.querySelector('#lyricsEditor .lyrics-editor').focus({ preventScroll: true });
            }
        }

        function _lhTagPh(k) { const hi = document.getElementById('hashtagInput'); if (hi) hi.placeholder = hi.dataset[k]; }

        function lhEditorClose() {
            if (!_lhEdMoved) return;
            const moved = _lhEdMoved;
            _lhEdMove(() => {
                for (const [n, ph] of moved) ph.replaceWith(n);
            });
            _lhEdMoved = null;
            document.getElementById('lyricsEditor').hidden = true;
            document.body.classList.remove('editor-open');
            if (typeof lhCanvasApply === 'function') lhCanvasApply();   // 回到整齊直列
            _lhTagPh('phShort');
            // 滑鼠裝置焦點回到打開它的地方；觸控不聚焦歌詞（不然鍵盤又彈出來、而且又會自動打開）
            const back = _lhEdOpener;
            _lhEdOpener = null;
            if (_lhEdMouse() && back && back.isConnected && back.focus) back.focus({ preventScroll: true });
            else if (document.activeElement && document.getElementById('leftPanel').contains(document.activeElement)) document.activeElement.blur();
        }

        // 上方一排歌曲分頁：舊的在左、新的在右，最後是「＋」；點了換歌、雙擊改名
        function lhEditorRenderTabs() {
            const bar = _lhEdMoved ? document.getElementById('editorTabs') : _lhLpWide ? document.getElementById('lpTabs') : null;
            if (!bar) return;
            const hadFocus = bar.contains(document.activeElement) && !document.activeElement.classList.contains('song-name-input');
            if (bar.querySelector('.song-name-input')) return;   // 改名中不重畫（改完會再畫一次）
            const tabs = sortedSongs().reverse().map(s => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'editor-tab';
                b.dataset.songId = s.id;
                b.textContent = s.title;
                b.title = s.title + '（雙擊改名）';
                if (s.color) { b.classList.add('has-color'); b.style.setProperty('--song-c', s.color); }
                if (s.id === activeSongId) b.setAttribute('aria-current', 'true');
                return b;
            });
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'editor-tab editor-tab-add';
            add.textContent = '＋';
            add.title = '新增歌曲';
            add.setAttribute('aria-label', '新增一首歌曲');
            // 目前這首歌的顏色標籤：點了選色
            const col = document.createElement('button');
            col.type = 'button';
            col.className = 'editor-tab editor-tab-color';
            const cs = curSong();
            if (cs && cs.color) col.style.setProperty('--song-c', cs.color);
            col.title = '這首歌的顏色標籤';
            col.setAttribute('aria-label', '設定這首歌的顏色標籤');
            col.setAttribute('aria-haspopup', 'true');
            bar.replaceChildren(...tabs, add, col);
            const cur = bar.querySelector('[aria-current="true"]');
            if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            if (hadFocus && cur) cur.focus({ preventScroll: true });
        }

        // 選色小面板：八個顏色＋「無」，點外面或 Esc 關
        function _lhSongColorPop(anchor) {
            document.getElementById('songColorPop')?.remove();
            const song = curSong();
            if (!song) return;
            const pop = document.createElement('div');
            pop.id = 'songColorPop';
            pop.className = 'song-color-pop';
            pop.setAttribute('role', 'group');
            pop.setAttribute('aria-label', '歌曲顏色');
            const close = () => { pop.remove(); document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', key, true); };
            const out = e => { if (!pop.contains(e.target) && e.target !== anchor) close(); };
            const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); anchor.focus(); } };
            for (const c of [...LH_ROLE_COLORS, null]) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'swatch song-color-sw' + (c ? '' : ' none');
                if (c) b.style.setProperty('--song-c', c);
                b.setAttribute('aria-label', c ? '顏色 ' + c : '不要顏色');
                b.setAttribute('aria-pressed', String((song.color || null) === c));
                if (!c) b.textContent = '無';
                b.addEventListener('click', () => { lhSongSetColor(song.id, c); close(); });
                pop.append(b);
            }
            document.body.append(pop);
            const r = anchor.getBoundingClientRect();
            if (typeof lhPlaceMenu === 'function') lhPlaceMenu(pop, r.left, r.bottom + 4);
            else { pop.style.left = r.left + 'px'; pop.style.top = r.bottom + 4 + 'px'; }
            document.addEventListener('pointerdown', out, true);
            document.addEventListener('keydown', key, true);
            pop.querySelector('[aria-pressed="true"]')?.focus();
        }

        for (const id of ['editorTabs', 'lpTabs']) {
            const bar = document.getElementById(id);
            bar?.addEventListener('click', e => {
                const t = e.target.closest('.editor-tab');
                if (!t) return;
                if (t.classList.contains('editor-tab-color')) { _lhSongColorPop(t); return; }
                if (t.classList.contains('editor-tab-add')) {
                    const before = activeSongId;
                    createSong({ rename: false });
                    if (activeSongId === before) return;
                    const tab = [...bar.querySelectorAll('.editor-tab')].find(b => b.dataset.songId === activeSongId);
                    if (tab) startRenameSong(activeSongId, { isNew: true, anchor: tab });
                } else if (t.dataset.songId) switchSong(t.dataset.songId);
            });
            bar?.addEventListener('dblclick', e => {
                const t = e.target.closest('.editor-tab');
                if (t && t.dataset.songId) startRenameSong(t.dataset.songId, { anchor: t });
            });
        }

        // 電腦（滑鼠）：雙擊歌詞打開，單擊不打開；手指／觸控筆：點歌詞就打開，游標留在點的位置
        // 觸控等到 click 才搬：那時游標已經放好，而且還在使用者手勢裡，重新聚焦鍵盤才會照常出現。
        // 不看 click 落在哪：聚焦會讓版面移動（鍵盤讓位），click 常落在旁邊；按下時記住是哪一段，click 時它還有焦點就打開
        let _lhEdTapTa = null;
        document.getElementById('lyricsSections')?.addEventListener('dblclick', e => {
            const ta = e.target.closest && e.target.closest('.section-textarea');
            if (ta && !_lhEdMoved && !_lhLpWide) lhEditorOpen(ta, [ta.selectionStart, ta.selectionEnd]);
        });
        // 觸控點歌詞、標籤輸入框、情境框都會彈出編輯器（Andy：行動裝置點情境標籤也要彈）
        document.querySelector('#leftPanel .lyrics-layout')?.addEventListener('pointerdown', e => {
            _lhEdTapTa = !_lhEdMoved && e.pointerType !== 'mouse' && e.target.closest && e.target.closest('.section-textarea, .context-textarea, .hashtag-input') || null;
        });
        document.addEventListener('click', () => {
            const ta = _lhEdTapTa;
            _lhEdTapTa = null;
            if (ta && !_lhEdMoved && !_lhLpWide && document.activeElement === ta) lhEditorOpen(ta, [ta.selectionStart, ta.selectionEnd]);
        }, true);

        // 點遮罩（按下與放開都在遮罩上）關閉；在面板裡選字拖到外面放開不算
        let _lhEdDownOnMask = false;
        document.getElementById('lyricsEditor')?.addEventListener('pointerdown', e => { _lhEdDownOnMask = e.target === e.currentTarget; });
        document.getElementById('lyricsEditor')?.addEventListener('click', e => {
            if (_lhEdDownOnMask && e.target === e.currentTarget) lhEditorClose();
            _lhEdDownOnMask = false;
        });

        // Esc 關閉（選單、浮動列、拖曳在 capture 階段先用掉 Esc；組字中的 Esc 是取消組字）；Tab 在面板內循環
        document.addEventListener('keydown', e => {
            // 拉寬的歌詞面板：Esc 收回（選單、浮層先用掉的不算）
            if (!_lhEdMoved && e.key === 'Escape' && !e.isComposing && document.body.classList.contains('lp-full') && !e.defaultPrevented
                && !document.querySelector('.word-ctx-menu.show, .settings-overlay.show, .about-overlay.show, .feedback-modal-overlay.show, #wordSpace:not([hidden])')
                && !(e.target.classList && e.target.classList.contains('song-name-input'))) { e.preventDefault(); lhLpFull(false); return; }
            if (!_lhEdMoved || e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Escape') {
                if (e.defaultPrevented || document.querySelector('.word-ctx-menu.show, .settings-overlay.show, .about-overlay.show, .feedback-modal-overlay.show')) return;
                if (e.target.classList && e.target.classList.contains('song-name-input')) return;
                e.preventDefault();   // 手機版「Esc 收起 sheet」看 defaultPrevented，不會連 sheet 一起收
                lhEditorClose();
            } else if (e.key === 'Tab') {
                const dlg = document.querySelector('#lyricsEditor .lyrics-editor');
                if (!dlg.contains(e.target) && e.target !== document.body) return;   // 焦點在選單、對話框裡：不管
                const f = [...dlg.querySelectorAll('button, textarea, input, select, [tabindex="0"]')].filter(x => !x.disabled && x.offsetParent !== null);
                if (!f.length) return;
                const first = f[0], last = f[f.length - 1];
                if (e.shiftKey && (e.target === first || e.target === dlg)) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && e.target === last) { e.preventDefault(); first.focus(); }
            }
        });
