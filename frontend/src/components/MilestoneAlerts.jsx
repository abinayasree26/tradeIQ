/**
 * MilestoneAlerts.jsx — Progressive Alert Engine UI
 * Create rules, view history, configure Telegram, fire checks.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Bell, Plus, Trash2, RefreshCw, Send, CheckCircle,
  AlertTriangle, ChevronDown, ChevronUp, Zap, Target,
  MessageCircle, Clock, Activity
} from 'lucide-react';
import { CONFIG } from '../config';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const fmt = (n) => n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const CONDITION_TYPES = [
  { value: 'volume_rvol',   label: 'Volume RVOL',       hint: 'e.g. 1.5 (1.5× daily avg)' },
  { value: 'rsi_level',     label: 'RSI Level',          hint: 'e.g. 30 (RSI reaches 30)' },
  { value: 'price_breakout',label: 'Price Breakout',     hint: 'e.g. 2500 (fixed level)' },
  { value: 'price_pct',     label: 'Price % Move',       hint: 'e.g. 2.0 (2% from prev close)' },
  { value: 'macd_cross',    label: 'MACD Cross',         hint: 'e.g. 0 (histogram sign change)' },
  { value: 'bb_squeeze',    label: 'BB Squeeze',         hint: 'e.g. 0.05 (band width)' },
  { value: 'ema_cross',     label: 'EMA Cross',          hint: 'e.g. 1 (EMA9 vs EMA21)' },
];

const DEFAULT_MILESTONES = [80, 90, 100, 110, 120, 150];

function MilestonePips({ chain = [], lastHit = null }) {
  return (
    <div className="milestone-chain">
      {chain.map((m, i) => {
        const hit  = lastHit != null && m <= lastHit;
        const next = !hit && (i === 0 || (chain[i - 1] <= lastHit));
        return (
          <div
            key={m}
            className={`milestone-pip ${hit ? 'hit' : next ? 'next' : 'miss'}`}
            title={`${m}% milestone`}
          >
            {m}
          </div>
        );
      })}
    </div>
  );
}

function AlertRuleCard({ rule, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const chain = rule.milestone_pcts || DEFAULT_MILESTONES;

  return (
    <div className="alert-rule-card" style={{ marginBottom: 10 }}>
      <div className="flex-between" style={{ cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: rule.is_active ? 'var(--bullish)' : 'var(--text-muted)',
            boxShadow: rule.is_active ? '0 0 6px var(--bullish)' : 'none',
          }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{rule.symbol} — {rule.condition_type?.replace(/_/g, ' ')}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Target: {rule.target_value}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge ${rule.is_active ? 'badge-bullish' : 'badge-neutral'}`}>
            {rule.is_active ? 'Active' : 'Inactive'}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onDelete(rule.id); }}
            className="btn btn-danger btn-xs"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Trash2 size={11} />
          </button>
          {expanded ? <ChevronUp size={15} color="var(--text-muted)" /> : <ChevronDown size={15} color="var(--text-muted)" />}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>Milestone chain:</div>
          <MilestonePips chain={chain} lastHit={rule.last_hit_pct} />
          {rule.description && (
            <div style={{ marginTop: 12, fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5, background: 'var(--bg-overlay)', padding: '10px 12px', borderRadius: 8 }}>
              {rule.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AlertEventCard({ event }) {
  const [expanded, setExpanded] = useState(false);
  const isUp = event.condition_type?.includes('buy') || event.milestone_pct >= 100;

  return (
    <div className="card" style={{ padding: 14, marginBottom: 8 }}>
      <div className="flex-between" style={{ cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: isUp ? 'var(--bullish-dim)' : 'var(--bearish-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={15} color={isUp ? 'var(--bullish)' : 'var(--bearish)'} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>
              {event.symbol} — {event.condition_type?.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <Clock size={10} />
              {event.fired_at ? new Date(event.fired_at).toLocaleString('en-IN') : 'Just now'}
              {event.milestone_pct != null && (
                <span className="badge badge-accent" style={{ marginLeft: 4 }}>{event.milestone_pct}% milestone</span>
              )}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
      </div>

      {expanded && event.coaching_message && (
        <div style={{
          marginTop: 12, padding: '12px 14px', background: 'var(--bg-overlay)',
          borderRadius: 10, fontSize: '0.78rem', lineHeight: 1.6, color: 'var(--text-secondary)',
          borderLeft: '3px solid var(--accent)', fontFamily: 'monospace', whiteSpace: 'pre-wrap',
        }}>
          {event.coaching_message}
        </div>
      )}
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */
const TABS = ['Rules', 'Create', 'History', 'Telegram'];

