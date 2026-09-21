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
  PauseCircle,
  Play,
  RotateCcw,
  Zap,
  Sliders,
  VolumeX,
  RefreshCw,
  Activity,
  Terminal,
} from 'lucide-react';
import { ChatMessageItem, sendChatMessage, sendVoiceMessage, checkServerHealth } from '../lib/api';
import { normalizeForSpeech, chunkTextForSpeech } from '../lib/speechNormalizer';

// ──────────────────────────────────────────────────────────────
// VAD & Barge-In tuning constants — tweak these without touching logic
// ──────────────────────────────────────────────────────────────
/** Volume % (0-100) above which we consider the user as speaking during idle listening. */
const VAD_SPEECH_THRESHOLD = 20;
/** Volume % (0-100) needed to trigger barge-in during AI speech (higher to reject speaker feedback). */
const BARGE_IN_SPEECH_THRESHOLD = 50;
/** Milliseconds of silence after speech before auto-submitting the turn. */
const VAD_SILENCE_MS = 2000;
/** Milliseconds of speech detected while agent is playing before barge-in triggers. */
const BARGE_IN_DETECT_MS = 300;
/** Safety cap: auto-submit after this many ms even if VAD never fires. */
const MAX_TURN_MS = 10000;
/** Enable verbose diagnostic logs */
const DEBUG_VOICE = true;

export interface VoiceDiagnosticLog {
  id: string;
  time: string;
  text: string;
  type: 'info' | 'start' | 'end' | 'error' | 'boundary';
  details?: string;
}

