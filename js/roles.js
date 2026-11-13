// ==================== 角色標記 UI（對唱、音樂劇） ====================
// 資料與平移在 sections-core.js（song.roles、段落 marks）。這支檔：角色顏色變數、新增角色、
// 選字浮動列「指定角色 ▸」開的 #roleSelMenu。角色名稱是使用者輸入，只走 textContent（T-r05-03）。

// 把這首歌每個角色的顏色寫成 --rl0..--rl7（鏡像層的 span.rl 與選單的色點共用）。顏色一定先過驗證才進 CSS（T-r05-02）。
// 改色只改變數，不用重畫鏡像層
function lhRolesRefresh() {
    const song = typeof curSong === 'function' ? curSong() : null;
    const roles = (song && song.roles) || [];
    const st = document.documentElement.style;
    for (let k = 0; k < LH_ROLE_MAX; k++) {
        const r = roles[k];
        if (r && LH_SEC_COLOR_RE.test(r.color)) st.setProperty('--rl' + k, r.color);
        else st.removeProperty('--rl' + k);
    }
}

// 新增角色：滿 8 個回 null。顏色取預設色盤第一個沒用過的。這是整首歌的設定，不進復原歷史（和歌名、段落高度一樣）
function lhRoleAdd(song) {
    const roles = song.roles || [];
    if (roles.length >= LH_ROLE_MAX) return null;
    const used = new Set(roles.map(r => r.color));
    const role = {
        id: lhNewId('role-'),
        name: '角色 ' + (roles.length + 1),
        color: LH_ROLE_COLORS.find(c => !used.has(c)) || LH_ROLE_COLORS[roles.length]
    };
    song.roles = [...roles, role];
    markDirty(song.id);
    flushSongs();
    lhRolesRefresh();
    return role;
}

// 把快照範圍指定給角色（null＝清除）；一步可復原
function lhRoleMark(snap, roleId) {
    const step = lhSecApply('role', song => {
        const s = song.sections.find(x => x.id === snap.secId);
        if (!s || s.text.slice(snap.a, snap.b) !== snap.text) return false;   // 快照過期：不動任何標記
        const next = lhMarksSet(s.marks, snap.a, snap.b, roleId);
        if (JSON.stringify(next) === JSON.stringify(s.marks || [])) return false;
        lhSecSetMarks(s, next);
    });
    if (!step) return false;
    const el = lhSecEl(snap.secId);
    if (el) lhMapPaint(el);
    const role = roleId && (curSong().roles || []).find(r => r.id === roleId);
    lhAnnounce(role ? '已指定為「' + cutName(role.name, 16) + '」' : '已清除角色');
    return true;
}

// ===== 選單 #roleSelMenu =====
let _lhRoleSel = null;    // 選取快照 { secId, a, b, text }；null＝選單關著
let _lhRoleMenu = null;

function _lhRoleBuild() {
    if (_lhRoleMenu) return;
    const m = _lhMk('div', 'word-ctx-menu section-menu role-sel-menu');
    m.id = 'roleSelMenu';
    m.setAttribute('role', 'menu');
    m.setAttribute('aria-label', '指定角色');
    // 不搶文字框的焦點與選取（手機鍵盤也才不會收）
    for (const t of ['pointerdown', 'mousedown']) m.addEventListener(t, e => e.preventDefault());
    m.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('.role-sel-item, .role-sel-clear, .role-sel-new');
        const snap = _lhRoleSel;
        if (!b || !snap) return;
        if (b.classList.contains('role-sel-new')) {
            if (b.getAttribute('aria-disabled') === 'true') { showToast('最多 ' + LH_ROLE_MAX + ' 個角色'); return; }
            lhRoleSelClose();
            const role = lhRoleAdd(curSong());
            if (role) {
                lhRoleMark(snap, role.id);
                showToast('已新增「' + cutName(role.name, 12) + '」，可按工具列「角色 ▾」改名、改色', 3000);
            } else showToast('最多 ' + LH_ROLE_MAX + ' 個角色');
            return;
        }
        lhRoleSelClose();
        lhRoleMark(snap, b.classList.contains('role-sel-clear') ? null : b.dataset.id);
    });
    m.addEventListener('keydown', e => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const items = [...m.querySelectorAll('button')], i = items.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus({ preventScroll: true });
    });
    document.body.appendChild(m);
    _lhRoleMenu = m;
}