export default function MilestoneAlerts({ symbol, theme }) {
  const [tab, setTab]           = useState('Rules');
  const [rules, setRules]       = useState([]);
  const [history, setHistory]   = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [telegramStatus, setTelegramStatus] = useState(null);
  const [checkResult, setCheckResult]       = useState(null);
  const [fireResult, setFireResult]         = useState(null);

  // Create form
  const [form, setForm] = useState({
    symbol,
    condition_type: 'volume_rvol',
    target_value: '',
    description: '',
    milestone_pcts: DEFAULT_MILESTONES.join(','),
    send_telegram: true,
  });

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch(CONFIG.STAP.ALERT_RULES);
      if (!res.ok) return;
      const data = await res.json();
      setRules(Array.isArray(data) ? data : (data.rules || []));
    } catch {}
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(CONFIG.STAP.ALERT_HISTORY);
      if (!res.ok) return;
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : (data.events || []));
    } catch {}
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(CONFIG.STAP.ALERT_TEMPLATES);
      if (!res.ok) return;
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : (data.templates || []));
    } catch {}
  }, []);

  useEffect(() => {
    fetchRules();
    fetchHistory();
    fetchTemplates();
  }, [fetchRules, fetchHistory, fetchTemplates]);

  useEffect(() => {
    setForm(f => ({ ...f, symbol }));
  }, [symbol]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const milestones = form.milestone_pcts.split(',').map(Number).filter(Boolean);
      const res = await fetch(CONFIG.STAP.ALERT_RULES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          target_value: parseFloat(form.target_value),
          milestone_pcts: milestones,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      await fetchRules();
      setTab('Rules');
    } catch (e) {
      alert('Error creating rule: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`${CONFIG.STAP.ALERT_RULES}/${id}`, { method: 'DELETE' });
      await fetchRules();
    } catch {}
  };

  const handleCheck = async () => {
    setLoading(true); setCheckResult(null);
    try {
      const res  = await fetch(CONFIG.STAP.ALERT_CHECK(symbol));
      const data = await res.json();
      setCheckResult(data);
    } catch (e) { setCheckResult({ error: e.message }); }
    finally { setLoading(false); }
  };

  const handleFire = async () => {
    setLoading(true); setFireResult(null);
    try {
      const res  = await fetch(CONFIG.STAP.ALERT_FIRE(symbol), { method: 'POST' });
      const data = await res.json();
      setFireResult(data);
      await fetchHistory();
    } catch (e) { setFireResult({ error: e.message }); }
    finally { setLoading(false); }
  };

  const handleTelegramTest = async () => {
    setTelegramStatus('testing');
    try {
      const res  = await fetch(CONFIG.STAP.TG_TEST);
      const data = await res.json();
      setTelegramStatus(data.status === 'ok' ? 'ok' : 'fail');
    } catch { setTelegramStatus('fail'); }
  };

  const applyTemplate = (tpl) => {
    setForm(f => ({
      ...f,
      condition_type: tpl.condition_type || f.condition_type,
      target_value:   tpl.target_value || '',
      description:    tpl.description || '',
      milestone_pcts: (tpl.milestone_pcts || DEFAULT_MILESTONES).join(','),
    }));
    setTab('Create');
  };

  return (
    <div>
      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Rules tab ──────────────────────────────────────────────────────── */}
      {tab === 'Rules' && (
        <div>
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{rules.length} active rule{rules.length !== 1 ? 's' : ''}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={handleCheck} disabled={loading}>
                <Activity size={13} /> Dry Run
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleFire} disabled={loading}>
                <Zap size={13} /> Fire & Send
              </button>
            </div>
          </div>

          {rules.length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <Bell size={28} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <div style={{ fontWeight: 700, marginBottom: 6 }}>No alert rules yet</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Create your first rule or start from a template
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn btn-primary btn-sm" onClick={() => setTab('Create')}>
                  <Plus size={13} /> Create Rule
                </button>
                {templates.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => applyTemplate(templates[0])}>
                    Use Template
                  </button>
                )}
              </div>
            </div>
          ) : (
            rules.map(r => <AlertRuleCard key={r.id} rule={r} onDelete={handleDelete} />)
          )}

          {/* Dry-run / fire results */}
          {(checkResult || fireResult) && (
            <div className="card" style={{ padding: 16, marginTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 12 }}>
                {checkResult ? '🔍 Dry Run Result' : '⚡ Alert Fired'}
              </div>
              <pre style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                {JSON.stringify(checkResult || fireResult, null, 2)}
              </pre>
            </div>
          )}

          {/* Templates */}
          {templates.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 12 }}>
                Quick Templates
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {templates.map((tpl, i) => (
                  <div key={i} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{tpl.name || tpl.condition_type?.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{tpl.description}</div>
                    </div>
                    <button className="btn btn-ghost btn-xs" onClick={() => applyTemplate(tpl)}>Use</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Create tab ─────────────────────────────────────────────────────── */}
      {tab === 'Create' && (
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="form-label">Symbol</label>
            <input className="form-input" value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} placeholder="RELIANCE" required />
          </div>

          <div>
            <label className="form-label">Condition Type</label>
            <select className="form-input form-select" value={form.condition_type} onChange={e => setForm(f => ({ ...f, condition_type: e.target.value }))}>
              {CONDITION_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 5 }}>
              {CONDITION_TYPES.find(c => c.value === form.condition_type)?.hint}
            </div>
          </div>

          <div>
            <label className="form-label">Target Value</label>
            <input className="form-input" type="number" step="any" value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))} placeholder="e.g. 1.5" required />
          </div>

          <div>
            <label className="form-label">Milestone Chain (% — comma separated)</label>
            <input className="form-input" value={form.milestone_pcts} onChange={e => setForm(f => ({ ...f, milestone_pcts: e.target.value }))} placeholder="80,90,100,120,150" />
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 5 }}>
              Alert fires progressively at each percentage of the target
            </div>
          </div>

          <div>
            <label className="form-label">Description (optional)</label>
            <input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="When RELIANCE volume surges..." />
          </div>

          <div className="flex-between" style={{ padding: '12px 14px', background: 'var(--bg-overlay)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Send Telegram Alert</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Push notification when milestone fires</div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={form.send_telegram} onChange={e => setForm(f => ({ ...f, send_telegram: e.target.checked }))} />
              <span className="toggle-slider" />
            </label>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</> : <><Plus size={14} /> Create Alert Rule</>}
          </button>
        </form>
      )}

      {/* ── History tab ────────────────────────────────────────────────────── */}
      {tab === 'History' && (
        <div>
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{history.length} events</span>
            <button className="btn btn-ghost btn-sm" onClick={fetchHistory}><RefreshCw size={13} /> Refresh</button>
          </div>
          {history.length === 0 ? (
            <div className="no-data">No alert history yet. Create rules and fire them to see results.</div>
          ) : (
            history.slice(0, 20).map((ev, i) => <AlertEventCard key={i} event={ev} />)
          )}
        </div>
      )}

      {/* ── Telegram tab ───────────────────────────────────────────────────── */}
      {tab === 'Telegram' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card-accent card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <MessageCircle size={20} color="var(--accent-light)" />
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Telegram Bot Setup</span>
            </div>
            <ol style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 2, paddingLeft: 18 }}>
              <li>Open Telegram → search <strong>@BotFather</strong> → <code style={{ background: 'var(--bg-card)', padding: '1px 5px', borderRadius: 4 }}>/newbot</code></li>
              <li>Copy the BOT_TOKEN → add to <code style={{ background: 'var(--bg-card)', padding: '1px 5px', borderRadius: 4 }}>backend-python/.env</code></li>
              <li>Message your new bot once (any text)</li>
              <li>Visit <strong>GET /alerts/telegram/chat-id</strong> to get your chat ID</li>
              <li>Add TELEGRAM_CHAT_ID to <code style={{ background: 'var(--bg-card)', padding: '1px 5px', borderRadius: 4 }}>.env</code> → restart</li>
            </ol>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleTelegramTest} disabled={telegramStatus === 'testing'} style={{ flex: 1 }}>
              <Send size={14} />
              {telegramStatus === 'testing' ? 'Testing…' : 'Test Connection'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                try {
                  const r = await fetch(CONFIG.STAP.TG_CHATID);
                  const d = await r.json();
                  alert(`Chat ID: ${d.chat_id || JSON.stringify(d)}`);
                } catch { alert('Could not fetch chat ID'); }
              }}
            >
              Get Chat ID
            </button>
          </div>

          {telegramStatus === 'ok' && (
            <div className="card-bullish card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircle size={18} color="var(--bullish)" />
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Telegram is connected and working!</span>
            </div>
          )}
          {telegramStatus === 'fail' && (
            <div className="card-bearish card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={18} color="var(--bearish)" />
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Connection failed</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Check BOT_TOKEN and CHAT_ID in .env</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
