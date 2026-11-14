        const WORKER_URL = 'https://lucky-hawaii.is3000dollar.workers.dev';

        // 模型由 Worker 決定與換手；清單由 /models 提供，「自動」永遠排第一
        const AUTO_MODEL = { id: 'auto', label: '自動（推薦）', provider: 'auto' };
        let LLM_MODELS = [AUTO_MODEL];

        // ===== 用自己的金鑰（BYOK）：有金鑰就從瀏覽器直連服務商，不經 Worker；金鑰存在 apiKey_<服務商>（safety.js 標為機密，不進備份） =====
        // 模型清單依各家官方文件（2026-11 查證）：Anthropic models overview、OpenAI All models、Gemini models、xAI models、Groq models、DeepSeek updates。
        // usage：1～3 格＝每次請求的花費／額度多寡（同一家裡相對比較）。
        // kind：anthropic／gemini／openai（OpenAI 相容的 /chat/completions）。local：自己填網址（Ollama、其他相容服務），模型清單在「測試連線」時讀回來存在 lh:aiLocal
        // （TypeSafe 的 Jev 是只回答選擇題／分數的判斷模型、不會產生文字，不能拿來給詞，所以沒有列）
        const BYOK_PROVIDERS = {
            anthropic: { name: 'Anthropic（Claude）', kind: 'anthropic', key: 'https://platform.claude.com/settings/keys', models: [
                { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', usage: 1 },
                { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', usage: 2 },
                { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', usage: 3 },
            ] },
            openai: { name: 'OpenAI', kind: 'openai', base: 'https://api.openai.com/v1', noTemp: true, key: 'https://platform.openai.com/api-keys', models: [
                { id: 'gpt-6-luna', label: 'GPT-6 Luna', usage: 1 },
                { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', usage: 2 },
                { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', usage: 3 },
            ] },
            gemini: { name: 'Gemini', kind: 'gemini', key: 'https://aistudio.google.com/apikey', video: 'https://www.youtube.com/watch?v=Upk-iMyC3aM', models: [
                { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', usage: 1 },
                { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', usage: 2 },
                { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', usage: 3 },
            ] },
            xai: { name: 'xAI（Grok）', kind: 'openai', base: 'https://api.x.ai/v1', key: 'https://console.x.ai/', models: [
                { id: 'grok-4.3', label: 'Grok 4.3', usage: 1 },
                { id: 'grok-4.7', label: 'Grok 4.7', usage: 3 },
            ] },
            groq: { name: 'Groq', kind: 'openai', base: 'https://api.groq.com/openai/v1', key: 'https://console.groq.com/keys', video: 'https://www.youtube.com/watch?v=nt1PJu47nTk', models: [
                { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', usage: 1 },
                { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', usage: 2 },
                { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', usage: 2 },
            ] },
            deepseek: { name: 'DeepSeek', kind: 'openai', base: 'https://api.deepseek.com', key: 'https://platform.deepseek.com/api_keys', models: [
                { id: 'deepseek-flash', label: 'DeepSeek V4.1 Flash', usage: 1 },
                { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', usage: 2 },
            ] },
            ollama: { name: 'Ollama（本機模型）', kind: 'openai', local: true, keyless: true, defBase: 'http://localhost:11434/v1', models: [] },
            generic: { name: '其他 OpenAI 相容服務', kind: 'openai', local: true, defBase: '', models: [] },
        };
        const BYOK_USAGE_TEXT = ['', '用量少', '用量中', '用量多'];
        // 金鑰只收可見的 ASCII（貼上時夾帶空白、中文會讓請求標頭直接失敗）
        const BYOK_KEY_RE = /^[\x21-\x7e]{10,200}$/;
        const LH_AI_LOCAL_KEY = 'lh:aiLocal';   // { ollama: { base, models: [id] }, generic: {...} }

        function byokKey(provider) { return lhGet(`apiKey_${provider}`) || ''; }
        function _byokLocal() {
            return lhGetJSON(LH_AI_LOCAL_KEY, {}, o => !!o && typeof o === 'object' && !Array.isArray(o));
        }
        function _byokLocalCfg(p) {
            const c = _byokLocal()[p];
            const base = c && typeof c.base === 'string' && /^https?:\/\/[^\s]+$/.test(c.base) ? c.base.replace(/\/+$/, '') : BYOK_PROVIDERS[p].defBase;
            const models = c && Array.isArray(c.models) ? c.models.filter(m => typeof m === 'string' && m && m.length <= 120).slice(0, 60) : [];
            return { base, models };
        }
        function _byokLocalSave(p, patch) {
            const all = _byokLocal();
            all[p] = Object.assign(_byokLocalCfg(p), patch);
            lhSet(LH_AI_LOCAL_KEY, JSON.stringify(all));
        }
        function _byokBase(p) { return BYOK_PROVIDERS[p].local ? _byokLocalCfg(p).base : BYOK_PROVIDERS[p].base; }
        // 這家能不能用：雲端看有沒有金鑰；本機／自訂看網址和讀回來的模型清單（Ollama 不用金鑰）
        function byokReady(p) {
            const cfg = BYOK_PROVIDERS[p];
            if (!cfg.local) return !!byokKey(p);
            const c = _byokLocalCfg(p);
            return !!c.base && c.models.length > 0;   // 自訂服務的金鑰可有可無
        }
        function _byokModelList(p) {
            const cfg = BYOK_PROVIDERS[p];
            return cfg.local ? _byokLocalCfg(p).models.map(id => ({ id, label: id, usage: 0 })) : cfg.models;
        }
        // 能用的服務商才有選項；id 加 byok: 前綴，不會和 Worker 的模型撞名
        function byokModels() {
            return Object.keys(BYOK_PROVIDERS).filter(byokReady).flatMap(p =>
                _byokModelList(p).map(m => ({ id: `byok:${p}:${m.id}`, label: m.label, provider: p, model: m.id, usage: m.usage, byok: true })));
        }
        function allModels() { return [...LLM_MODELS, ...byokModels()]; }
        function currentModel() {
            const v = document.getElementById('modelSelect')?.value;
            return allModels().find(m => m.id === v) || LLM_MODELS[0];
        }

        function renderModelSelect() {
            const sel = document.getElementById('modelSelect');
            if (!sel) return;
            const models = allModels();
            // 選項標籤來自網路，用 Option 建立，不拼 HTML 字串
            sel.replaceChildren(...models.map(m => new Option(m.label, m.id)));
            // 舊值（例如已下架的模型、金鑰已清掉的模型）只在畫面上顯示成「自動」，不改使用者存的值（Phase 1 測試要求開站不改任何鍵；使用者自己改選才寫入）
            const stored = lhGet('selectedModel');
            sel.value = models.some(m => m.id === stored) ? stored : 'auto';
            _renderModelPicker();
        }
        function onModelChange() {
            lhSet('selectedModel', document.getElementById('modelSelect').value);
            _renderModelPicker();
        }

        // ===== 自製模型下拉（button＋listbox）：原生 select 留著當值的來源（隱藏），選項右邊可以放用量圖示 =====
        // 訊號格圖示：三根由低到高的柱子，亮 n 根
        function _usageIcon(n) {
            const NS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('viewBox', '0 0 15 12');
            svg.setAttribute('class', 'usage-bars');
            svg.setAttribute('aria-hidden', 'true');
            [[1, 8], [6, 5], [11, 1]].forEach(([x, y], i) => {
                const r = document.createElementNS(NS, 'rect');
                r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', 3); r.setAttribute('height', 12 - y); r.setAttribute('rx', 0.75);
                if (i < n) r.setAttribute('class', 'on');
                svg.append(r);
            });
            return svg;
        }
        function _modelOption(m, selected) {
            const o = document.createElement('div');
            o.setAttribute('role', 'option');
            o.id = 'modelOpt-' + m.id.replace(/[^\w-]/g, '_');
            o.dataset.id = m.id;
            o.className = 'model-opt';
            o.setAttribute('aria-selected', String(m.id === selected));
            const name = document.createElement('span');
            name.className = 'model-opt-name';
            name.textContent = m.label;
            o.append(name);
            if (m.usage) {
                const wrap = document.createElement('span');
                wrap.className = 'model-opt-usage';
                wrap.title = '免費額度' + BYOK_USAGE_TEXT[m.usage];
                wrap.dataset.usage = m.usage;
                const sr = document.createElement('span');
                sr.className = 'sr-only';
                sr.textContent = `，${BYOK_PROVIDERS[m.provider].name} 你的金鑰，${BYOK_USAGE_TEXT[m.usage]}（${m.usage}／3 格）`;
                wrap.append(_usageIcon(m.usage), sr);
                o.append(wrap);
            }
            return o;
        }
        function _modelGroup(label, models, selected) {
            const g = document.createElement('div');
            g.setAttribute('role', 'group');
            g.setAttribute('aria-label', label);
            const h = document.createElement('div');
            h.className = 'model-group-label';
            h.setAttribute('aria-hidden', 'true');
            h.textContent = label;
            g.append(h, ...models.map(m => _modelOption(m, selected)));
            return g;
        }
        function _renderModelPicker() {
            const btn = document.getElementById('modelPicker');
            const list = document.getElementById('modelList');
            if (!btn || !list) return;
            const m = currentModel();
            btn.querySelector('.model-picker-label').textContent = m.label;
            btn.setAttribute('aria-label', `AI 模型：${m.label}${m.byok ? '（用你自己的金鑰）' : ''}`);
            const selected = m.id;
            const own = byokModels();
            // 有設定的每一家各一組，組裡就是那一家自己的模型
            const groups = Object.keys(BYOK_PROVIDERS).map(p => [p, own.filter(x => x.provider === p)]).filter(([, ms]) => ms.length);
            list.replaceChildren(...(own.length
                ? [_modelGroup('好韻器提供', LLM_MODELS, selected), ...groups.map(([p, ms]) => _modelGroup('你的 ' + BYOK_PROVIDERS[p].name, ms, selected))]
                : LLM_MODELS.map(x => _modelOption(x, selected))));
            _syncKeyBtn(m);
        }
        function _modelOpts() { return [...document.querySelectorAll('#modelList [role="option"]')]; }
        function _modelSetActive(o) {
            const list = document.getElementById('modelList');
            _modelOpts().forEach(x => x.classList.toggle('active', x === o));
            if (!o) { list.removeAttribute('aria-activedescendant'); return; }
            list.setAttribute('aria-activedescendant', o.id);
            o.scrollIntoView({ block: 'nearest' });
        }
        function modelPickerOpen() {
            const list = document.getElementById('modelList');
            list.hidden = false;
            document.getElementById('modelPicker').setAttribute('aria-expanded', 'true');
            list.focus({ preventScroll: true });
            const opts = _modelOpts();
            _modelSetActive(opts.find(o => o.getAttribute('aria-selected') === 'true') || opts[0]);
        }
        function modelPickerClose(refocus) {
            const list = document.getElementById('modelList');
            if (list.hidden) return;
            list.hidden = true;
            document.getElementById('modelPicker').setAttribute('aria-expanded', 'false');
            if (refocus) document.getElementById('modelPicker').focus({ preventScroll: true });
        }
        function _modelChoose(id) {
            const sel = document.getElementById('modelSelect');
            sel.value = id;
            onModelChange();
            modelPickerClose(true);
        }
        (function _wireModelPicker() {
            const btn = document.getElementById('modelPicker');
            const list = document.getElementById('modelList');
            if (!btn || !list) return;
            btn.addEventListener('click', () => (list.hidden ? modelPickerOpen() : modelPickerClose(true)));
            btn.addEventListener('keydown', e => {
                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                e.preventDefault();
                modelPickerOpen();
            });
            list.addEventListener('click', e => {
                const o = e.target.closest('[role="option"]');
                if (o) _modelChoose(o.dataset.id);
            });
            list.addEventListener('keydown', e => {
                if (e.isComposing) return;
                const opts = _modelOpts();
                const i = opts.findIndex(o => o.classList.contains('active'));
                const n = opts.length;
                const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
                if (to !== undefined) { e.preventDefault(); _modelSetActive(opts[(to + n) % n]); return; }
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (opts[i]) _modelChoose(opts[i].dataset.id); return; }
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); modelPickerClose(true); return; }
                if (e.key === 'Tab') modelPickerClose(false);
            });
            // 點選單外面就收起；被點到的東西照常反應（和韻腳選單一樣）
            document.addEventListener('pointerdown', e => {
                if (!list.hidden && !document.getElementById('modelPickerWrap').contains(e.target)) modelPickerClose(false);
            });
        })();

        // 右上鑰匙：目前模型走自己的金鑰時呼吸閃爍（CSS 處理減少動態），否則淡淡的靜止；點了開偏好設定的「AI」分頁
        function _syncKeyBtn(m) {
            const k = document.getElementById('aiKeyBtn');
            if (!k) return;
            const on = !!m?.byok;
            k.dataset.on = String(on);
            const label = on ? `正在使用你自己的 ${BYOK_PROVIDERS[m.provider].name} 金鑰，點此設定`
                : byokModels().length ? '目前沒有用你自己的金鑰（模型選單裡「你的 …」那幾組才會用），點此設定'
                : '用你自己的 AI 金鑰，點此設定';
            k.setAttribute('aria-label', label);
            k.title = label;
        }
        function lhOpenAiPrefs() {
            modelPickerClose(false);
            if (!document.getElementById('settingsOverlay').classList.contains('show')) toggleSettings();
            lhPrefsSelectTab('ai', true);
        }

        // ===== 偏好設定「AI」分頁：先在下拉選服務商，一行貼金鑰（本機／自訂多一行網址）、顯示／隱藏、測試連線、清除 =====
        let _byokCur = Object.keys(BYOK_PROVIDERS).find(byokReady) || 'gemini';
        function _byokStatus(provider, text, kind) {
            if (provider !== _byokCur) return;
            const el = document.getElementById('byokStatus');
            el.textContent = text;
            el.dataset.kind = kind || '';
        }
        // 存金鑰：空字串＝清除；格式不對就不存並說明。回傳是否已存
        function byokSaveKey(provider, raw) {
            const val = String(raw).trim();
            if (!val) {
                lhRemove(`apiKey_${provider}`);
                _byokStatus(provider, '已清除這台裝置上的金鑰', 'ok');
            } else if (!BYOK_KEY_RE.test(val)) {
                _byokStatus(provider, '金鑰格式不對：請只貼上金鑰本身（英文字母、數字與符號），不要夾帶空白或中文', 'err');
                return false;
            } else {
                if (!lhSet(`apiKey_${provider}`, val)) return false;
                _byokStatus(provider, '已存在這台裝置的瀏覽器裡', 'ok');
            }
            renderModelSelect();
            _byokHave();
            return true;
        }

        // 服務商的錯誤 → 白話繁中（絕不顯示金鑰或英文技術字串）
        function _byokErrorMsg(provider, status, data) {
            const name = BYOK_PROVIDERS[provider].name;
            const raw = JSON.stringify(data ?? '');
            if (status === 401 || status === 403 || raw.includes('API_KEY_INVALID') || raw.includes('invalid_api_key')) return `${name} 金鑰無效，請到偏好設定的「AI」分頁重新貼上金鑰`;
            if (status === 429) return `${name} 的額度暫時用完了（每分鐘或每天的上限），請稍後再試，或換一個模型`;
            if (status === 402) return `${name} 帳戶餘額不足，請到 ${name} 的網站儲值，或換一個模型`;
            if (status === 404) return `${name} 找不到這個模型，請換一個模型`;
            if (status === 400) return `${name} 不接受這次的請求，請換一個模型再試`;
            return `${name} 暫時無法使用，請稍後再試`;
        }
        // 直連服務商：回傳 JSON；任何失敗 throw aiError
        async function _byokFetch(provider, url, init, timeoutMs) {
            const cfg = BYOK_PROVIDERS[provider], name = cfg.name;
            let res;
            try {
                res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
            } catch (e) {
                lhWarn(name + ' 請求送不出去', e);
                if (e.name === 'TimeoutError') throw aiError(`${name} 回應太久，請稍後再試`);
                throw aiError(provider === 'ollama' ? '連不上本機的 Ollama：確認它正在執行，並把環境變數 OLLAMA_ORIGINS 設成允許這個網站（例如 *）'
                    : cfg.local ? `連不上 ${_byokBase(provider) || '這個網址'}：確認網址正確、服務有開，而且允許瀏覽器直接連線（CORS）`
                    : `連不上 ${name}（網路問題，或這家不允許瀏覽器直接連線），請檢查網路後再試`);
            }
            let data = null;
            try { data = await res.json(); } catch (e) { lhWarn(name + ' 回應不是 JSON', e); }
            if (!res.ok) {
                lhWarn(`${name} 回應 HTTP ${res.status}`);
                throw aiError(_byokErrorMsg(provider, res.status, data));
            }
            if (!data) throw aiError(`${name} 回應格式不對，請稍後再試`);
            return data;
        }
        function _byokHeaders(provider, key) {
            const kind = BYOK_PROVIDERS[provider].kind;
            if (kind === 'gemini') return { 'x-goog-api-key': key };
            if (kind === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
            return key ? { Authorization: 'Bearer ' + key } : {};
        }
        async function _callByok(model, prompt) {
            const p = model.provider, cfg = BYOK_PROVIDERS[p], key = byokKey(p), name = cfg.name;
            if (!key && !cfg.local) throw aiError(`這台裝置沒有 ${name} 金鑰了，請到偏好設定的「AI」分頁貼上，或換回好韻器提供的模型`);
            const headers = { 'Content-Type': 'application/json', ..._byokHeaders(p, key) };
            let text, tokens;
            if (cfg.kind === 'gemini') {
                // 金鑰放標頭，不放網址
                const data = await _byokFetch(p, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.model)}:generateContent`, {
                    method: 'POST', headers,
                    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.95 } }),
                }, 35000);
                text = (data.candidates?.[0]?.content?.parts || []).filter(x => !x.thought && typeof x.text === 'string').map(x => x.text).join('');
                tokens = data.usageMetadata?.totalTokenCount;
            } else if (cfg.kind === 'anthropic') {
                const data = await _byokFetch(p, 'https://api.anthropic.com/v1/messages', {
                    method: 'POST', headers,
                    body: JSON.stringify({ model: model.model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
                }, 60000);
                text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
                tokens = data.usage ? (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0) : undefined;
            } else {
                const body = { model: model.model, messages: [{ role: 'user', content: prompt }] };
                if (!cfg.noTemp) body.temperature = 0.95;   // OpenAI 新一代模型只收預設溫度
                const data = await _byokFetch(p, _byokBase(p) + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body) }, cfg.local ? 120000 : 60000);
                text = data.choices?.[0]?.message?.content;
                tokens = data.usage?.total_tokens;
            }
            if (typeof text !== 'string' || !text.trim()) throw aiError(`${name} 沒有回應內容，請再試一次`);
            lhAiNotice(`${model.label}（你的金鑰）${Number.isFinite(tokens) ? `｜${tokens} tokens` : ''}`);
            return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        }
        // 測試連線：讀一次各家的模型清單（不花生成額度）；本機／自訂服務順便把模型清單存起來
        async function byokTest(provider) {
            const cfg = BYOK_PROVIDERS[provider];
            const input = document.getElementById('byokKey');
            if (input.value.trim() || !cfg.local) { if (!byokSaveKey(provider, input.value)) return; }
            if (cfg.local) {
                const base = document.getElementById('byokBase').value.trim().replace(/\/+$/, '');
                if (!/^https?:\/\/\S+$/.test(base)) { _byokStatus(provider, '請先填服務網址（http:// 或 https:// 開頭，通常以 /v1 結尾）', 'err'); return; }
                _byokLocalSave(provider, { base });
            }
            const key = byokKey(provider);
            if (!key && !cfg.local) { _byokStatus(provider, '請先貼上金鑰', 'err'); return; }
            _byokStatus(provider, '測試中…', '');
            const url = cfg.kind === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200'
                : cfg.kind === 'anthropic' ? 'https://api.anthropic.com/v1/models' : _byokBase(provider) + '/models';
            try {
                const data = await _byokFetch(provider, url, { headers: _byokHeaders(provider, key) }, 10000);
                if (cfg.local) {
                    const ids = (Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : []).map(m => m && (m.id || m.name)).filter(x => typeof x === 'string' && x);
                    if (!ids.length) { _byokStatus(provider, '連得上，但沒讀到任何模型（Ollama 請先 ollama pull 一個模型）', 'err'); return; }
                    _byokLocalSave(provider, { models: ids.slice(0, 60) });
                    renderModelSelect();
                    _byokHave();
                    _byokStatus(provider, `連線成功！讀到 ${ids.length} 個模型，已經可以在 AI 建議的模型選單裡選`, 'ok');
                    return;
                }
                _byokStatus(provider, `連線成功！${cfg.name} 金鑰可以用，模型選單裡「你的 ${cfg.name}」那組已經可以選`, 'ok');
            } catch (e) {
                _byokStatus(provider, e.plain ? e.message : AI_FALLBACK_MSG, 'err');
            }
        }
        // 切換服務商：金鑰欄換成這家的、本機／自訂多一行網址、說明與取得金鑰的連結跟著換
        function _byokShow(p) {
            _byokCur = p;
            const cfg = BYOK_PROVIDERS[p];
            document.getElementById('byokProvider').value = p;
            const input = document.getElementById('byokKey');
            input.value = byokKey(p);
            input.placeholder = cfg.keyless ? '不用金鑰（留空）' : cfg.local ? '金鑰（沒有就留空）' : '貼上 ' + cfg.name + ' 金鑰';
            input.setAttribute('aria-label', cfg.name + ' 金鑰');
            const baseRow = document.getElementById('byokBaseRow');
            baseRow.hidden = !cfg.local;
            if (cfg.local) document.getElementById('byokBase').value = _byokLocalCfg(p).base;
            const st = document.getElementById('byokStatus');
            st.textContent = ''; st.dataset.kind = '';
            const note = document.getElementById('byokNote');
            note.replaceChildren();
            if (cfg.local) note.append(p === 'ollama'
                ? '在這台電腦執行 Ollama，填網址後按「測試連線」，會讀出你下載過的模型。'
                : '任何 OpenAI 相容的服務（LM Studio、OpenRouter、自架…）：填網址（通常以 /v1 結尾）和金鑰，按「測試連線」讀出模型。');
            else {
                note.append('模型：' + cfg.models.map(m => m.label).join('、') + '。');
                const a = document.createElement('a');
                a.href = cfg.key; a.target = '_blank'; a.rel = 'noopener';
                a.textContent = '取得 ' + cfg.name + ' 金鑰';
                note.append(' ', a);
                if (cfg.video) {
                    const v = document.createElement('a');
                    v.href = cfg.video; v.target = '_blank'; v.rel = 'noopener'; v.className = 'byok-video';
                    v.textContent = '（教學影片）';
                    note.append(' ', v);
                }
            }
        }
        // 已設定的服務商：一排小標籤，點了就切過去
        function _byokHave() {
            const box = document.getElementById('byokHave');
            if (!box) return;
            const ps = Object.keys(BYOK_PROVIDERS).filter(byokReady);
            box.replaceChildren(...(ps.length ? [Object.assign(document.createElement('span'), { textContent: '已設定：' })] : []), ...ps.map(p => {
                const b = document.createElement('button');
                b.type = 'button'; b.className = 'byok-chip'; b.dataset.p = p;
                b.textContent = BYOK_PROVIDERS[p].name;
                return b;
            }));
            document.querySelectorAll('#byokProvider option').forEach(o => { o.textContent = BYOK_PROVIDERS[o.value].name + (byokReady(o.value) ? '　✓' : ''); });
        }
        function byokRenderPrefs() {
            const input = document.getElementById('byokKey');
            if (input && document.activeElement !== input) _byokShow(_byokCur);
            _byokHave();
            if (typeof lhAiTuneSync === 'function') lhAiTuneSync();
        }
        (function _wireByokPrefs() {
            const sel = document.getElementById('byokProvider');
            if (!sel) return;
            sel.replaceChildren(...Object.keys(BYOK_PROVIDERS).map(p => new Option(BYOK_PROVIDERS[p].name, p)));
            sel.addEventListener('change', () => _byokShow(sel.value));
            const input = document.getElementById('byokKey');
            input.addEventListener('change', () => { if (input.value.trim() || !BYOK_PROVIDERS[_byokCur].local) byokSaveKey(_byokCur, input.value); });
            document.getElementById('byokBase').addEventListener('change', e => _byokLocalSave(_byokCur, { base: e.target.value.trim().replace(/\/+$/, '') }));
            document.querySelector('#byokBox .byok-eye').addEventListener('click', e => {
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                e.currentTarget.setAttribute('aria-pressed', String(show));
                e.currentTarget.setAttribute('aria-label', show ? '隱藏金鑰' : '顯示金鑰');
                e.currentTarget.title = show ? '隱藏金鑰' : '顯示金鑰';
            });
            document.querySelector('#byokBox [data-act="test"]').addEventListener('click', () => byokTest(_byokCur));
            document.querySelector('#byokBox [data-act="clear"]').addEventListener('click', () => {
                input.value = '';
                byokSaveKey(_byokCur, '');
                if (BYOK_PROVIDERS[_byokCur].local) { _byokLocalSave(_byokCur, { models: [] }); renderModelSelect(); _byokHave(); }
            });
            document.getElementById('byokHave').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) _byokShow(b.dataset.p); });
            _byokShow(_byokCur);
            _byokHave();
        })();

        // 從 Worker 取得目前可用的模型，選單 = 自動 + 這份清單（依 Worker 給的順序）
        // 任何失敗都只留下「自動」；只重畫選單，不寫使用者的設定
        async function loadModels() {
            try {
                const res = await fetch(WORKER_URL + '/models', { signal: AbortSignal.timeout(5000) });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                if (data?.ok !== true || !Array.isArray(data.models)) throw new Error('模型清單格式不對');
                const list = data.models.filter(m => m && typeof m.id === 'string' && m.id && typeof m.label === 'string' && m.label && m.id !== 'auto');
                LLM_MODELS = [AUTO_MODEL, ...list];
                renderModelSelect();
            } catch (e) {
                lhWarn('模型清單載入失敗，先用「自動」', e);
            }
        }

        // 換模型由 Worker 負責，這裡只回傳一個（D-16）
        function aiTryList() {
            return [currentModel()];
        }

        // AI 失敗時使用者看到的後備句子（錯誤不是 aiError 產生的就用這句，絕不顯示英文或技術字串）
        const AI_FALLBACK_MSG = 'AI 暫時無法使用，請稍後再試';

        // 帶 plain 旗標的 Error：message 已是可直接給使用者看的白話繁中；沒有旗標的 Error 是程式內部問題，不能直接顯示
        function aiError(message) {
            const e = new Error(message);
            e.plain = true;
            return e;
        }

        // 統一呼叫介面 → 回傳純文字回應。只送任務內容，Worker 決定用哪個模型；
        // 失敗一律 throw aiError，message 已是可直接給使用者看的白話繁中
        async function callLLM(model, prompt) {
            // 選了自己金鑰的模型：直連服務商；失敗就直接告訴使用者，不偷偷改走 Worker（不然會以為在用自己的額度）
            if (model.byok) return _callByok(model, prompt);
            let res;
            try {
                res = await fetch(WORKER_URL + '/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, model: model.id, temperature: 0.95 }),
                    signal: AbortSignal.timeout(35000)
                });
            } catch (e) {
                lhWarn('AI 請求送不出去', e);
                throw aiError(e.name === 'TimeoutError' ? 'AI 回應太久，請稍後再試' : '連不上 AI 服務，請檢查網路後再試');
            }
            let data;
            try {
                data = await res.json();
            } catch (e) {
                lhWarn('AI 回應不是 JSON', e);
                throw aiError('AI 服務回應格式不對，請稍後再試');
            }
            if (!res.ok || !data?.ok) throw aiError(data?.message || AI_FALLBACK_MSG);

            // Worker 換了模型時告訴使用者實際用的是哪一個
            const switched = model.id !== 'auto' && data.model && data.model.id !== model.id;
            if (data.usage) {
                lhAiNotice(`${switched ? '已切到 ' : ''}${data.model.label}｜${data.usage.total_tokens} tokens`);
            } else if (switched) {
                lhAiNotice(`已切到 ${data.model.label}`);
            }
            // 移除思考標籤（針對 DeepSeek R1 等模型）並回傳
            return String(data.text).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        }



// ==================== AI 完成特效（取代原本中間偏下的模型／token 浮窗） ====================
// 在觸發的按鈕旁邊噴出東西：「提供詞語建議」噴金幣、小燈泡噴亮光；模型與 token 數變成往上飄的小字。
// 用 Web Animations API（element.animate），不寫 CSS @keyframes。偏好設定關掉動畫（lhBgFxIsOn）或系統要求減少動態時，什麼都不顯示，連 token 提示也不出現。
let _lhFx = { el: null, kind: 'coins' };
function lhFxAnchorSet(el, kind) { _lhFx = { el, kind }; }
function lhFxEnabled() {
    if (typeof lhBgFxIsOn === 'function' && !lhBgFxIsOn()) return false;
    return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}
// 模型／token 文字：中規中矩地寫在「回報詞語」右邊當狀態列，幾秒後淡出（不管特效開關都顯示）；特效只負責動畫
let _lhStatusT = 0;
function lhAiNotice(text) {
    const st = document.getElementById('aiStatus');
    if (st && text) {
        clearTimeout(_lhStatusT);
        st.getAnimations().forEach(a => a.cancel());
        st.textContent = text;
        st.title = text;
        st.classList.remove('fade');
        _lhStatusT = setTimeout(() => {
            const done = () => st.classList.add('fade');
            if (matchMedia('(prefers-reduced-motion: reduce)').matches || !st.animate) return done();
            st.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1200, easing: 'ease' }).onfinish = done;
        }, 4000);
    }
    if (!lhFxEnabled() || document.hidden) return;
    const el = _lhFx.el && _lhFx.el.isConnected ? _lhFx.el : document.getElementById('generateBtn');
    if (el) lhFxBurst(el, _lhFx.kind);
}
function lhFxBurst(anchor, kind) {
    const r = anchor.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const layer = document.createElement('div');
    layer.className = 'lh-fx';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:960;pointer-events:none;';
    const put = (css, content) => {
        const n = document.createElement('div');
        n.style.cssText = 'position:absolute;left:' + cx + 'px;top:' + cy + 'px;will-change:transform,opacity;' + css;
        if (content) n.textContent = content;
        layer.appendChild(n);
        return n;
    };
    const coins = kind === 'coins';
    const n = coins ? 16 : 12;
    for (let i = 0; i < n; i++) {
        const ang = coins ? -Math.PI / 2 + (Math.random() - 0.5) * 2.2 : (i / n) * Math.PI * 2 + Math.random() * 0.3;
        const sp = coins ? 70 + Math.random() * 110 : 38 + Math.random() * 38;
        const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
        const size = coins ? 12 + Math.random() * 6 : 10 + Math.random() * 8;
        const p = coins
            ? put('width:' + size + 'px;height:' + size + 'px;margin:-' + size / 2 + 'px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3b0,#f2b705 60%,#b07d00);border:1px solid #8a5a00;')
            : put('margin:-' + size / 2 + 'px;font-size:' + size + 'px;line-height:1;color:#f5c518;text-shadow:0 0 6px #ffd84d;', '✦');
        const spin = (Math.random() - 0.5) * 540;
        const frames = coins
            ? [{ transform: 'translate(0,0) scale(.5)', opacity: 1 },
               { transform: 'translate(' + vx * 0.6 + 'px,' + vy + 'px) rotate(' + spin / 2 + 'deg) scale(1)', opacity: 1, offset: 0.495 },   // 往上噴的時間 ×1.2、落下不變
               { transform: 'translate(' + vx + 'px,' + (vy + 150 + Math.random() * 60) + 'px) rotate(' + spin + 'deg) scale(.8)', opacity: 0 }]
            : [{ transform: 'translate(0,0) scale(.3)', opacity: 1 },
               { transform: 'translate(' + vx + 'px,' + vy + 'px) rotate(' + spin / 3 + 'deg) scale(1.1)', opacity: 0 }];
        p.animate(frames, { duration: coins ? (1700 + Math.random() * 700) * 1.09 : 1300 + Math.random() * 500, easing: coins ? 'cubic-bezier(.2,.7,.4,1)' : 'ease-out', fill: 'forwards' });
    }
    if (!coins) {
        const ring = put('width:44px;height:44px;margin:-22px;border-radius:50%;border:2px solid #ffd84d;box-shadow:0 0 14px #ffd84d;');
        ring.animate([{ transform: 'scale(.3)', opacity: 0.9 }, { transform: 'scale(1.8)', opacity: 0 }], { duration: 1100, easing: 'ease-out', fill: 'forwards' });
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 3600);
}
