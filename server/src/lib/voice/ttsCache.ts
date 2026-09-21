/**
 * TTS Disk & Memory Cache — server/src/lib/voice/ttsCache.ts
 *
 * Persists generated TTS audio to disk under .cache/tts/<sha256>.wav
 * with an in-memory LRU/Map layer on top. Eliminates boot-time API
 * warmup charges and prevents re-synthesizing previously generated phrases.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { synthesizeSpeechUniversal } from './tts.js';

dotenv.config();

export interface CachedPhrase {
  key?: string;
  text: string;
  audioBuffer: Buffer;
  mimeType: string;
  ready: boolean;
  hash: string;
}

interface CacheMetadata {
  key?: string;
  text: string;
  mimeType: string;
  voice: string;
  model: string;
  language: string;
  createdAt: string;
}

export const INTAKE_PHRASES: Record<string, string> = {
  greeting: 'Hello! Thank you for calling Apex Dental Care Clinic. May I have your name, please?',

  ask_name: 'May I have your full name, please?',
  ask_phone: 'Thank you. What is your phone number?',
  ask_date: 'Which date would you like to come in?',
  ask_time: 'And what time works for you?',

  reask_name: "Sorry, I didn't catch that. Could you repeat your name, please?",
  reask_phone: "Sorry, I didn't catch that. Could you repeat your phone number, please?",
  reask_date: "Sorry, I didn't catch that. Could you repeat the date you'd like, please?",
  reask_time: "Sorry, I didn't catch that. Could you repeat the time you'd prefer, please?",

  offer_text:
    "I'm having trouble understanding. Could you please type your response in the chat box below?",

  readback_prefix: "Let me confirm your details.",
  confirm_prompt: 'Shall I go ahead and book this appointment for you?',

  yes_confirm: "Perfect! Your appointment has been booked. We'll see you then. Thank you for calling Apex Dental Care Clinic!",
  no_prompt: 'No problem. Which detail would you like to change — your name, phone number, date, or time?',

  sorry_invalid_name:
    "I'm sorry, that doesn't sound like a valid name. Could you please say your full name?",
  sorry_invalid_phone:
    "I'm sorry, that doesn't look like a valid 10-digit Indian mobile number. Please try again.",
  sorry_invalid_date:
    "I'm sorry, I couldn't understand that date, or it might be in the past. Could you say the date again?",
  sorry_invalid_time:
    "I'm sorry, I couldn't understand that time, or it falls outside our clinic hours of 9 AM to 7 PM. Could you say the time again?",
};

class TtsCacheManager {
  private memoryCache = new Map<string, CachedPhrase>();
  private cacheDir: string;

  constructor() {
    // Resolve cache directory: server/.cache/tts or .cache/tts
    const cwd = process.cwd();
    if (fs.existsSync(path.join(cwd, 'server'))) {
      this.cacheDir = path.join(cwd, 'server', '.cache', 'tts');
    } else {
      this.cacheDir = path.join(cwd, '.cache', 'tts');
    }

    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      this.scanDiskCache();
    } catch (err: any) {
      console.warn(`[TTS Cache] Failed to initialize disk cache dir: ${err.message}`);
    }
  }

  /**
   * Computes a deterministic SHA-256 hash for a given text and voice configuration
   */
  public getHash(
    text: string,
    voice = process.env.SARVAM_TTS_VOICE || 'ritu',
    model = process.env.SARVAM_TTS_MODEL || 'bulbul:v3',
    language = 'en-IN'
  ): string {
    const raw = `${text.trim().toLowerCase()}|${voice}|${model}|${language}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Pre-loads metadata from existing disk cache files without downloading anything
   */
  private scanDiskCache(): void {
    if (!fs.existsSync(this.cacheDir)) return;
    try {
      const files = fs.readdirSync(this.cacheDir);
      let loaded = 0;
      for (const file of files) {
        if (file.endsWith('.json')) {
          const hash = file.replace('.json', '');
          const wavFile = path.join(this.cacheDir, `${hash}.wav`);
          const jsonFile = path.join(this.cacheDir, file);
          if (fs.existsSync(wavFile)) {
            try {
              const meta: CacheMetadata = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
              // Cache metadata and lazy-load audio buffer into memory on demand
              if (meta.key) {
                this.memoryCache.set(`key:${meta.key}`, {
                  key: meta.key,
                  text: meta.text,
                  audioBuffer: null as any, // loaded on get()
                  mimeType: meta.mimeType || 'audio/wav',
                  ready: true,
                  hash,
                });
              }
              this.memoryCache.set(`hash:${hash}`, {
                key: meta.key,
                text: meta.text,
                audioBuffer: null as any,
                mimeType: meta.mimeType || 'audio/wav',
                ready: true,
                hash,
              });
              loaded++;
            } catch {}
          }
        }
      }
      if (loaded > 0) {
        console.log(`[TTS Cache] Found ${loaded} pre-existing cached audio file(s) on disk.`);
      }
    } catch (err: any) {
      console.warn(`[TTS Cache] Error reading disk cache: ${err.message}`);
    }
  }

  /**
   * Boot-time warmup is intentionally removed to avoid any paid API usage on restart.
   * Kept for interface compatibility.
   */
  async warmup(): Promise<void> {
    // Zero-cost: no network calls on startup.
  }

  /**
   * Reads an entry from memory or disk
   */
  get(key: string): CachedPhrase | undefined {
    let entry = this.memoryCache.get(`key:${key}`);
    if (entry && entry.audioBuffer) return entry;

    // Check disk via known phrase text
    const text = INTAKE_PHRASES[key];
    if (text) {
      return this.getByText(text, key);
    }
    return undefined;
  }

  /**
   * Looks up cached phrase by exact text
   */
  getByText(text: string, keyHint?: string): CachedPhrase | undefined {
    const hash = this.getHash(text);
    let entry = this.memoryCache.get(`hash:${hash}`);
    if (entry && entry.audioBuffer) return entry;

    // Check disk
    const wavPath = path.join(this.cacheDir, `${hash}.wav`);
    const jsonPath = path.join(this.cacheDir, `${hash}.json`);
    if (fs.existsSync(wavPath)) {
      try {
        const audioBuffer = fs.readFileSync(wavPath);
        let mimeType = 'audio/wav';
        let key = keyHint;
        if (fs.existsSync(jsonPath)) {
          const meta: CacheMetadata = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          mimeType = meta.mimeType || mimeType;
          key = key || meta.key;
        }
        const cached: CachedPhrase = {
          key,
          text,
          audioBuffer,
          mimeType,
          ready: true,
          hash,
        };
        this.memoryCache.set(`hash:${hash}`, cached);
        if (key) this.memoryCache.set(`key:${key}`, cached);
        return cached;
      } catch (err: any) {
        console.warn(`[TTS Cache] Failed reading disk cache for hash ${hash}: ${err.message}`);
      }
    }

    return undefined;
  }

  /**
   * Saves an audio buffer to both memory and disk
   */
  save(
    text: string,
    audioBuffer: Buffer,
    mimeType = 'audio/wav',
    key?: string,
    voice = process.env.SARVAM_TTS_VOICE || 'ritu',
    model = process.env.SARVAM_TTS_MODEL || 'bulbul:v3',
    language = 'en-IN'
  ): CachedPhrase {
    const hash = this.getHash(text, voice, model, language);
    const entry: CachedPhrase = {
      key,
      text,
      audioBuffer,
      mimeType,
      ready: true,
      hash,
    };

    // Store in memory
    this.memoryCache.set(`hash:${hash}`, entry);
    if (key) {
      this.memoryCache.set(`key:${key}`, entry);
    }

    // Persist to disk
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      fs.writeFileSync(path.join(this.cacheDir, `${hash}.wav`), audioBuffer);
      const meta: CacheMetadata = {
        key,
        text,
        mimeType,
        voice,
        model,
        language,
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(this.cacheDir, `${hash}.json`), JSON.stringify(meta, null, 2), 'utf8');
      console.log(`[TTS Cache] Persisted audio to disk (.cache/tts/${hash.slice(0, 10)}...wav)`);
    } catch (err: any) {
      console.warn(`[TTS Cache] Failed writing to disk: ${err.message}`);
    }

    return entry;
  }

  /**
   * Retrieves base64 URI for a key, or null if not in cache
   */
  getBase64(key: string): string | null {
    const entry = this.get(key);
    if (!entry || !entry.ready || !entry.audioBuffer) return null;
    return `data:${entry.mimeType};base64,${entry.audioBuffer.toString('base64')}`;
  }

  /**
   * Retrieves base64 URI for text, or null if not in cache
   */
  getBase64ByText(text: string): string | null {
    const entry = this.getByText(text);
    if (!entry || !entry.ready || !entry.audioBuffer) return null;
    return `data:${entry.mimeType};base64,${entry.audioBuffer.toString('base64')}`;
  }

  /**
   * Returns whether a key is ready in cache
   */
  isReady(key: string): boolean {
    return Boolean(this.get(key)?.ready);
  }

  get size(): number {
    return this.memoryCache.size;
  }
}

export const ttsCache = new TtsCacheManager();
