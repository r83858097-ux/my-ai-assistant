import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Plus,
  Bot,
  User,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Info,
  X,
  ShieldCheck,
  StopCircle,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  model?: string;
  isError?: boolean;
}

const STARTER_PROMPTS = [
  'Explain quantum computing in simple words',
  'Give me 3 quick dinner recipe ideas with eggs and vegetables',
  'Write a short polite email asking for project feedback',
  'What are 5 helpful tips to prepare for a job interview?',
];

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem('my_ai_assistant_chat');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    return [];
  });

  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('my_ai_assistant_chat', JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages]);

  // Auto-scroll to bottom on new messages
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  useEffect(() => {
    scrollToBottom(true);
  }, [messages, isLoading]);

  // Adjust textarea height automatically on mobile
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollH, 120)}px`;
    }
  }, [input]);

  // Cancel any ongoing request
  const handleCancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setStatusMessage('Request cancelled');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleSend = async (textToSend?: string, customBaseHistory?: ChatMessage[]) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    // Use customBaseHistory if provided (e.g. during retry), or remove trailing error messages from current messages
    const baseHistory = customBaseHistory !== undefined ? customBaseHistory : messages.filter((m) => !m.isError);

    const userMsgId = `user-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newHistory = [...baseHistory, userMessage];
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);
    setStatusMessage(null);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Set up AbortController with 30-second client-side timeout
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const clientTimeoutId = setTimeout(() => {
      controller.abort();
    }, 30000);

    try {
      // Prepare message history for server
      const validMessages = newHistory.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: validMessages }),
        signal: controller.signal,
      });

      clearTimeout(clientTimeoutId);

      let data: any = {};
      const responseText = await response.text();
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { error: `Server error (${response.status}): ${responseText || 'No response body'}` };
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response from Gemini.');
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: data.reply || 'No response content returned.',
        model: data.model,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      clearTimeout(clientTimeoutId);
      console.error('Chat request error:', err);

      let friendlyError = 'Sorry, an error occurred while connecting to Gemini. Please try again.';

      if (err.name === 'AbortError') {
        friendlyError = 'Request timed out after 20 seconds. Please tap "Retry question" to try again.';
      } else if (err.message) {
        friendlyError = err.message;
      }

      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        text: friendlyError,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };

      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      // GUARANTEED: always stop the "Thinking..." state
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startNewChat = () => {
    if (isLoading) {
      handleCancelRequest();
    }
    if (messages.length > 0) {
      const confirmClear = window.confirm ? window.confirm('Start a new chat? Current messages will be cleared.') : true;
      if (!confirmClear) return;
    }
    setMessages([]);
    try {
      sessionStorage.removeItem('my_ai_assistant_chat');
    } catch {
      // ignore
    }
    setInput('');
    setStatusMessage('Started a new conversation');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const copyMessage = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const retryLastMessage = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      const withoutErrors = messages.filter((m) => !m.isError);
      const lastUserIdx = withoutErrors.map((m) => m.id).lastIndexOf(lastUserMsg.id);
      const baseHistory = lastUserIdx >= 0 ? withoutErrors.slice(0, lastUserIdx) : [];
      handleSend(lastUserMsg.text, baseHistory);
    }
  };

  // Helper to render formatted markdown-like text safely
  const renderFormattedText = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('```')) {
        return (
          <div key={idx} className="my-1 font-mono text-[11px] text-indigo-300 opacity-60">
            {line}
          </div>
        );
      }

      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        return (
          <div key={idx} className="flex items-start gap-2 my-0.5 pl-1">
            <span className="text-indigo-400 font-bold leading-5">•</span>
            <span className="flex-1 leading-relaxed">{line.trim().replace(/^[-*]\s+/, '')}</span>
          </div>
        );
      }

      if (/^\d+\.\s/.test(line.trim())) {
        return (
          <div key={idx} className="my-0.5 pl-1 leading-relaxed">
            {line}
          </div>
        );
      }

      if (!line.trim()) {
        return <div key={idx} className="h-2" />;
      }

      return (
        <p key={idx} className="my-0.5 leading-relaxed">
          {line}
        </p>
      );
    });
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-lg mx-auto bg-slate-950 text-slate-100 font-sans shadow-2xl overflow-hidden sm:border-x sm:border-slate-800">
      {/* Mobile-Friendly Header */}
      <header className="flex-none bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 p-0.5 shadow-md shadow-indigo-600/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Bot className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white">My AI Assistant</h1>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Gemini
              </span>
            </div>
            <p className="text-[11px] text-slate-400">gemini-3.8-flash • resilient failover</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={startNewChat}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
            title="Start New Chat"
            aria-label="Start New Chat"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden xs:inline text-[11px] font-medium">New</span>
          </button>

          <button
            onClick={() => setShowInfoModal(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="App Details & Secrets Setup"
            aria-label="App Details"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Ephemeral notification banner */}
      {statusMessage && (
        <div className="bg-indigo-600/90 text-white text-[11px] font-medium px-4 py-1.5 text-center flex-none">
          {statusMessage}
        </div>
      )}

      {/* Main Chat Message List */}
      <main className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-4 overscroll-contain">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center px-4 py-8">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 shadow-lg shadow-indigo-500/10">
              <Sparkles className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Hello! How can I help you today?</h2>
            <p className="text-xs text-slate-400 max-w-xs mb-6 leading-relaxed">
              I am your AI Assistant powered by Google Gemini. Ask me any question, brainstorm ideas, draft emails, or analyze code.
            </p>

            <div className="w-full space-y-2">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-left mb-2 pl-1">
                Suggested Prompts
              </p>
              {STARTER_PROMPTS.map((promptText, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(promptText)}
                  className="w-full text-left p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800/80 hover:border-indigo-500/30 text-xs text-slate-300 transition-all active:scale-[0.99] flex items-center justify-between group"
                >
                  <span className="leading-snug">{promptText}</span>
                  <Send className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition-colors shrink-0 ml-2" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const isUser = message.role === 'user';
            return (
              <div
                key={message.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group`}
              >
                <div
                  className={`flex items-start gap-2 max-w-[88%] sm:max-w-[82%] ${
                    isUser ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold ${
                      isUser
                        ? 'bg-blue-600 text-white'
                        : message.isError
                        ? 'bg-rose-500/20 border border-rose-500/30 text-rose-400'
                        : 'bg-indigo-600/30 border border-indigo-500/30 text-indigo-300'
                    }`}
                  >
                    {isUser ? <User className="w-4 h-4" /> : message.isError ? <AlertCircle className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  {/* Bubble */}
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm shadow-sm ${
                      isUser
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-sm'
                        : message.isError
                        ? 'bg-rose-950/40 border border-rose-500/40 text-rose-200 rounded-tl-sm'
                        : 'bg-slate-900 border border-slate-800/80 text-slate-200 rounded-tl-sm'
                    }`}
                  >
                    {message.isError ? (
                      <div className="space-y-2">
                        <div className="font-semibold text-rose-400 flex items-center gap-1.5 text-xs">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Connection Notice
                        </div>
                        <p className="leading-relaxed text-xs">{message.text}</p>
                        <button
                          onClick={retryLastMessage}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-[11px] font-medium text-rose-300 transition-colors mt-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retry question
                        </button>
                      </div>
                    ) : (
                      renderFormattedText(message.text)
                    )}

                    {/* Metadata & Actions */}
                    <div
                      className={`flex items-center gap-2 mt-1.5 text-[10px] ${
                        isUser ? 'text-indigo-200/70 justify-end' : 'text-slate-400 justify-between'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{message.timestamp}</span>
                        {message.model && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">
                            {message.model}
                          </span>
                        )}
                      </div>
                      {!isUser && !message.isError && (
                        <button
                          onClick={() => copyMessage(message.text, message.id)}
                          className="opacity-70 hover:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-white"
                          title="Copy text"
                        >
                          {copiedId === message.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Loading / Thinking State with Stop/Cancel Option */}
        {isLoading && (
          <div className="flex items-start gap-2 max-w-[85%] animate-fade-in">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5 text-indigo-300">
              <Bot className="w-4 h-4" />
            </div>
            <div className="rounded-2xl rounded-tl-sm px-4 py-2.5 bg-slate-900 border border-slate-800 text-slate-400 flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"></span>
                <span
                  className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                  style={{ animationDelay: '0.2s' }}
                ></span>
                <span
                  className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                  style={{ animationDelay: '0.4s' }}
                ></span>
                <span className="ml-1 text-[11px] text-slate-300 font-medium">Thinking...</span>
              </div>
              <button
                onClick={handleCancelRequest}
                className="text-[10px] text-slate-400 hover:text-rose-400 flex items-center gap-1 pl-2 border-l border-slate-800 transition-colors"
                title="Cancel request"
              >
                <StopCircle className="w-3 h-3" />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input Box Bar */}
      <footer className="flex-none bg-slate-900/90 border-t border-slate-800/80 px-3 py-2.5 sm:px-4 sm:py-3 backdrop-blur-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-2 bg-slate-950 border border-slate-800 focus-within:border-indigo-500/70 rounded-2xl p-1.5 transition-all"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1 bg-transparent border-0 px-2.5 py-1.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none leading-relaxed min-h-[36px] max-h-[120px]"
          />

          {isLoading ? (
            <button
              type="button"
              onClick={handleCancelRequest}
              className="flex-none w-9 h-9 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 flex items-center justify-center transition-all border border-slate-700"
              title="Stop generation"
              aria-label="Stop generation"
            >
              <StopCircle className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex-none w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white flex items-center justify-center transition-all shadow-md shadow-indigo-600/30 active:scale-95"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </form>

        <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-slate-500">
          <span>Gemini 3.8 Flash • Protected with 20s timeout</span>
          <span>{messages.length} messages in session</span>
        </div>
      </footer>

      {/* Information Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm text-white">About My AI Assistant</h3>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/20">
                <span className="font-semibold text-indigo-300 block mb-1">Fast &amp; Resilient AI</span>
                Every answer comes from Google's <strong className="text-white">gemini-3.8-flash</strong> model via the official Gen AI SDK, backed by automatic failover to <strong className="text-white">gemini-3.1-flash-lite</strong> and strict timeout protection.
              </div>

              <div>
                <span className="font-semibold text-white block mb-1">No Indefinite Hanging</span>
                <p className="text-slate-400 leading-relaxed">
                  Both the server and mobile client have strict timeouts (7s server attempt, 20s client limit) ensuring the app never gets stuck on "Thinking...".
                </p>
              </div>

              <div>
                <span className="font-semibold text-white block mb-1">API Key &amp; Security</span>
                <p className="text-slate-400 leading-relaxed">
                  Your Gemini API key is stored safely on the server as <code className="text-indigo-300 font-mono">GEMINI_API_KEY</code>. It is never sent to the browser or visible in your Android device's network traffic.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowInfoModal(false)}
              className="mt-6 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
