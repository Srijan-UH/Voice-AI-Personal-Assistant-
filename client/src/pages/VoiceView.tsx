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
  Zap,
  Sliders,
  VolumeX,
  Phone,
  PhoneOff,
} from 'lucide-react';
import { ChatMessageItem, sendChatMessage, sendVoiceMessage, checkServerHealth } from '../lib/api';

// ──────────────────────────────────────────────────────────────
// VAD & Voice Endpointing Tuning Constants
// ──────────────────────────────────────────────────────────────
/** Volume % (0-100) above which we detect user speaking */
const VAD_SPEECH_THRESHOLD = 15;
/** Milliseconds of silence after speech before auto-submitting the turn (reduced for zero-delay responsiveness) */
const VAD_SILENCE_MS = 280;
/** Volume % required to interrupt/barge-in while AI is speaking (tuned to avoid speaker feedback and room noise) */
const BARGE_IN_VOLUME_THRESHOLD = 50;
/** Safety cap: auto-submit after this many ms even if silence never triggers */
const MAX_TURN_MS = 7000;

// Helper to convert base64 data URI to ArrayBuffer for Web Audio API decodeAudioData
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.replace(/^data:audio\/\w+;base64,/, '');
  const binaryString = window.atob(clean);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
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

  // Live Call & Audio States
  const [isCallActive, setIsCallActive] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Click "Start Voice Call" to begin');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const [micVolume, setMicVolume] = useState<number>(0);

  // Perf metrics from Sarvam AI pipeline
  const [lastPerf, setLastPerf] = useState<{
    sttMs?: number;
    engineMs?: number;
    ttsMs?: number;
    totalMs?: number;
    fromCache?: boolean;
  } | null>(null);

  // Audio References
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakerAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Barge-In (Interruption) tracking refs
  const bargeInCountRef = useRef<number>(0);
  const lastBargeInTimeRef = useRef<number>(0);
  const playbackStartTimeRef = useRef<number>(0);
  const interruptAssistantRef = useRef<() => void>(() => {});

  // Cached greeting & last spoken text for instant playback and replay
  const greetingAudioRef = useRef<{ audioBase64: string | null; reply: string } | null>(null);
  const lastPlayedAudioBase64Ref = useRef<string | null>(null);
  const lastPlayedTextRef = useRef<string>('');

  // VAD tracking refs
  const hasSpokenRef = useRef<boolean>(false);
  const lastSpeechTimeRef = useRef<number>(Date.now());
  const isStoppingRef = useRef<boolean>(false);
  const hasSubmittedTurnRef = useRef<boolean>(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTurnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync state refs to prevent stale closure issues in audio callbacks
  const isCallActiveRef = useRef<boolean>(false);
  const isCompletedRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const isPlayingAudioRef = useRef<boolean>(false);
  const isRecordingRef = useRef<boolean>(false);

  useEffect(() => {
    isCallActiveRef.current = isCallActive;
  }, [isCallActive]);

  useEffect(() => {
    isCompletedRef.current = isCompleted;
  }, [isCompleted]);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    isPlayingAudioRef.current = isPlayingAudio;
  }, [isPlayingAudio]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  // Pre-load session & initial greeting audio on mount so it is ready to speak instantly
  useEffect(() => {
    if (workflowId && messages.length === 0) {
      sendChatMessage(workflowId, '', sessionIdRef.current)
        .then((res) => {
          updateSessionId(res.sessionId);
          setMessages(res.messages || []);
          setExtractedFields(res.extractedFields || {});
          greetingAudioRef.current = {
            audioBase64: res.audioBase64 || null,
            reply: res.reply,
          };
          if (res.audioBase64) lastPlayedAudioBase64Ref.current = res.audioBase64;
          if (res.reply) lastPlayedTextRef.current = res.reply;
        })
        .catch((err) => {
          console.warn('[VoiceView] Pre-fetch greeting notice:', err);
        });
    }
  }, [workflowId]);

  // Clean up audio context, active speech & timers on unmount
  useEffect(() => {
    return () => {
      cancelAllAudio();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (maxTurnTimerRef.current) clearTimeout(maxTurnTimerRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach((t) => t.stop());
      abortControllerRef.current?.abort();
    };
  }, []);

  // Stop any active audio playback immediately
  const cancelAllAudio = () => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {}
      currentSourceRef.current = null;
    }
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = '';
      } catch {}
      currentAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setIsPlayingAudio(false);
    isPlayingAudioRef.current = false;
  };

  // ────────────────────────────────────────────────────────────
  // Live Call Lifecycle
  // ────────────────────────────────────────────────────────────
  const startLiveCall = async (forceFresh = false) => {
    setErrorMsg(null);

    // If starting after a previous call was completed, or explicitly requested fresh, wipe stale session data cleanly
    if (isCompletedRef.current || forceFresh) {
      updateSessionId(undefined);
      setMessages([]);
      setExtractedFields({});
      setIsCompleted(false);
      isCompletedRef.current = false;
      greetingAudioRef.current = null;
    }

    // ── STEP 1: Synchronously unlock AudioContext within the user gesture! ──
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    } catch (ctxErr) {
      console.warn('[AudioContext] Initial click unlock notice:', ctxErr);
    }

    setIsCallActive(true);
    isCallActiveRef.current = true;
    setStatusText('Connecting with Dental Clinic Assistant...');

    // ── STEP 2: Acquire Microphone stream ──────────────────
    let stream = micStreamRef.current;
    if (!stream || !stream.active) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        micStreamRef.current = stream;
      } catch (err: any) {
        console.error('Microphone access denied:', err);
        setErrorMsg('Microphone access denied. Please click "Allow" on browser microphone prompt.');
        setIsCallActive(false);
        isCallActiveRef.current = false;
        setStatusText('Microphone Blocked');
        return;
      }
    }

    // ── STEP 3: Setup Audio Visualizer Analyser Node & Live VAD Monitor ──
    try {
      const audioCtx = audioContextRef.current!;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }

      if (!analyserRef.current) {
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const micDataArray = new Uint8Array(analyser.frequencyBinCount);
        const speakerDataArray = new Uint8Array(128);

        const monitorAudio = () => {
          if (!isCallActiveRef.current) return;
          analyser.getByteFrequencyData(micDataArray);

          let maxVal = 0;
          for (let i = 0; i < micDataArray.length; i++) {
            if (micDataArray[i] > maxVal) maxVal = micDataArray[i];
          }
          const micVol = Math.min(100, Math.round((maxVal / 255) * 100));

          // If AI is speaking, read speakerAnalyser for orb pulsation
          let speakerVol = 0;
          if (isPlayingAudioRef.current && speakerAnalyserRef.current) {
            try {
              speakerAnalyserRef.current.getByteFrequencyData(speakerDataArray);
              let maxSpk = 0;
              for (let i = 0; i < speakerDataArray.length; i++) {
                if (speakerDataArray[i] > maxSpk) maxSpk = speakerDataArray[i];
              }
              speakerVol = Math.min(100, Math.round((maxSpk / 255) * 100));
            } catch {}
          }

          // Visualizer volume: reflect speaker output while AI speaks, mic input otherwise
          setMicVolume(isPlayingAudioRef.current ? Math.max(speakerVol, 15) : micVol);

          // ── BARGE-IN INTERRUPTION: Detect intentional user speech while AI is talking ──
          if (isPlayingAudioRef.current && !isProcessingRef.current) {
            const now = Date.now();
            const timeSinceStart = now - playbackStartTimeRef.current;
            // 1500ms grace period prevents ambient room noise, fan, or speaker feedback from cutting off AI speech
            if (timeSinceStart > 1500) {
              if (micVol >= BARGE_IN_VOLUME_THRESHOLD) {
                bargeInCountRef.current += 1;
                // Requires sustained human speech (>= 8 frames ~ 130ms)
                if (bargeInCountRef.current >= 8 && now - lastBargeInTimeRef.current > 1500) {
                  lastBargeInTimeRef.current = now;
                  bargeInCountRef.current = 0;
                  console.log(`[Barge-In] Intentional speech detected (${micVol}% >= ${BARGE_IN_VOLUME_THRESHOLD}%). Cutting off AI assistant!`);
                  interruptAssistantRef.current();
                }
              } else {
                bargeInCountRef.current = Math.max(0, bargeInCountRef.current - 1);
              }
            } else {
              bargeInCountRef.current = 0;
            }
          }

          // ── VAD Silence Detection while recording ────────────────
          if (isRecordingRef.current && !isStoppingRef.current && !hasSubmittedTurnRef.current) {
            const now = Date.now();
            if (micVol >= VAD_SPEECH_THRESHOLD) {
              hasSpokenRef.current = true;
              lastSpeechTimeRef.current = now;
            } else if (hasSpokenRef.current && now - lastSpeechTimeRef.current >= VAD_SILENCE_MS) {
              console.log(`[VAD] ${VAD_SILENCE_MS}ms silence detected. Auto-submitting turn...`);
              stopRecordingTurn();
            }
          }

          animFrameRef.current = requestAnimationFrame(monitorAudio);
        };
        monitorAudio();
      }
    } catch (e) {
      console.warn('AudioContext init warning:', e);
    }

    // ── STEP 4: Speak greeting out loud immediately ───────────
    if (greetingAudioRef.current) {
      // Preloaded greeting is ready: speak immediately!
      const { audioBase64, reply } = greetingAudioRef.current;
      playAudioResponse(audioBase64 || '', reply);
    } else if (messages.length === 0 && workflowId) {
      // Fetch greeting if not preloaded yet
      try {
        setIsProcessing(true);
        isProcessingRef.current = true;
        setStatusText('Connecting to Sarvam Voice Assistant...');
        const res = await sendChatMessage(workflowId, '', sessionIdRef.current);
        updateSessionId(res.sessionId);
        setMessages(res.messages || []);
        setExtractedFields(res.extractedFields || {});

        playAudioResponse(res.audioBase64 || '', res.reply);
      } catch (err: any) {
        console.error('Session init error:', err);
        setErrorMsg('Failed to initialize session. You can tap mic to retry.');
        setStatusText('Session Failed');
      } finally {
        setIsProcessing(false);
        isProcessingRef.current = false;
      }
    } else {
      startRecordingTurn();
    }
  };

  // Hang up the call
  const endLiveCall = () => {
    setIsCallActive(false);
    isCallActiveRef.current = false;
    cancelAllAudio();
    abortControllerRef.current?.abort();

    updateSessionId(undefined);
    setExtractedFields({});
    setIsCompleted(false);
    isCompletedRef.current = false;
    greetingAudioRef.current = null;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (maxTurnTimerRef.current) clearTimeout(maxTurnTimerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    setIsRecording(false);
    isRecordingRef.current = false;
    setMicVolume(0);
    setStatusText('Call Ended — Click to Start Voice Call');
  };

  // ────────────────────────────────────────────────────────────
  // Recording Turn (User Speaks -> Audio Blob)
  // ────────────────────────────────────────────────────────────
  const startRecordingTurn = async () => {
    if (isProcessingRef.current || isCompletedRef.current || !isCallActiveRef.current) return;

    cancelAllAudio();
    audioChunksRef.current = [];
    hasSpokenRef.current = false;
    lastSpeechTimeRef.current = Date.now();
    isStoppingRef.current = false;
    hasSubmittedTurnRef.current = false;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (maxTurnTimerRef.current) clearTimeout(maxTurnTimerRef.current);

    const stream = micStreamRef.current;
    if (!stream || !stream.active) return;

    // Safety timeout: auto-submit if max duration reached
    maxTurnTimerRef.current = setTimeout(() => {
      if (hasSpokenRef.current && !isStoppingRef.current) {
        console.log(`[Max Turn Timer] Reached ${MAX_TURN_MS}ms. Auto-submitting turn.`);
        stopRecordingTurn();
      }
    }, MAX_TURN_MS);

    try {
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

      mediaRecorder.onstop = () => {
        const finalMime = options.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: finalMime });
        submitAudioTurn(audioBlob);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      isRecordingRef.current = true;
      setStatusText('Listening... Speak now');
    } catch (err: any) {
      console.error('Failed to start MediaRecorder:', err);
    }
  };

  // ── Interrupt the AI assistant immediately and start recording user speech ──
  const interruptAssistant = () => {
    console.log('[VoiceView] Barge-in interruption: cancelling speech and opening mic...');
    cancelAllAudio();
    abortControllerRef.current?.abort();

    if (isCallActiveRef.current && !isCompletedRef.current) {
      startRecordingTurn();
      hasSpokenRef.current = true;
      lastSpeechTimeRef.current = Date.now();
      setStatusText('Listening... Speak now');
    }
  };
  interruptAssistantRef.current = interruptAssistant;

  const stopRecordingTurn = () => {
    if (isStoppingRef.current || hasSubmittedTurnRef.current) return;
    isStoppingRef.current = true;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (maxTurnTimerRef.current) clearTimeout(maxTurnTimerRef.current);

    setIsRecording(false);
    isRecordingRef.current = false;
    setStatusText('Processing with Sarvam AI...');

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        submitAudioTurn(audioBlob);
      }
    } else {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      submitAudioTurn(audioBlob);
    }
  };

  // ────────────────────────────────────────────────────────────
  // Submit Audio to Server (/api/conversations/:workflowId/voice)
  // ────────────────────────────────────────────────────────────
  const submitAudioTurn = async (audioBlob: Blob) => {
    if (hasSubmittedTurnRef.current || !workflowId) return;
    hasSubmittedTurnRef.current = true;

    if (!audioBlob || audioBlob.size <= 250) {
      console.log('[VoiceView] Audio chunk too small. Re-opening mic...');
      startRecordingTurn();
      return;
    }

    setIsProcessing(true);
    isProcessingRef.current = true;
    setStatusText('AI Thinking...');

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await sendVoiceMessage(workflowId, audioBlob, sessionIdRef.current, controller.signal);

      updateSessionId(res.sessionId);
      setMessages(res.messages || []);
      setExtractedFields(res.extractedFields || {});
      const completed = res.isCompleted || false;
      setIsCompleted(completed);
      isCompletedRef.current = completed;
      if (res.closingMessage) setClosingMessage(res.closingMessage);
      if (res.savedCallId) setSavedCallId(res.savedCallId);

      if (res.perf) {
        setLastPerf({ ...res.perf, fromCache: res.fromCache });
      }

      if (completed) {
        setIsCallActive(false);
        isCallActiveRef.current = false;
        setStatusText('Call Session Completed');
      }

      // Play audio response from Sarvam AI with speech fallback
      if (res.audioBase64) {
        playAudioResponse(res.audioBase64, res.replyText || res.reply);
      } else if (res.replyText || res.reply) {
        speakBrowserTTS(res.replyText || res.reply);
      } else {
        startRecordingTurn();
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.log('[VoiceView] Voice turn request aborted (barge-in)');
        return;
      }
      console.error('Error processing voice message:', err);
      setErrorMsg('Could not hear audio clearly. Tap mic to retry.');
      setStatusText('Tap Mic to Retry');
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  // Browser Speech Synthesis Fallback if audio element cannot play
  const speakBrowserTTS = (text: string) => {
    if (!('speechSynthesis' in window)) {
      if (isCallActiveRef.current && !isCompletedRef.current) startRecordingTurn();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-IN';
      utterance.rate = 1.0;

      setIsPlayingAudio(true);
      isPlayingAudioRef.current = true;
      setStatusText('AI Assistant Speaking (Click Orb to Interrupt)');

      utterance.onend = () => {
        setIsPlayingAudio(false);
        isPlayingAudioRef.current = false;
        if (isCallActiveRef.current && !isCompletedRef.current) {
          startRecordingTurn();
        }
      };

      utterance.onerror = () => {
        setIsPlayingAudio(false);
        isPlayingAudioRef.current = false;
        if (isCallActiveRef.current && !isCompletedRef.current) {
          startRecordingTurn();
        }
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('[VoiceView] Browser TTS error:', err);
      setIsPlayingAudio(false);
      isPlayingAudioRef.current = false;
      if (isCallActiveRef.current && !isCompletedRef.current) startRecordingTurn();
    }
  };

  // Play assistant audio response (Web Audio API -> HTMLAudioElement -> SpeechSynthesis)
  const playAudioResponse = async (audioBase64: string, fallbackText?: string) => {
    try {
      cancelAllAudio();
      playbackStartTimeRef.current = Date.now();
      bargeInCountRef.current = 0;
      if (fallbackText) lastPlayedTextRef.current = fallbackText;
      if (audioBase64) lastPlayedAudioBase64Ref.current = audioBase64;

      if (!audioBase64 && !fallbackText) {
        if (isCallActiveRef.current && !isCompletedRef.current) startRecordingTurn();
        return;
      }

      setIsPlayingAudio(true);
      isPlayingAudioRef.current = true;
      setStatusText('AI Assistant Speaking (Speak or click to interrupt)');

      // Method 1: Web Audio API (decodeAudioData) - ZERO autoplay block once AudioContext is unlocked
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }
      const audioCtx = audioContextRef.current;
      if (audioCtx && audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }

      if (audioBase64 && audioCtx && audioCtx.state !== 'closed') {
        try {
          const arrayBuffer = base64ToArrayBuffer(audioBase64);
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;

          // Connect to destination (speakers)
          source.connect(audioCtx.destination);

          // Connect ONLY to speakerAnalyserRef (NEVER to analyserRef/mic!)
          if (!speakerAnalyserRef.current && audioCtx) {
            try {
              speakerAnalyserRef.current = audioCtx.createAnalyser();
              speakerAnalyserRef.current.fftSize = 256;
            } catch {}
          }
          if (speakerAnalyserRef.current) {
            try {
              source.connect(speakerAnalyserRef.current);
            } catch {}
          }

          currentSourceRef.current = source;

          source.onended = () => {
            currentSourceRef.current = null;
            setIsPlayingAudio(false);
            isPlayingAudioRef.current = false;
            if (isCallActiveRef.current && !isCompletedRef.current) {
              startRecordingTurn();
            }
          };

          source.start(0);
          return;
        } catch (webAudioErr) {
          console.warn('[VoiceView] WebAudio decode failed, falling back to HTML5 Audio:', webAudioErr);
        }
      }

      // Method 2: HTMLAudioElement with ObjectURL fallback
      if (audioBase64) {
        try {
          const arrayBuffer = base64ToArrayBuffer(audioBase64);
          const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
          const blobUrl = URL.createObjectURL(blob);
          const audio = new Audio(blobUrl);
          currentAudioRef.current = audio;

          audio.onended = () => {
            URL.revokeObjectURL(blobUrl);
            currentAudioRef.current = null;
            setIsPlayingAudio(false);
            isPlayingAudioRef.current = false;
            if (isCallActiveRef.current && !isCompletedRef.current) {
              startRecordingTurn();
            }
          };

          audio.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            currentAudioRef.current = null;
            setIsPlayingAudio(false);
            isPlayingAudioRef.current = false;
            if (fallbackText) speakBrowserTTS(fallbackText);
            else if (isCallActiveRef.current && !isCompletedRef.current) startRecordingTurn();
          };

          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn('[VoiceView] audio.play() blocked, using speech synthesis fallback:', err);
              URL.revokeObjectURL(blobUrl);
              currentAudioRef.current = null;
              setIsPlayingAudio(false);
              isPlayingAudioRef.current = false;
              if (fallbackText) speakBrowserTTS(fallbackText);
              else if (isCallActiveRef.current && !isCompletedRef.current) startRecordingTurn();
            });
          }
          return;
        } catch (htmlAudioErr) {
          console.warn('[VoiceView] HTMLAudio fallback failed:', htmlAudioErr);
        }
      }

      // Method 3: Browser SpeechSynthesis Safety Net
      if (fallbackText) {
        speakBrowserTTS(fallbackText);
      } else if (isCallActiveRef.current && !isCompletedRef.current) {
        startRecordingTurn();
      }
    } catch (err) {
      console.error('[VoiceView] Audio playback exception:', err);
      setIsPlayingAudio(false);
      isPlayingAudioRef.current = false;
      if (fallbackText) speakBrowserTTS(fallbackText);
      else if (isCallActiveRef.current && !isCompletedRef.current) startRecordingTurn();
    }
  };

  // Replay assistant's last spoken phrase or test audio output
  const replayLastAudio = () => {
    // Unlock audio context synchronously
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    } catch {}

    if (lastPlayedAudioBase64Ref.current) {
      playAudioResponse(lastPlayedAudioBase64Ref.current, lastPlayedTextRef.current);
    } else if (lastPlayedTextRef.current) {
      speakBrowserTTS(lastPlayedTextRef.current);
    } else {
      speakBrowserTTS('Hello! This is Apex Dental Care Clinic. Your audio is working properly.');
    }
  };

  // Handle Manual Text Fallback Form
  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || isProcessing || isCompleted || !workflowId) return;

    const msg = textInput.trim();
    setTextInput('');
    cancelAllAudio();

    setIsProcessing(true);
    isProcessingRef.current = true;
    setStatusText('Processing text...');

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
        setIsCallActive(false);
        isCallActiveRef.current = false;
        setStatusText('Call Session Completed');
      }

      if (res.audioBase64 || res.reply) {
        playAudioResponse(res.audioBase64 || '', res.reply);
      } else if (isCallActiveRef.current && !completed) {
        startRecordingTurn();
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      setErrorMsg(err.message || 'Failed to send message.');
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-4 flex flex-col h-[calc(100vh-5rem)]">
      {/* Top Header Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 mb-3 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => {
              endLiveCall();
              navigate('/');
            }}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Radio className={`w-4 h-4 ${isCallActive ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}`} />
              Sarvam Voice AI Receptionist
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              ChatGPT-Style Voice Call • Saaras v3 + Bulbul v3
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Latency / Perf Badge */}
          {lastPerf?.totalMs && (
            <span
              className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-extrabold border bg-emerald-50 text-emerald-700 border-emerald-200"
              title={`STT: ${lastPerf.sttMs}ms | Engine: ${lastPerf.engineMs}ms | TTS: ${lastPerf.ttsMs}ms (${lastPerf.fromCache ? 'cache' : 'live'})`}
            >
              ~{lastPerf.totalMs}ms {lastPerf.fromCache && '⚡'}
            </span>
          )}

          {/* Audio Test / Replay Button */}
          <button
            onClick={replayLastAudio}
            className="p-1.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1 text-[11px] font-bold border border-slate-200"
            title="Test speaker sound or replay assistant voice"
          >
            <Volume2 className={`w-3.5 h-3.5 ${isPlayingAudio ? 'text-emerald-600 animate-bounce' : 'text-indigo-600'}`} />
            <span className="hidden sm:inline">{isPlayingAudio ? 'Playing' : 'Test Sound'}</span>
          </button>

          {/* Sarvam Mode Badge */}
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase border bg-purple-50 text-purple-700 border-purple-200">
            Sarvam AI
          </span>

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
              No information collected yet. Start the call to speak with the assistant.
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

      {/* Chat Messages Log */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4 rounded-3xl bg-slate-50 border border-slate-200 mb-3 shadow-inner">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 space-y-2">
            <Bot className="w-10 h-10 text-slate-300 animate-bounce" />
            <p className="text-xs font-medium">Click "Start Voice Call" below to begin live conversation.</p>
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
                {closingMessage || 'Thank you for calling! Your intake is complete.'}
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

      {/* Main ChatGPT-Voice Action Controls */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xl space-y-4">
        {/* Status Text Banner */}
        <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-700">
          {isCompleted ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-emerald-700 font-extrabold">Call Session Completed</span>
            </>
          ) : isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
              <span className="text-purple-600 font-bold">AI Thinking & Generating Voice...</span>
            </>
          ) : isPlayingAudio ? (
            <>
              <Volume2 className="w-4 h-4 text-emerald-600 animate-pulse" />
              <span className="text-emerald-700 font-bold">Sarvam AI Speaking (Speak to interrupt)</span>
            </>
          ) : isRecording ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
              </span>
              <span className="text-rose-600 font-bold">Listening... Speak now</span>
            </>
          ) : isCallActive ? (
            <span className="text-emerald-700 font-bold">{statusText}</span>
          ) : (
            <span className="text-slate-600">{statusText}</span>
          )}
        </div>

        {/* ChatGPT-Style Dynamic Glowing Voice Orb */}
        <div className="flex items-center justify-center gap-5 pt-1">
          {isCompleted ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => startLiveCall(true)}
                className="px-6 py-3.5 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-600 to-emerald-600 hover:scale-105 text-white font-extrabold text-xs shadow-lg transition-all flex items-center gap-2"
              >
                <Phone className="w-4 h-4 text-white" />
                <span>Start New Call</span>
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-5 py-3.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs shadow transition-all flex items-center gap-2 border border-slate-200"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>View Summary</span>
              </button>
            </div>
          ) : isCallActive ? (
            <div className="flex items-center gap-6">
              {/* Central Pulsing Audio Orb (ChatGPT Voice style) */}
              <button
                onClick={isPlayingAudio ? interruptAssistant : stopRecordingTurn}
                style={{
                  boxShadow: isPlayingAudio
                    ? '0 0 35px rgba(16, 185, 129, 0.6)'
                    : `0 0 ${20 + micVolume * 0.6}px rgba(225, 29, 72, ${0.4 + micVolume * 0.006})`,
                  transform: `scale(${1 + micVolume * 0.003})`,
                }}
                className={`w-24 h-24 rounded-full text-white flex flex-col items-center justify-center shadow-2xl transition-all duration-150 ${
                  isPlayingAudio
                    ? 'bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 animate-pulse'
                    : 'bg-gradient-to-tr from-rose-600 via-purple-600 to-indigo-600'
                }`}
                title={isPlayingAudio ? 'Click to interrupt AI' : 'Click to send turn immediately'}
              >
                {isPlayingAudio ? (
                  <>
                    <Volume2 className="w-8 h-8 mb-1 animate-bounce" />
                    <span className="text-[9px] font-extrabold uppercase tracking-wide">Interrupt</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-8 h-8 mb-1 animate-pulse" />
                    <span className="text-[9px] font-extrabold uppercase tracking-wide">Tap to Send</span>
                  </>
                )}
              </button>

              {/* End Call Button */}
              <button
                onClick={endLiveCall}
                className="w-12 h-12 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-300 flex items-center justify-center transition-all shadow-sm"
                title="End Call"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => startLiveCall()}
              disabled={isProcessing || isCompleted}
              className="px-8 py-4 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-600 to-emerald-600 hover:scale-105 text-white font-extrabold text-sm flex items-center gap-3 shadow-xl glow-indigo transition-all active:scale-95 disabled:opacity-40"
            >
              <Phone className="w-6 h-6 animate-pulse" />
              <span>{messages.length > 0 ? 'Resume Voice Call' : 'Start Voice Call'}</span>
            </button>
          )}
        </div>

        <p className="text-[11px] text-center text-slate-400 font-medium pt-1">
          {isCallActive
            ? '⚡ Powered by Sarvam AI: Saaras v3 STT + Bulbul v3 TTS. Speak naturally; pauses auto-submit.'
            : '🎙️ Click "Start Voice Call" for hands-free live conversation with Sarvam AI voices.'}
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
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-md disabled:opacity-40 transition-all flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