// 每次打開重填
function _lhRoleSelFill() {
    const roles = curSong().roles || [];
    const kids = [_lhMk('span', 'section-menu-cap', '指定角色')];
    roles.forEach((r, k) => {
        const b = _lhMkBtn('section-menu-btn role-sel-item', '');
        b.setAttribute('role', 'menuitem');
        b.dataset.id = r.id;
        const dot = _lhMk('span', 'role-dot');
        dot.dataset.rl = String(k);
        dot.setAttribute('aria-hidden', 'true');
        b.append(dot, document.createTextNode(cutName(r.name, 12)));
        kids.push(b);
    });
    if (roles.length) {
        const c = _lhMkBtn('section-menu-btn role-sel-clear', '清除角色');
        c.setAttribute('role', 'menuitem');
        kids.push(c);
    }
    const nb = _lhMkBtn('section-menu-btn role-sel-new', '＋ 新角色');
    nb.setAttribute('role', 'menuitem');
    if (roles.length >= LH_ROLE_MAX) nb.setAttribute('aria-disabled', 'true');
    kids.push(nb);
    _lhRoleMenu.replaceChildren(...kids);
}

// anchorRect：被擠上來蓋住按鈕時翻到它上方
function lhRoleSelOpen(snap, x, y, byKeyboard, anchorRect) {
    _lhRoleBuild();
    if (typeof lhMapCloseAll === 'function') lhMapCloseAll();   // 同時只開一個浮層
    lhSecCloseMenu();
    closeExportMenu();
    closeSongListOverlay();
    lhMoveSelClose();
    _lhRoleSel = snap;
    _lhRoleSelFill();
    lhPlaceMenu(_lhRoleMenu, x, y);
    if (anchorRect) {
        const b = _lhRoleMenu.getBoundingClientRect();
        if (b.top < anchorRect.bottom && anchorRect.top - b.height - 4 >= 4) lhPlaceMenu(_lhRoleMenu, x, anchorRect.top - b.height - 4);
    }
    if (byKeyboard) _lhRoleMenu.querySelector('button:not([aria-disabled="true"])')?.focus({ preventScroll: true });
}

function lhRoleSelClose(refocus) {
    if (!_lhRoleMenu) return;
    const id = _lhRoleSel && _lhRoleSel.secId;
    const inside = _lhRoleMenu.contains(document.activeElement);
    _lhRoleMenu.classList.remove('show');
    _lhRoleSel = null;
    if (refocus && inside) lhSecEl(id)?.querySelector('.section-textarea')?.focus({ preventScroll: true });
}

function lhRoleBusy() {
    return _lhRoleSel !== null || _lhRolePanelOn;
}

// 點外面收起（不攔這一下）；Esc 收起並把焦點還給文字框（capture：≤ 900 的 sheet 才不會一起收）
document.addEventListener('pointerdown', e => {
    if (_lhRoleSel && !(e.target.closest && e.target.closest('#roleSelMenu'))) lhRoleSelClose();
}, true);
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || !_lhRoleSel) return;
    e.preventDefault();
    e.stopPropagation();
    lhRoleSelClose(true);
}, true);

// ==================== 角色管理面板 #roleMenu（工具列「角色 ▾」） ====================
// 新增、改名、改色、刪除這首歌的角色。這些是整首歌的設定，不進復原歷史（同 lhRoleAdd）。
// 角色名稱是使用者輸入：只走 textContent、.value、createTextNode（T-s3k-01）。
let _lhRolePanel = null, _lhRolePanelOn = false;

