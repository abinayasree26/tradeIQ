import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Plus, Trash2, Play, CheckCircle2, Clock, AlertTriangle, MessageSquare } from 'lucide-react';
import { CONFIG } from '../config';

const CONDITION_LABELS = {
  volume_rvol:    { label: 'Volume Surge (RVOL)', desc: 'Fire as volume approaches/exceeds daily average' },
  rsi_level:      { label: 'RSI Level',           desc: 'Fire as RSI crosses key threshold' },
  price_breakout: { label: 'Price Breakout',       desc: 'Fire when price crosses a key level' },
  price_pct:      { label: 'Price % Move',         desc: 'Fire on significant intraday % moves' },
  macd_cross:     { label: 'MACD Cross',           desc: 'Fire on MACD bullish/bearish crossover' },
  bb_squeeze:     { label: 'Bollinger Squeeze',    desc: 'Fire when bands compress before breakout' },
  ema_cross:      { label: 'EMA Cross',            desc: 'Fire on EMA9/EMA21 golden or death cross' },
};

// ── Milestone progress bar ───────────────────────────────────────────────────
function MilestoneProgress({ steps, lastMilestone }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 8 }}>
      {steps.map((step, i) => {
        const fired = i < lastMilestone;
        const active = i === lastMilestone;
        return (
          <React.Fragment key={i}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700,
              background: fired ? '#00c853' : active ? 'rgba(255,204,2,0.2)' : 'rgba(255,255,255,0.06)',
              border: fired ? '2px solid #00c853' : active ? '2px solid #ffcc02' : '2px solid rgba(255,255,255,0.1)',
              color: fired ? '#fff' : active ? '#ffcc02' : '#666',
            }}>
              {fired ? '✓' : `${(step * 100).toFixed(0) > step ? (step * 100).toFixed(0) + '%' : step}`}
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: fired ? '#00c853' : 'rgba(255,255,255,0.08)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Alert history card ───────────────────────────────────────────────────────
function HistoryCard({ event }) {
  const [expanded, setExpanded] = useState(false);
  const pct = event.milestone_pct;
  const label = pct <= 0.85 ? '80%' : pct <= 0.95 ? '90%' : pct <= 1.05 ? '100%' : pct <= 1.4 ? '120%' : '150%+';
  const color = pct >= 1.0 ? '#69f0ae' : '#ffcc02';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.07)', padding: '12px 14px',
      marginBottom: 8, cursor: 'pointer',
    }} onClick={() => setExpanded(!expanded)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 13, color }}>{event.symbol}</span>
          <span style={{ fontSize: 11, color: '#666', marginLeft: 8 }}>
            {CONDITION_LABELS[event.condition_type]?.label || event.condition_type}
          </span>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11 }}>
          <div style={{ color }}>{label} milestone</div>
          <div style={{ color: '#666' }}>{new Date(event.triggered_at).toLocaleString('en-IN')}</div>
        </div>
      </div>
      {event.price_at_trigger && (
        <div style={{ fontSize: 11, color: '#90a4ae', marginTop: 4 }}>
          Price ₹{event.price_at_trigger?.toFixed(2)} · RSI {event.rsi_at_trigger?.toFixed(1)}
          {event.stop_loss && ` · SL ₹${event.stop_loss.toFixed(2)}`}
          {event.target_1 && ` · T1 ₹${event.target_1.toFixed(2)}`}
        </div>
      )}
      {expanded && event.message && (
        <div style={{
          marginTop: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.3)',
          borderRadius: 8, fontSize: 11, color: '#cfd8dc', whiteSpace: 'pre-line', lineHeight: 1.6,
        }}>
          {event.message}
        </div>
      )}
      {event.delivered_via?.length > 0 && (
        <div style={{ fontSize: 10, color: '#555', marginTop: 6 }}>
          Sent via: {event.delivered_via.join(', ')}
        </div>
      )}
    </div>
  );
}

