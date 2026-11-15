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
  if (audio) {
    if (audio.state === 'suspended') void audio.resume();
    return;
  }
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctx) {
    audio = new Ctx();
    void loadSamples(audio);
  }
}

// ---------------- 녹음된 효과음 (public/sounds) ----------------
// Pixabay 무료 효과음(출처 표기 필요 없음)을 잘라서 넣었어요. 처음 터치할 때 한 번 받아두고 Web Audio로 재생해요.
const SAMPLE_FILES = {
  allin: '/sounds/allin.mp3',
  chipsA: '/sounds/chips-a.mp3',
  chipsB: '/sounds/chips-b.mp3',
  cardPlace: '/sounds/card-place.mp3',
  cardTakeA: '/sounds/card-take-a.mp3',
  cardTakeB: '/sounds/card-take-b.mp3',
} as const;
type Sample = keyof typeof SAMPLE_FILES;
const samples = new Map<Sample, AudioBuffer>();

async function loadSamples(ctx: AudioContext) {
  await Promise.all(
    (Object.keys(SAMPLE_FILES) as Sample[]).map(async (name) => {
      try {
        const res = await fetch(SAMPLE_FILES[name]);
        samples.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
      } catch {
        // 못 받으면 그 소리는 합성음으로 대신해요
      }
    }),
  );
}

/** 녹음 소리를 재생. 아직 못 받았으면 false */
function play(ctx: AudioContext, name: Sample, t: number, gain = 1, rate = 1): boolean {
  const buffer = samples.get(name);
  if (!buffer) return false;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(ctx.destination);
  src.start(t);
  return true;
}

/** 딜러가 카드를 깔 순간: 카드 장수만큼 '착' 소리 */
export function dealSound(cards: number) {
  if (!soundEnabled() || !audio || audio.state !== 'running') return;
  const ctx = audio;
  const t = ctx.currentTime + 0.02;
  for (let i = 0; i < cards; i++) play(ctx, i % 2 ? 'cardTakeB' : 'cardTakeA', t + i * 0.13, 0.9, 0.97 + i * 0.03);
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
  // 녹음된 소리 우선 (체크는 녹음이 없어서 합성한 테이블 톡톡)
  switch (kind) {
    case 'call':
      if (play(ctx, 'chipsB', t, 0.55)) return;
      break;
    case 'bet':
      if (play(ctx, 'chipsA', t, 0.55)) return;
      break;
    case 'raise':
      if (play(ctx, 'chipsA', t, 0.55)) {
        play(ctx, 'chipsB', t + 0.13, 0.5, 1.06);
        return;
      }
      break;
    case 'allin':
      if (play(ctx, 'allin', t, 0.8)) {
        tone(ctx, t + 0.05, 120, 55, 0.5, 0.18);
        return;
      }
      break;
    case 'fold':
      if (play(ctx, 'cardPlace', t, 0.95)) return;
      break;
  }
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
      break;
    case 'fold':
      // 카드를 테이블 위로 쓱
      burst(ctx, t, { freq: 2400, q: 0.7, dur: 0.22, gain: 0.16, sweepTo: 700 });
      break;
  }
}

