        // ===== 底部面板：情境 & 標籤 =====
        function toggleRecentPanel() {
            const panel = document.getElementById('recentPanel');
            panel.classList.toggle('collapsed');
            lhSet('recentPanelCollapsed', panel.classList.contains('collapsed'));
        }

        function addHashtag(tagValue) {
            const tag = (tagValue || '').trim().replace(/^#/, '');
            if (!tag) return;
            if (!hashtags.includes(tag)) {
                hashtags.push(tag);
                lhSet('haiku_hashtags', JSON.stringify(hashtags));
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
            hashtags = hashtags.filter(t => t !== tag);
            lhSet('haiku_hashtags', JSON.stringify(hashtags));
            renderHashtags();
        }

        function renderHashtags() {
            const container = document.getElementById('hashtagChips');
            if (hashtags.length === 0) {
                container.innerHTML = '<span style="color:var(--text-secondary);font-size:0.85rem;">新增標籤來引導 AI 建議</span>';
                return;
            }
            container.innerHTML = hashtags.map(t =>
                `<span class="hashtag-chip">#${t}<span class="chip-remove" onclick="removeHashtag('${t.replace(/'/g, "\\'")}')">×</span></span>`
            ).join('');
        }

        // ===== 左側面板：歌詞段落 =====
        function toggleLeftPanel() {
            const panel = document.getElementById('leftPanel');
            panel.classList.toggle('collapsed');
            lhSet('leftPanelCollapsed', panel.classList.contains('collapsed'));
            syncCenterPanel();
        }

        function saveLyrics() {
            const sections = document.querySelectorAll('.lyrics-section');
            lyricsSections = Array.from(sections).map(s => ({
                label: s.querySelector('.section-label')?.value ?? '',
                text: s.querySelector('.section-textarea')?.value ?? '',
                collapsed: s.classList.contains('collapsed')
            }));
            lhSet('haiku_lyrics', JSON.stringify(lyricsSections));
        }

        // ===== 段落 toggle / label edit / drag reorder =====
        function onSectionHeaderClick(e, i) {
            if (e.target.classList.contains('section-remove')) return;
            if (e.target.classList.contains('section-label') && !e.target.hasAttribute('readonly')) return;
            toggleLyricsSection(i);
        }

        function toggleLyricsSection(i) {
            lyricsSections[i].collapsed = !lyricsSections[i].collapsed;
            const section = document.querySelector(`.lyrics-section[data-index="${i}"]`);
            if (section) {
                section.classList.toggle('collapsed', lyricsSections[i].collapsed);
                const chev = section.querySelector('.section-chevron');
                if (chev) chev.style.transform = lyricsSections[i].collapsed ? 'rotate(-90deg)' : '';
            }
            lhSet('haiku_lyrics', JSON.stringify(lyricsSections));
        }

        function enableSectionLabel(input, e) {
            e.stopPropagation();
            input.removeAttribute('readonly');
            input.focus();
            input.select();
        }

        function disableSectionLabel(input) {
            input.setAttribute('readonly', '');
            saveLyrics();
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
            saveLyrics();
            const [moved] = lyricsSections.splice(_dragSrcIdx, 1);
            lyricsSections.splice(i, 0, moved);
            _dragSrcIdx = null;
            lhSet('haiku_lyrics', JSON.stringify(lyricsSections));
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

        // ===== 存檔 / 讀取（左側歌詞段落 + 情境 + #標籤 + 右側保留池）=====
        function exportSession() {
            saveLyrics(); // 確保最新 DOM 狀態同步到 lyricsSections
            const ctx = document.getElementById('contextDescription')?.value || '';
            const payload = {
                version: 1,
                exportedAt: new Date().toISOString(),
                lyricsSections,
                hashtags,
                savedWords,
                contextDescription: ctx
            };
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
            const defaultName = `LuckyHawaii_${stamp}`;
            const userName = window.prompt('請輸入存檔檔名（不需加 .json）', defaultName);
            if (userName === null) return; // 使用者取消
            const safe = (userName.trim() || defaultName).replace(/[\\/:*?"<>|]/g, '_');
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safe}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('已匯出 ' + safe + '.json');
        }

        function importSession(ev) {
            const file = ev.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    if (!confirm('讀取存檔會覆蓋目前的歌詞段落、情境、#標籤與保留池，確定？')) {
                        ev.target.value = ''; return;
                    }
                    if (Array.isArray(data.lyricsSections)) {
                        lyricsSections = data.lyricsSections;
                        lhSet('haiku_lyrics', JSON.stringify(lyricsSections));
                        renderLyricsSections();
                    }
                    if (Array.isArray(data.hashtags)) {
                        hashtags = data.hashtags;
                        lhSet('haiku_hashtags', JSON.stringify(hashtags));
                        renderHashtags();
                    }
                    if (Array.isArray(data.savedWords)) {
                        savedWords = data.savedWords;
                        lhSet('haiku_savedwords', JSON.stringify(savedWords));
                        renderSavedWords();
                    }
                    if (typeof data.contextDescription === 'string') {
                        const ta = document.getElementById('contextDescription');
                        if (ta) ta.value = data.contextDescription;
                    }
                    showToast('已讀取存檔');
                } catch (e) {
                    showToast('讀取失敗：檔案格式錯誤');
                }
                ev.target.value = '';
            };
            reader.readAsText(file);
        }

        function addLyricsSection() {
            lyricsSections.push({ label: '新段落', text: '', collapsed: false });
            lhSet('haiku_lyrics', JSON.stringify(lyricsSections));
            renderLyricsSections();
            // 滾到底部讓新段落可見
            setTimeout(() => {
                const body = document.querySelector('#leftPanel .side-panel-body');
                if (body) body.scrollTop = body.scrollHeight;
            }, 50);
        }

        function removeLyricsSection(index) {
            lyricsSections.splice(index, 1);
            lhSet('haiku_lyrics', JSON.stringify(lyricsSections));
            renderLyricsSections();
        }

        function renderLyricsSections() {
            const container = document.getElementById('lyricsSections');
            if (!container) return;
            container.innerHTML = lyricsSections.map((s, i) => {
                const defaultLabel = i === 0 ? '歌詞' : '新段落';
                const labelVal = (s.label || defaultLabel).replace(/"/g, '&quot;');
                const col = s.collapsed ? 'collapsed' : '';
                const chevStyle = s.collapsed ? 'style="transform:rotate(-90deg)"' : '';
                const removeBtn = i === 0 ? '' :
                    `<button class="section-remove" onclick="event.stopPropagation();removeLyricsSection(${i})" title="刪除">−</button>`;
                const placeholder = i === 0 ? '在這裡輸入或貼上歌詞…' : '在這裡輸入歌詞…';
                return `<div class="lyrics-section ${col}" data-index="${i}">
                    <div class="lyrics-section-header"
                         onclick="onSectionHeaderClick(event,${i})"
                         ondragstart="onSectionDragStart(event,${i})"
                         ondragover="onSectionDragOver(event,${i})"
                         ondragleave="onSectionDragLeave(event)"
                         ondrop="onSectionDrop(event,${i})"
                         ondragend="onSectionDragEnd()"
                         draggable="true">
                        <span class="section-chevron" ${chevStyle}>▾</span>
                        <input class="section-label" value="${labelVal}" readonly
                               ondblclick="enableSectionLabel(this,event)"
                               onblur="disableSectionLabel(this)"
                               onkeydown="if(event.key==='Enter')this.blur()">
                        ${removeBtn}
                    </div>
                    <div class="section-body"><textarea class="section-textarea" oninput="saveLyrics()" placeholder="${placeholder}">${s.text}</textarea></div>
                </div>`;
            }).join('');
        }

