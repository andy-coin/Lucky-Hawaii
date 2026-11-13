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
            if (role) lhRoleMark(snap, role.id);
            else showToast('最多 ' + LH_ROLE_MAX + ' 個角色');
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
    return _lhRoleSel !== null;
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

lhRolesRefresh();