// ── New rule form ────────────────────────────────────────────────────────────
function NewRuleForm({ symbol, onCreated }) {
  const [condType, setCondType]  = useState('volume_rvol');
  const [direction, setDir]      = useState('above');
  const [stepsStr, setStepsStr]  = useState('0.8,0.9,1.0,1.2,1.5');
  const [baseVal, setBaseVal]    = useState('');
  const [telegram, setTelegram]  = useState(true);
  const [saving, setSaving]      = useState(false);
  const [err, setErr]            = useState('');

  const save = async () => {
    setSaving(true); setErr('');
    try {
      const steps = stepsStr.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
      const body = {
        symbol,
        condition_type: condType,
        milestone_chain: {
          steps,
          base_value: baseVal ? parseFloat(baseVal) : null,
          direction,
        },
        notify_telegram: telegram,
      };
      const res = await window.fetch(CONFIG.STAP.ALERT_RULES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      onCreated();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
    padding: '7px 10px', color: '#e0e0e0', fontSize: 12, boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 11, color: '#90a4ae', marginBottom: 4, display: 'block' };

  return (
    <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
      <h4 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700 }}>+ New Alert Rule for {symbol}</h4>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Condition Type</label>
          <select value={condType} onChange={e => setCondType(e.target.value)} style={inputStyle}>
            {Object.entries(CONDITION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>{CONDITION_LABELS[condType]?.desc}</div>
        </div>

        <div>
          <label style={labelStyle}>Direction</label>
          <select value={direction} onChange={e => setDir(e.target.value)} style={inputStyle}>
            <option value="above">Above thresholds (breakout)</option>
            <option value="below">Below thresholds (breakdown/oversold)</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Milestone Steps (comma-separated)</label>
          <input value={stepsStr} onChange={e => setStepsStr(e.target.value)} style={inputStyle}
            placeholder="0.8,0.9,1.0,1.2,1.5"
          />
          <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>RVOL: ratios. RSI/Price: actual values.</div>
        </div>

        <div>
          <label style={labelStyle}>Base Value (optional)</label>
          <input value={baseVal} onChange={e => setBaseVal(e.target.value)} style={inputStyle}
            placeholder="Auto-detected for RVOL"
          />
          <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Leave blank for RVOL (auto-uses avg volume).</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input type="checkbox" id="tg" checked={telegram} onChange={e => setTelegram(e.target.checked)} />
        <label htmlFor="tg" style={{ fontSize: 12, color: '#90a4ae' }}>Send via Telegram</label>
      </div>

      {err && <div style={{ color: '#ff5252', fontSize: 11, marginBottom: 10 }}>⚠ {err}</div>}

      <button onClick={save} disabled={saving} style={{
        background: '#1565c0', border: 'none', borderRadius: 8,
        padding: '8px 18px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12,
      }}>
        {saving ? 'Saving...' : 'Create Rule'}
      </button>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────
export default function MilestoneAlerts({ symbol }) {
  const [rules, setRules]       = useState([]);
  const [history, setHistory]   = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheck] = useState(null);
  const [tgStatus, setTgStatus] = useState(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, hRes] = await Promise.all([
        window.fetch(CONFIG.STAP.ALERT_RULES),
        window.fetch(`${CONFIG.STAP.ALERT_HISTORY}?symbol=${symbol}&limit=20`),
      ]);
      if (rRes.ok) setRules((await rRes.json()).rules || []);
      if (hRes.ok) setHistory((await hRes.json()).events || []);
    } catch {}
    setLoading(false);
  }, [symbol]);

  useEffect(() => { loadRules(); }, [loadRules]);

  const deleteRule = async (id) => {
    await window.fetch(`${CONFIG.STAP.ALERT_RULES}/${id}`, { method: 'DELETE' });
    loadRules();
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const res = await window.fetch(CONFIG.STAP.ALERT_CHECK(symbol));
      if (res.ok) setCheck(await res.json());
    } catch {}
    setChecking(false);
  };

  const testTelegram = async () => {
    const res = await window.fetch(CONFIG.STAP.TG_TEST);
    if (res.ok) setTgStatus(await res.json());
  };

  const symRules = rules.filter(r => r.symbol === symbol);

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Milestone Alerts</h3>
          <span style={{ fontSize: 11, color: '#666' }}>{symbol} · {symRules.length} active rules</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={checkNow} disabled={checking} style={{
            background: 'rgba(21,101,192,0.2)', border: '1px solid rgba(21,101,192,0.4)',
            borderRadius: 8, padding: '6px 12px', color: '#90caf9', cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Play size={12} />{checking ? 'Checking...' : 'Check Now'}
          </button>
          <button onClick={() => setShowForm(!showForm)} style={{
            background: 'rgba(0,200,83,0.15)', border: '1px solid rgba(0,200,83,0.3)',
            borderRadius: 8, padding: '6px 12px', color: '#69f0ae', cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Plus size={12} />New Rule
          </button>
        </div>
      </div>

      {showForm && (
        <NewRuleForm symbol={symbol} onCreated={() => { setShowForm(false); loadRules(); }} />
      )}

      {/* Check result */}
      {checkResult && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.08)', padding: 14, marginBottom: 14,
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            Check Result — {checkResult.rules_checked} rules · {checkResult.fired_count} fired
          </div>
          {checkResult.indicators_snapshot && (
            <div style={{ fontSize: 11, color: '#90a4ae', marginBottom: 8 }}>
              Close: ₹{checkResult.indicators_snapshot.close?.toFixed(2)} ·
              RSI: {checkResult.indicators_snapshot.rsi_14?.toFixed(1)} ·
              RVOL: {checkResult.indicators_snapshot.rvol?.toFixed(2)}× ·
              Signal: {checkResult.indicators_snapshot.signal}
            </div>
          )}
          {checkResult.fired_events.map((ev, i) => (
            <div key={i} style={{
              background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.2)',
              borderRadius: 8, padding: 10, marginBottom: 8,
            }}>
              <div style={{ fontWeight: 600, color: '#69f0ae', fontSize: 12 }}>
                {ev.rule_name} — Milestone {Math.round(ev.threshold * 100)}%
              </div>
              <div style={{ fontSize: 11, color: '#cfd8dc', marginTop: 4, whiteSpace: 'pre-line' }}>
                {ev.message}
              </div>
            </div>
          ))}
          {checkResult.fired_count === 0 && (
            <div style={{ fontSize: 12, color: '#666' }}>No milestones crossed at current values.</div>
          )}
        </div>
      )}

      {/* Active Rules */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#90a4ae', marginBottom: 10 }}>ACTIVE RULES</div>
        {loading && <div style={{ color: '#666', fontSize: 12 }}>Loading...</div>}
        {!loading && symRules.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '24px 16px',
            background: 'rgba(255,255,255,0.02)', borderRadius: 10,
            border: '1px dashed rgba(255,255,255,0.08)', color: '#555', fontSize: 12,
          }}>
            <Bell size={28} style={{ opacity: 0.3, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
            No alert rules for {symbol}.<br/>
            Click "+ New Rule" to create progressive milestone alerts.
          </div>
        )}
        {symRules.map(rule => (
          <div key={rule.id} style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.07)', padding: '12px 14px', marginBottom: 8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{rule.rule_name}</div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                  {CONDITION_LABELS[rule.condition_type]?.label}
                  {rule.notify_telegram && ' · 📱 Telegram'}
                </div>
              </div>
              <button onClick={() => deleteRule(rule.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#ff5252', padding: 4,
              }}><Trash2 size={13} /></button>
            </div>
            <MilestoneProgress
              steps={rule.milestone_chain?.steps || []}
              lastMilestone={rule.last_milestone || 0}
            />
          </div>
        ))}
      </div>

      {/* Alert History */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#90a4ae', marginBottom: 10 }}>RECENT ALERTS</div>
        {history.length === 0
          ? <div style={{ color: '#555', fontSize: 12 }}>No alert history yet.</div>
          : history.map(ev => <HistoryCard key={ev.id} event={ev} />)
        }
      </div>

      {/* Telegram setup */}
      <div style={{
        marginTop: 20, padding: '12px 14px',
        background: 'rgba(255,255,255,0.03)', borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>📱 Telegram Alert Setup</div>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 10 }}>
          Get alerts on Telegram for free. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in backend .env
        </div>
        <button onClick={testTelegram} style={{
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '6px 12px', color: '#e0e0e0', cursor: 'pointer', fontSize: 11,
        }}>
          Test Connection
        </button>
        {tgStatus && (
          <div style={{ marginTop: 8, fontSize: 11, color: tgStatus.ok ? '#69f0ae' : '#ff5252' }}>
            {tgStatus.ok
              ? `✓ Connected as @${tgStatus.bot_username}${tgStatus.chat_id_configured ? '' : ' — set TELEGRAM_CHAT_ID'}`
              : `✗ ${tgStatus.error}`
            }
          </div>
        )}
        <div style={{ fontSize: 10, color: '#444', marginTop: 8 }}>
          Steps: 1) /newbot on @BotFather → get token · 2) Message your bot · 3) GET /alerts/telegram/chat-id
        </div>
      </div>
    </div>
  );
}
