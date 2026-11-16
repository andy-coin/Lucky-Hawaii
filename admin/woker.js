  const ALLOWED_ORIGIN = 'https://andy-coin.github.io';

  export default {
    async fetch(request, env) {
      const url = new URL(request.url);
      const path = url.pathname;

      // CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        });
      }

      const jsonHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      };

      const corsHeaders = {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Content-Type': 'application/json',
      };

      // ===== /feedback：儲存回報至 KV =====
      if (path === '/feedback') {
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        const origin = request.headers.get('Origin');
        if (origin !== ALLOWED_ORIGIN) return new Response('Forbidden', { status: 403 });
        try {
          const data = await request.json();
          const key = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await env.USER_FEEDBACK_KV.put(key, JSON.stringify({
            ...data,
            ts: new Date().toISOString(),
          }));
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
        }
      }

      // ===== /reports.json：JSON 列表（需密鑰，給 admin 後台用）=====
      if (path === '/reports.json') {
        if (url.searchParams.get('key') !== env.USER_REPORT_KEY) {
          return new Response('Forbidden', { status: 403 });
        }
        try {
          const list = await env.USER_FEEDBACK_KV.list();
          const items = (await Promise.all(
            list.keys.map(async k => {
              const val = await env.USER_FEEDBACK_KV.get(k.name);
              try {
                const obj = val ? JSON.parse(val) : null;
                if (obj) obj.kvKey = k.name;
                return obj;
              } catch(e) { return null; }
            })
          )).filter(Boolean);
          items.sort((a, b) => new Date(b.ts) - new Date(a.ts));
          return new Response(JSON.stringify(items), { headers: jsonHeaders });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
        }
      }

      // ===== /reports/decision：寫回決定狀態（需密鑰）=====
      // body: { kvKey, status: 'pending'|'agreed'|'dismissed'|'archived', action?: {...} }
      if (path === '/reports/decision') {
        if (url.searchParams.get('key') !== env.USER_REPORT_KEY) {
          return new Response('Forbidden', { status: 403 });
        }
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        try {
          const { kvKey, status, action } = await request.json();
          if (!kvKey || !status) {
            return new Response(JSON.stringify({ error: 'kvKey and status required' }), { status: 400, headers: jsonHeaders });
          }
          const val = await env.USER_FEEDBACK_KV.get(kvKey);
          if (!val) return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: jsonHeaders });
          const obj = JSON.parse(val);
          if (status === 'pending') {
            delete obj.status; delete obj.decided_at; delete obj.action;
          } else {
            obj.status = status;
            obj.decided_at = new Date().toISOString();
            if (action) obj.action = action; else delete obj.action;
          }
          await env.USER_FEEDBACK_KV.put(kvKey, JSON.stringify(obj));
          return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
        }
      }

      // ===== /reports/delete：永久刪除一筆 KV（需密鑰）=====
      if (path === '/reports/delete') {
        if (url.searchParams.get('key') !== env.USER_REPORT_KEY) {
          return new Response('Forbidden', { status: 403 });
        }
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        try {
          const { kvKey } = await request.json();
          if (!kvKey) return new Response(JSON.stringify({ error: 'kvKey required' }), { status: 400, headers: jsonHeaders });
          await env.USER_FEEDBACK_KV.delete(kvKey);
          return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
        }
      }

      // ===== /reports：舊的 HTML 視圖已移除，請改用 admin（讀 /reports.json） =====
      if (path === '/reports') {
        return new Response('Moved: 請使用 /admin/ 後台（資料來源 /reports.json）', { status: 410 });
      }

      // ===== 原有 LLM proxy =====
      const origin = request.headers.get('Origin');
      if (origin !== ALLOWED_ORIGIN) return new Response('Forbidden', { status: 403 });
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

      try {
        const raw = await request.json();
        const provider = raw._provider || 'groq';
        const model = raw.model;

        const responseHeaders = {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN
        };

        if (provider === 'gemini') {
          const geminiUrl =
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
          const geminiBody = {
            contents: raw.messages.map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            })),
            generationConfig: {
              temperature: raw.temperature || 0.7,
              maxOutputTokens: raw.max_tokens || 2048,
            }
          };
          const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody)
          });
          const data = await res.json();
          return new Response(JSON.stringify(data), { status: res.status, headers: responseHeaders });
        }

        if (provider === 'github') {
          const ghRes = await fetch('https://models.inference.ai.azure.com/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.GITHUB_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model, messages: raw.messages,
              temperature: raw.temperature, max_tokens: raw.max_tokens
            })
          });
          const data = await ghRes.json();
          return new Response(JSON.stringify(data), { status: ghRes.status, headers: responseHeaders });
        }

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model, messages: raw.messages,
            temperature: raw.temperature, max_tokens: raw.max_tokens
          })
        });
        const data = await groqRes.json();
        return new Response(JSON.stringify(data), { status: groqRes.status, headers: responseHeaders });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN }
        });
      }
    }
  };