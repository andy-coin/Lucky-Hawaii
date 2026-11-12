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
            el.scrollIntoView({ block: 'nearest' });
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

                const header = document.createElement('div');
                header.className = 'lyrics-section-header';

                // ⋮⋮ 排序把手：只有它能拖（Pointer Events 在 js/sections.js），選字、按名稱鈕都不會誤拖
                const grip = document.createElement('button');
                grip.type = 'button';
                grip.className = 'section-handle';
                grip.title = '拖曳排序';
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

                // 底邊拉桿（C4）：在 textarea 下面、不蓋住最後一行；拖、鍵盤、雙擊都在 js/sections.js
                const rz = document.createElement('div');
                rz.className = 'section-resize';
                rz.setAttribute('role', 'separator');
                rz.setAttribute('aria-orientation', 'horizontal');
                rz.tabIndex = 0;
                rz.setAttribute('aria-label', lhSecResizeLabel(s.label));
                rz.setAttribute('aria-valuemin', String(LH_SEC_H_MIN));
                rz.setAttribute('aria-valuemax', String(LH_SEC_H_MAX));

                el.append(header, body, rz);
                if (s.height !== null) lhSecSetHeight(el, s.height);   // 存過的高度：data-h 與 --sec-h
                return el;
            }));
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
            if (el.classList.contains('section-textarea')) sec.text = el.value;
            else return;
            markDirty(song.id);
        }

        ['lyricsSections', 'contextDescription'].forEach(id => {
            const area = document.getElementById(id);
            if (!area) return;
            area.addEventListener('compositionstart', () => { _lhComposing = true; clearTimeout(_saveTimer); });
            area.addEventListener('compositionend', e => {
                _lhComposing = false; syncFromField(e.target); flushSongs(); lhSecCountFrom(e.target);
                // 一個確認的詞算一步（組字中不記）
                if (e.target.classList.contains('section-textarea')) lhHistTyping(curSong(), e.target.closest('.lyrics-section').dataset.id, e.target.selectionStart);
            });
            area.addEventListener('input', e => {
                syncFromField(e.target);
                // Firefox 在 compositionend 之後還會送最後一個 input，所以兩個旗標都看
                if (!_lhComposing && !e.isComposing) {
                    scheduleSave(); lhSecCountFrom(e.target);
                    if (e.target.classList.contains('section-textarea')) lhHistTyping(curSong(), e.target.closest('.lyrics-section').dataset.id, e.target.selectionStart);
                }
            });
            area.addEventListener('focusout', () => { _lhComposing = false; flushSongs(); });
        });