export const VoiceView: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const sessionIdRef = useRef<string | undefined>(undefined);

  const updateSessionId = (newId: string | undefined) => {
    sessionIdRef.current = newId;
    setSessionId(newId);
  };
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [extractedFields, setExtractedFields] = useState<Record<string, any>>({});
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [closingMessage, setClosingMessage] = useState<string>('');
  const [savedCallId, setSavedCallId] = useState<string | undefined>(undefined);
  const [textInput, setTextInput] = useState<string>('');

  // Continuous Session & Voice States
  const [isContinuousMode, setIsContinuousMode] = useState<boolean>(true);
  const [isSessionActive, setIsSessionActive] = useState<boolean>(true);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Initializing Assistant...');
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const [micVolume, setMicVolume] = useState<number>(0);

  // Dev Voice Test & Settings Panel States
  const [showVoiceTester, setShowVoiceTester] = useState<boolean>(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [speechRate, setSpeechRate] = useState<number>(0.98);
  const [speechPitch, setSpeechPitch] = useState<number>(1.0);
  const [serverVoiceMode, setServerVoiceMode] = useState<'browser' | 'sarvam-static' | 'sarvam'>('browser');
  const [testCustomText, setTestCustomText] = useState<string>('');
  const [voiceLogs, setVoiceLogs] = useState<VoiceDiagnosticLog[]>([]);

  useEffect(() => {
    checkServerHealth()
      .then((h) => {
        if (h.voiceMode) setServerVoiceMode(h.voiceMode);
      })
      .catch(() => {});
  }, []);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const capturedTextRef = useRef<string>('');
  const animFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  // AbortController to cancel in-flight fetch on barge-in
  const abortControllerRef = useRef<AbortController | null>(null);
  // Separate analyser for barge-in monitoring while agent is speaking
  const bargeInAnalyserRef = useRef<AnalyserNode | null>(null);
  const bargeInStreamRef = useRef<MediaStream | null>(null);
  const bargeInFrameRef = useRef<number | null>(null);
  const bargeInStartTimeRef = useRef<number | null>(null);

  // Garbage collection protection & speech chunk queue refs
  const activeUtterancesRef = useRef<SpeechSynthesisUtterance[]>([]);
  const speechQueueRef = useRef<string[]>([]);
  const currentSpeakingTextRef = useRef<string>('');
  const hasInitializedRef = useRef<boolean>(false);

  // Sync state refs to prevent stale closure issues in async audio/speech callbacks
  const isContinuousModeRef = useRef<boolean>(true);
  const isSessionActiveRef = useRef<boolean>(true);
  const isCompletedRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const isRecordingRef = useRef<boolean>(false);
  const isPlayingAudioRef = useRef<boolean>(false);

  // Voice Activity Detection (VAD) & silence auto-submit tracking refs
  const hasSpokenRef = useRef<boolean>(false);
  const lastSpeechTimeRef = useRef<number>(Date.now());
  const isStoppingRef = useRef<boolean>(false);
  const hasSubmittedTurnRef = useRef<boolean>(false);

  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoListenDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isContinuousModeRef.current = isContinuousMode;
  }, [isContinuousMode]);

  useEffect(() => {
    isSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);

  useEffect(() => {
    isCompletedRef.current = isCompleted;
  }, [isCompleted]);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isPlayingAudioRef.current = isPlayingAudio;
  }, [isPlayingAudio]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Logging helper for speech events & diagnostics
  const addVoiceLog = (
    text: string,
    type: 'info' | 'start' | 'end' | 'error' | 'boundary',
    details?: string
  ) => {
    const timeStr = new Date().toLocaleTimeString();
    if (DEBUG_VOICE) {
      console.log(
        `[Voice ${type.toUpperCase()}] ${timeStr} | "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`,
        details ? `-> ${details}` : ''
      );
    }
    setVoiceLogs((prev) => [
      { id: Math.random().toString(36).substring(2, 9), time: timeStr, text, type, details },
      ...prev.slice(0, 49),
    ]);
  };

  // Safely cancels any ongoing synthesis, empties queues, and cleans up references
  const cancelAllSpeech = () => {
    speechQueueRef.current = [];
    activeUtterancesRef.current = [];
    currentSpeakingTextRef.current = '';
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = '';
    }
    stopBargeInMonitor();
    setIsPlayingAudio(false);
    isPlayingAudioRef.current = false;
  };

  // Detect speaker echo in speech recognition
  const isEchoOfAssistant = (transcript: string) => {
    if (!isPlayingAudioRef.current || !currentSpeakingTextRef.current) return false;
    const cleanT = transcript.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanA = currentSpeakingTextRef.current.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanT.length > 5 && (cleanA.includes(cleanT) || cleanT.includes(cleanA));
  };

  // Populate available browser voices on mount or voiceschanged
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;
      setAvailableVoices(voices);

      setSelectedVoiceURI((prev) => {
        if (prev && voices.some((v) => v.voiceURI === prev)) return prev;

        // Preferred voice priority:
        // 1. Indian English voice (en-IN)
        const enIn = voices.find(
          (v) =>
            v.lang.replace('_', '-').toLowerCase() === 'en-in' ||
            (v.lang.toLowerCase().startsWith('en') && v.name.toLowerCase().includes('india'))
        );
        if (enIn) return enIn.voiceURI;

        // 2. High-quality / natural English voice
        const naturalEn = voices.find(
          (v) =>
            v.lang.toLowerCase().startsWith('en') &&
            (v.name.toLowerCase().includes('natural') ||
              v.name.toLowerCase().includes('google') ||
              v.name.toLowerCase().includes('premium'))
        );
        if (naturalEn) return naturalEn.voiceURI;

        // 3. Any English voice
        const anyEn = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
        if (anyEn) return anyEn.voiceURI;

        return voices[0]?.voiceURI || '';
      });
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Clean up audio context, active speech & timers on unmount
  useEffect(() => {
    return () => {
      cancelAllSpeech();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (bargeInFrameRef.current) cancelAnimationFrame(bargeInFrameRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (autoListenDelayRef.current) clearTimeout(autoListenDelayRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (bargeInStreamRef.current) bargeInStreamRef.current.getTracks().forEach((t) => t.stop());
      abortControllerRef.current?.abort();
    };
  }, []);

  // Initialize session on mount (guarded against React StrictMode double invocation)
  useEffect(() => {
    if (!workflowId) return;
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    async function initVoiceSession() {
      try {
        setIsProcessing(true);
        setStatusText('Initializing Assistant...');
        setIsSessionActive(true);
        isSessionActiveRef.current = true;

        const res = await sendChatMessage(workflowId!, '', sessionIdRef.current);
        updateSessionId(res.sessionId);
        setMessages(res.messages || []);
        setExtractedFields(res.extractedFields || {});
        const completed = res.isCompleted || false;
        setIsCompleted(completed);
        isCompletedRef.current = completed;
        if (res.closingMessage) setClosingMessage(res.closingMessage);

        if (completed) {
          setStatusText('Call Session Completed');
        } else if (res.audioBase64) {
          playAudioResponse(res.audioBase64);
        } else if (res.reply) {
          speakBrowserTTS(res.reply);
        } else {
          triggerAutoListen();
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

  // Auto-listening trigger function called after TTS completes
  const triggerAutoListen = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (autoListenDelayRef.current) clearTimeout(autoListenDelayRef.current);

    if (isCompletedRef.current) {
      setIsSessionActive(false);
      isSessionActiveRef.current = false;
      setStatusText('Call Session Completed');
      return;
    }

    if (isContinuousModeRef.current && isSessionActiveRef.current) {
      setStatusText('Listening... Speak your answer anytime');
      autoListenDelayRef.current = setTimeout(() => {
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) return;
        if (isPlayingAudioRef.current) return;
        startRecording();
      }, 500);
    } else {
      setStatusText('Tap Mic to Speak');
    }
  };

  const maxTurnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single-flight turn submitter — prefers locally recognized transcript (zero latency, zero cost)
  const submitTurn = (audioBlob: Blob) => {
    if (hasSubmittedTurnRef.current) return;
    hasSubmittedTurnRef.current = true;

    const transcript = capturedTextRef.current.trim();
    if (transcript) {
      console.log('[VoiceView] Submitting recognized speech transcript to /conversations endpoint:', transcript);
      handleProcessTextInput(transcript);
      return;
    }

    console.log('[VoiceView] Submitting audio turn to /voice endpoint...');
    handleProcessVoiceInput(audioBlob);
  };

  // ────────────────────────────────────────────────────────────
  // Barge-in: Disabled volume-based auto-monitoring during AI speech
  // to prevent computer speakers from cutting off the assistant's voice.
  // Manual tap-to-speak or interrupt button remains available.
  // ────────────────────────────────────────────────────────────
  const startBargeInMonitor = async () => {
    // No-op: prevents speaker feedback from interrupting agent speech
    return;
  };

  const stopBargeInMonitor = () => {
    if (bargeInFrameRef.current) cancelAnimationFrame(bargeInFrameRef.current);
    bargeInFrameRef.current = null;
    bargeInStartTimeRef.current = null;
    if (bargeInStreamRef.current) {
      bargeInStreamRef.current.getTracks().forEach((t) => t.stop());
      bargeInStreamRef.current = null;
    }
    bargeInAnalyserRef.current = null;
  };

  const handleBargeIn = () => {
    // 1. Stop agent audio, empty queue, and clear utterance refs
    cancelAllSpeech();

    // 2. Cancel any in-flight server request
    abortControllerRef.current?.abort();

    // 3. Mark last assistant message as interrupted
    setMessages((prev) => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === 'assistant') {
          updated[i] = { ...updated[i], content: updated[i].content + ' [interrupted]' };
          break;
        }
      }
      return updated;
    });

    // 4. Stop barge-in monitor and resume listening
    stopBargeInMonitor();
    setIsPlayingAudio(false);
    isPlayingAudioRef.current = false;
    triggerAutoListen();
  };

  // Stop recording & auto-submit turn (always sends audio blob)
  const stopRecording = () => {
    if (isStoppingRef.current || hasSubmittedTurnRef.current) return;
    isStoppingRef.current = true;

    console.log('[VoiceView] Stopping recording and submitting audio...');

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (autoListenDelayRef.current) clearTimeout(autoListenDelayRef.current);
    if (maxTurnTimerRef.current) clearTimeout(maxTurnTimerRef.current);

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }

    setIsRecording(false);
    isRecordingRef.current = false;
    setStatusText('Processing AI response...');

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop(); // onstop handler calls submitTurn
      } catch {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        submitTurn(audioBlob);
      }
    } else {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      submitTurn(audioBlob);
    }
  };

  // Start microphone recording & audio visualizer
  const startRecording = async () => {
    if (isProcessingRef.current || isCompletedRef.current) return;
    setErrorMsg(null);
    audioChunksRef.current = [];
    capturedTextRef.current = '';
    setLiveTranscript('');
    setMicVolume(0);

    setIsSessionActive(true);
    isSessionActiveRef.current = true;
    setIsRecording(true);
    isRecordingRef.current = true;

    // Reset VAD & silence auto-submit flags
    hasSpokenRef.current = false;
    lastSpeechTimeRef.current = Date.now();
    isStoppingRef.current = false;
    hasSubmittedTurnRef.current = false;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (autoListenDelayRef.current) clearTimeout(autoListenDelayRef.current);
    if (maxTurnTimerRef.current) clearTimeout(maxTurnTimerRef.current);

    // Cancel active TTS playback
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }

    // Safety fallback: auto-submit after MAX_TURN_MS
    maxTurnTimerRef.current = setTimeout(() => {
      if (hasSpokenRef.current && !isStoppingRef.current) {
        console.log(`[Max Turn Timer] ${MAX_TURN_MS}ms auto-cap. Auto-submitting...`);
        stopRecording();
      }
    }, MAX_TURN_MS);

    try {
      // 1. Get user microphone stream with enhanced audio settings
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // 2. Setup Audio Visualizer Analyser Node & VAD Silence Monitor
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioCtx;
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {});
        }

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateVolume = () => {
          if (isStoppingRef.current || hasSubmittedTurnRef.current) return;
          analyser.getByteFrequencyData(dataArray);

          let maxVal = 0;
          for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i] > maxVal) maxVal = dataArray[i];
          }
          const vol = Math.min(100, Math.round((maxVal / 255) * 100));
          setMicVolume(vol);

          const now = Date.now();
          // Speech detection uses VAD_SPEECH_THRESHOLD (default 20%)
          if (vol >= VAD_SPEECH_THRESHOLD) {
            if (!hasSpokenRef.current) {
              console.log('[VAD] Speech detected! Volume:', vol);
            }
            hasSpokenRef.current = true;
            lastSpeechTimeRef.current = now;
          } else if (hasSpokenRef.current && now - lastSpeechTimeRef.current >= VAD_SILENCE_MS) {
            console.log(`[VAD] ${VAD_SILENCE_MS}ms silence after speech. Auto-submitting...`);
            stopRecording();
            return;
          }

          animFrameRef.current = requestAnimationFrame(updateVolume);
        };
        updateVolume();
      } catch (e) {
        console.warn('AudioContext volume meter initialization failed:', e);
      }

      // 3. Start Web Speech Recognition — for live transcript display ONLY.
      //    Do NOT use it for auto-submit (that's VAD's job). This prevents double-submit.
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognitionRef.current = recognition;
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = workflowId?.includes('hindi') ? 'hi-IN' : 'en-IN';

          recognition.onspeechstart = () => {
            hasSpokenRef.current = true;
            lastSpeechTimeRef.current = Date.now();
          };

          recognition.onresult = (event: any) => {
            let fullText = '';
            for (let i = 0; i < event.results.length; i++) {
              fullText += event.results[i][0].transcript + ' ';
            }
            const cleanText = fullText.trim();
            if (cleanText) {
              if (isEchoOfAssistant(cleanText)) {
                if (DEBUG_VOICE) console.log('[Echo Filter] Discarded assistant speech feedback:', cleanText);
                return;
              }
              // Live transcript display & speech submission ref
              setLiveTranscript(cleanText);
              capturedTextRef.current = cleanText;
              hasSpokenRef.current = true;
              lastSpeechTimeRef.current = Date.now();
            }
          };

          recognition.onerror = (e: any) => {
            if (e.error !== 'no-speech') console.warn('[Web Speech API] Error:', e.error);
          };

          recognition.start();
        } catch (e) {
          console.warn('SpeechRecognition failed:', e);
        }
      }

      // 4. Setup MediaRecorder
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
        // Always send audio blob — never bypass to text endpoint
        submitTurn(audioBlob);
      };

      mediaRecorder.start(250);
      setStatusText(isContinuousModeRef.current ? 'Listening... Speak your answer now' : 'Listening... Speak now!');
    } catch (err: any) {
      console.error('Microphone recording error:', err);
      setErrorMsg('Microphone access denied. Please click "Allow" on browser microphone prompt.');
      setStatusText('Microphone Access Blocked');
      setIsSessionActive(false);
      isSessionActiveRef.current = false;
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  // Pause / End Continuous Session
  const pauseContinuousSession = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (autoListenDelayRef.current) clearTimeout(autoListenDelayRef.current);
    setIsSessionActive(false);
    isSessionActiveRef.current = false;
    stopRecording();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (currentAudioRef.current) currentAudioRef.current.pause();
    setIsPlayingAudio(false);
    setStatusText('Session Paused — Tap Mic to Resume');
  };

  // Process Voice Input — always sends audio blob to /voice endpoint
  const handleProcessVoiceInput = async (audioBlob: Blob) => {
    if (!workflowId) return;

    setIsProcessing(true);
    setStatusText('Processing AI response...');

    const inaudibleMsg = 'Could not hear audio clearly. Please tap the mic and try again.';

    // Create a new AbortController for this request (barge-in can cancel it)
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let res;
      if (!audioBlob || audioBlob.size <= 200) {
        // Too small — no real audio captured
        setErrorMsg(inaudibleMsg);
        speakBrowserTTS(inaudibleMsg);
        setStatusText('Use Chat or Tap Mic to Retry');
        setIsProcessing(false);
        return;
      }

      try {
        res = await sendVoiceMessage(workflowId, audioBlob, sessionIdRef.current, controller.signal);
      } catch (sttErr: any) {
        if (sttErr.name === 'AbortError') {
          console.log('[VoiceView] Request aborted (barge-in)');
          setIsProcessing(false);
          return;
        }
        console.warn('Voice STT failed:', sttErr.message);
        setErrorMsg(inaudibleMsg);
        speakBrowserTTS(inaudibleMsg);
        setStatusText('Use Chat or Tap Mic to Retry');
        setIsProcessing(false);
        return;
      }

      updateSessionId(res.sessionId);
      setMessages(res.messages || []);
      setExtractedFields(res.extractedFields || {});
      const completed = res.isCompleted || false;
      setIsCompleted(completed);
      isCompletedRef.current = completed;
      if (res.closingMessage) setClosingMessage(res.closingMessage);
      if (res.savedCallId) setSavedCallId(res.savedCallId);

      if (completed) {
        setIsSessionActive(false);
        isSessionActiveRef.current = false;
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (autoListenDelayRef.current) clearTimeout(autoListenDelayRef.current);
        setStatusText('Call Session Completed');
      }

      setLiveTranscript('');

      // Playback response audio or browser TTS fallback
      if (res.audioBase64) {
        playAudioResponse(res.audioBase64);
      } else if (res.replyText || res.reply) {
        speakBrowserTTS(res.replyText || res.reply);
      } else {
        triggerAutoListen();
      }
    } catch (err: any) {
      if ((err as any)?.name === 'AbortError') {
        console.log('[VoiceView] Fetch aborted (barge-in)');
        setIsProcessing(false);
        return;
      }
      console.error('Error processing voice message:', err);
      setErrorMsg(inaudibleMsg);
      speakBrowserTTS(inaudibleMsg);
      setStatusText('Use Chat or Tap Mic to Retry');
    } finally {
      setIsProcessing(false);
    }
  };

  // Process text-based turn (from speech recognition or text input box)
  const handleProcessTextInput = async (msg: string) => {
    if (!msg.trim() || isProcessingRef.current || isCompletedRef.current || !workflowId) return;

    setIsProcessing(true);
    setStatusText('Processing...');
    setErrorMsg(null);

    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (currentAudioRef.current) currentAudioRef.current.pause();

    try {
      const res = await sendChatMessage(workflowId, msg, sessionIdRef.current);
      updateSessionId(res.sessionId);
      setMessages(res.messages || []);
      setExtractedFields(res.extractedFields || {});
      const completed = res.isCompleted || false;
      setIsCompleted(completed);
      isCompletedRef.current = completed;
      if (res.closingMessage) setClosingMessage(res.closingMessage);
      if (res.savedCallId) setSavedCallId(res.savedCallId);

      if (completed) {
        setIsSessionActive(false);
        isSessionActiveRef.current = false;
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (autoListenDelayRef.current) clearTimeout(autoListenDelayRef.current);
        setStatusText('Call Session Completed');
      }

      setLiveTranscript('');
      capturedTextRef.current = '';

      if (res.audioBase64) {
        playAudioResponse(res.audioBase64);
      } else if (res.reply) {
        speakBrowserTTS(res.reply);
      } else {
        triggerAutoListen();
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      setErrorMsg(err.message || 'Failed to send message.');
      setStatusText('Tap Mic to Retry');
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
    await handleProcessTextInput(msg);
  };

  // Play agent audio response (with barge-in monitor)
  const playAudioResponse = (audioBase64: string) => {
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = '';
      }

      const audio = new Audio(audioBase64);
      currentAudioRef.current = audio;
      setIsPlayingAudio(true);
      isPlayingAudioRef.current = true;
      setStatusText('AI Assistant Speaking...');

      // Start barge-in monitor while agent plays
      startBargeInMonitor();

      const onDone = () => {
        stopBargeInMonitor();
        setIsPlayingAudio(false);
        isPlayingAudioRef.current = false;
        triggerAutoListen();
      };

      audio.onended = onDone;
      audio.onerror = onDone;

      audio.play().catch((err) => {
        console.warn('Audio autoplay prevented:', err);
        stopBargeInMonitor();
        setIsPlayingAudio(false);
        isPlayingAudioRef.current = false;
        triggerAutoListen();
      });
    } catch (err) {
      console.error('Audio playback exception:', err);
      stopBargeInMonitor();
      setIsPlayingAudio(false);
      isPlayingAudioRef.current = false;
      triggerAutoListen();
    }
  };

  // Browser Speech Synthesis with clause chunking, speech normalizer & GC protection
  const speakBrowserTTS = (rawText: string, onAllDone?: () => void) => {
    try {
      if (!('speechSynthesis' in window)) {
        addVoiceLog(rawText, 'error', 'SpeechSynthesis API not supported in browser');
        if (onAllDone) onAllDone();
        else triggerAutoListen();
        return;
      }

      // 1. Reset speech queue safely without cancelling ongoing cycle
      speechQueueRef.current = [];
      activeUtterancesRef.current = [];
      currentSpeakingTextRef.current = '';
      if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }

      // 2. Normalize text for speech (pronunciation, numbers, acronyms, dates, markdown removal)
      const normalized = normalizeForSpeech(rawText);
      addVoiceLog(
        normalized,
        'info',
        `Original (${rawText.length} chars) -> Normalized (${normalized.length} chars)`
      );

      // 3. Chunk into clauses (< 350 chars) to prevent Chrome truncation without chopping sentences
      const chunks = chunkTextForSpeech(normalized, 350);
      if (chunks.length === 0) {
        if (onAllDone) onAllDone();
        else triggerAutoListen();
        return;
      }

      speechQueueRef.current = [...chunks];

      const playNextChunk = () => {
        if (speechQueueRef.current.length === 0) {
          // All chunks finished
          setIsPlayingAudio(false);
          isPlayingAudioRef.current = false;
          currentSpeakingTextRef.current = '';
          stopBargeInMonitor();
          if (onAllDone) {
            onAllDone();
          } else {
            triggerAutoListen();
          }
          return;
        }

        const chunk = speechQueueRef.current.shift()!;
        currentSpeakingTextRef.current = chunk;

        const utterance = new SpeechSynthesisUtterance(chunk);
        // Retain utterance reference in ref array and global window so Chrome GC does not drop it mid-speech
        activeUtterancesRef.current.push(utterance);
        (window as any).__voiceUtterance = utterance;

        // Assign selected or fallback voice
        const voice = availableVoices.find((v) => v.voiceURI === selectedVoiceURI);
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        } else {
          utterance.lang = workflowId?.includes('hindi') ? 'hi-IN' : 'en-IN';
        }

        utterance.rate = speechRate;
        utterance.pitch = speechPitch;

        const startTime = performance.now();

        utterance.onstart = () => {
          setIsPlayingAudio(true);
          isPlayingAudioRef.current = true;
          setStatusText('AI Assistant Speaking...');
          startBargeInMonitor();
          addVoiceLog(chunk, 'start', `Voice: ${utterance.voice?.name || utterance.lang}`);
        };

        utterance.onboundary = (e) => {
          if (e.name === 'word') {
            addVoiceLog(chunk, 'boundary', `word @ char ${e.charIndex}`);
          }
        };

        const cleanupUtterance = () => {
          activeUtterancesRef.current = activeUtterancesRef.current.filter((u) => u !== utterance);
        };

        utterance.onend = () => {
          const durationMs = Math.round(performance.now() - startTime);
          addVoiceLog(chunk, 'end', `Duration: ${durationMs}ms`);
          cleanupUtterance();
          // Small delay before next chunk prevents Chrome from dropping the next utterance
          setTimeout(() => {
            playNextChunk();
          }, 60);
        };

        utterance.onerror = (e) => {
          const durationMs = Math.round(performance.now() - startTime);
          addVoiceLog(chunk, 'error', `Code: ${e.error} (after ${durationMs}ms)`);
          cleanupUtterance();
          // If interrupted or canceled by user action/barge-in, do not continue queue
          if (e.error === 'interrupted' || e.error === 'canceled') {
            speechQueueRef.current = [];
            setIsPlayingAudio(false);
            isPlayingAudioRef.current = false;
            currentSpeakingTextRef.current = '';
            stopBargeInMonitor();
          } else {
            setTimeout(() => {
              playNextChunk();
            }, 60);
          }
        };

        window.speechSynthesis.speak(utterance);

        // Chrome bug workaround: resume if synthesis was paused
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      };

      playNextChunk();
    } catch (err: any) {
      console.warn('Browser speech synthesis error:', err);
      addVoiceLog(rawText, 'error', err?.message || String(err));
      setIsPlayingAudio(false);
      isPlayingAudioRef.current = false;
      stopBargeInMonitor();
      if (onAllDone) onAllDone();
      else triggerAutoListen();
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-4 flex flex-col h-[calc(100vh-5rem)]">
      {/* Top Header Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 mb-3 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => {
              pauseContinuousSession();
              navigate('/');
            }}
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
              Real-Time Hands-Free Voice Testing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Active Engine Voice Mode Badge */}
          <span
            className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase border ${
              serverVoiceMode === 'browser'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : serverVoiceMode === 'sarvam-static'
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
            title={`Active Engine Voice Mode: ${serverVoiceMode}`}
          >
            Mode: {serverVoiceMode}
          </span>

          {/* Dev Voice Lab & Diagnostics Toggle */}
          <button
            onClick={() => setShowVoiceTester(!showVoiceTester)}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
              showVoiceTester
                ? 'bg-purple-600 text-white border-purple-700 shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
            title="Open Voice AI Testing & Diagnostics Panel"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Voice Lab</span>
          </button>

          {/* Continuous Mode Toggle */}
          <button
            onClick={() => {
              const nextVal = !isContinuousMode;
              setIsContinuousMode(nextVal);
              isContinuousModeRef.current = nextVal;
              if (!nextVal && isRecording) {
                // If user disables continuous mode while recording, let current turn finish normally
              }
            }}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
              isContinuousMode
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-slate-100 text-slate-600 border-slate-300'
            }`}
            title="Toggle Continuous Hands-Free Voice Session"
          >
            <Zap className={`w-3.5 h-3.5 ${isContinuousMode ? 'text-emerald-600 fill-emerald-600' : 'text-slate-400'}`} />
            <span>{isContinuousMode ? 'Hands-Free ON' : 'Manual Mode'}</span>
          </button>

          {/* Drawer Toggle */}
          <button
            onClick={() => setShowDrawer(!showDrawer)}
            className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1 border border-slate-200"
          >
            <ListChecks className="w-4 h-4 text-indigo-600" />
            <span>({Object.keys(extractedFields).length})</span>
            {showDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Dev Voice Test & Diagnostic Suite Panel */}
      {showVoiceTester && (
        <div className="bg-slate-900 text-slate-100 border border-slate-800 rounded-3xl p-4 mb-3 shadow-2xl animate-fade-in space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-purple-300">
                Voice AI Lab & Diagnostic Suite
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-slate-800 text-purple-300 px-2 py-0.5 rounded-full border border-purple-800 uppercase font-bold">
                Mode: {serverVoiceMode}
              </span>
              <span className="text-[10px] bg-purple-900/60 text-purple-300 px-2 py-0.5 rounded-full border border-purple-700/50">
                {availableVoices.length} voices found
              </span>
              <button
                onClick={() => setShowVoiceTester(false)}
                className="text-slate-400 hover:text-slate-200 text-xs px-1.5 py-0.5 rounded-md hover:bg-slate-800"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Voice Selection & Sliders */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <label className="text-[11px] font-bold text-slate-300 block mb-1">
                Active Browser Voice
              </label>
              <select
                value={selectedVoiceURI}
                onChange={(e) => setSelectedVoiceURI(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
              >
                {availableVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    [{v.lang}] {v.name.length > 25 ? v.name.slice(0, 25) + '...' : v.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-bold text-slate-300">Speech Rate</label>
                <span className="text-[11px] font-mono text-purple-400">{speechRate.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.7"
                max="1.3"
                step="0.02"
                value={speechRate}
                onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                className="w-full accent-purple-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-bold text-slate-300">Pitch</label>
                <span className="text-[11px] font-mono text-purple-400">{speechPitch.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="1.2"
                step="0.05"
                value={speechPitch}
                onChange={(e) => setSpeechPitch(parseFloat(e.target.value))}
                className="w-full accent-purple-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Quick Clinic Question Test Buttons */}
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
              Quick Test Clinic Questions (Real Flow)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                {
                  label: '1. Greeting',
                  text: 'Hello! Thank you for calling Apex Dental Care Clinic. How can I help you today?',
                },
                {
                  label: '2. Full Name',
                  text: 'Could you please share your full name?',
                },
                {
                  label: '3. Phone No.',
                  text: 'What is the best 10-digit phone number to reach you on?',
                },
                {
                  label: '4. Pref Date',
                  text: 'Which date would you prefer for your appointment?',
                },
                {
                  label: '5. Pref Time',
                  text: 'What time works best for you, for example 10:00 AM or 4:30 PM?',
                },
                {
                  label: '6. Full Read-back',
                  text: 'Let me confirm: Your name is Ramesh Kumar S, phone number 9876543210, appointment on Wednesday, October 21st, 2026 at 4:30 PM. Shall I confirm this appointment?',
                },
                {
                  label: '7. Confirmation',
                  text: 'Great! Your appointment has been booked. You will receive a confirmation message shortly. Have a wonderful day!',
                },
              ].map((btn, idx) => (
                <button
                  key={idx}
                  onClick={() => speakBrowserTTS(btn.text)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-purple-900/40 hover:border-purple-600 border border-slate-700 rounded-xl text-[11px] font-semibold text-slate-300 hover:text-white transition-all text-left truncate flex items-center gap-1.5"
                  title={btn.text}
                >
                  <Play className="w-3 h-3 text-purple-400 shrink-0" />
                  <span className="truncate">{btn.label}</span>
                </button>
              ))}
              <button
                onClick={cancelAllSpeech}
                className="px-2.5 py-1.5 bg-rose-950/50 hover:bg-rose-900/80 border border-rose-800 text-rose-300 hover:text-white rounded-xl text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5"
              >
                <VolumeX className="w-3 h-3 text-rose-400" />
                <span>Stop Speech</span>
              </button>
            </div>
          </div>

          {/* Custom Speech Tester */}
          <div className="flex gap-2">
            <input
              type="text"
              value={testCustomText}
              onChange={(e) => setTestCustomText(e.target.value)}
              placeholder="Test custom phrase, e.g. 'Call Ramesh at 9876543210 on 2026-10-21 at 4:30 PM'..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && testCustomText.trim()) {
                  speakBrowserTTS(testCustomText);
                }
              }}
            />
            <button
              onClick={() => {
                if (testCustomText.trim()) speakBrowserTTS(testCustomText);
              }}
              disabled={!testCustomText.trim()}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Test TTS</span>
            </button>
          </div>

          {/* Diagnostic Log Console */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Terminal className="w-3 h-3 text-slate-400" />
                Speech Synthesis Event Stream
              </span>
              <button
                onClick={() => setVoiceLogs([])}
                className="text-[10px] text-slate-400 hover:text-slate-200 underline"
              >
                Clear Log
              </button>
            </div>
            <div className="bg-black/60 rounded-xl p-2.5 h-28 overflow-y-auto font-mono text-[10px] space-y-1 border border-slate-800">
              {voiceLogs.length === 0 ? (
                <span className="text-slate-500 italic">No events logged yet. Tap any test button above.</span>
              ) : (
                voiceLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-1.5 leading-tight">
                    <span className="text-slate-500 shrink-0">[{log.time}]</span>
                    <span
                      className={`px-1 py-0.2 rounded shrink-0 uppercase font-bold text-[9px] ${
                        log.type === 'start'
                          ? 'bg-blue-900/70 text-blue-300'
                          : log.type === 'end'
                          ? 'bg-emerald-900/70 text-emerald-300'
                          : log.type === 'error'
                          ? 'bg-rose-900/70 text-rose-300'
                          : log.type === 'boundary'
                          ? 'bg-purple-900/70 text-purple-300'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {log.type}
                    </span>
                    <span className="text-slate-300 truncate flex-1">"{log.text}"</span>
                    {log.details && <span className="text-amber-400 shrink-0">({log.details})</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* Error / Alert Banner */}
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
              Listening — Turn Active
            </span>
            <div className="flex items-center gap-2">
              {/* Finish speaking manual trigger button */}
              <button
                onClick={stopRecording}
                className="px-2 py-0.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold transition-colors"
              >
                Send Turn Now
              </button>
              {/* Audio Wave Visualizer Bars */}
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
          </div>

          {liveTranscript ? (
            <p className="text-xs font-semibold text-indigo-900 italic bg-white/80 p-2 rounded-xl border border-indigo-100">
              "{liveTranscript}"
            </p>
          ) : (
            <p className="text-[11px] text-indigo-500 italic">
              Speak turn-by-turn into your microphone (auto-submits when you pause)...
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
        <div className="p-4 mb-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between shadow-md animate-fade-in">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                Call Intake Completed
              </h4>
              <p className="text-xs text-emerald-700 font-medium leading-relaxed">
                {closingMessage || 'Thank you for calling! Your intake is complete and saved to Firestore.'}
              </p>
            </div>
          </div>
          {savedCallId && (
            <button
              onClick={() => navigate('/dashboard')}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm shrink-0 ml-2"
            >
              View Call Log
            </button>
          )}
        </div>
      )}

      {/* Main Microphone Action Controls */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xl space-y-3">
        {/* Status Banner */}
        <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-700">
          {isCompleted ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-emerald-700 font-extrabold">Call Session Completed</span>
            </>
          ) : isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span className="text-indigo-600">Processing turn...</span>
            </>
          ) : isPlayingAudio ? (
            <>
              <Volume2 className="w-4 h-4 text-emerald-600 animate-pulse" />
              <span className="text-emerald-700">AI Assistant Speaking...</span>
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

        {/* Big Pulsing Mic / Pause Session / Completed Action Button */}
        <div className="flex items-center justify-center gap-4 pt-1">
          {isCompleted ? (
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-lg transition-all flex items-center gap-2"
            >
              <CheckCircle2 className="w-4.5 h-4.5 text-white" />
              <span>Call Intake Completed — View Call Log</span>
            </button>
          ) : isSessionActive && isRecording ? (
            <div className="flex items-center gap-3">
              <button
                onClick={stopRecording}
                style={{
                  boxShadow: `0 0 ${15 + micVolume * 0.4}px rgba(225, 29, 72, ${0.4 + micVolume * 0.006})`,
                  transform: `scale(${1 + micVolume * 0.002})`,
                }}
                className="w-20 h-20 rounded-full bg-gradient-to-tr from-rose-600 to-red-500 text-white flex items-center justify-center shadow-xl transition-all hover:scale-105"
                title="Send current turn immediately"
              >
                <Square className="w-8 h-8" />
              </button>

              <button
                onClick={pauseContinuousSession}
                className="p-3.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors shadow-sm"
                title="Pause Continuous Session"
              >
                <PauseCircle className="w-6 h-6" />
              </button>
            </div>
          ) : (
            <button
              onClick={startRecording}
              disabled={isProcessing || isCompleted}
              className="px-6 py-4 rounded-full bg-gradient-to-tr from-indigo-600 via-purple-600 to-rose-600 hover:scale-105 text-white font-extrabold text-sm flex items-center gap-3 shadow-xl glow-indigo transition-all active:scale-95 disabled:opacity-40"
            >
              <Mic className="w-7 h-7 animate-pulse" />
              <span>{messages.length > 0 ? 'Resume Hands-Free Session' : 'Start Voice Session'}</span>
            </button>
          )}
        </div>

        <p className="text-[11px] text-center text-slate-400 font-medium pt-1">
          {isContinuousMode
            ? '⚡ Hands-free mode active: mic auto-opens after AI replies & autosubmits when you pause speaking.'
            : '👆 Manual mode active: click mic button for each turn.'}
        </p>

        {/* Text Input Fallback */}
        <form onSubmit={handleSendText} className="flex gap-2 pt-2 border-t border-slate-100">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={isProcessing || isCompleted}
            placeholder="Or type a text message..."
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

