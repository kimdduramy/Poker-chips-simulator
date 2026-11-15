import { useEffect } from 'react';
import { soundEnabled } from './device';

/** Keeps the screen on while a table is open. Browsers drop the lock when the tab hides, so it is re-requested. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let disposed = false;
    const request = async () => {
      if (disposed || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // denied (battery saver or no user gesture yet); retried on the next interaction
      }
    };
    void request();
    document.addEventListener('visibilitychange', request);
    document.addEventListener('pointerdown', request);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', request);
      document.removeEventListener('pointerdown', request);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

let audio: AudioContext | null = null;

export function unlockAudio() {
  primeSpeech();
  if (audio) {
    if (audio.state === 'suspended') void audio.resume();
    return;
  }
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctx) audio = new Ctx();
}

/** Two soft rising tones, plus a vibration on devices that support it. */
export function turnAlert() {
  navigator.vibrate?.([40, 70, 40]);
  if (!soundEnabled() || !audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  [660, 880].forEach((freq, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + i * 0.12;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(audio!.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  });
}

// ---------------- 액션 효과음 ----------------
// 파일 없이 Web Audio로 직접 만들어요. 종류마다 다른 소리:
// 체크 = 테이블 두 번 톡톡, 콜 = 칩 두 개 딸깍, 벳 = 칩 몇 개 놓기,
// 레이즈 = 칩 여러 개 + 올라가는 음, 올인 = 칩 와르르 + 낮은 쿵, 폴드 = 카드 쓱 미는 소리

export type ActionSound = 'check' | 'call' | 'bet' | 'raise' | 'allin' | 'fold';

let noise: AudioBuffer | null = null;
function noiseBuffer(ctx: AudioContext) {
  if (noise) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** 짧은 잡음 덩어리 (두드림, 카드 마찰) */
function burst(ctx: AudioContext, t: number, opts: { freq: number; q?: number; dur: number; gain: number; type?: BiquadFilterType; sweepTo?: number }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq, t);
  if (opts.sweepTo) filter.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + opts.dur);
  filter.Q.value = opts.q ?? 1;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(opts.gain, t + Math.min(0.01, opts.dur / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t);
  src.stop(t + opts.dur + 0.02);
}

/** 칩끼리 부딪히는 '딸깍': 높은 금속성 두 음 + 아주 짧은 잡음 */
function clink(ctx: AudioContext, t: number, pitch = 1, level = 1) {
  [3100, 4650].forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f * pitch * (1 + (Math.random() - 0.5) * 0.04);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime((i ? 0.035 : 0.06) * level, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  });
  burst(ctx, t, { freq: 6000, q: 0.8, dur: 0.03, gain: 0.05 * level, type: 'highpass' });
}

function tone(ctx: AudioContext, t: number, from: number, to: number, dur: number, level: number, type: OscillatorType = 'sine') {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function actionSound(kind: ActionSound) {
  if (!soundEnabled() || !audio || audio.state !== 'running') return;
  const ctx = audio;
  const t = ctx.currentTime + 0.01;
  switch (kind) {
    case 'check':
      // 손가락으로 테이블 톡톡
      burst(ctx, t, { freq: 420, q: 2.5, dur: 0.09, gain: 0.5, type: 'lowpass' });
      burst(ctx, t + 0.14, { freq: 420, q: 2.5, dur: 0.09, gain: 0.42, type: 'lowpass' });
      break;
    case 'call':
      clink(ctx, t, 1);
      clink(ctx, t + 0.09, 0.97, 0.8);
      break;
    case 'bet':
      [0, 0.07, 0.13, 0.2].forEach((d, i) => clink(ctx, t + d, 1 - i * 0.02, 0.9));
      break;
    case 'raise':
      [0, 0.06, 0.11, 0.16, 0.21, 0.26].forEach((d, i) => clink(ctx, t + d, 0.95 + i * 0.03, 0.9));
      tone(ctx, t + 0.05, 440, 880, 0.32, 0.07, 'triangle');
      break;
    case 'allin':
      for (let i = 0; i < 12; i++) clink(ctx, t + i * 0.035 + Math.random() * 0.02, 0.9 + Math.random() * 0.2, 0.8);
      tone(ctx, t, 110, 55, 0.6, 0.25);
      tone(ctx, t + 0.12, 330, 990, 0.45, 0.06, 'triangle');
      // 칩 소리 뒤에 사람 목소리로 "올인!"
      setTimeout(() => say('올인!'), 380);
      break;
    case 'fold':
      // 카드를 테이블 위로 쓱
      burst(ctx, t, { freq: 2400, q: 0.7, dur: 0.22, gain: 0.16, sweepTo: 700 });
      break;
  }
}

// ---------------- 목소리 (올인) ----------------
// 녹음 파일 없이 기기에 들어 있는 한국어 음성(브라우저 음성 합성)으로 말해요.
// 아이폰 사파리는 처음 한 번은 사용자가 화면을 누를 때 말하기를 시작해야 해서, 터치할 때 빈 문장으로 미리 깨워둬요.

let primed = false;
function primeSpeech() {
  if (primed || !('speechSynthesis' in window)) return;
  primed = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    // 음성 합성을 못 쓰는 브라우저면 목소리만 빠져요
  }
}

function koreanVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'ko-KR' && /yuna|google|heami|sunhi/i.test(v.name)) ?? voices.find((v) => v.lang.startsWith('ko'));
}

export function say(text: string) {
  if (!soundEnabled() || !('speechSynthesis' in window)) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    const voice = koreanVoice();
    if (voice) u.voice = voice;
    u.rate = 1.05;
    u.pitch = 0.9;
    u.volume = 1;
    synth.speak(u);
  } catch {
    // 무시: 소리만 안 나요
  }
}
