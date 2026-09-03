import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Send,
  Bot,
  User,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Calendar,
  Sparkles,
  AlertCircle,
  Database,
  ListChecks,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ChatMessageItem, sendChatMessage } from '../lib/api';

export const ChatView: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [extractedFields, setExtractedFields] = useState<Record<string, any>>({});
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [savedCallId, setSavedCallId] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Initialize conversation session on mount
  useEffect(() => {
    if (!workflowId) return;

    async function initChat() {
      try {
        setSending(true);
        setErrorMsg(null);
        const res = await sendChatMessage(workflowId!, '');
        setSessionId(res.sessionId);
        setMessages(res.messages || []);
        setExtractedFields(res.extractedFields || {});
        setIsCompleted(res.isCompleted || false);
      } catch (err: any) {
        console.error('Error initializing chat session:', err);
        setErrorMsg(err.message || 'Failed to initialize AI conversation');
      } finally {
        setSending(false);
      }
    }

    initChat();
  }, [workflowId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || sending || !workflowId || isCompleted) return;

    const userText = inputText.trim();
    setInputText('');
    setErrorMsg(null);

    // Optimistically add user message to UI
    const tempUserMsg: ChatMessageItem = {
      id: `temp_usr_${Date.now()}`,
      role: 'user',
      content: userText,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setSending(true);

    try {
      const res = await sendChatMessage(workflowId, userText, sessionId);
      setSessionId(res.sessionId);
      setMessages(res.messages || []);
      setExtractedFields(res.extractedFields || {});
      setIsCompleted(res.isCompleted);
      if (res.savedCallId) {
        setSavedCallId(res.savedCallId);
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      setErrorMsg(err.message || 'Failed to get response from AI engine.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-4 flex flex-col h-[calc(100vh-5rem)]">
      {/* Top Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 mb-3 flex items-center justify-between shadow-xl">
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-indigo-400" />
              AI Voice & Text Engine
            </h2>
            <p className="text-[10px] text-slate-400 font-mono">Workflow ID: {workflowId}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Drawer Toggle */}
          <button
            onClick={() => setShowDrawer(!showDrawer)}
            className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>Extracted Data ({Object.keys(extractedFields).length})</span>
            {showDrawer ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <span
            className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${
              isCompleted
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
            }`}
          >
            {isCompleted ? 'Call Completed' : 'Live Intake'}
          </span>
        </div>
      </div>

      {/* Extracted Data Checklist Drawer (Collapsible) */}
      {showDrawer && (
        <div className="mb-3 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl animate-fade-in text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Real-time Extracted Information
            </span>
            <span className="text-[10px] text-slate-400">Captured in Firestore Session</span>
          </div>

          {Object.keys(extractedFields).length === 0 ? (
            <p className="text-[11px] text-slate-500 italic py-1">
              No fields collected yet. Chat with the assistant to begin intake!
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(extractedFields).map(([key, val]) => (
                <div
                  key={key}
                  className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex items-start justify-between"
                >
                  <div>
                    <span className="text-[10px] text-slate-400 block font-mono capitalize">
                      {key.replace('_', ' ')}
                    </span>
                    <span className="text-xs font-semibold text-emerald-300">{String(val)}</span>
                  </div>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error Box */}
      {errorMsg && (
        <div className="mb-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Chat Messages Log Area */}
      <div className="flex-1 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 overflow-y-auto space-y-3.5 backdrop-blur-sm">
        {messages.map((msg) => {
          if (msg.role === 'tool') {
            return (
              <div
                key={msg.id}
                className="flex justify-center my-1"
              >
                <div className="bg-purple-950/40 border border-purple-500/30 text-purple-300 px-3 py-1.5 rounded-full text-[11px] flex items-center gap-1.5 shadow-sm">
                  <Calendar className="w-3.5 h-3.5 text-purple-400" />
                  <span>{msg.content}</span>
                </div>
              </div>
            );
          }

          const isAssistant = msg.role === 'assistant';

          return (
            <div
              key={msg.id}
              className={`flex items-start space-x-2 ${isAssistant ? 'justify-start' : 'justify-end'}`}
            >
              {isAssistant && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-md shadow-indigo-500/20">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-xs shadow-sm leading-relaxed ${
                  isAssistant
                    ? 'bg-slate-800 text-slate-100 border border-slate-700/80 rounded-tl-none'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-tr-none'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <span
                  className={`text-[9px] block mt-1 text-right ${
                    isAssistant ? 'text-slate-400' : 'text-indigo-200'
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {!isAssistant && (
                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          );
        })}

        {sending && (
          <div className="flex items-center space-x-2 text-slate-400 text-xs py-2 px-1">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span className="italic">AI Voice Engine is thinking & processing tools...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Completion Banner */}
      {isCompleted && (
        <div className="mt-3 p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl text-xs space-y-1.5 animate-fade-in">
          <div className="flex items-center justify-between text-emerald-300 font-semibold">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Intake Completed & Saved to Firestore!
            </span>
            {savedCallId && (
              <span className="text-[10px] font-mono bg-emerald-500/20 px-2 py-0.5 rounded-full text-emerald-300">
                Call ID: {savedCallId.slice(0, 10)}...
              </span>
            )}
          </div>
          <p className="text-[11px] text-emerald-400/80">
            Parent doc <code className="bg-emerald-950 px-1 py-0.5 rounded">calls/{savedCallId}</code> and subcollections <code className="bg-emerald-950 px-1 py-0.5 rounded">responses</code> & <code className="bg-emerald-950 px-1 py-0.5 rounded">transcript</code> were written to your database.
          </p>
        </div>
      )}

      {/* Message Input Form */}
      <form onSubmit={handleSendMessage} className="mt-3 flex items-center space-x-2">
        <input
          type="text"
          disabled={sending || isCompleted}
          placeholder={isCompleted ? 'Conversation completed and saved.' : 'Type your message or ask for appointment...'}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50 transition-colors"
        />
        <button
          type="submit"
          disabled={sending || isCompleted || !inputText.trim()}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 text-white p-2.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center shrink-0"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
};
