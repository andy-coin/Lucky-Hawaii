        const WORKER_URL = 'https://lucky-hawaii.is3000dollar.workers.dev';

        // 模型由 Worker 決定與換手；清單由 /models 提供，「自動」永遠排第一
        const AUTO_MODEL = { id: 'auto', label: '自動（推薦）', provider: 'auto' };
        let LLM_MODELS = [AUTO_MODEL];

        function saveApiKey(provider, val) {
            // 如果是 Worker 代理的服務，其實可以不讓使用者填 Key
            lhSet(`apiKey_${provider}`, val.trim());
            renderModelSelect();
        }

        function renderModelSelect() {
            const sel = document.getElementById('modelSelect');
            if (!sel) return;
            // 選項標籤來自網路，用 Option 建立，不拼 HTML 字串
            sel.replaceChildren(...LLM_MODELS.map(m => new Option(m.label, m.id)));
            // 舊值（例如已下架的模型）只在畫面上顯示成「自動」，不改使用者存的值（Phase 1 測試要求開站不改任何鍵；使用者自己改選才寫入）
            const stored = lhGet('selectedModel');
            sel.value = LLM_MODELS.some(m => m.id === stored) ? stored : 'auto';
        }
        function onModelChange() {
            lhSet('selectedModel', document.getElementById('modelSelect').value);
        }

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
            return [LLM_MODELS.find(m => m.id === document.getElementById('modelSelect')?.value) || LLM_MODELS[0]];
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
                showToast(`${switched ? '已切到 ' : ''}${data.model.label}｜本次 ${data.usage.total_tokens} tokens`, 4000);
            } else if (switched) {
                showToast(`已切到 ${data.model.label}`);
            }
            // 移除思考標籤（針對 DeepSeek R1 等模型）並回傳
            return String(data.text).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        }

