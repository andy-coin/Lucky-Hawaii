        // ===== 底部面板：情境 & 標籤 =====
        function toggleRecentPanel() {
            const panel = document.getElementById('recentPanel');
            panel.classList.toggle('collapsed');
            lhSet('recentPanelCollapsed', panel.classList.contains('collapsed'));
        }

        function addHashtag(tagValue) {
            const tag = (tagValue || '').trim().replace(/^#/, '');
            const song = curSong();
            if (!tag || !song) return;
            if (!song.hashtags.includes(tag)) {
                song.hashtags.push(tag);
                markDirty(song.id);
                flushSongs();
                renderHashtags();
            }
        }

        function openHashtagPopup() {
            const overlay = document.getElementById('hashtagPopupOverlay');
            const input = document.getElementById('hashtagPopupInput');
            if (!overlay) return;
            input.value = '';
            overlay.classList.add('show');
            setTimeout(() => input.focus(), 80);
        }

        function closeHashtagPopup() {
            document.getElementById('hashtagPopupOverlay')?.classList.remove('show');
        }

        function confirmHashtagPopup() {
            const input = document.getElementById('hashtagPopupInput');
            addHashtag(input?.value || '');
            closeHashtagPopup();
        }

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
        }

        // ===== 左側面板：歌詞段落 =====
        function toggleLeftPanel() {
            const panel = document.getElementById('leftPanel');
            panel.classList.toggle('collapsed');
            lhSet('leftPanelCollapsed', panel.classList.contains('collapsed'));
            // 剛打開的是左邊：放不下兩個面板時，收起的是右邊
            syncCenterPanel(panel.classList.contains('collapsed') ? undefined : 'left');
        }

        // ===== 段落 toggle / label edit / drag reorder =====
        function onSectionHeaderClick(e, i) {
            if (e.target.classList.contains('section-remove')) return;
            if (e.target.classList.contains('section-label') && !e.target.hasAttribute('readonly')) return;
            toggleLyricsSection(i);
        }

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

        function enableSectionLabel(input, e) {
            e.stopPropagation();
            input.removeAttribute('readonly');
            input.focus();
            input.select();
        }

        // 名稱在打字時就已經同步進模型（syncFromField）；這裡只結束編輯狀態並存檔，不從畫面讀值
        function disableSectionLabel(input) {
            input.setAttribute('readonly', '');
            flushSongs();
        }

        let _dragSrcIdx = null;
        function onSectionDragStart(e, i) {
            _dragSrcIdx = i;
            e.dataTransfer.effectAllowed = 'move';
            e.currentTarget.parentElement.classList.add('dragging');
        }
        function onSectionDragOver(e, i) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (_dragSrcIdx !== null && _dragSrcIdx !== i) {
                document.querySelectorAll('.lyrics-section').forEach(s => s.classList.remove('drag-over'));
                const t = document.querySelector(`.lyrics-section[data-index="${i}"]`);
                if (t) t.classList.add('drag-over');
            }
        }
        function onSectionDragLeave(e) {
            e.currentTarget.parentElement?.classList.remove('drag-over');
        }
        function onSectionDrop(e, i) {
            e.preventDefault();
            if (_dragSrcIdx === null || _dragSrcIdx === i) return;
            const song = curSong();
            if (!song || !song.sections[_dragSrcIdx]) { _dragSrcIdx = null; return; }
            const [moved] = song.sections.splice(_dragSrcIdx, 1);
            song.sections.splice(i, 0, moved);
            _dragSrcIdx = null;
            markDirty(song.id);
            flushSongs();
            renderLyricsSections();
        }
        function onSectionDragEnd() {
            _dragSrcIdx = null;
            document.querySelectorAll('.lyrics-section').forEach(s => s.classList.remove('dragging', 'drag-over'));
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
            const song = curSong();
            if (!song) return;
            song.sections.push({ id: lhNewId('sec-'), label: '新段落', text: '', collapsed: false });
            markDirty(song.id);
            flushSongs();
            renderLyricsSections();
            // 滾到底部讓新段落可見
            setTimeout(() => {
                const body = document.querySelector('#leftPanel .side-panel-body');
                if (body) body.scrollTop = body.scrollHeight;
            }, 50);
        }

        function removeLyricsSection(index) {
            // 手機上刪除鈕變大了（44px），一次點錯不能就把寫好的歌詞弄丟：段落有內容時先確認，取消就什麼都不動（D-12）。
            // 段落名稱當純文字塞進 confirm 訊息（不是 HTML，T-05-17）。第 9 階段會改成可復原，到時這個確認再拿掉。
            const song = curSong();
            const sec = song && song.sections[index];
            if (!sec) return;
            if ((sec.text || '').trim()) {
                const name = sec.label || (index === 0 ? '歌詞' : '新段落');
                if (!confirm('刪除「' + name + '」？段落內的歌詞會一併刪除，無法復原。')) return;
            }
            song.sections.splice(index, 1);
            markDirty(song.id);
            flushSongs();
            renderLyricsSections();
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
        }

        // 用 createElement / textContent / .value 組節點，歌詞與名稱不經過 HTML 解析（T-08-01）
        // class 與 data-index 維持原樣（版型與測試依賴），另加 data-id：編輯一律用 id 找區塊（B4）
        function renderLyricsSections() {
            const container = document.getElementById('lyricsSections');
            const song = curSong();
            if (!container || !song) return;
            container.replaceChildren(...song.sections.map((s, i) => {
                const el = document.createElement('div');
                el.className = 'lyrics-section' + (s.collapsed ? ' collapsed' : '');
                el.dataset.index = String(i);
                el.dataset.id = s.id;

                const header = document.createElement('div');
                header.className = 'lyrics-section-header';
                header.setAttribute('onclick', `onSectionHeaderClick(event,${i})`);
                header.setAttribute('ondragstart', `onSectionDragStart(event,${i})`);
                header.setAttribute('ondragover', `onSectionDragOver(event,${i})`);
                header.setAttribute('ondragleave', 'onSectionDragLeave(event)');
                header.setAttribute('ondrop', `onSectionDrop(event,${i})`);
                header.setAttribute('ondragend', 'onSectionDragEnd()');
                header.setAttribute('draggable', 'true');

                const chev = document.createElement('span');
                chev.className = 'section-chevron';
                chev.textContent = '▾';
                if (s.collapsed) chev.style.transform = 'rotate(-90deg)';
                header.appendChild(chev);

                const label = document.createElement('input');
                label.className = 'section-label';
                label.value = s.label || (i === 0 ? '歌詞' : '新段落');
                label.setAttribute('readonly', '');
                label.setAttribute('ondblclick', 'enableSectionLabel(this,event)');
                label.setAttribute('onblur', 'disableSectionLabel(this)');
                label.setAttribute('onkeydown', "if(event.key==='Enter'&&!event.isComposing&&event.keyCode !== 229)this.blur()");
                header.appendChild(label);

                if (i !== 0) {
                    const rm = document.createElement('button');
                    rm.className = 'section-remove';
                    rm.setAttribute('onclick', `event.stopPropagation();removeLyricsSection(${i})`);
                    rm.title = '刪除';
                    rm.textContent = '−';
                    header.appendChild(rm);
                }

                const body = document.createElement('div');
                body.className = 'section-body';
                const ta = document.createElement('textarea');
                ta.className = 'section-textarea';
                ta.placeholder = i === 0 ? '在這裡輸入或貼上歌詞…' : '在這裡輸入歌詞…';
                ta.value = s.text;
                body.appendChild(ta);

                el.append(header, body);
                return el;
            }));
        }

        // ===== 編輯器事件（B1、B2）：掛在不會被重畫的容器上，重畫只換子節點 =====
        // 輸入只改記憶體裡的模型；組字中（compositionstart～compositionend）完全不存檔，
        // 確認後立刻存；一般打字 300 毫秒後存一次；離開欄位立刻存
        let _lhComposing = false;

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
            else if (el.classList.contains('section-label')) sec.label = el.value;
            else return;
            markDirty(song.id);
        }

        ['lyricsSections', 'contextDescription'].forEach(id => {
            const area = document.getElementById(id);
            if (!area) return;
            area.addEventListener('compositionstart', () => { _lhComposing = true; });
            area.addEventListener('compositionend', e => { _lhComposing = false; syncFromField(e.target); flushSongs(); });
            area.addEventListener('input', e => {
                syncFromField(e.target);
                // Firefox 在 compositionend 之後還會送最後一個 input，所以兩個旗標都看
                if (!_lhComposing && !e.isComposing) scheduleSave();
            });
            area.addEventListener('focusout', () => { _lhComposing = false; flushSongs(); });
        });

