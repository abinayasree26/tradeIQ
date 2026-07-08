import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';

// ─── Shared .env loader ──────────────────────────────────────────────────────
// Tries root ../.env first (shared), then a local .env as fallback.
// Values containing '=' are handled correctly (split on first '=' only).
// Lines starting with '#' and blank lines are skipped.
function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return false;
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
    return true;
  } catch (e) {
    console.warn(`[Proxy] Could not parse ${envPath}:`, e.message);
    return false;
  }
}

const __dir    = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const rootEnv  = path.resolve(__dir, '../.env');
const localEnv = path.resolve(__dir, '.env');

if (!loadEnv(rootEnv)) {
  loadEnv(localEnv);
  console.log('[Proxy] Loaded env from local .env (root .env not found)');
} else {
  console.log('[Proxy] Loaded env from shared root .env');
}

const PORT          = process.env.PORT || 3000;
const FINNHUB_KEY   = process.env.FINNHUB_API_KEY || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY  || '';
const GROQ_KEY      = process.env.GROQ_API_KEY   || '';
const GEMINI_KEY    = process.env.GEMINI_API_KEY || '';
const OLLAMA_URL    = process.env.OLLAMA_URL     || 'http://localhost:11434';
const OLLAMA_MODEL  = process.env.OLLAMA_MODEL   || 'llama3';

// ─── AI provider priority order (skip if key missing) ────────────────────────
// 1. Groq   — free, 30 req/min, llama3-70b (fast)
// 2. Gemini — free, 15 req/min, gemini-1.5-flash
// 3. Ollama — free local inference, no limits
// 4. Claude — paid, fallback
const AI_PROVIDERS = [
  { name: 'groq',   available: () => !!GROQ_KEY },
  { name: 'gemini', available: () => !!GEMINI_KEY },
  { name: 'ollama', available: () => true },   // always try local Ollama
  { name: 'claude', available: () => !!ANTHROPIC_KEY && !ANTHROPIC_KEY.includes('YOUR_') },
];
console.log('[AI] Provider priority:', AI_PROVIDERS.filter(p => p.available()).map(p => p.name).join(' → ') || 'demo-sandbox');

// ─── Simple in-memory caches ───────────────────────────────────────────────
let livePriceCache = { data: null, fetchedAt: 0 };
let newsCache      = { data: null, fetchedAt: 0 };

// ─── NSE market hours: Mon–Fri 03:45–10:00 UTC ────────────────────────────
function isMarketOpen() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun,6=Sat
  if (day === 0 || day === 6) return false;
  const h = now.getUTCHours(), m = now.getUTCMinutes();
  const mins = h * 60 + m;
  return mins >= 225 && mins <= 600; // 03:45=225, 10:00=600
}

// ─── Fetch helper (returns a Promise<string>) ─────────────────────────────
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', ...headers }
    };
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', d => { buf += d; });
      res.on('end', () => resolve(buf));
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── Sentiment helper ─────────────────────────────────────────────────────
const BULL_KW = ['rally','surge','gain','rise','high','record','growth','beat','strong','bull'];
const BEAR_KW = ['fall','drop','crash','low','loss','weak','decline','bear','sell','down'];
function detectSentiment(text) {
  const t = (text || '').toLowerCase();
  const b = BULL_KW.filter(k => t.includes(k)).length;
  const d = BEAR_KW.filter(k => t.includes(k)).length;
  if (b > d) return 'bullish';
  if (d > b) return 'bearish';
  return 'neutral';
}

