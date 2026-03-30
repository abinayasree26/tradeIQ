import React, { useState, useEffect, useRef } from 'react';
import { Send, X, Bot, User, Sparkles, MessageSquare, Trash2, Cpu } from 'lucide-react';
import { CONFIG } from '../config';

const AiChat = ({ isOpen, onClose, databricksData, selectedSymbol }) => {
  const [userInput, setUserInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', content: `Hi! I am your TradeIQ AI. Ask me anything about ${selectedSymbol || 'Nifty 50'}.` }
  ]);
  
  useEffect(() => {
    if (chatHistory.length === 1) {
      setChatHistory([{ role: 'assistant', content: `Hi! I am your TradeIQ AI. Ask me anything about ${selectedSymbol || 'Nifty 50'}.` }]);
    }
  }, [selectedSymbol]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const streamRef = useRef('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, isTyping]);

  const SUGGESTED_QUESTIONS = [
    "Best month in 2024?",
    "How many 500pt days?",
    "Compare Q1 vs Q4",
    "Worst single day?"
  ];

  const handleSendMessage = async (e, text = null) => {
    if (e) e.preventDefault();
    const query = text || userInput;
    if (!query.trim() || isTyping) return;

    const newUserMessage = { role: 'user', content: query };
    const updatedHistory = [...chatHistory, newUserMessage].slice(-20); // Keep last 20 messages
    setChatHistory(updatedHistory);
    setUserInput('');
    setIsTyping(true);
    streamRef.current = '';

    try {
      const response = await fetch(CONFIG.ENDPOINTS.AI_CHAT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: query,
          history: updatedHistory,
          databricksData
        })
      });

      if (!response.ok) throw new Error('AI Server error');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      const assistantMessage = { role: 'assistant', content: '' };
      setChatHistory(prev => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                streamRef.current += parsed.token;
                setChatHistory(prev => {
                  const last = prev[prev.length - 1];
                  const others = prev.slice(0, -1);
                  return [...others, { ...last, content: streamRef.current }];
                });
              }
              if (parsed.error) {
                setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${parsed.error}` }]);
              }
            } catch (e) { /* skip */ }
          }
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      setChatHistory(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error connecting to the AI." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const clearChat = () => {
    setChatHistory([{ role: 'assistant', content: 'Chat history cleared. How can I help you today?' }]);
  };

  if (!isOpen) return (
    <button className="chat-trigger" onClick={onClose}>
      <Sparkles size={24} /> <span>Ask AI</span>
    </button>
  );

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className="bot-info">
          <div className="bot-avatar"><Bot size={18} /></div>
          <div>
            <h4>TradeIQ AI</h4>
            <div className="status-row">
              <span className="pulse-dot"></span>
              <p className="status">Powered by Claude</p>
            </div>
          </div>
        </div>
        <div className="chat-actions">
          <button className="icon-action" onClick={clearChat} title="Clear Chat"><Trash2 size={16} /></button>
          <button className="close-chat" onClick={onClose}><X size={18} /></button>
        </div>
      </div>

      <div className="chat-messages">
        {chatHistory.map((msg, idx) => (
          <div key={idx} className={`message-wrap ${msg.role}`}>
            <div className="avatar-small">
              {msg.role === 'assistant' ? <Bot size={12} /> : <User size={12} />}
            </div>
            <div className="message">
              {msg.content}
            </div>
          </div>
        ))}
        {isTyping && !streamRef.current && (
          <div className="message-wrap assistant">
            <div className="avatar-small"><Bot size={12} /></div>
            <div className="message typing">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {chatHistory.length <= 1 && (
        <div className="suggested-row">
          {SUGGESTED_QUESTIONS.map((q, i) => (
            <button key={i} className="suggested-chip" onClick={() => handleSendMessage(null, q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      <form className="chat-input" onSubmit={handleSendMessage}>
        <input 
          type="text" 
          placeholder="Ask me anything..." 
          value={userInput} 
          onChange={(e) => setUserInput(e.target.value)}
        />
        <button type="submit" disabled={!userInput.trim() || isTyping}>
          <Send size={18} />
        </button>
      </form>
      <div className="chat-footer">
        <Cpu size={12} />
        <span>Claude 3.5 Sonnet Integration</span>
      </div>
    </div>
  );
};

export default AiChat;