function _lhRolePanelBuild() {
    if (_lhRolePanel) return;
    const m = _lhMk('div', 'word-ctx-menu section-menu role-menu');
    m.id = 'roleMenu';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-label', '角色設定');
    // 每次都用 data-id 回頭找角色（面板開著時歌可能換了）；找不到就忽略
    const roleOf = el => {
        const row = el.closest && el.closest('.role-row');
        const song = curSong();
        const role = row && song && (song.roles || []).find(r => r.id === row.dataset.id);
        return role ? { row, song, role, k: song.roles.indexOf(role) } : null;
    };
    m.addEventListener('input', e => {
        const t = e.target;
        if (t.classList.contains('role-name')) {
            const c = roleOf(t);
            const name = _lhSecCut(t.value.trim(), LH_SEC_ROLE_MAX);
            if (!c || !name) return;
            c.role.name = name;
            markDirty(c.song.id);
            scheduleSave();
        } else if (t.classList.contains('role-color')) {
            const c = roleOf(t);
            if (c) _lhRoleSetColor(c, t.value);
        }
    });
    m.addEventListener('change', e => {
        const t = e.target;
        if (t.classList.contains('role-name')) _lhRoleNameCommit(t);
        else if (t.classList.contains('role-color')) flushSongs();
    });
    m.addEventListener('focusout', e => {
        const b = e.target;
        if (b.classList && b.classList.contains('role-del')) _lhRoleDisarm(b);
    });
    m.addEventListener('click', e => {
        const t = e.target.closest && e.target.closest('.swatch, .role-add, .role-del');
        if (!t) return;
        if (t.classList.contains('role-add')) {
            if (t.getAttribute('aria-disabled') === 'true') { showToast('最多 ' + LH_ROLE_MAX + ' 個角色'); return; }
            const role = lhRoleAdd(curSong());
            if (!role) { showToast('最多 ' + LH_ROLE_MAX + ' 個角色'); return; }
            _lhRolePanelFill();
            _lhRolePanelPlace();
            if (matchMedia(_LH_FINE).matches) {   // 手機不搶焦點（鍵盤會彈出來蓋住面板）
                const inp = [...m.querySelectorAll('.role-row')].find(r => r.dataset.id === role.id)?.querySelector('.role-name');
                if (inp) { inp.focus({ preventScroll: true }); inp.select(); inp.scrollIntoView({ block: 'nearest' }); }
            }
            return;
        }
        const c = roleOf(t);
        if (!c) return;
        if (t.classList.contains('swatch')) { _lhRoleSetColor(c, t.dataset.hex); flushSongs(); return; }
        // 刪除要按兩下：第一下變「確定刪除？」，3 秒或離開按鈕就還原
        if (t.dataset.armed === '1') { _lhRoleDisarm(t); lhRoleDelete(c.role.id); return; }
        t.dataset.armed = '1';
        t.textContent = '確定刪除？';
        t._timer = setTimeout(() => _lhRoleDisarm(t), 3000);
    });
    document.body.appendChild(m);
    _lhRolePanel = m;
}

function _lhRoleDisarm(btn) {
    clearTimeout(btn._timer);
    if (btn.dataset.armed !== '1') return;
    delete btn.dataset.armed;
    btn.textContent = '刪除';
}

// 名稱清空後離開欄位：變回「角色 n」
function _lhRoleNameCommit(input) {
    const row = input.closest('.role-row'), song = curSong();
    const k = song && row ? (song.roles || []).findIndex(r => r.id === row.dataset.id) : -1;
    if (k < 0) return;
    if (!input.value.trim()) {
        song.roles[k].name = '角色 ' + (k + 1);
        input.value = song.roles[k].name;
    }
    markDirty(song.id);
    flushSongs();
}

// 改色：先過格式驗證才進模型，畫面靠 CSS 變數，不用重畫鏡像層
function _lhRoleSetColor(c, value) {
    const hex = String(value).toLowerCase();
    if (!LH_SEC_COLOR_RE.test(hex)) return;
    c.role.color = hex;
    markDirty(c.song.id);
    scheduleSave();
    lhRolesRefresh();
    c.row.querySelectorAll('.swatch').forEach(sw => sw.setAttribute('aria-pressed', String(sw.dataset.hex === hex)));
    const pick = c.row.querySelector('.role-color');
    if (pick.value !== hex) pick.value = hex;
}