// ─── Time-ago helper ─────────────────────────────────────────────────────
function timeAgo(ts) {
  const diff = Math.floor((Date.now() / 1000 - ts) / 60);
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff/60)}h ago`;
}

// ─── Main HTTP server ─────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  // ── /dataprox — Databricks SQL ─────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/dataprox') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { host, token, warehouse_id, statement } = JSON.parse(body);
        console.log(`[Databricks] ${statement.substring(0, 60)}...`);
        const opts = {
          hostname: host,
          path: '/api/2.0/sql/statements',
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        };
        const dbReq = https.request(opts, (dbRes) => {
          let dbData = '';
          dbRes.on('data', d => { dbData += d; });
          dbRes.on('end', () => {
            console.log(`[Databricks] Status: ${dbRes.statusCode}`);
            res.statusCode = dbRes.statusCode;
            res.setHeader('Content-Type', 'application/json');
            res.end(dbData);
          });
        });
        dbReq.on('error', (e) => { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); });
        dbReq.write(JSON.stringify({ warehouse_id, statement, wait_timeout: '30s', on_wait_timeout: 'CANCEL' }));
        dbReq.end();
      } catch (err) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid JSON' })); }
    });
    return;
  }

  // ── GET /live-price — Yahoo Finance ────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/live-price')) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const symbolStr = parsedUrl.searchParams.get('symbol') || 'NIFTY 50';
    
    const SYMBOL_MAP = {
      'NIFTY 50': '%5ENSEI',
      'BANKNIFTY': '%5ENSEBANK',
      'RELIANCE': 'RELIANCE.NS',
      'TCS': 'TCS.NS',
      'INFY': 'INFY.NS',
      'TATAMOTORS': 'TATAMOTORS.NS',
      'HDFCBANK': 'HDFCBANK.NS',
      'SBIN': 'SBIN.NS'
    };
    
    const yahooSymbol = SYMBOL_MAP[symbolStr] || symbolStr;
    const now = Date.now();
    
    // Per-symbol cache
    if (!global.liveCaches) global.liveCaches = {};
    const cache = global.liveCaches[symbolStr];
    
    if (cache && now - cache.fetchedAt < 60000) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(cache.data));
      return;
    }

    (async () => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`;
        const raw = await httpsGet(url);
        const json = JSON.parse(raw);
        const meta = json?.chart?.result?.[0]?.meta || {};
        const quotes = json?.chart?.result?.[0]?.indicators?.quote?.[0] || {};
        const closes = quotes.close || [];
        const price = meta.regularMarketPrice || closes[closes.length - 1] || 0;
        const prevClose = meta.chartPreviousClose || meta.previousClose || price;
        const change = price - prevClose;
        const changePct = prevClose ? (change / prevClose) * 100 : 0;
        
        const result = {
          symbol: symbolStr,
          price: Math.round(price * 100) / 100,
          change: Math.round(change * 100) / 100,
          changePct: Math.round(changePct * 100) / 100,
          dayHigh: meta.regularMarketDayHigh || 0,
          dayLow: meta.regularMarketDayLow || 0,
          volume: meta.regularMarketVolume || 0,
          timestamp: Date.now(),
          isMarketOpen: isMarketOpen()
        };
        
        global.liveCaches[symbolStr] = { data: result, fetchedAt: now };
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
      } catch (e) {
        console.error(`[LivePrice] Error for ${symbolStr}:`, e.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
    })();
    return;
  }

  // ── GET /historical — 1 Year Historical for Charts ──────────────────────
  if (req.method === 'GET' && req.url.startsWith('/historical')) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const symbolStr = parsedUrl.searchParams.get('symbol') || 'NIFTY 50';
    const SYMBOL_MAP = {
      'NIFTY 50': '%5ENSEI', 'BANKNIFTY': '%5ENSEBANK', 'RELIANCE': 'RELIANCE.NS',
      'TCS': 'TCS.NS', 'INFY': 'INFY.NS', 'TATAMOTORS': 'TATAMOTORS.NS',
      'HDFCBANK': 'HDFCBANK.NS', 'SBIN': 'SBIN.NS'
    };
    const yahooSymbol = SYMBOL_MAP[symbolStr] || symbolStr;

    (async () => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1y`;
        const raw = await httpsGet(url);
        const json = JSON.parse(raw);
        const result = json?.chart?.result?.[0] || {};
        const t = result.timestamp || [];
        const q = result.indicators?.quote?.[0] || {};
        const daily = t.map((ts, i) => ({
          time: new Date(ts * 1000).toISOString().split('T')[0],
          open: q.open?.[i] || 0,
          high: q.high?.[i] || 0,
          low: q.low?.[i] || 0,
          close: q.close?.[i] || 0
        })).filter(d => d.close > 0);
        
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(daily));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
    })();
    return;
  }

  // ── GET /news — Market News with Sentiment ──────────────────────────────
  if (req.method === 'GET' && req.url === '/news') {
    const now = Date.now();
    if (newsCache.data && now - newsCache.fetchedAt < 600000) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(newsCache.data));
      return;
    }
    (async () => {
      try {
        // Using global FINNHUB_KEY from process.env or default
        const url = `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_KEY}`;
        const raw = await httpsGet(url);
        const articles = JSON.parse(raw);
        const cutoff = Date.now() / 1000 - 86400;
        const filtered = articles
          .filter(a => a.datetime >= cutoff && a.headline)
          .slice(0, 8)
          .map(a => ({
            headline: a.headline,
            summary: a.summary || '',
            source: a.source || 'News',
            url: a.url || '#',
            publishedAt: a.datetime,
            timeAgo: timeAgo(a.datetime),
            sentiment: detectSentiment(a.headline + ' ' + (a.summary || '')),
            image: a.image || ''
          }));
        const result = { articles: filtered, fetchedAt: Date.now() };
        newsCache = { data: result, fetchedAt: now };
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
      } catch (e) {
        console.error('[News] Error:', e.message);
        // Return mock data on error so UI still works
        const mockArticles = [
          { headline: 'Nifty 50 shows resilience amid global volatility', summary: 'Markets remain steady despite global cues', source: 'Economic Times', url: '#', publishedAt: Math.floor(Date.now()/1000)-3600, timeAgo: '1h ago', sentiment: 'bullish', image: '' },
          { headline: 'FII selling pressure weighs on domestic markets', summary: 'Foreign investors continue to sell', source: 'Mint', url: '#', publishedAt: Math.floor(Date.now()/1000)-7200, timeAgo: '2h ago', sentiment: 'bearish', image: '' },
          { headline: 'RBI holds rates steady in latest policy meeting', summary: 'Central bank maintains status quo on rates', source: 'Reuters', url: '#', publishedAt: Math.floor(Date.now()/1000)-10800, timeAgo: '3h ago', sentiment: 'neutral', image: '' },
          { headline: 'IT sector leads gains as Nifty rallies 300 points', summary: 'Technology stocks surge on strong earnings', source: 'CNBC', url: '#', publishedAt: Math.floor(Date.now()/1000)-14400, timeAgo: '4h ago', sentiment: 'bullish', image: '' },
          { headline: 'Sensex crashes 500 points on global sell-off', summary: 'Markets drop sharply tracking weak global cues', source: 'Business Standard', url: '#', publishedAt: Math.floor(Date.now()/1000)-18000, timeAgo: '5h ago', sentiment: 'bearish', image: '' },
          { headline: 'Auto sector gains on strong monthly sales data', summary: 'Auto companies report record sales numbers', source: 'Moneycontrol', url: '#', publishedAt: Math.floor(Date.now()/1000)-21600, timeAgo: '6h ago', sentiment: 'bullish', image: '' },
          { headline: 'Crude oil prices stabilize after recent decline', summary: 'Brent crude holds above $80 per barrel', source: 'Reuters', url: '#', publishedAt: Math.floor(Date.now()/1000)-25200, timeAgo: '7h ago', sentiment: 'neutral', image: '' },
          { headline: 'Banking sector weak amid credit growth concerns', summary: 'PSU banks underperform as credit growth slows', source: 'Bloomberg', url: '#', publishedAt: Math.floor(Date.now()/1000)-28800, timeAgo: '8h ago', sentiment: 'bearish', image: '' },
        ];
        const result = { articles: mockArticles, fetchedAt: Date.now() };
        newsCache = { data: result, fetchedAt: now };
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
      }
    })();
    return;
  }

  // ── POST /ai-chat — Multi-provider AI (Groq → Gemini → Ollama → Claude → Demo) ──
  if (req.method === 'POST' && req.url === '/ai-chat') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { message, question, history = [], context = '', symbol = 'NIFTY50', databricksData = {} } = JSON.parse(body);
        const userText = message || question || '';
        console.log(`[AI] "${userText.substring(0, 60)}…"`);

        const SYSTEM_PROMPT = `You are TradeIQ AI — an expert Indian stock market analyst specialising in NSE/BSE equity analysis, technical indicators (RSI, MACD, Bollinger Bands, EMA, VWAP, ATR), candlestick patterns, and trading psychology. You currently have context about ${symbol}. Be concise, precise, and actionable. Use ₹ for prices. Do not provide financial advice — describe what indicators suggest.`;

        const msgs = [
          ...history.slice(-6).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content || m.text || '' })),
          { role: 'user', content: context ? `${context}\n\n${userText}` : userText },
        ];

        // ─── SSE helpers ───────────────────────────────────────────────────────
        const sseHeaders = () => {
          if (!res.headersSent) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('Access-Control-Allow-Origin', '*');
          }
        };

        const streamWords = (text) => {
          sseHeaders();
          const words = text.split(' ');
          let i = 0;
          const iv = setInterval(() => {
            if (i < words.length) {
              res.write(`data: ${JSON.stringify({ token: (i === 0 ? '' : ' ') + words[i] })}\n\n`);
              i++;
            } else {
              clearInterval(iv);
              res.write('data: [DONE]\n\n');
              if (!res.writableEnded) res.end();
            }
          }, 35);
          res.on('close', () => clearInterval(iv));
        };

        const streamError = (msg) => {
          sseHeaders();
          res.write(`data: ${JSON.stringify({ token: `⚠ ${msg}` })}\n\n`);
          res.write('data: [DONE]\n\n');
          if (!res.writableEnded) res.end();
        };

        // ─── 1. GROQ — free, llama3-70b-8192, 30 req/min ─────────────────────
        if (GROQ_KEY) {
          console.log('[AI] Trying Groq (llama3-70b-8192)...');
          try {
            const payload = JSON.stringify({
              model: 'llama3-70b-8192',
              messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...msgs],
              max_tokens: 800,
              stream: true,
              temperature: 0.4,
            });
            sseHeaders();
            await new Promise((resolve, reject) => {
              const req2 = https.request({
                hostname: 'api.groq.com',
                path: '/openai/v1/chat/completions',
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${GROQ_KEY}`,
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(payload),
                },
              }, (r) => {
                if (r.statusCode === 429) { console.warn('[Groq] Rate limited, trying next...'); r.resume(); resolve('rate_limit'); return; }
                if (r.statusCode !== 200) { let e=''; r.on('data',d=>e+=d); r.on('end',()=>{ console.warn('[Groq] Error',r.statusCode,e); resolve('error'); }); return; }
                let buf = '';
                r.on('data', chunk => {
                  buf += chunk.toString();
                  const lines = buf.split('\n'); buf = lines.pop();
                  for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const d = line.slice(6).trim();
                    if (d === '[DONE]') { res.write('data: [DONE]\n\n'); continue; }
                    try {
                      const p = JSON.parse(d);
                      const t = p.choices?.[0]?.delta?.content;
                      if (t) res.write(`data: ${JSON.stringify({ token: t })}\n\n`);
                    } catch(_){}
                  }
                });
                r.on('end', () => { if (!res.writableEnded) { res.write('data: [DONE]\n\n'); res.end(); } resolve('ok'); });
              });
              req2.on('error', e => { console.warn('[Groq] Network error:', e.message); resolve('error'); });
              req2.write(payload); req2.end();
            }).then(status => {
              if (status === 'ok') return Promise.resolve('done');
              return Promise.reject(new Error(status));
            });
            return; // success — exit
          } catch(e) {
            console.warn('[Groq] Failed, trying next provider:', e.message);
            if (res.writableEnded) return;
          }
        }

        // ─── 2. GEMINI — free, gemini-1.5-flash, 15 req/min ──────────────────
        if (GEMINI_KEY) {
          console.log('[AI] Trying Gemini (gemini-1.5-flash)...');
          try {
            // Gemini uses REST (non-SSE), then we stream the response word-by-word
            const geminiMsgs = msgs.map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }],
            }));
            const payload = JSON.stringify({
              system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
              contents: geminiMsgs,
              generationConfig: { maxOutputTokens: 800, temperature: 0.4 },
            });
            const geminiRes = await new Promise((resolve, reject) => {
              const req2 = https.request({
                hostname: 'generativelanguage.googleapis.com',
                path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
              }, (r) => {
                let d = ''; r.on('data', c => d += c);
                r.on('end', () => resolve({ status: r.statusCode, body: d }));
              });
              req2.on('error', reject);
              req2.write(payload); req2.end();
            });
            if (geminiRes.status === 429) { console.warn('[Gemini] Rate limited, trying next...'); }
            else if (geminiRes.status === 200) {
              const parsed = JSON.parse(geminiRes.body);
              const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
              console.log('[AI] Gemini OK');
              streamWords(text);
              return;
            } else {
              console.warn('[Gemini] Error', geminiRes.status, geminiRes.body.slice(0, 120));
            }
          } catch(e) {
            console.warn('[Gemini] Failed:', e.message);
            if (res.writableEnded) return;
          }
        }

        // ─── 3. OLLAMA — 100% free local, no API key needed ──────────────────
        {
          console.log(`[AI] Trying Ollama local (${OLLAMA_MODEL})...`);
          try {
            const isLocalHttps = OLLAMA_URL.startsWith('https');
            const ollamaLib = isLocalHttps ? https : http;
            const ollamaParsed = new URL(OLLAMA_URL);
            const payload = JSON.stringify({
              model: OLLAMA_MODEL,
              messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...msgs],
              stream: true,
            });
            const ollamaOk = await new Promise((resolve) => {
              const req2 = ollamaLib.request({
                hostname: ollamaParsed.hostname,
                port: ollamaParsed.port || (isLocalHttps ? 443 : 80),
                path: '/api/chat',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
                timeout: 5000, // 5s connect timeout — fail fast if Ollama not running
              }, (r) => {
                if (r.statusCode !== 200) { r.resume(); resolve(false); return; }
                sseHeaders();
                let buf = '';
                r.on('data', chunk => {
                  buf += chunk.toString();
                  const lines = buf.split('\n'); buf = lines.pop();
                  for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                      const p = JSON.parse(line);
                      const t = p.message?.content;
                      if (t) res.write(`data: ${JSON.stringify({ token: t })}\n\n`);
                      if (p.done) { res.write('data: [DONE]\n\n'); if (!res.writableEnded) res.end(); }
                    } catch(_){}
                  }
                });
                r.on('end', () => { if (!res.writableEnded) { res.write('data: [DONE]\n\n'); res.end(); } resolve(true); });
              });
              req2.on('error', () => resolve(false));
              req2.on('timeout', () => { req2.destroy(); resolve(false); });
              req2.write(payload); req2.end();
            });
            if (ollamaOk) { console.log('[AI] Ollama OK'); return; }
            console.warn('[AI] Ollama not available (not running locally)');
          } catch(e) {
            console.warn('[Ollama] Failed:', e.message);
            if (res.writableEnded) return;
          }
        }

        // ─── 4. CLAUDE — paid fallback ─────────────────────────────────────────
        if (ANTHROPIC_KEY && !ANTHROPIC_KEY.includes('YOUR_')) {
          console.log('[AI] Trying Claude (claude-3-haiku — cheapest tier)...');
          try {
            const payload = JSON.stringify({
              model: 'claude-3-haiku-20240307', // cheapest Claude model, ~250x less than Sonnet
              max_tokens: 600,
              system: SYSTEM_PROMPT,
              messages: msgs,
              stream: true,
            });
            sseHeaders();
            await new Promise((resolve) => {
              const req2 = https.request({
                hostname: 'api.anthropic.com',
                path: '/v1/messages',
                method: 'POST',
                headers: {
                  'x-api-key': ANTHROPIC_KEY,
                  'anthropic-version': '2023-06-01',
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(payload),
                },
              }, (r) => {
                if (r.statusCode === 429) {
                  let e=''; r.on('data',d=>e+=d); r.on('end',()=>{ console.warn('[Claude] Rate limited'); resolve('rate_limit'); });
                  return;
                }
                if (r.statusCode !== 200) { let e=''; r.on('data',d=>e+=d); r.on('end',()=>{ console.warn('[Claude] Error',r.statusCode); resolve('error'); }); return; }
                let buf = '';
                r.on('data', chunk => {
                  buf += chunk.toString();
                  const lines = buf.split('\n'); buf = lines.pop();
                  for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const d = line.slice(6).trim();
                    try {
                      const p = JSON.parse(d);
                      if (p.type === 'content_block_delta' && p.delta?.text)
                        res.write(`data: ${JSON.stringify({ token: p.delta.text })}\n\n`);
                      if (p.type === 'message_stop') { res.write('data: [DONE]\n\n'); if (!res.writableEnded) res.end(); }
                    } catch(_){}
                  }
                });
                r.on('end', () => { if (!res.writableEnded) { res.write('data: [DONE]\n\n'); res.end(); } resolve('ok'); });
              });
              req2.on('error', e => { console.warn('[Claude] Error:', e.message); resolve('error'); });
              req2.write(payload); req2.end();
            });
            if (!res.writableEnded) return;
          } catch(e) {
            console.warn('[Claude] Failed:', e.message);
            if (res.writableEnded) return;
          }
        }

        // ─── 5. DEMO SANDBOX — hardcoded Indian market Q&A ───────────────────
        console.log('[AI] All providers unavailable — using Demo Sandbox');
        const q = userText.toLowerCase();
        let demoText = '';
        if (q.includes('rsi')) {
          demoText = `**RSI (Relative Strength Index)** measures momentum on a 0–100 scale.\n\n- **RSI < 30** → Oversold zone — potential reversal up\n- **RSI > 70** → Overbought zone — potential reversal down\n- **RSI 40–60** → Neutral / consolidation\n\nFor ${symbol}, watch for RSI divergence (price makes new high but RSI doesn't) as a leading reversal signal.`;
        } else if (q.includes('macd')) {
          demoText = `**MACD (Moving Average Convergence Divergence)** tracks trend changes.\n\n- **Bullish cross**: MACD line crosses above Signal line → momentum shifting up\n- **Bearish cross**: MACD crosses below Signal → momentum shifting down\n- **Histogram** expanding = strengthening trend; shrinking = weakening trend\n\nA MACD bullish cross combined with RSI < 60 gives a strong entry signal.`;
        } else if (q.includes('bollinger') || q.includes('bb')) {
          demoText = `**Bollinger Bands** = 20-day SMA ± 2 standard deviations.\n\n- **Price touches lower band** → potential bounce (buy zone)\n- **Price touches upper band** → potential reversal (sell zone)\n- **Squeeze** (bands narrowing) → explosive breakout imminent\n\nFor ${symbol}, a BB squeeze with rising RSI typically precedes a bullish breakout.`;
        } else if (q.includes('stop') || q.includes('stoploss') || q.includes('stop loss')) {
          demoText = `**Stop-Loss Strategies for ${symbol}:**\n\n1. **ATR-based**: Entry price − (1.5 × ATR14) — adapts to volatility\n2. **Swing low**: Place below the last significant low — technical S/R based\n3. **% fixed**: 1–2% below entry for intraday; 3–5% for swing trades\n\n💡 Never risk more than 1–2% of capital on a single trade. For Nifty futures, 1 lot = 50 units.`;
        } else if (q.includes('nifty') || q.includes('index')) {
          demoText = `**Nifty 50** is India's benchmark NSE index comprising 50 large-cap stocks across 13 sectors.\n\n**Key support/resistance levels** to watch:\n- Major S/R zones are typically round numbers (24000, 24500, 25000)\n- FII activity drives index movement — track net FII data daily\n- Nifty trades 09:15–15:30 IST, Mon–Fri\n\nUse the Indicators tab for real-time RSI, MACD, and EMA signals.`;
        } else if (q.includes('volume') || q.includes('rvol')) {
          demoText = `**Volume Analysis** is crucial for confirming price moves.\n\n- **RVOL > 1.5×** = above-average conviction — trust the move\n- **RVOL < 0.7×** = low participation — false breakout risk\n- **OBV rising** with price = institutional accumulation\n- **CMF > 0** = net buying pressure\n\nA price breakout on RVOL > 2× is the strongest confirmation signal.`;
        } else {
          demoText = `👋 I'm **TradeIQ AI** — your Indian market analysis assistant!\n\nI can help with:\n- **Technical indicators** (RSI, MACD, Bollinger Bands, EMA, ATR, VWAP)\n- **Stop-loss strategies** for NSE/BSE stocks\n- **Candlestick patterns** (Doji, Hammer, Engulfing, etc.)\n- **Market concepts** (F&O, FII/DII, RVOL, pivot points)\n\n💡 *Tip: For live AI responses, add a free **GROQ_API_KEY** or **GEMINI_API_KEY** to your .env file — both have generous free tiers!*`;
        }
        streamWords(demoText);

      } catch (err) {
        console.error('[AI Chat] Parse error:', err.message);
        res.statusCode = 400;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ── 404 fallback ────────────────────────────────────────────────────────
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`\n🚀 StockIQ Proxy running at http://localhost:${PORT}`);
  console.log(`   Routes: /dataprox | /live-price | /news | /ai-chat`);
});
