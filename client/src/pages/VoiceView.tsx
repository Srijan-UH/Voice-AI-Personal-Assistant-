import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Mic,
  Square,
  Volume2,
  Bot,
  User,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  ListChecks,
  ChevronDown,
  ChevronUp,
  Radio,
  Send,
} from 'lucide-react';
import { ChatMessageItem, sendChatMessage, sendVoiceMessage } from '../lib/api';

export const VoiceView: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [extractedFields, setExtractedFields] = useState<Record<string, any>>({});
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [savedCallId, setSavedCallId] = useState<string | undefined>(undefined);
  const [textInput, setTextInput] = useState<string>('');

  // Recording & Voice States
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Tap Mic to Speak');
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const [micVolume, setMicVolume] = useState<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const capturedTextRef = useRef<string>('');
  const animFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Initialize session on mount
  useEffect(() => {
    if (!workflowId) return;

    async function initVoiceSession() {
      try {
        setIsProcessing(true);
        setStatusText('Initializing Assistant...');
        const res = await sendChatMessage(workflowId!, '');
        setSessionId(res.sessionId);
        setMessages(res.messages || []);
        setExtractedFields(res.extractedFields || {});
        setIsCompleted(res.isCompleted || false);
        setStatusText('Tap Mic to Speak');

        if (res.reply) {
          speakBrowserTTS(res.reply);
        }
      } catch (err: any) {
        console.error('Error initializing voice session:', err);
        setErrorMsg(err.message || 'Failed to initialize voice session');
        setStatusText('Session Failed');
      } finally {
        setIsProcessing(false);
      }
    }

    initVoiceSession();
  }, [workflowId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  // Clean up audio context on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, []);

  // Start microphone recording & volume meter
  const startRecording = async () => {
    if (isProcessing || isCompleted) return;
    setErrorMsg(null);
    audioChunksRef.current = [];
    capturedTextRef.current = '';
    setLiveTranscript('');
    setMicVolume(0);

    // Cancel active TTS playback
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    try {
      // 1. Get user microphone stream first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 2. Setup Audio Visualizer Analyser Node
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateVolume = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setMicVolume(Math.min(100, Math.round((avg / 128) * 100)));
          animFrameRef.current = requestAnimationFrame(updateVolume);
        };
        updateVolume();
      } catch (e) {
        console.warn('AudioContext volume meter initialization failed:', e);
      }

      // 3. Start Web Speech Recognition if supported
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognitionRef.current = recognition;
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = workflowId?.includes('hindi') ? 'hi-IN' : 'en-US';

          recognition.onresult = (event: any) => {
            let fullText = '';
            for (let i = 0; i < event.results.length; i++) {
              fullText += event.results[i][0].transcript + ' ';
            }
            const cleanText = fullText.trim();
            if (cleanText) {
              setLiveTranscript(cleanText);
              capturedTextRef.current = cleanText;
            }
          };

          recognition.onerror = (e: any) => {
            console.warn('[Web Speech API] Error:', e.error);
          };

          recognition.start();
        } catch (e) {
          console.warn('SpeechRecognition failed:', e);
        }
      }

      // 4. Setup MediaRecorder with supported MIME type & 250ms timeslice
      let options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' };
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/webm' };
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop volume visualizer & audio tracks
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());

        const finalMime = options.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: finalMime });
        await handleProcessVoiceInput(audioBlob, capturedTextRef.current);
      };

      mediaRecorder.start(250); // timeslice 250ms
      setIsRecording(true);
      setStatusText('Listening... Speak now!');
    } catch (err: any) {
      console.error('Microphone recording error:', err);
      setErrorMsg('Microphone access denied. Please click "Allow" on browser microphone prompt.');
      setStatusText('Microphone Access Blocked');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatusText('Processing...');
    }
  };

  // Process Voice Input (Text or Blob)
  const handleProcessVoiceInput = async (audioBlob: Blob, recognizedText?: string) => {
    if (!workflowId) return;

    setIsProcessing(true);
    setStatusText('Processing AI response...');

    const inaudibleMsg = 'Sorry for the inconvenience. We could not hear your audio clearly. You can tap the mic to retry or continue in chat below.';

    try {
      let res;
      // 1. If Web Speech API captured text locally, send chat message directly
      if (recognizedText && recognizedText.trim().length > 0) {
        res = await sendChatMessage(workflowId, recognizedText.trim(), sessionId);
      } else if (audioBlob && audioBlob.size > 200) {
        // 2. Fallback: send recorded audio blob to server STT endpoint
        try {
          res = await sendVoiceMessage(workflowId, audioBlob, sessionId);
        } catch (sttErr: any) {
          console.warn('Voice Blob STT failed:', sttErr.message);
          setErrorMsg(inaudibleMsg);
          speakBrowserTTS(inaudibleMsg);
          setStatusText('Tap Mic to Retry or Use Chat');
          setIsProcessing(false);
          return;
        }
      } else {
        // No speech detected
        setErrorMsg(inaudibleMsg);
        speakBrowserTTS(inaudibleMsg);
        setStatusText('Tap Mic to Retry or Use Chat');
        setIsProcessing(false);
        return;
      }

      setSessionId(res.sessionId);
      setMessages(res.messages || []);
      setExtractedFields(res.extractedFields || {});
      setIsCompleted(res.isCompleted || false);
      if (res.savedCallId) setSavedCallId(res.savedCallId);

      setLiveTranscript('');

      // Playback response audio or browser TTS fallback
      if (res.audioBase64) {
        playAudioResponse(res.audioBase64);
      } else if (res.reply) {
        speakBrowserTTS(res.reply);
      } else {
        setStatusText(res.isCompleted ? 'Call Completed' : 'Tap Mic to Speak');
      }
    } catch (err: any) {
      console.error('Error processing voice message:', err);
      setErrorMsg(inaudibleMsg);
      speakBrowserTTS(inaudibleMsg);
      setStatusText('Tap Mic to Retry or Use Chat');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Manual Text Send Fallback
  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || isProcessing || isCompleted || !workflowId) return;

    const msg = textInput.trim();
    setTextInput('');
    setIsProcessing(true);
    setStatusText('Processing...');
    setErrorMsg(null);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    try {
      const res = await sendChatMessage(workflowId, msg, sessionId);
      setSessionId(res.sessionId);
      setMessages(res.messages || []);
      setExtractedFields(res.extractedFields || {});
      setIsCompleted(res.isCompleted || false);
      if (res.savedCallId) setSavedCallId(res.savedCallId);

      if (res.reply) {
        speakBrowserTTS(res.reply);
      } else {
        setStatusText(res.isCompleted ? 'Call Completed' : 'Tap Mic to Speak');
      }
    } catch (err: any) {
      console.error('Error sending text:', err);
      setErrorMsg(err.message || 'Failed to send message.');
      setStatusText('Tap Mic to Retry');
    } finally {
      setIsProcessing(false);
    }
  };

  // Play ElevenLabs audio response
  const playAudioResponse = (audioBase64: string) => {
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }

      const audio = new Audio(audioBase64);
      currentAudioRef.current = audio;
      setIsPlayingAudio(true);
      setStatusText('Speaking...');

      audio.onended = () => {
        setIsPlayingAudio(false);
        setStatusText(isCompleted ? 'Call Completed' : 'Tap Mic to Speak');
      };

      audio.onerror = () => {
        setIsPlayingAudio(false);
        setStatusText('Tap Mic to Speak');
      };

      audio.play().catch((err) => {
        console.warn('Audio autoplay prevented:', err);
        setIsPlayingAudio(false);
        setStatusText('Tap Mic to Speak');
      });
    } catch (err) {
      console.error('Audio playback exception:', err);
      setIsPlayingAudio(false);
    }
  };

  // Browser Speech Synthesis Fallback
  const speakBrowserTTS = (text: string) => {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.lang = workflowId?.includes('hindi') ? 'hi-IN' : 'en-US';

        utterance.onstart = () => {
          setIsPlayingAudio(true);
          setStatusText('Speaking...');
        };
        utterance.onend = () => {
          setIsPlayingAudio(false);
          setStatusText(isCompleted ? 'Call Completed' : 'Tap Mic to Speak');
        };
        utterance.onerror = () => {
          setIsPlayingAudio(false);
          setStatusText(isCompleted ? 'Call Completed' : 'Tap Mic to Speak');
        };
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.warn('Browser speech synthesis error:', err);
      setIsPlayingAudio(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-4 flex flex-col h-[calc(100vh-5rem)]">
      {/* Top Header Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 mb-3 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
              Voice AI Assistant
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Real-Time Voice Intake & Booking
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowDrawer(!showDrawer)}
          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 border border-slate-200"
        >
          <ListChecks className="w-4 h-4 text-indigo-600" />
          Extracted ({Object.keys(extractedFields).length})
          {showDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Extracted Fields Drawer */}
      {showDrawer && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-3 shadow-lg animate-fade-in space-y-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Extracted Lead Fields
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Auto-extracted by AI</span>
          </div>

          {Object.keys(extractedFields).length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">
              No information collected yet. Speak to the assistant to start intake.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {Object.entries(extractedFields).map(([key, val]) => (
                <div key={key} className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">{key}</span>
                  <span className="font-semibold text-slate-900 block truncate">{String(val)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Polite Error / Inaudible Alert Banner */}
      {errorMsg && (
        <div className="p-3.5 mb-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span className="font-semibold leading-relaxed">{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="font-bold text-amber-800 text-[10px] shrink-0 ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Live Speech Recognition Box */}
      {isRecording && (
        <div className="p-3 mb-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs space-y-2 shadow-sm animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="font-bold text-indigo-700 flex items-center gap-1.5">
              <Mic className="w-4 h-4 text-rose-600 animate-pulse" />
              Microphone Active — Listening
            </span>
            {/* Audio Wave Volume Visualizer Bars */}
            <div className="flex items-end gap-1 h-4">
              <div
                className="w-1 bg-indigo-600 rounded-full transition-all duration-75"
                style={{ height: `${Math.max(20, micVolume * 0.8)}%` }}
              ></div>
              <div
                className="w-1 bg-indigo-600 rounded-full transition-all duration-75"
                style={{ height: `${Math.max(30, micVolume * 1.2)}%` }}
              ></div>
              <div
                className="w-1 bg-indigo-600 rounded-full transition-all duration-75"
                style={{ height: `${Math.max(15, micVolume * 0.6)}%` }}
              ></div>
            </div>
          </div>

          {liveTranscript ? (
            <p className="text-xs font-semibold text-indigo-900 italic bg-white/80 p-2 rounded-xl border border-indigo-100">
              "{liveTranscript}"
            </p>
          ) : (
            <p className="text-[11px] text-indigo-500 italic">
              Say your request aloud into your microphone...
            </p>
          )}
        </div>
      )}

      {/* Chat Messages Log */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4 rounded-3xl bg-slate-50 border border-slate-200 mb-3 shadow-inner">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 space-y-2">
            <Bot className="w-10 h-10 text-slate-300 animate-bounce" />
            <p className="text-xs font-medium">Connecting to Voice AI Assistant...</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isTool = msg.role === 'tool';

            if (isTool) {
              return (
                <div key={msg.id} className="flex justify-center my-2">
                  <div className="px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold flex items-center gap-1.5 shadow-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    {msg.content}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm ${
                    isUser ? 'bg-indigo-600' : 'bg-slate-900'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div
                  className={`max-w-[80%] p-3.5 rounded-2xl text-xs sm:text-sm font-medium leading-relaxed shadow-sm ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-white text-slate-900 border border-slate-200 rounded-tl-none'
                  }`}
                >
                  <p>{msg.content}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Completion Banner */}
      {isCompleted && (
        <div className="p-4 mb-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between shadow-md">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                Call Intake Completed
              </h4>
              <p className="text-xs text-emerald-700">All required fields collected & logged in Firestore.</p>
            </div>
          </div>
          {savedCallId && (
            <button
              onClick={() => navigate('/calls')}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm"
            >
              View Call Log
            </button>
          )}
        </div>
      )}

      {/* Main Microphone Action Controls */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xl space-y-3">
        {/* Status Pill */}
        <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-700">
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Processing...</span>
            </>
          ) : isPlayingAudio ? (
            <>
              <Volume2 className="w-4 h-4 text-emerald-600 animate-pulse" />
              <span className="text-emerald-700">Speaking...</span>
            </>
          ) : isRecording ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
              </span>
              <span className="text-rose-600 font-bold">{statusText}</span>
            </>
          ) : (
            <span className="text-slate-600">{statusText}</span>
          )}
        </div>

        {/* Big Pulsing Mic Button with Dynamic Volume Ring */}
        <div className="flex justify-center pt-1">
          {isRecording ? (
            <button
              onClick={stopRecording}
              style={{
                boxShadow: `0 0 ${15 + micVolume * 0.4}px rgba(225, 29, 72, ${0.4 + micVolume * 0.006})`,
                transform: `scale(${1 + micVolume * 0.002})`,
              }}
              className="w-20 h-20 rounded-full bg-gradient-to-tr from-rose-600 to-red-500 text-white flex items-center justify-center shadow-xl transition-all"
            >
              <Square className="w-8 h-8" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={isProcessing || isCompleted}
              className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 via-purple-600 to-rose-600 hover:scale-105 text-white flex items-center justify-center shadow-xl glow-indigo transition-all active:scale-95 disabled:opacity-40"
            >
              <Mic className="w-9 h-9" />
            </button>
          )}
        </div>

        {/* Text Input Fallback */}
        <form onSubmit={handleSendText} className="flex gap-2 pt-2 border-t border-slate-100">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={isProcessing || isCompleted}
            placeholder="Type a message or response..."
            className="flex-1 glass-input px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!textInput.trim() || isProcessing || isCompleted}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md disabled:opacity-40 transition-all flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
