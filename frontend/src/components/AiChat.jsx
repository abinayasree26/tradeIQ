/**
 * AiChat.jsx — Claude AI Trading Assistant
 * Floating chat window with markdown-lite rendering and quick prompts.
 */
import { useState, useRef, useEffect } from 'react';
import { Send, X, Bot, User, Sparkles, RefreshCw, Zap } from 'lucide-react';
import { CONFIG } from '../config';

const SUGGESTIONS = [
  'What is the current RSI signal?',
  'Explain the MACD crossover',
  'Best stop-loss strategy for RELIANCE?',
  'What does Bollinger Band squeeze mean?',
  'Explain volume analysis for today',
];

function renderMarkdown(text) {
  // Simple markdown-lite renderer
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:rgba(99,102,241,0.15);padding:1px 5px;border-radius:4px;font-family:monospace;font-size:0.88em">$1</code>')
    .replace(/\n/g, '<br/>');
}

export default function AiChat({ isOpen, onClose, selectedSymbol, databricksData }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `👋 Hi! I'm your TradeIQ AI assistant powered by Claude.\n\nI can help you understand technical indicators, interpret signals, and explain trading concepts for **${selectedSymbol}**.\n\nWhat would you like to know?`,
    },
  ]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef         = useRef(null);
  const inputRef               = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;

    setMessages(m => [...m, { role: 'user', content: userText }]);
    setInput('');
    setLoading(true);

    // Add empty assistant message that we'll stream into
    setMessages(m => [...m, { role: 'assistant', content: '' }]);

    try {
      const contextStr = databricksData
        ? `Context for ${databricksData.symbol}: Avg Open ₹${databricksData.summary?.avg_open}, Avg Close ₹${databricksData.summary?.avg_close}.`
        : '';

      const res = await fetch(CONFIG.ENDPOINTS.AI_CHAT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message:  userText,
          symbol:   selectedSymbol,
          context:  contextStr,
          history:  messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get('content-type') || '';

      // ── SSE streaming response (Groq / Ollama / Claude) ──────────────────
      if (contentType.includes('text/event-stream')) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const token = parsed.token || parsed.delta?.content || '';
              if (token) {
                setMessages(m => {
                  const updated = [...m];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: updated[updated.length - 1].content + token,
                  };
                  return updated;
                });
              }
            } catch (_) {}
          }
        }
      } else {
        // ── Plain JSON response (Gemini REST, demo sandbox) ───────────────
        const data = await res.json();
        const reply = data.response || data.message || data.content || data.text || 'No response';
        setMessages(m => {
          const updated = [...m];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: reply };
          return updated;
        });
      }
    } catch (e) {
      setMessages(m => {
        const updated = [...m];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: `⚠️ Connection error: ${e.message}\n\nEnsure the Node proxy is running:\n\`\`\`\ncd backend-proxy && node proxy.js\n\`\`\``,
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: `Chat cleared. Ask me anything about **${selectedSymbol}** or Indian markets.`,
    }]);
  };

  if (!isOpen) return null;

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-bot-avatar">
          <Bot size={18} />
        </div>
        <div>
          <div className="chat-title">TradeIQ AI</div>
          <div className="chat-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div className="status-dot live" />
            Claude · {selectedSymbol}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={clearChat}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 5, borderRadius: 7, display: 'flex' }}
            title="Clear chat"
          >
            <RefreshCw size={14} />
          </button>
          <button className="chat-close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div style={{
              width: 26, height: 26, borderRadius: msg.role === 'user' ? 7 : 8,
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-overlay)',
              border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, color: msg.role === 'user' ? 'white' : 'var(--accent-light)',
            }}>
              {msg.role === 'user' ? <User size={13} /> : <Sparkles size={13} />}
            </div>
            <div className="chat-bubble">
              <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
            </div>
          </div>
        ))}

        {loading && messages[messages.length - 1]?.content === '' && (
          <div className="chat-message assistant">
            <div style={{
              width: 26, height: 26, borderRadius: 8,
              background: 'var(--bg-overlay)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--accent-light)', flexShrink: 0,
            }}>
              <Sparkles size={13} />
            </div>
            <div className="chat-bubble" style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border)' }}>
              <div className="typing-dots">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick suggestions (only if 1 message) */}
      {messages.length <= 1 && (
        <div className="chat-chips">
          {SUGGESTIONS.slice(0, 3).map((s, i) => (
            <button key={i} className="chat-chip" onClick={() => sendMessage(s)}>
              <Zap size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="chat-input-bar">
        <input
          ref={inputRef}
          type="text"
          placeholder={`Ask about ${selectedSymbol}…`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading}
        />
        <button
          className="chat-send"
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          title="Send (Enter)"
        >
          <Send size={15} />
        </button>
      </div>

      {/* Footer */}
      <div style={{ padding: '4px 16px 10px', fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center', letterSpacing: '0.04em' }}>
        Powered by Anthropic Claude · Not financial advice
      </div>
    </div>
  );
}
