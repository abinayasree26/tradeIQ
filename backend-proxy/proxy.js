import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';

// ─── Simple manual .env loading (since we want minimum dependencies) ────────
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf8');
    env.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length === 2) {
        process.env[parts[0].trim()] = parts[1].trim();
      }
    });
  }
} catch (e) {
  console.warn('[Proxy] Failed to load .env file:', e.message);
}

const PORT = process.env.PORT || 3000;
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || 'cs84s1pr01qlt0n9uts0cs84s1pr01qlt0n9utsg';
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || 'YOUR_ANTHROPIC_KEY';

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

  // ── POST /ai-chat — Claude Anthropic SSE Streaming ─────────────────────
  if (req.method === 'POST' && req.url === '/ai-chat') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { question, history = [], databricksData = {} } = JSON.parse(body);
        const currentSym = databricksData.symbol || 'NIFTY 50';
        const systemPrompt = `You are TradeIQ AI, a professional stock market analyst. 
Currently, you are analyzing ${currentSym}. 
- For Nifty 50, you have access to extensive historical 2024 data (Databricks). 
- For other stocks, prioritize realtime API data if present in context. 
Answer concisely in 2-3 sentences max. Use Indian number system (e.g. 22,500). 
Always refer to index moves in "points" and stocks in "rupees". 
Be insightful, professional, and data-driven. Never make up data.`;

        const contextMsg = `Current Databricks data context:\n${JSON.stringify(databricksData, null, 2)}\n\nUser question: ${question}`;

        const recentHistory = history.slice(-6).map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.text || m.content || ''
        }));

        const messages = [...recentHistory, { role: 'user', content: contextMsg }];

        const payload = JSON.stringify({
          model: 'claude-3-5-sonnet-20240620', // Using current Sonnet model
          max_tokens: 1024,
          system: `You are StockIQ, an expert Nifty 50 market analyst AI. You have access to 2024 Nifty 50 historical data provided as JSON context. 
Answer questions concisely in 2–3 sentences. Format numbers with Indian number system (lakhs/crores). 
When mentioning prices, always say 'points' not 'rupees'. 
If asked for SQL, generate it. Never make up data not in the context.`,
          messages,
          stream: true
        });

        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');

        const opts = {
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        };

        const claudeReq = https.request(opts, (claudeRes) => {
          let buf = '';
          claudeRes.on('data', chunk => {
            buf += chunk.toString();
            const lines = buf.split('\n');
            buf = lines.pop(); // keep incomplete last line
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') { res.write('data: [DONE]\n\n'); continue; }
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                    res.write(`data: ${JSON.stringify({ token: parsed.delta.text })}\n\n`);
                  }
                  if (parsed.type === 'message_stop') {
                    res.write('data: [DONE]\n\n');
                    res.end();
                  }
                } catch (_) { /* skip malformed */ }
              }
            }
          });
          claudeRes.on('end', () => { res.write('data: [DONE]\n\n'); res.end(); });
        });

        claudeReq.on('error', (e) => {
          console.error('[Claude] Error:', e.message);
          res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
          res.end();
        });

        claudeReq.write(payload);
        claudeReq.end();

      } catch (err) {
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