// 每次打開、新增、刪除都重填
function _lhRolePanelFill() {
    const roles = (curSong() && curSong().roles) || [];
    const kids = [_lhMk('div', 'section-menu-title', '這首歌的角色（最多 ' + LH_ROLE_MAX + ' 個）')];
    if (!roles.length) kids.push(_lhMk('span', 'section-menu-cap', '還沒有角色。反白歌詞後按「指定角色 ▸」，或按下面新增。'));
    roles.forEach((r, k) => {
        const row = _lhMk('div', 'role-row');
        row.dataset.id = r.id;
        const dot = _lhMk('span', 'role-dot');
        dot.dataset.rl = String(k);
        dot.setAttribute('aria-hidden', 'true');
        const name = _lhMk('input', 'section-name-input role-name');
        name.type = 'text';
        name.maxLength = LH_SEC_ROLE_MAX;
        name.value = r.name;
        name.setAttribute('aria-label', '角色 ' + (k + 1) + ' 的名稱');
        const del = _lhMkBtn('section-menu-btn role-del', '刪除', '刪除角色「' + cutName(r.name, 12) + '」');
        const head = _lhMk('div', 'role-row-head');
        head.append(dot, name, del);
        const grid = _lhMk('div', 'swatch-grid role-swatches');
        for (const c of LH_SEC_COLORS) {
            const sw = _lhMkBtn('swatch', '', '角色 ' + (k + 1) + ' 顏色：' + c.name);
            sw.dataset.hex = c.hex;
            sw.style.setProperty('--sw', c.hex);
            sw.setAttribute('aria-pressed', String(c.hex === r.color));
            grid.appendChild(sw);
        }
        const pick = _lhMk('input', 'section-color-input role-color');
        pick.type = 'color';
        pick.value = r.color;
        pick.setAttribute('aria-label', '角色 ' + (k + 1) + ' 自訂顏色');
        grid.appendChild(pick);
        row.append(head, grid);
        kids.push(row);
    });
    const add = _lhMkBtn('section-menu-btn role-add', '＋ 新角色');
    if (roles.length >= LH_ROLE_MAX) add.setAttribute('aria-disabled', 'true');
    kids.push(add);
    _lhRolePanel.replaceChildren(...kids);
}

// 刪除角色：這個角色在所有段落的標記一起清掉，歌詞與其他角色的標記不動
function lhRoleDelete(id) {
    const song = curSong();
    const role = song && (song.roles || []).find(r => r.id === id);
    if (!role) return;
    song.roles = song.roles.filter(r => r.id !== id);
    lhSongRolesFix(song);   // 沒角色就拿掉 roles 欄位；標記整首重新清理（換新陣列，復原快照不受影響）
    markDirty(song.id);
    flushSongs();
    // ponytail: 角色的增改刪不進復原歷史。這裡只把歷史的「現在」重拍並清掉重做，之後的復原步驟不會帶回被刪角色的標記；
    // 刪除「之前」記下的舊步驟還是可能還原出那些標記，但角色已不在、畫面與匯出都不認，下次載入時 lhSongRolesFix 會丟掉
    const h = lhHistEnsure(song);
    h.present = _snap(song);
    h.future.length = 0;
    lhHistSyncButtons();
    lhRolesRefresh();
    lhMapRenderAll();   // 角色序號往前補，顏色跟著變，整頁鏡像重畫
    if (_lhRolePanelOn) {
        const inside = _lhRolePanel.contains(document.activeElement);
        _lhRolePanelFill();
        _lhRolePanelPlace();
        if (inside) _lhRolePanel.querySelector('.role-add').focus({ preventScroll: true });
    }
    lhAnnounce('已刪除角色「' + cutName(role.name, 16) + '」');
}

