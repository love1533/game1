'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { saveScore } from '@/lib/ranking';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Character {
  name: string;
  color: string;
  emoji: string;
  heart: string;
  bgColor: string;
}

interface FruitDef {
  emoji: string;
  name: string;
  color: string;
}

interface SkeweredFruit {
  emoji: string;
  name: string;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: 'star' | 'circle' | 'heart' | 'sparkle' | 'crystal' | 'bubble';
  rotation: number;
  rotSpeed: number;
}

interface Gallery {
  fruits: SkeweredFruit[];
  syrupColor: string;
  stars: number;
  charIdx: number;
  coating: 'thin' | 'perfect' | 'thick';
}

type Phase =
  | 'select'
  | 'pickFruits'
  | 'makeSyrup'
  | 'coating'
  | 'hardening'
  | 'complete'
  | 'gallery';

// ─── Constants ────────────────────────────────────────────────────────────────
const CHARACTERS: Character[] = [
  { name: '승민', color: '#3B82F6', emoji: '🤖', heart: '💙', bgColor: '#EFF6FF' },
  { name: '건우', color: '#10B981', emoji: '🩺', heart: '💚', bgColor: '#ECFDF5' },
  { name: '강우', color: '#F59E0B', emoji: '👨‍🍳', heart: '🧡', bgColor: '#FFFBEB' },
  { name: '수현', color: '#EC4899', emoji: '💃', heart: '💗', bgColor: '#FDF2F8' },
  { name: '이현', color: '#FF69B4', emoji: '👸', heart: '💖', bgColor: '#FCE4EC' },
];

const FRUIT_DEFS: FruitDef[] = [
  { emoji: '🍓', name: '딸기', color: '#FF6B6B' },
  { emoji: '🍇', name: '포도', color: '#9B59B6' },
  { emoji: '🍊', name: '귤', color: '#FF8C00' },
  { emoji: '🍑', name: '복숭아', color: '#FFB347' },
  { emoji: '🍌', name: '바나나', color: '#FFD700' },
  { emoji: '🫐', name: '블루베리', color: '#4169E1' },
  { emoji: '🥝', name: '키위', color: '#6DB33F' },
];

const SKEWER_MAX = 5;
const STEPS = ['과일 고르기', '설탕 시럽', '코팅하기', '굳히기', '완성!'];

// Syrup color stops: white → light yellow → golden (PERFECT) → dark brown (BURNED)
const SYRUP_COLORS = [
  { t: 0,    color: [255, 255, 255] as [number, number, number] }, // white
  { t: 0.25, color: [255, 255, 200] as [number, number, number] }, // light yellow
  { t: 0.50, color: [255, 210, 80]  as [number, number, number] }, // yellow-gold
  { t: 0.62, color: [220, 160, 20]  as [number, number, number] }, // GOLDEN PERFECT start
  { t: 0.78, color: [200, 130, 10]  as [number, number, number] }, // GOLDEN PERFECT end
  { t: 0.88, color: [140, 70,  10]  as [number, number, number] }, // dark amber
  { t: 1.0,  color: [60,  30,  5]   as [number, number, number] }, // burned
];

// ─── Audio helpers ─────────────────────────────────────────────────────────────
function getAudioCtxSingleton(ref: React.MutableRefObject<AudioContext | null>): AudioContext {
  if (!ref.current) ref.current = new AudioContext();
  if (ref.current.state === 'suspended') ref.current.resume();
  return ref.current;
}

function playBubble(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300 + Math.random() * 200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(); osc.stop(ctx.currentTime + 0.18);
  } catch { /* ignore */ }
}

function playDrip(ctx: AudioContext) {
  try {
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.12;
      osc.frequency.setValueAtTime(800 - i * 120, t);
      osc.frequency.exponentialRampToValueAtTime(300, t + 0.1);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.start(t); osc.stop(t + 0.15);
    }
  } catch { /* ignore */ }
}

function playCrystal(ctx: AudioContext) {
  try {
    const notes = [1046.5, 1318.5, 1568];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'triangle';
      const t = ctx.currentTime + i * 0.07;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.start(t); osc.stop(t + 0.26);
    });
  } catch { /* ignore */ }
}

function playCelebration(ctx: AudioContext) {
  try {
    const melody = [523.25, 659.25, 783.99, 1046.5, 783.99, 880, 1046.5];
    melody.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.12;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.start(t); osc.stop(t + 0.16);
    });
  } catch { /* ignore */ }
}

function playChime(ctx: AudioContext, freq = 880) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.4, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(); osc.stop(ctx.currentTime + 0.31);
  } catch { /* ignore */ }
}

// ─── Color interpolation ──────────────────────────────────────────────────────
function interpolateSyrupColor(t: number): string {
  const stops = SYRUP_COLORS;
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      lo = stops[i]; hi = stops[i + 1]; break;
    }
  }
  const f = lo.t === hi.t ? 0 : (t - lo.t) / (hi.t - lo.t);
  const r = Math.round(lo.color[0] + (hi.color[0] - lo.color[0]) * f);
  const g = Math.round(lo.color[1] + (hi.color[1] - lo.color[1]) * f);
  const b = Math.round(lo.color[2] + (hi.color[2] - lo.color[2]) * f);
  return `rgb(${r},${g},${b})`;
}

function isSyrupGolden(t: number): boolean {
  return t >= 0.55 && t <= 0.82;
}