// 放在按鈕正下方；放不下被擠上去蓋住按鈕時翻到上方（同韻腳選單）
function _lhRolePanelPlace() {
    const btn = document.getElementById('roleMenuBtn');
    if (!_lhRolePanel || !btn) return;
    const r = btn.getBoundingClientRect();
    lhPlaceMenu(_lhRolePanel, r.left, r.bottom + 4);
    const b = _lhRolePanel.getBoundingClientRect();
    if (b.top < r.bottom && r.top - b.height - 4 >= 4) lhPlaceMenu(_lhRolePanel, r.left, r.top - b.height - 4);
}

// byKeyboard：鍵盤打開才把焦點放進面板；滑鼠、觸控不搶焦點（手機鍵盤不要彈出來）
function lhRolePanelOpen(byKeyboard) {
    _lhRolePanelBuild();
    if (typeof lhMapCloseAll === 'function') lhMapCloseAll();   // 同時只開一個浮層（也會收掉 #roleSelMenu）
    lhSecCloseMenu();
    closeExportMenu();
    closeSongListOverlay();
    lhMoveSelClose();
    _lhRolePanelFill();
    _lhRolePanelOn = true;
    _lhRolePanelPlace();
    document.getElementById('roleMenuBtn').setAttribute('aria-expanded', 'true');
    (byKeyboard ? _lhRolePanel.querySelector('.role-name') || _lhRolePanel.querySelector('.role-add') : null)?.focus({ preventScroll: true });
}

function lhRolePanelClose(refocus) {
    if (!_lhRolePanel || !_lhRolePanelOn) return;
    _lhRolePanel.querySelectorAll('.role-name').forEach(i => { if (!i.value.trim()) _lhRoleNameCommit(i); });   // 關掉時還在空白的名稱也補回預設
    _lhRolePanel.querySelectorAll('.role-del').forEach(_lhRoleDisarm);
    _lhRolePanelOn = false;
    _lhRolePanel.classList.remove('show');
    const btn = document.getElementById('roleMenuBtn');
    btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus({ preventScroll: true });
}

document.getElementById('roleMenuBtn').addEventListener('click', e => {
    if (_lhRolePanelOn) lhRolePanelClose(false);
    else lhRolePanelOpen(e.detail === 0);   // 鍵盤（Enter／空白）觸發的 click，detail 是 0
});
// 點面板外面關掉（不攔這一下）；「角色 ▾」本身交給它的 click 切換
document.addEventListener('pointerdown', e => {
    if (_lhRolePanelOn && !(e.target.closest && e.target.closest('#roleMenu, #roleMenuBtn'))) lhRolePanelClose(false);
}, true);
document.addEventListener('focusout', e => {
    if (!_lhRolePanelOn || !_lhRolePanel.contains(e.target) || !e.relatedTarget) return;
    if (!e.relatedTarget.closest('#roleMenu, #roleMenuBtn')) lhRolePanelClose(false);
});
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !_lhRolePanelOn || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    e.stopPropagation();
    lhRolePanelClose(true);
}, true);
// 螢幕鍵盤出現／收起、視窗大小改變：就地重新夾進可見範圍（不重新對齊按鈕：手機鍵盤出現時工具列可能被捲出畫面）
let _lhRolePanelRaf = 0;
function _lhRolePanelReclamp() {
    if (!_lhRolePanelOn || _lhRolePanelRaf) return;
    _lhRolePanelRaf = requestAnimationFrame(() => requestAnimationFrame(() => {
        _lhRolePanelRaf = 0;
        if (!_lhRolePanelOn) return;
        lhPlaceMenu(_lhRolePanel, parseFloat(_lhRolePanel.style.left), parseFloat(_lhRolePanel.style.top));
        const ae = document.activeElement;
        if (ae && _lhRolePanel.contains(ae)) ae.scrollIntoView({ block: 'nearest' });
    }));
}
window.addEventListener('resize', _lhRolePanelReclamp);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', _lhRolePanelReclamp);
    window.visualViewport.addEventListener('scroll', _lhRolePanelReclamp);
}

lhRolesRefresh();