function isSyrupBurned(t: number): boolean {
  return t > 0.88;
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────
function drawRoundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawEmoji(ctx: CanvasRenderingContext2D, emoji: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.font = `${size}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x, y);
  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, p.life) * 0.9;
  if (p.type === 'star') {
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const ia = ((i * 4 + 2) * Math.PI) / 5 - Math.PI / 2;
      if (i === 0) ctx.moveTo(Math.cos(a) * p.size, Math.sin(a) * p.size);
      else ctx.lineTo(Math.cos(a) * p.size, Math.sin(a) * p.size);
      ctx.lineTo(Math.cos(ia) * p.size * 0.4, Math.sin(ia) * p.size * 0.4);
    }
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
  } else if (p.type === 'heart') {
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.beginPath();
    ctx.moveTo(0, p.size * 0.3);
    ctx.bezierCurveTo(-p.size * 0.5, -p.size * 0.2, -p.size, p.size * 0.1, 0, p.size);
    ctx.bezierCurveTo(p.size, p.size * 0.1, p.size * 0.5, -p.size * 0.2, 0, p.size * 0.3);
    ctx.fillStyle = p.color;
    ctx.fill();
  } else if (p.type === 'sparkle') {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + p.rotation;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(a) * p.size * 1.4, p.y + Math.sin(a) * p.size * 1.4);
      ctx.stroke();
    }
  } else if (p.type === 'crystal') {
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.beginPath();
    ctx.moveTo(0, -p.size);
    ctx.lineTo(p.size * 0.5, 0);
    ctx.lineTo(0, p.size);
    ctx.lineTo(-p.size * 0.5, 0);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (p.type === 'bubble') {
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  }
  ctx.restore();
}

function spawnParticles(
  particles: Particle[],
  x: number, y: number,
  count: number,
  colors: string[],
  types: Particle['type'][],
  speed = 3,
  gravity = true
) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = speed * (0.5 + Math.random());
    particles.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 20,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - (gravity ? 1.5 : 0),
      life: 1,
      maxLife: 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 5,
      type: types[Math.floor(Math.random() * types.length)],
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.2,
    });
  }
}

function updateParticles(particles: Particle[], dt: number): Particle[] {
  for (const p of particles) {
    p.x += p.vx * dt * 0.06;
    p.y += p.vy * dt * 0.06;
    p.vy += 0.08;
    p.life -= dt * 0.012;
    p.rotation += p.rotSpeed;
  }
  return particles.filter(p => p.life > 0);
}

// ─── Main State ───────────────────────────────────────────────────────────────
interface GameState {
  phase: Phase;
  selectedChar: number;

  // Phase 1: fruit picking
  skewered: SkeweredFruit[];

  // Phase 2: syrup
  syrupTemp: number;       // 0–1
  stirPoints: { x: number; y: number; t: number }[];
  stirSpeed: number;       // computed from recent stir points
  syrupDone: boolean;
  syrupBurned: boolean;
  lastStirTime: number;

  // Phase 3: coating
  skEwerY: number;         // vertical position of skewer (0=above, 1=fully dipped)
  dipping: boolean;
  dipStartY: number;
  coatingLevel: number;    // 0–1 based on dip time
  coatDone: boolean;
  coatDipTime: number;     // ms spent dipped

  // Phase 4: hardening
  hardness: number;        // 0–1
  tapCount: number;
  lastTapTime: number;
  iceTapCooldown: number;

  // Phase 5: complete
  stars: number;
  coatingRating: 'thin' | 'perfect' | 'thick';
  celebTimer: number;

  // gallery
  gallery: Gallery[];

  // shared
  particles: Particle[];
  canvasW: number;
  canvasH: number;
  gleamAngle: number;
  animT: number;

  // touch tracking for stir gesture
  touchHistory: { x: number; y: number; t: number }[];
  lastTouchX: number;
  lastTouchY: number;

  // drag state for coating
  dragActive: boolean;
  dragStartY: number;
  currentDragY: number;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function TanghuluPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const lastFrameTime = useRef<number>(0);
  const bubbleCooldown = useRef<number>(0);

  const gs = useRef<GameState>({
    phase: 'select',
    selectedChar: 4,
    skewered: [],
    syrupTemp: 0,
    stirPoints: [],
    stirSpeed: 0,
    syrupDone: false,
    syrupBurned: false,
    lastStirTime: 0,
    skEwerY: 0,
    dipping: false,
    dipStartY: 0,
    coatingLevel: 0,
    coatDone: false,
    coatDipTime: 0,
    hardness: 0,
    tapCount: 0,
    lastTapTime: 0,
    iceTapCooldown: 0,
    stars: 0,
    coatingRating: 'perfect',
    celebTimer: 0,
    gallery: [],
    particles: [],
    canvasW: 0,
    canvasH: 0,
    gleamAngle: 0,
    animT: 0,
    touchHistory: [],
    lastTouchX: 0,
    lastTouchY: 0,
    dragActive: false,
    dragStartY: 0,
    currentDragY: 0,
  });

  const [uiPhase, setUiPhase] = useState<Phase>('select');
  const [selectedChar, setSelectedChar] = useState(4);

  const getAudio = useCallback(() => getAudioCtxSingleton(audioCtxRef), []);

  // ─── Phase transitions ─────────────────────────────────────────────────────
  const goToPhase = useCallback((phase: Phase) => {
    gs.current.phase = phase;
    setUiPhase(phase);
  }, []);

  const startGame = useCallback((charIdx: number) => {
    const s = gs.current;
    s.selectedChar = charIdx;
    s.skewered = [];
    s.syrupTemp = 0;
    s.stirPoints = [];
    s.stirSpeed = 0;
    s.syrupDone = false;
    s.syrupBurned = false;
    s.lastStirTime = 0;
    s.skEwerY = 0;
    s.dipping = false;
    s.coatingLevel = 0;
    s.coatDone = false;
    s.coatDipTime = 0;
    s.hardness = 0;
    s.tapCount = 0;
    s.lastTapTime = 0;
    s.iceTapCooldown = 0;
    s.celebTimer = 0;
    s.particles = [];
    s.touchHistory = [];
    s.dragActive = false;
    goToPhase('pickFruits');
  }, [goToPhase]);

  const finishFruits = useCallback(() => {
    if (gs.current.skewered.length === 0) return;
    playChime(getAudio(), 660);
    goToPhase('makeSyrup');
  }, [getAudio, goToPhase]);

  const finishSyrup = useCallback(() => {
    const s = gs.current;
    if (!isSyrupGolden(s.syrupTemp)) return;
    s.syrupDone = true;
    playChime(getAudio(), 880);
    spawnParticles(s.particles, s.canvasW / 2, s.canvasH * 0.45, 30,
      ['#FFD700', '#FFA500', '#FFEC8B', '#FFB300'],
      ['star', 'sparkle', 'circle']);
    goToPhase('coating');
  }, [getAudio, goToPhase]);

  const computeRating = useCallback(() => {
    const s = gs.current;
    // Stars: syrup golden (0–1), coating (0–1), hardness (0–1)
    const syrupScore = isSyrupGolden(s.syrupTemp) ? 1 : isSyrupBurned(s.syrupTemp) ? 0 : 0.5;
    const coatScore = s.coatingRating === 'perfect' ? 1 : 0.5;
    const hardScore = s.hardness >= 0.95 ? 1 : s.hardness >= 0.7 ? 0.7 : 0.4;
    const fruitScore = Math.min(1, s.skewered.length / SKEWER_MAX);
    const total = (syrupScore + coatScore + hardScore + fruitScore) / 4;
    return total >= 0.85 ? 3 : total >= 0.6 ? 2 : 1;
  }, []);

  const finishHardening = useCallback(() => {
    const s = gs.current;
    s.stars = computeRating();
    playCelebration(getAudio());
    spawnParticles(s.particles, s.canvasW / 2, s.canvasH * 0.3, 60,
      ['#FFD700', '#FF69B4', '#FFC0CB', '#FFEC8B', '#FF1493'],
      ['star', 'heart', 'sparkle', 'circle'], 5);
    s.gallery.push({
      fruits: [...s.skewered],
      syrupColor: interpolateSyrupColor(s.syrupTemp),
      stars: s.stars,
      charIdx: s.selectedChar,
      coating: s.coatingRating,
    });
    saveScore('tanghulu', CHARACTERS[s.selectedChar].name, s.stars);
    goToPhase('complete');
  }, [getAudio, computeRating, goToPhase]);

  // ─── Drawing ───────────────────────────────────────────────────────────────
  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#FFF5FA');
    grad.addColorStop(0.5, '#FFE8F4');
    grad.addColorStop(1, '#FFD6EC');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Floating bg decorations
    const decos = ['🌸', '✨', '💗', '⭐', '🍬', '💕', '🌺'];
    decos.forEach((d, i) => {
      const x = (w * (i * 137.5 % 100)) / 100;
      const y = (h * ((i * 61.8 % 100))) / 100;
      const bob = Math.sin(t * 0.001 + i * 1.1) * 8;
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.font = '22px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d, x, y + bob);
      ctx.restore();
    });
  }, []);

  const drawStepIndicator = useCallback((ctx: CanvasRenderingContext2D, w: number, currentStep: number) => {
    const totalSteps = 5;
    const bw = Math.min(w - 32, 360);
    const bx = (w - bw) / 2;
    const by = 14;
    const bh = 40;

    ctx.save();
    drawRoundRect(ctx, bx, by, bw, bh, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.shadowColor = 'rgba(255,105,180,0.15)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.strokeStyle = '#FFB3D9';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    const stepW = bw / totalSteps;
    STEPS.forEach((label, i) => {
      const sx = bx + stepW * i + stepW / 2;
      const sy = by + bh / 2;
      const active = i === currentStep;
      const done = i < currentStep;

      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, 10, 0, Math.PI * 2);
      ctx.fillStyle = done ? '#FF69B4' : active ? '#FF1493' : 'rgba(255,179,217,0.4)';
      ctx.fill();
      if (active) {
        ctx.strokeStyle = '#FF1493';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.font = `bold ${active ? 11 : 9}px sans-serif`;
      ctx.fillStyle = active ? '#FF1493' : done ? '#FF69B4' : '#FFB3D9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(done ? '✓' : `${i + 1}`, sx, sy);
      ctx.restore();
    });
  }, []);

  // ─── Phase 1: Pick Fruits ────────────────────────────────────────────────────
  const drawPickFruits = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const s = gs.current;
    drawBackground(ctx, w, h, t);
    drawStepIndicator(ctx, w, 0);

    // Title
    ctx.save();
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#FF69B4';
    ctx.textAlign = 'center';
    ctx.fillText('🍓 과일을 고르세요! (최대 5개)', w / 2, 76);
    ctx.restore();

    // Vertical skewer in center
    const skewerX = w / 2;
    const skewerTop = h * 0.18;
    const skewerBottom = h * 0.72;
    const fruitSpacing = (skewerBottom - skewerTop) / (SKEWER_MAX + 0.5);

    // Wooden skewer stick
    ctx.save();
    const stickGrad = ctx.createLinearGradient(skewerX - 5, 0, skewerX + 5, 0);
    stickGrad.addColorStop(0, '#C8935A');
    stickGrad.addColorStop(0.4, '#E8C99A');
    stickGrad.addColorStop(1, '#B87840');
    ctx.strokeStyle = stickGrad;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(180,120,60,0.3)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(skewerX, skewerTop - 20);
    ctx.lineTo(skewerX, skewerBottom + 30);
    ctx.stroke();
    ctx.restore();

    // Skewer tip sparkle
    drawEmoji(ctx, '✨', skewerX, skewerTop - 26, 14);

    // Empty slot indicators
    for (let i = 0; i < SKEWER_MAX; i++) {
      const fy = skewerBottom - i * fruitSpacing;
      if (i >= s.skewered.length) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(skewerX, fy, 22, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,179,217,0.5)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Skewered fruits
    s.skewered.forEach((fruit, i) => {
      const fy = skewerBottom - i * fruitSpacing;
      // Syrup coat glow placeholder
      ctx.save();
      const glowGrad = ctx.createRadialGradient(skewerX, fy, 8, skewerX, fy, 30);
      glowGrad.addColorStop(0, `rgba(255,220,150,0.1)`);
      glowGrad.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(skewerX, fy, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawEmoji(ctx, fruit.emoji, skewerX, fy, 40);
    });

    // Fruit palette below
    const palY = h * 0.79;
    const fruitCount = FRUIT_DEFS.length;
    const paletteW = Math.min(w - 32, fruitCount * 60);
    const startX = (w - paletteW) / 2 + 30;

    // Palette card bg
    ctx.save();
    drawRoundRect(ctx, (w - paletteW - 20) / 2, palY - 44, paletteW + 20, 100, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.shadowColor = 'rgba(255,105,180,0.15)';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.strokeStyle = '#FFB3D9';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#FF69B4';
    ctx.textAlign = 'center';
    ctx.fillText('탭해서 꼬치에 꿰어요!', w / 2, palY - 28);
    ctx.restore();

    FRUIT_DEFS.forEach((f, i) => {
      const fx = startX + i * (paletteW / (fruitCount - 1));
      const bob = Math.sin(t * 0.002 + i * 0.8) * 3;
      drawEmoji(ctx, f.emoji, fx, palY + bob, 34);
      ctx.save();
      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#FF85C1';
      ctx.textAlign = 'center';
      ctx.fillText(f.name, fx, palY + 24);
      ctx.restore();
    });

    // Instruction hint
    ctx.save();
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#FFB3D9';
    ctx.textAlign = 'center';
    ctx.fillText('꼬치에서 탭하면 제거돼요', w / 2, h * 0.92);
    ctx.restore();

    // Next button
    if (s.skewered.length > 0) {
      const bx = w / 2 - 80;
      const by2 = h * 0.93;
      ctx.save();
      drawRoundRect(ctx, bx, by2, 160, 40, 14);
      ctx.fillStyle = '#FF69B4';
      ctx.shadowColor = 'rgba(255,105,180,0.35)';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`다음 (${s.skewered.length}/5) →`, w / 2, by2 + 20);
      ctx.restore();
    }
  }, [drawBackground, drawStepIndicator]);

  // ─── Phase 2: Make Syrup ─────────────────────────────────────────────────────
  const drawMakeSyrup = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const s = gs.current;
    drawBackground(ctx, w, h, t);
    drawStepIndicator(ctx, w, 1);

    // Title
    ctx.save();
    ctx.font = 'bold 19px sans-serif';
    ctx.fillStyle = '#FF69B4';
    ctx.textAlign = 'center';
    ctx.fillText('🍯 설탕 시럽 만들기', w / 2, 76);
    ctx.restore();

    const potCX = w / 2;
    const potCY = h * 0.45;
    const potR = Math.min(w * 0.28, 100);

    // Stove (burner)
    ctx.save();
    const stoveW = potR * 3.2;
    const stoveH = 40;
    const stoveX = potCX - stoveW / 2;
    const stoveY = potCY + potR * 0.9;
    drawRoundRect(ctx, stoveX, stoveY, stoveW, stoveH, 8);
    ctx.fillStyle = '#555';
    ctx.fill();

    // Burner glow based on temp
    const burnAlpha = s.syrupTemp * 0.8;
    const burnColor = s.syrupBurned
      ? `rgba(255,50,0,${burnAlpha})`
      : `rgba(255,${180 - s.syrupTemp * 180},0,${burnAlpha})`;
    ctx.beginPath();
    ctx.ellipse(potCX, stoveY + 10, potR * 1.1, 18, 0, 0, Math.PI * 2);
    ctx.fillStyle = burnColor;
    ctx.fill();

    // Flame particles (based on temp)
    if (s.syrupTemp > 0.1) {
      const flameCount = Math.floor(s.syrupTemp * 6);
      for (let i = 0; i < flameCount; i++) {
        const fx = potCX + (Math.random() - 0.5) * potR * 1.5;
        const baseY = stoveY + 5;
        const flameH = 20 * s.syrupTemp;
        ctx.save();
        ctx.globalAlpha = 0.6;
        const flameGrad = ctx.createLinearGradient(fx, baseY - flameH, fx, baseY);
        flameGrad.addColorStop(0, 'rgba(255,255,0,0)');
        flameGrad.addColorStop(0.6, 'rgba(255,150,0,0.8)');
        flameGrad.addColorStop(1, 'rgba(255,50,0,0.9)');
        ctx.beginPath();
        ctx.ellipse(fx, baseY - flameH / 2, 6, flameH / 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = flameGrad;
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();

    // Copper pot body
    ctx.save();
    const potGrad = ctx.createRadialGradient(potCX - potR * 0.3, potCY - potR * 0.2, potR * 0.1,
      potCX, potCY, potR * 1.3);
    potGrad.addColorStop(0, '#F0C070');
    potGrad.addColorStop(0.4, '#D4873A');
    potGrad.addColorStop(0.8, '#B06020');
    potGrad.addColorStop(1, '#8B4513');
    ctx.beginPath();
    ctx.ellipse(potCX, potCY + potR * 0.7, potR * 1.05, potR * 0.35, 0, 0, Math.PI);
    ctx.moveTo(potCX - potR, potCY);
    ctx.lineTo(potCX - potR * 1.05, potCY + potR * 0.7);
    ctx.ellipse(potCX, potCY + potR * 0.7, potR * 1.05, potR * 0.35, 0, Math.PI, 0);
    ctx.lineTo(potCX + potR, potCY);
    ctx.fillStyle = potGrad;
    ctx.fill();
    ctx.restore();

    // Pot inner contents (syrup)
    const syrupColor = interpolateSyrupColor(s.syrupTemp);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(potCX, potCY + potR * 0.18, potR * 0.88, potR * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = syrupColor;
    ctx.fill();

    // Syrup surface shimmer
    if (s.syrupTemp > 0.15) {
      const shimmerGrad = ctx.createLinearGradient(potCX - potR * 0.8, 0, potCX + potR * 0.8, 0);
      shimmerGrad.addColorStop(0, 'rgba(255,255,255,0)');
      shimmerGrad.addColorStop(0.5, `rgba(255,255,255,${s.syrupTemp * 0.35})`);
      shimmerGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shimmerGrad;
      ctx.fill();
    }
    ctx.restore();

    // Bubbles in pot when hot
    if (s.syrupTemp > 0.3) {
      const bubbleCount = Math.floor(s.syrupTemp * 8);
      for (let i = 0; i < bubbleCount; i++) {
        const bx = potCX + (Math.random() - 0.5) * potR * 1.4;
        const by = potCY + potR * 0.05 + Math.sin(t * 0.005 + i) * 12;
        const br = 2 + Math.random() * 5;
        ctx.save();
        ctx.globalAlpha = 0.4 + Math.random() * 0.3;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Pot rim
    ctx.save();
    const rimGrad = ctx.createLinearGradient(potCX - potR * 1.1, potCY, potCX + potR * 1.1, potCY);
    rimGrad.addColorStop(0, '#8B4513');
    rimGrad.addColorStop(0.3, '#D4873A');
    rimGrad.addColorStop(0.7, '#C07830');
    rimGrad.addColorStop(1, '#8B4513');
    ctx.beginPath();
    ctx.ellipse(potCX, potCY, potR * 1.1, potR * 0.32, 0, 0, Math.PI * 2);
    ctx.strokeStyle = rimGrad;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();

    // Pot handles
    [-1, 1].forEach(side => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(potCX + side * (potR * 1.1 + 14), potCY + potR * 0.1, 14, Math.PI * 0.8, Math.PI * 2.2);
      ctx.strokeStyle = '#A0522D';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    });

    // Sugar + water label
    ctx.save();
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#FF85C1';
    ctx.textAlign = 'center';
    ctx.fillText('설탕 + 물', potCX, potCY + potR * 0.22);
    ctx.restore();

    // Temperature gauge
    const gaugeX = w - 56;
    const gaugeY = h * 0.28;
    const gaugeH = h * 0.38;

    ctx.save();
    drawRoundRect(ctx, gaugeX - 14, gaugeY, 28, gaugeH, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = '#FFB3D9';
    ctx.lineWidth = 1.5;
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // Gauge fill
    const fillH = gaugeH * 0.9 * s.syrupTemp;
    const gaugeColor = isSyrupBurned(s.syrupTemp)
      ? '#8B0000'
      : isSyrupGolden(s.syrupTemp)
        ? '#FFD700'
        : s.syrupTemp > 0.3
          ? '#FFA500'
          : '#87CEEB';
    ctx.save();
    drawRoundRect(ctx, gaugeX - 8, gaugeY + (gaugeH * 0.9 - fillH) + gaugeH * 0.05, 16, fillH, 6);
    ctx.fillStyle = gaugeColor;
    ctx.fill();
    ctx.restore();

    // Gauge labels
    const gaugeLabelX = gaugeX - 30;
    [
      { t: 0.62, label: '황금', color: '#FFD700' },
      { t: 0.82, label: '최고!', color: '#FFA500' },
      { t: 0.88, label: '위험', color: '#FF4500' },
    ].forEach(({ t: lt, label, color }) => {
      const ly = gaugeY + gaugeH * 0.9 * (1 - lt) + gaugeH * 0.05;
      ctx.save();
      ctx.font = '9px sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.fillText(label, gaugeLabelX, ly + 4);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(gaugeLabelX + 2, ly);
      ctx.lineTo(gaugeX - 10, ly);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.restore();
    });

    // Temp label top
    ctx.save();
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#FF69B4';
    ctx.textAlign = 'center';
    ctx.fillText('온도', gaugeX, gaugeY - 8);
    ctx.restore();

    // Instructions
    const instrY = h * 0.82;
    const golden = isSyrupGolden(s.syrupTemp);
    const burned = isSyrupBurned(s.syrupTemp);

    ctx.save();
    drawRoundRect(ctx, w * 0.08, instrY, w * 0.84, 80, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.shadowColor = 'rgba(255,105,180,0.1)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.strokeStyle = golden ? '#FFD700' : '#FFB3D9';
    ctx.lineWidth = burned ? 2.5 : 1.5;
    if (burned) ctx.strokeStyle = '#FF4500';
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';

    if (burned) {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#FF4500';
      ctx.fillText('🔥 탔어요! 너무 빠르게 저었어요', w / 2, instrY + 22);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#FF6347';
      ctx.fillText('잠시 멈추고 천천히 저으세요', w / 2, instrY + 44);
    } else if (golden) {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#B8860B';
      ctx.fillText('✨ 황금빛 시럽 완성! 지금 누르세요!', w / 2, instrY + 22);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#DAA520';
      ctx.fillText('"완성!" 버튼을 눌러요', w / 2, instrY + 44);
    } else if (s.syrupTemp < 0.2) {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#FF69B4';
      ctx.fillText('냄비 위에서 원을 그리며 저어요!', w / 2, instrY + 22);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#FF85C1';
      ctx.fillText('🌀 원형으로 천천히~', w / 2, instrY + 44);
    } else {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#FF8C00';
      ctx.fillText('계속 저어요~ 황금빛이 될 때까지!', w / 2, instrY + 22);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#FFA500';
      ctx.fillText(`온도: ${Math.round(s.syrupTemp * 100)}%`, w / 2, instrY + 44);
    }
    ctx.restore();

    // Stir trail
    if (s.touchHistory.length > 1) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      s.touchHistory.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      ctx.restore();
    }

    // Completion button when golden
    if (golden && !s.syrupDone) {
      const bx = w / 2 - 90;
      const by2 = instrY + 58;
      ctx.save();
      const pulse = 1 + Math.sin(t * 0.008) * 0.04;
      ctx.translate(w / 2, by2 + 22);
      ctx.scale(pulse, pulse);
      ctx.translate(-w / 2, -(by2 + 22));
      drawRoundRect(ctx, bx, by2, 180, 44, 16);
      ctx.fillStyle = '#FFD700';
      ctx.shadowColor = 'rgba(255,215,0,0.5)';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = '#8B6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('완성! ✨', w / 2, by2 + 22);
      ctx.restore();
    }

    // Particles
    s.particles.forEach(p => drawParticle(ctx, p));
  }, [drawBackground, drawStepIndicator]);

  // ─── Phase 3: Coating ────────────────────────────────────────────────────────
  const drawCoating = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const s = gs.current;
    drawBackground(ctx, w, h, t);
    drawStepIndicator(ctx, w, 2);

    ctx.save();
    ctx.font = 'bold 19px sans-serif';
    ctx.fillStyle = '#FF69B4';
    ctx.textAlign = 'center';
    ctx.fillText('🍯 시럽에 코팅하기', w / 2, 76);
    ctx.restore();

    const potCX = w / 2;
    const potCY = h * 0.72;
    const potR = Math.min(w * 0.3, 110);

    // Syrup pot
    ctx.save();
    const potGrad = ctx.createRadialGradient(potCX - potR * 0.3, potCY - potR * 0.2, potR * 0.1,
      potCX, potCY, potR * 1.3);
    potGrad.addColorStop(0, '#F0C070');
    potGrad.addColorStop(0.5, '#D4873A');
    potGrad.addColorStop(1, '#8B4513');
    ctx.beginPath();
    ctx.ellipse(potCX, potCY + potR * 0.7, potR * 1.05, potR * 0.3, 0, 0, Math.PI);
    ctx.moveTo(potCX - potR, potCY);
    ctx.lineTo(potCX - potR * 1.05, potCY + potR * 0.7);
    ctx.ellipse(potCX, potCY + potR * 0.7, potR * 1.05, potR * 0.3, 0, Math.PI, 0);
    ctx.lineTo(potCX + potR, potCY);
    ctx.fillStyle = potGrad;
    ctx.fill();
    ctx.restore();

    // Syrup surface in pot
    const syrupC = interpolateSyrupColor(s.syrupTemp);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(potCX, potCY + potR * 0.15, potR * 0.88, potR * 0.28, 0, 0, Math.PI * 2);
    ctx.fillStyle = syrupC;
    ctx.fill();
    // Gloss
    const sGloss = ctx.createLinearGradient(potCX - potR * 0.7, 0, potCX + potR * 0.7, 0);
    sGloss.addColorStop(0, 'rgba(255,255,255,0)');
    sGloss.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    sGloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sGloss;
    ctx.fill();
    ctx.restore();

    // Pot rim
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(potCX, potCY, potR * 1.1, potR * 0.32, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#D4873A';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.restore();

    // Drip effect when dipping
    if (s.dipping && s.coatDipTime > 200) {
      const dripCount = 3;
      for (let i = 0; i < dripCount; i++) {
        const dx = potCX + (i - 1) * 25 + Math.sin(t * 0.003 + i) * 8;
        const dripY = potCY + potR * 0.15 - 10;
        const dripLen = 20 + Math.sin(t * 0.005 + i * 2) * 10;
        ctx.save();
        const dripGrad = ctx.createLinearGradient(dx, dripY, dx, dripY + dripLen);
        dripGrad.addColorStop(0, syrupC);
        dripGrad.addColorStop(1, 'rgba(200,130,10,0)');
        ctx.strokeStyle = dripGrad;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(dx, dripY);
        ctx.lineTo(dx, dripY + dripLen);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Skewer position based on drag or auto
    const skewerBaseY = h * 0.12;
    const dippedY = potCY - potR * 0.2;
    const skewerY = skewerBaseY + (dippedY - skewerBaseY) * s.skEwerY;
    const skewerX = potCX;

    const fruitSpacing = 52;
    const firstFruitY = skewerY + 80;

    // Draw skewer stick
    ctx.save();
    const stickGrad2 = ctx.createLinearGradient(skewerX - 5, 0, skewerX + 5, 0);
    stickGrad2.addColorStop(0, '#C8935A');
    stickGrad2.addColorStop(0.4, '#E8C99A');
    stickGrad2.addColorStop(1, '#B87840');
    ctx.strokeStyle = stickGrad2;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(skewerX, skewerY);
    ctx.lineTo(skewerX, firstFruitY + s.skewered.length * fruitSpacing + 20);
    ctx.stroke();
    ctx.restore();

    // Draw fruits with syrup coating
    s.skewered.forEach((fruit, i) => {
      const fy = firstFruitY + i * fruitSpacing;
      const coated = s.coatingLevel > 0 && s.skEwerY > 0.3;

      if (coated) {
        const coatAlpha = Math.min(1, s.coatingLevel);
        // Amber syrup coat
        ctx.save();
        const coatGrad = ctx.createRadialGradient(skewerX, fy, 8, skewerX, fy, 30);
        coatGrad.addColorStop(0, `rgba(220,160,20,${coatAlpha * 0.6})`);
        coatGrad.addColorStop(0.6, `rgba(200,130,10,${coatAlpha * 0.4})`);
        coatGrad.addColorStop(1, `rgba(180,100,5,0)`);
        ctx.fillStyle = coatGrad;
        ctx.beginPath();
        ctx.arc(skewerX, fy, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Shiny gleam
        if (coatAlpha > 0.5) {
          const gleam = s.gleamAngle;
          ctx.save();
          ctx.beginPath();
          ctx.arc(skewerX, fy, 24, 0, Math.PI * 2);
          ctx.clip();
          const gleamGrad = ctx.createLinearGradient(
            skewerX + Math.cos(gleam) * -30, fy + Math.sin(gleam) * -30,
            skewerX + Math.cos(gleam) * 30, fy + Math.sin(gleam) * 30
          );
          gleamGrad.addColorStop(0, 'rgba(255,255,255,0)');
          gleamGrad.addColorStop(0.45, 'rgba(255,255,255,0)');
          gleamGrad.addColorStop(0.5, `rgba(255,255,255,${coatAlpha * 0.7})`);
          gleamGrad.addColorStop(0.55, 'rgba(255,255,255,0)');
          gleamGrad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gleamGrad;
          ctx.fillRect(skewerX - 30, fy - 30, 60, 60);
          ctx.restore();

          // Sparkle on fruit
          if (coatAlpha > 0.7 && Math.sin(t * 0.01 + i) > 0.7) {
            drawEmoji(ctx, '✨', skewerX + 18, fy - 18, 12);
          }
        }
      }

      drawEmoji(ctx, fruit.emoji, skewerX, fy, 38);
    });

    // Instructions
    const instrY = h * 0.85;
    ctx.save();
    drawRoundRect(ctx, w * 0.06, instrY, w * 0.88, 72, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.shadowColor = 'rgba(255,105,180,0.1)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.strokeStyle = '#FFB3D9';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';

    if (s.coatDone) {
      const rating = s.coatingRating;
      const msg = rating === 'perfect' ? '🌟 완벽한 코팅이에요!' :
        rating === 'thin' ? '💧 살짝 얇네요~ 괜찮아요!' : '🍯 두껍게 코팅했어요!';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#FF69B4';
      ctx.fillText(msg, w / 2, instrY + 22);

      // Next button
      const bx2 = w / 2 - 85;
      const by3 = instrY + 38;
      ctx.save();
      drawRoundRect(ctx, bx2, by3, 170, 38, 14);
      ctx.fillStyle = '#FF69B4';
      ctx.shadowColor = 'rgba(255,105,180,0.35)';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('굳히러 가기! 🧊 →', w / 2, by3 + 19);
      ctx.restore();
    } else if (s.skEwerY > 0.5) {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#FF8C00';
      ctx.fillText('시럽에 담가지고 있어요~ 🍯', w / 2, instrY + 22);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#FFA500';
      const pct = Math.round(s.coatingLevel * 100);
      ctx.fillText(`코팅 중: ${pct}%  위로 올리면 완성!`, w / 2, instrY + 44);
    } else {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#FF69B4';
      ctx.fillText('꼬치를 아래로 드래그하세요! ↓', w / 2, instrY + 22);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#FF85C1';
      ctx.fillText('아래로 내려서 시럽에 담가요', w / 2, instrY + 44);
    }
    ctx.restore();

    // Particles
    s.particles.forEach(p => drawParticle(ctx, p));
  }, [drawBackground, drawStepIndicator]);

  // ─── Phase 4: Hardening ───────────────────────────────────────────────────────
  const drawHardening = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const s = gs.current;
    drawBackground(ctx, w, h, t);
    drawStepIndicator(ctx, w, 3);

    ctx.save();
    ctx.font = 'bold 19px sans-serif';
    ctx.fillStyle = '#5DADE2';
    ctx.textAlign = 'center';
    ctx.fillText('🧊 탕후루 굳히기', w / 2, 76);
    ctx.restore();

    // Ice tray
    const trayW = Math.min(w * 0.85, 340);
    const trayH = trayW * 0.55;
    const trayX = (w - trayW) / 2;
    const trayY = h * 0.35;

    // Ice tray bg
    ctx.save();
    const iceGrad = ctx.createLinearGradient(trayX, trayY, trayX, trayY + trayH);
    iceGrad.addColorStop(0, '#E8F4FD');
    iceGrad.addColorStop(1, '#AED6F1');
    drawRoundRect(ctx, trayX, trayY, trayW, trayH, 18);
    ctx.fillStyle = iceGrad;
    ctx.shadowColor = 'rgba(93,173,226,0.3)';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.strokeStyle = '#5DADE2';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // Ice crystals on tray
    const crystalCount = Math.floor(s.hardness * 20);
    for (let i = 0; i < crystalCount; i++) {
      const cx2 = trayX + (i * 137.5 % trayW) * 0.9 + trayW * 0.05;
      const cy2 = trayY + (i * 61.8 % trayH) * 0.8 + trayH * 0.1;
      const cSize = 3 + (i % 3) * 2;
      ctx.save();
      ctx.globalAlpha = 0.4 + (i % 3) * 0.15;
      ctx.fillStyle = `rgba(174,214,241,${0.6 + s.hardness * 0.4})`;
      ctx.beginPath();
      ctx.translate(cx2, cy2);
      ctx.rotate((i * 30 + t * 0.001) % (Math.PI * 2));
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * cSize, Math.sin(a) * cSize);
      }
      ctx.strokeStyle = 'rgba(93,173,226,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // Skewer on ice tray
    const skewerX2 = w / 2;
    const skewerOnTrayY = trayY + 20;
    const fruitSpacing2 = 52;
    const firstFruitY2 = skewerOnTrayY + 40;

    // Skewer stick
    ctx.save();
    const stickGrad3 = ctx.createLinearGradient(skewerX2 - 5, 0, skewerX2 + 5, 0);
    stickGrad3.addColorStop(0, '#C8935A');
    stickGrad3.addColorStop(0.4, '#E8C99A');
    stickGrad3.addColorStop(1, '#B87840');
    ctx.strokeStyle = stickGrad3;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(skewerX2, skewerOnTrayY);
    ctx.lineTo(skewerX2, firstFruitY2 + s.skewered.length * fruitSpacing2 + 15);
    ctx.stroke();
    ctx.restore();

    // Fruits with glassy coating
    s.skewered.forEach((fruit, i) => {
      const fy = firstFruitY2 + i * fruitSpacing2;
      const hardAlpha = s.hardness;

      // Coat
      ctx.save();
      const coatGrad2 = ctx.createRadialGradient(skewerX2, fy, 8, skewerX2, fy, 28);
      coatGrad2.addColorStop(0, `rgba(220,160,20,${hardAlpha * 0.5})`);
      coatGrad2.addColorStop(0.7, `rgba(200,130,10,${hardAlpha * 0.3})`);
      coatGrad2.addColorStop(1, 'rgba(180,100,5,0)');
      ctx.fillStyle = coatGrad2;
      ctx.beginPath();
      ctx.arc(skewerX2, fy, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Ice crystals on fruit
      if (s.hardness > 0.3) {
        for (let k = 0; k < 3; k++) {
          const ca = (k * 2.1) + t * 0.001;
          const cr = 18 + k * 4;
          const cx3 = skewerX2 + Math.cos(ca) * cr;
          const cy3 = fy + Math.sin(ca) * cr;
          ctx.save();
          ctx.globalAlpha = s.hardness * 0.6;
          ctx.fillStyle = 'rgba(174,214,241,0.8)';
          ctx.beginPath();
          ctx.arc(cx3, cy3, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Hardened glass shine
      if (s.hardness > 0.6) {
        ctx.save();
        ctx.globalAlpha = (s.hardness - 0.6) * 2 * 0.5;
        ctx.beginPath();
        ctx.arc(skewerX2 - 6, fy - 10, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fill();
        ctx.restore();
      }

      drawEmoji(ctx, fruit.emoji, skewerX2, fy, 36);
    });

    // Progress bar
    const pbW = Math.min(w - 60, 300);
    const pbX = (w - pbW) / 2;
    const pbY = h * 0.74;

    ctx.save();
    drawRoundRect(ctx, pbX, pbY, pbW, 22, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.strokeStyle = '#5DADE2';
    ctx.lineWidth = 1.5;
    ctx.fill(); ctx.stroke();

    // Fill
    const fillW = pbW * s.hardness;
    if (fillW > 8) {
      const pbFill = ctx.createLinearGradient(pbX, 0, pbX + fillW, 0);
      pbFill.addColorStop(0, '#5DADE2');
      pbFill.addColorStop(1, '#85C1E9');
      drawRoundRect(ctx, pbX + 2, pbY + 2, Math.max(8, fillW - 4), 18, 6);
      ctx.fillStyle = pbFill;
      ctx.fill();
    }

    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = s.hardness > 0.5 ? 'white' : '#5DADE2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      s.hardness >= 1 ? '딱딱! 완성!' : `굳는 중... ${Math.round(s.hardness * 100)}%`,
      pbX + pbW / 2, pbY + 11
    );
    ctx.restore();

    // Instructions
    const instrY2 = h * 0.81;
    ctx.save();
    drawRoundRect(ctx, w * 0.06, instrY2, w * 0.88, 78, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.strokeStyle = '#AED6F1';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    if (s.hardness >= 1) {
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#2E86AB';
      ctx.fillText('🎊 완전히 굳었어요! 딱딱해졌어요!', w / 2, instrY2 + 22);
      // Complete button
      const bx3 = w / 2 - 85;
      const by4 = instrY2 + 38;
      ctx.save();
      drawRoundRect(ctx, bx3, by4, 170, 40, 14);
      ctx.fillStyle = '#FF69B4';
      ctx.shadowColor = 'rgba(255,105,180,0.35)';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('완성 보러가기! 🍡', w / 2, by4 + 20);
      ctx.restore();
    } else {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#2E86AB';
      ctx.fillText('탕후루를 탭탭탭! 두드려보세요! 🫳', w / 2, instrY2 + 22);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#5DADE2';
      ctx.fillText(`총 ${s.tapCount}번 두드렸어요!`, w / 2, instrY2 + 44);
    }
    ctx.restore();

    // Tap ripple particles
    s.particles.forEach(p => drawParticle(ctx, p));
  }, [drawBackground, drawStepIndicator]);

  // ─── Phase 5: Complete ────────────────────────────────────────────────────────
  const drawComplete = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const s = gs.current;
    drawBackground(ctx, w, h, t);
    drawStepIndicator(ctx, w, 4);

    const char = CHARACTERS[s.selectedChar];

    // Celebration title
    ctx.save();
    const titleScale = 1 + Math.sin(t * 0.004) * 0.03;
    ctx.translate(w / 2, 76);
    ctx.scale(titleScale, titleScale);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#FF1493';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,20,147,0.3)';
    ctx.shadowBlur = 10;
    ctx.fillText('🎊 탕후루 완성! 🎊', 0, 0);
    ctx.restore();

    // Star rating
    const stars = s.stars;
    const starY = h * 0.17;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '36px serif';
    ctx.fillText('⭐'.repeat(stars) + (stars < 3 ? '☆'.repeat(3 - stars) : ''), w / 2, starY);
    ctx.restore();

    // Finished tanghulu display (large, beautiful)
    const displayCX = w / 2;
    const displayTop = h * 0.25;
    const fruitSpacing3 = 58;

    // Glow backdrop
    ctx.save();
    const glowGrad = ctx.createRadialGradient(displayCX, displayTop + s.skewered.length * fruitSpacing3 * 0.5, 20,
      displayCX, displayTop + s.skewered.length * fruitSpacing3 * 0.5, 140);
    glowGrad.addColorStop(0, 'rgba(255,215,0,0.2)');
    glowGrad.addColorStop(0.5, 'rgba(255,105,180,0.1)');
    glowGrad.addColorStop(1, 'rgba(255,105,180,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(displayCX - 150, displayTop - 30, 300, s.skewered.length * fruitSpacing3 + 80);
    ctx.restore();

    // Skewer stick
    ctx.save();
    const stickGrad4 = ctx.createLinearGradient(displayCX - 5, 0, displayCX + 5, 0);
    stickGrad4.addColorStop(0, '#C8935A');
    stickGrad4.addColorStop(0.4, '#E8C99A');
    stickGrad4.addColorStop(1, '#B87840');
    ctx.strokeStyle = stickGrad4;
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(180,120,60,0.4)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(displayCX, displayTop - 24);
    ctx.lineTo(displayCX, displayTop + s.skewered.length * fruitSpacing3 + 30);
    ctx.stroke();
    ctx.restore();

    drawEmoji(ctx, '✨', displayCX, displayTop - 30, 16);

    // Fruits with full glassy coating
    s.skewered.forEach((fruit, i) => {
      const fy = displayTop + i * fruitSpacing3;
      const bob = Math.sin(t * 0.002 + i * 0.5) * 4;

      // Full amber coat
      ctx.save();
      const coatGrad3 = ctx.createRadialGradient(displayCX, fy + bob, 5, displayCX, fy + bob, 34);
      coatGrad3.addColorStop(0, 'rgba(220,160,20,0.7)');
      coatGrad3.addColorStop(0.5, 'rgba(200,130,10,0.5)');
      coatGrad3.addColorStop(0.8, 'rgba(180,100,5,0.25)');
      coatGrad3.addColorStop(1, 'rgba(180,100,5,0)');
      ctx.fillStyle = coatGrad3;
      ctx.beginPath();
      ctx.arc(displayCX, fy + bob, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Glassy reflection
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(displayCX, fy + bob, 26, 0, Math.PI * 2);
      ctx.clip();
      const refGrad = ctx.createLinearGradient(
        displayCX + Math.cos(s.gleamAngle) * -30, fy + bob + Math.sin(s.gleamAngle) * -30,
        displayCX + Math.cos(s.gleamAngle) * 30, fy + bob + Math.sin(s.gleamAngle) * 30
      );
      refGrad.addColorStop(0, 'rgba(255,255,255,0)');
      refGrad.addColorStop(0.45, 'rgba(255,255,255,0)');
      refGrad.addColorStop(0.5, 'rgba(255,255,255,0.65)');
      refGrad.addColorStop(0.55, 'rgba(255,255,255,0)');
      refGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = refGrad;
      ctx.fillRect(displayCX - 35, fy + bob - 35, 70, 70);
      ctx.restore();

      // Small white highlight dot
      ctx.save();
      ctx.beginPath();
      ctx.arc(displayCX - 8, fy + bob - 10, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
      ctx.restore();

      drawEmoji(ctx, fruit.emoji, displayCX, fy + bob, 42);
    });

    // Character eating animation
    const charCX = w * 0.78;
    const charCY = h * 0.43;
    const bounce = Math.abs(Math.sin(t * 0.005)) * 10;
    ctx.save();
    ctx.beginPath();
    ctx.arc(charCX, charCY - bounce, 38, 0, Math.PI * 2);
    ctx.fillStyle = char.bgColor;
    ctx.shadowColor = char.color + '88';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.strokeStyle = char.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    const eatEmojis = ['😋', '🤤', '😄', '🥰', '😍'];
    drawEmoji(ctx, eatEmojis[Math.floor(t * 0.006) % eatEmojis.length], charCX, charCY - bounce, 40);

    ctx.save();
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = char.color;
    ctx.textAlign = 'center';
    ctx.fillText(char.name, charCX, charCY - bounce + 50);
    ctx.restore();

    // Rating box
    const rateY = h * 0.66;
    ctx.save();
    drawRoundRect(ctx, w * 0.08, rateY, w * 0.84, 80, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.shadowColor = 'rgba(255,105,180,0.15)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.strokeStyle = '#FFB3D9';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    const ratingMessages = [
      '', // 0
      '🍡 잘 만들었어요! 더 연습하면 완벽해요!',
      '🌟 훌륭해요! 거의 완벽한 탕후루!',
      '🏆 완벽한 탕후루! 진짜 탕후루 장인이에요!',
    ];
    ctx.save();
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#FF1493';
    ctx.textAlign = 'center';
    ctx.fillText(ratingMessages[stars], w / 2, rateY + 24);

    const coatMsg = s.coatingRating === 'perfect' ? '코팅: 완벽 ✨' :
      s.coatingRating === 'thin' ? '코팅: 얇음 💧' : '코팅: 두꺼움 🍯';
    const syrupMsg = isSyrupGolden(s.syrupTemp) ? '시럽: 황금빛 🥇' :
      isSyrupBurned(s.syrupTemp) ? '시럽: 약간 탔어요 🔥' : '시럽: 좋아요 👍';
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#FF85C1';
    ctx.fillText(`${syrupMsg}  |  ${coatMsg}  |  굳기: ${Math.round(s.hardness * 100)}%`, w / 2, rateY + 48);
    ctx.restore();

    // Buttons
    const btn1Y = h * 0.81;
    ctx.save();
    drawRoundRect(ctx, w / 2 - 155, btn1Y, 148, 44, 16);
    ctx.fillStyle = '#FF69B4';
    ctx.shadowColor = 'rgba(255,105,180,0.35)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('다시 만들기 🍡', w / 2 - 155 + 74, btn1Y + 22);
    ctx.restore();

    ctx.save();
    drawRoundRect(ctx, w / 2 + 7, btn1Y, 148, 44, 16);
    ctx.fillStyle = '#FF85C1';
    ctx.fill();
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`갤러리 보기 (${s.gallery.length}) 📸`, w / 2 + 7 + 74, btn1Y + 22);
    ctx.restore();

    // Particles
    s.particles.forEach(p => drawParticle(ctx, p));
  }, [drawBackground, drawStepIndicator]);

  // ─── Gallery ────────────────────────────────────────────────────────────────
  const drawGallery = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const s = gs.current;
    drawBackground(ctx, w, h, t);

    ctx.save();
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#FF69B4';
    ctx.textAlign = 'center';
    ctx.fillText('📸 내가 만든 탕후루', w / 2, 36);
    ctx.restore();

    if (s.gallery.length === 0) {
      ctx.save();
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#FFB3D9';
      ctx.textAlign = 'center';
      ctx.fillText('아직 만든 탕후루가 없어요!', w / 2, h / 2);
      ctx.restore();
    } else {
      const cols = Math.min(3, s.gallery.length);
      const cardW = Math.min((w - 32) / cols - 8, 120);
      const cardH = cardW * 1.6;
      const totalW = cols * (cardW + 8) - 8;
      const startX = (w - totalW) / 2;

      s.gallery.forEach((item, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cx = startX + col * (cardW + 8);
        const cy = 60 + row * (cardH + 12);

        ctx.save();
        drawRoundRect(ctx, cx, cy, cardW, cardH, 14);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.shadowColor = item.syrupColor;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.strokeStyle = '#FFB3D9';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // Mini skewer
        const msCX = cx + cardW / 2;
        const msTop = cy + 12;
        ctx.save();
        ctx.strokeStyle = '#E8C99A';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(msCX, msTop);
        ctx.lineTo(msCX, cy + cardH - 28);
        ctx.stroke();
        ctx.restore();

        item.fruits.forEach((fruit, fi) => {
          const fy = msTop + 10 + fi * (cardH * 0.65 / item.fruits.length);
          drawEmoji(ctx, fruit.emoji, msCX, fy, 18);
        });

        // Stars
        ctx.save();
        ctx.font = '11px serif';
        ctx.textAlign = 'center';
        ctx.fillText('⭐'.repeat(item.stars), msCX, cy + cardH - 14);
        ctx.restore();

        // Char emoji
        ctx.save();
        ctx.font = '14px serif';
        ctx.textAlign = 'left';
        ctx.fillText(CHARACTERS[item.charIdx].emoji, cx + 4, cy + 16);
        ctx.restore();
      });
    }

    // Back button
    const btnY = h - 60;
    ctx.save();
    drawRoundRect(ctx, w / 2 - 85, btnY, 170, 44, 16);
    ctx.fillStyle = '#FF69B4';
    ctx.shadowColor = 'rgba(255,105,180,0.3)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('← 돌아가기', w / 2, btnY + 22);
    ctx.restore();
  }, [drawBackground]);

  // ─── Main Loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gs.current.canvasW = canvas.width;
      gs.current.canvasH = canvas.height;
    };
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d')!;

    const loop = (now: number) => {
      const dt = Math.min(now - lastFrameTime.current, 50);
      lastFrameTime.current = now;

      const s = gs.current;
      const w = canvas.width;
      const h = canvas.height;
      s.animT = now;
      s.gleamAngle += 0.04;

      ctx.clearRect(0, 0, w, h);

      if (s.phase === 'select') {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      if (s.phase === 'pickFruits') {
        drawPickFruits(ctx, w, h, now);
      }

      if (s.phase === 'makeSyrup') {
        // Syrup stirring logic
        const now2 = Date.now();
        const timeSinceStir = now2 - s.lastStirTime;

        if (timeSinceStir > 400) {
          // Slow cool-down if not stirring fast enough
          s.syrupTemp = Math.max(0, s.syrupTemp - dt * 0.00015);
        }

        // Apply stir speed to temperature
        if (s.stirSpeed > 0 && timeSinceStir < 300) {
          const targetRate = 0.00025; // rate at perfect stir speed
          const speedRatio = Math.min(2, s.stirSpeed / 80); // 80 is ideal speed
          if (speedRatio > 1.8) {
            // Too fast: risk burning
            s.syrupTemp = Math.min(1, s.syrupTemp + dt * 0.0005);
            if (s.syrupTemp > 0.88) s.syrupBurned = true;
          } else if (speedRatio < 0.3) {
            // Too slow: barely heats
            s.syrupTemp = Math.min(0.5, s.syrupTemp + dt * 0.00005);
          } else {
            // Good range
            const rate = targetRate * speedRatio;
            s.syrupTemp = Math.min(0.98, s.syrupTemp + dt * rate);
            if (s.syrupBurned && s.syrupTemp < 0.85) s.syrupBurned = false;
          }
        }

        // Bubble sounds
        bubbleCooldown.current -= dt;
        if (s.syrupTemp > 0.3 && bubbleCooldown.current <= 0) {
          playBubble(getAudio());
          bubbleCooldown.current = 400 - s.syrupTemp * 300;
        }

        // Cleanup old touch history
        const cutoff = Date.now() - 600;
        s.touchHistory = s.touchHistory.filter(pt => pt.t > cutoff);

        drawMakeSyrup(ctx, w, h, now);
      }

      if (s.phase === 'coating') {
        // Dip physics
        if (s.dragActive) {
          const dragDelta = s.currentDragY - s.dragStartY;
          s.skEwerY = Math.max(0, Math.min(1, dragDelta / (h * 0.4)));
        } else if (!s.coatDone) {
          // Spring back up
          s.skEwerY = Math.max(0, s.skEwerY - dt * 0.004);
        }

        s.dipping = s.skEwerY > 0.5;

        if (s.dipping) {
          s.coatDipTime += dt;
          s.coatingLevel = Math.min(1, s.coatDipTime / 2500);
        }

        // Auto-complete if lifted after some dipping
        if (!s.dragActive && s.coatDipTime > 400 && s.skEwerY < 0.2 && !s.coatDone) {
          s.coatDone = true;
          // Determine coating quality
          if (s.coatDipTime < 900) s.coatingRating = 'thin';
          else if (s.coatDipTime < 3500) s.coatingRating = 'perfect';
          else s.coatingRating = 'thick';

          playDrip(getAudio());
          spawnParticles(s.particles, w / 2, h * 0.4, 20,
            ['#FFD700', '#FFA500', '#FFEC8B'],
            ['sparkle', 'circle', 'star'], 3);
        }

        drawCoating(ctx, w, h, now);
      }

      if (s.phase === 'hardening') {
        // Auto harden slowly
        s.hardness = Math.min(1, s.hardness + dt * 0.00012);

        // Ice formation particles
        if (Math.random() < 0.04 && s.hardness < 0.95) {
          const ix = w / 2 + (Math.random() - 0.5) * 160;
          const iy = h * 0.38 + Math.random() * 180;
          spawnParticles(s.particles, ix, iy, 2,
            ['rgba(174,214,241,0.8)', 'rgba(93,173,226,0.6)', 'rgba(255,255,255,0.9)'],
            ['crystal', 'sparkle'], 0.8, false);
        }

        if (s.hardness >= 1 && s.iceTapCooldown <= 0) {
          playCrystal(getAudio());
          s.iceTapCooldown = 9999; // only once
        }

        s.iceTapCooldown -= dt;

        drawHardening(ctx, w, h, now);
      }

      if (s.phase === 'complete') {
        s.celebTimer += dt;
        if (s.celebTimer < 400) {
          spawnParticles(s.particles, w * Math.random(), h * 0.2, 2,
            ['#FFD700', '#FF69B4', '#FFC0CB', '#FF1493'],
            ['star', 'heart', 'sparkle'], 4);
        }
        drawComplete(ctx, w, h, now);
      }

      if (s.phase === 'gallery') {
        drawGallery(ctx, w, h, now);
      }

      // Update particles
      s.particles = updateParticles(s.particles, dt);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [drawPickFruits, drawMakeSyrup, drawCoating, drawHardening, drawComplete, drawGallery, getAudio]);

  // ─── Interaction handlers ──────────────────────────────────────────────────
  const handleInteract = useCallback((cx: number, cy: number, isStart: boolean) => {
    const s = gs.current;
    getAudio(); // unlock audio

    if (s.phase === 'pickFruits') {
      const w = s.canvasW;
      const h = s.canvasH;
      const skewerX = w / 2;
      const skewerBottom = h * 0.72;
      const fruitSpacing = (skewerBottom - h * 0.18) / (SKEWER_MAX + 0.5);

      // Check if tapping skewered fruit (to remove)
      for (let i = s.skewered.length - 1; i >= 0; i--) {
        const fy = skewerBottom - i * fruitSpacing;
        const dx = cx - skewerX;
        const dy = cy - fy;
        if (dx * dx + dy * dy < 30 * 30) {
          s.skewered.splice(i, 1);
          playChime(getAudio(), 440);
          return;
        }
      }

      // Check if tapping palette fruit
      const palY = h * 0.79;
      const fruitCount = FRUIT_DEFS.length;
      const paletteW = Math.min(w - 32, fruitCount * 60);
      const startX = (w - paletteW) / 2 + 30;

      FRUIT_DEFS.forEach((f, i) => {
        const fx = startX + i * (paletteW / (fruitCount - 1));
        const dx = cx - fx;
        const dy = cy - palY;
        if (dx * dx + dy * dy < 36 * 36 && s.skewered.length < SKEWER_MAX) {
          s.skewered.push({ emoji: f.emoji, name: f.name, color: f.color });
          playChime(getAudio(), 660 + i * 40);
          spawnParticles(s.particles, fx, palY, 8,
            ['#FFB3C6', '#FF69B4', '#FFD6E8'],
            ['circle', 'heart', 'sparkle'], 3);
        }
      });

      // Next button
      if (s.skewered.length > 0) {
        const bx = w / 2 - 80;
        const by = h * 0.93;
        if (cx >= bx && cx <= bx + 160 && cy >= by && cy <= by + 40) {
          finishFruits();
        }
      }
      return;
    }

    if (s.phase === 'makeSyrup') {
      const w = s.canvasW;
      const h = s.canvasH;
      const potCX = w / 2;
      const potCY = h * 0.45;
      const potR = Math.min(w * 0.28, 100);

      // Check if touching pot area for stirring
      const dx = cx - potCX;
      const dy = cy - potCY;
      if (dx * dx + dy * dy < (potR * 1.4) * (potR * 1.4)) {
        s.touchHistory.push({ x: cx, y: cy, t: Date.now() });
        s.lastTouchX = cx;
        s.lastTouchY = cy;
        s.lastStirTime = Date.now();

        // Compute stir speed from recent points
        if (s.touchHistory.length >= 3) {
          const recent = s.touchHistory.slice(-6);
          let totalDist = 0;
          let totalTime = 0;
          for (let i = 1; i < recent.length; i++) {
            const ddx = recent[i].x - recent[i - 1].x;
            const ddy = recent[i].y - recent[i - 1].y;
            totalDist += Math.sqrt(ddx * ddx + ddy * ddy);
            totalTime += recent[i].t - recent[i - 1].t;
          }
          s.stirSpeed = totalTime > 0 ? (totalDist / totalTime) * 100 : 0;
        }
      }

      // Check golden finish button
      if (isSyrupGolden(s.syrupTemp) && !s.syrupDone) {
        const instrY = h * 0.82;
        const bx = w / 2 - 90;
        const by = instrY + 58;
        if (cx >= bx && cx <= bx + 180 && cy >= by && cy <= by + 44) {
          finishSyrup();
        }
      }
      return;
    }

    if (s.phase === 'coating') {
      const h = s.canvasH;
      if (isStart) {
        s.dragActive = true;
        s.dragStartY = cy;
        s.currentDragY = cy;
      }

      // Check next button when done
      if (s.coatDone) {
        const instrY = h * 0.85;
        const w2 = s.canvasW;
        const bx = w2 / 2 - 85;
        const by = instrY + 38;
        if (cx >= bx && cx <= bx + 170 && cy >= by && cy <= by + 38) {
          goToPhase('hardening');
          playChime(getAudio(), 880);
        }
      }
      return;
    }

    if (s.phase === 'hardening') {
      const w = s.canvasW;
      const h = s.canvasH;

      // Tap on tanghulu
      const trayX = (w - Math.min(w * 0.85, 340)) / 2;
      const trayW = Math.min(w * 0.85, 340);
      const trayY = h * 0.35;
      const trayH = trayW * 0.55;

      if (cx >= trayX && cx <= trayX + trayW && cy >= trayY && cy <= trayY + trayH) {
        const now2 = Date.now();
        if (now2 - s.lastTapTime > 150) { // debounce
          s.tapCount++;
          s.hardness = Math.min(1, s.hardness + 0.04);
          s.lastTapTime = now2;

          playCrystal(getAudio());
          spawnParticles(s.particles, cx, cy, 6,
            ['rgba(174,214,241,0.9)', 'rgba(93,173,226,0.8)', 'white'],
            ['crystal', 'circle', 'sparkle'], 2, false);

          if (s.hardness >= 1) {
            spawnParticles(s.particles, w / 2, h * 0.5, 20,
              ['#5DADE2', '#AED6F1', '#FFFFFF', '#FFD700'],
              ['crystal', 'star', 'sparkle'], 4);
          }
        }
      }

      // Complete button
      if (s.hardness >= 1) {
        const instrY2 = h * 0.81;
        const bx3 = w / 2 - 85;
        const by4 = instrY2 + 38;
        if (cx >= bx3 && cx <= bx3 + 170 && cy >= by4 && cy <= by4 + 40) {
          finishHardening();
        }
      }
      return;
    }

    if (s.phase === 'complete') {
      const w = s.canvasW;
      const h = s.canvasH;
      const btn1Y = h * 0.81;

      // Remake button
      if (cx >= w / 2 - 155 && cx <= w / 2 - 7 && cy >= btn1Y && cy <= btn1Y + 44) {
        startGame(s.selectedChar);
      }

      // Gallery button
      if (cx >= w / 2 + 7 && cx <= w / 2 + 155 && cy >= btn1Y && cy <= btn1Y + 44) {
        goToPhase('gallery');
      }
      return;
    }

    if (s.phase === 'gallery') {
      const w = s.canvasW;
      const h = s.canvasH;
      const btnY = h - 60;
      if (cx >= w / 2 - 85 && cx <= w / 2 + 85 && cy >= btnY && cy <= btnY + 44) {
        goToPhase('complete');
      }
      return;
    }
  }, [getAudio, finishFruits, finishSyrup, goToPhase, finishHardening, startGame]);

  const handleTouchMove = useCallback((cx: number, cy: number) => {
    const s = gs.current;
    if (s.phase === 'makeSyrup') {
      handleInteract(cx, cy, false);
    }
    if (s.phase === 'coating') {
      s.currentDragY = cy;
    }
  }, [handleInteract]);

  const handleTouchEnd = useCallback(() => {
    const s = gs.current;
    if (s.phase === 'coating') {
      s.dragActive = false;
    }
    if (s.phase === 'makeSyrup') {
      s.stirSpeed = 0;
    }
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvasRef.current!.getBoundingClientRect();
    handleInteract(touch.clientX - rect.left, touch.clientY - rect.top, true);
  }, [handleInteract]);

  const onTouchMoveEvt = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvasRef.current!.getBoundingClientRect();
    handleTouchMove(touch.clientX - rect.left, touch.clientY - rect.top);
  }, [handleTouchMove]);

  const onTouchEndEvt = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    handleTouchEnd();
  }, [handleTouchEnd]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    handleInteract(e.clientX - rect.left, e.clientY - rect.top, true);
  }, [handleInteract]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (e.buttons === 0) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    handleTouchMove(e.clientX - rect.left, e.clientY - rect.top);
  }, [handleTouchMove]);

  const onMouseUp = useCallback(() => {
    handleTouchEnd();
  }, [handleTouchEnd]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', background: '#FFF5FA', position: 'relative' }}>
      <style>{`
        @keyframes kawaii-bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-8px) scale(1.05); }
        }
        @keyframes pink-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,105,180,0.4); }
          50% { box-shadow: 0 0 0 10px rgba(255,105,180,0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .char-card { transition: transform 0.15s, box-shadow 0.15s; cursor: pointer; }
        .char-card:active { transform: scale(0.93) !important; }
        .start-btn { animation: pink-pulse 1.5s ease-in-out infinite; }
      `}</style>

      <canvas
        ref={canvasRef}
        style={{
          display: uiPhase === 'select' ? 'none' : 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMoveEvt}
        onTouchEnd={onTouchEndEvt}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
      />

      {/* ── SELECT SCREEN ── */}
      {uiPhase === 'select' && (
        <div style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(160deg, #FFF5FA 0%, #FFE8F4 50%, #FFD6EC 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '20px 16px',
          overflowY: 'auto',
          boxSizing: 'border-box',
          gap: '0',
        }}>
          {/* Floating deco */}
          {['✨', '🌸', '💗', '⭐', '🍬'].map((sym, i) => (
            <span key={i} style={{
              position: 'fixed',
              fontSize: '20px',
              top: `${8 + i * 18}%`,
              left: i % 2 === 0 ? `${3 + i * 2}%` : `${88 - i * 2}%`,
              animation: `kawaii-bounce ${2 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.25}s`,
              opacity: 0.55,
              pointerEvents: 'none',
            }}>{sym}</span>
          ))}

          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: '10px', marginTop: '8px' }}>
            <div style={{ fontSize: '60px', animation: 'kawaii-bounce 2s ease-in-out infinite', lineHeight: 1.1 }}>🍡</div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '900',
              color: '#FF69B4',
              margin: '4px 0 2px',
              textShadow: '0 2px 10px rgba(255,105,180,0.3)',
              letterSpacing: '-0.5px',
            }}>탕후루 만들기</h1>
            <p style={{ fontSize: '13px', color: '#FF85C1', margin: 0, fontWeight: '600' }}>
              달콤한 탕후루를 직접 만들어봐요! ✨
            </p>
          </div>

          {/* 이현 추천 badge */}
          <div style={{
            background: 'linear-gradient(135deg, #FFD6EC, #FFADD5)',
            border: '2px solid #FF69B4',
            borderRadius: '22px',
            padding: '8px 22px',
            marginBottom: '14px',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(255,105,180,0.25)',
            animation: 'pink-pulse 1.8s ease-in-out infinite',
          }}>
            <span style={{ fontSize: '13px', fontWeight: '800', color: '#FF1493' }}>
              💗 이현이가 특별히 좋아하는 게임! 💗
            </span>
          </div>

          {/* Steps */}
          <div style={{
            background: 'rgba(255,255,255,0.88)',
            borderRadius: '18px',
            border: '1.5px solid #FFB3D9',
            padding: '12px 16px',
            marginBottom: '16px',
            maxWidth: '340px',
            width: '100%',
            boxSizing: 'border-box',
          }}>
            <p style={{ fontSize: '12px', fontWeight: '800', color: '#FF69B4', margin: '0 0 8px', textAlign: 'center' }}>
              🍡 만들기 과정
            </p>
            {[
              ['1️⃣', '과일 고르기', '꼬치에 과일을 꿰어요 (최대 5개)'],
              ['2️⃣', '설탕 시럽', '냄비를 원형으로 저어 황금빛 시럽!'],
              ['3️⃣', '코팅하기', '꼬치를 시럽에 담가 코팅해요'],
              ['4️⃣', '굳히기', '탭탭탭으로 얼음판 위에서 굳혀요'],
              ['5️⃣', '완성!', '별점 평가 & 갤러리 저장'],
            ].map(([num, title, desc]) => (
              <div key={title} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '4px', gap: '6px' }}>
                <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{num}</span>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#FF69B4' }}>{title}</span>
                  <span style={{ fontSize: '10px', color: '#999', marginLeft: '4px' }}>{desc}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Character select */}
          <p style={{ fontSize: '14px', fontWeight: '800', color: '#FF69B4', marginBottom: '10px', marginTop: '0' }}>
            캐릭터 선택 💕
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            maxWidth: '320px',
            width: '100%',
            marginBottom: '18px',
          }}>
            {CHARACTERS.map((char, i) => {
              const isSelected = selectedChar === i;
              const isIhyeon = i === 4;
              return (
                <div
                  key={char.name}
                  className={`char-card${isSelected ? ' char-selected' : ''}`}
                  onClick={() => setSelectedChar(i)}
                  style={{
                    background: isSelected
                      ? `linear-gradient(135deg, ${char.bgColor}, white)`
                      : 'rgba(255,255,255,0.85)',
                    border: isSelected ? `2.5px solid ${char.color}` : '2px solid #FFD6EC',
                    borderRadius: '20px',
                    padding: '14px 10px',
                    textAlign: 'center',
                    transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                    boxShadow: isSelected ? `0 6px 22px ${char.color}44` : '0 2px 8px rgba(255,180,220,0.15)',
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                >
                  {isIhyeon && (
                    <div style={{
                      position: 'absolute',
                      top: '-11px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'linear-gradient(135deg, #FF69B4, #FF1493)',
                      color: 'white',
                      fontSize: '9px',
                      fontWeight: '800',
                      padding: '3px 10px',
                      borderRadius: '10px',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 8px rgba(255,20,147,0.4)',
                    }}>이현's 추천! ⭐</div>
                  )}
                  <div style={{ fontSize: '38px', margin: '4px 0 2px', lineHeight: 1 }}>{char.emoji}</div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: char.color }}>{char.name}</div>
                  <div style={{ fontSize: '18px', marginTop: '2px' }}>{char.heart}</div>
                </div>
              );
            })}
          </div>

          <button
            className="start-btn"
            onClick={() => startGame(selectedChar)}
            style={{
              background: 'linear-gradient(135deg, #FF69B4, #FF1493)',
              color: 'white',
              border: 'none',
              borderRadius: '28px',
              padding: '16px 52px',
              fontSize: '18px',
              fontWeight: '900',
              cursor: 'pointer',
              boxShadow: '0 6px 24px rgba(255,20,147,0.35)',
              letterSpacing: '0.5px',
              marginBottom: '14px',
            }}
          >
            탕후루 만들러 가기! 🍡
          </button>

          <Link href="/" style={{
            fontSize: '13px',
            color: '#FFB3D9',
            textDecoration: 'none',
            fontWeight: '600',
            marginBottom: '20px',
          }}>← 홈으로 돌아가기</Link>
        </div>
      )}

      {/* Back button overlay during non-select phases */}
      {uiPhase !== 'select' && (
        <button
          onClick={() => { gs.current.phase = 'select'; setUiPhase('select'); }}
          style={{
            position: 'fixed',
            top: '14px',
            left: '14px',
            background: 'rgba(255,255,255,0.88)',
            border: '1.5px solid #FFB3D9',
            borderRadius: '20px',
            padding: '5px 12px',
            fontSize: '12px',
            color: '#FF69B4',
            fontWeight: '700',
            zIndex: 100,
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}
        >← 홈</button>
      )}
    </div>
  );
}
