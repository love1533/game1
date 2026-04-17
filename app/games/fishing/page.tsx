'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { saveScore } from '@/lib/ranking';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Character {
  name: string;
  color: string;
  emoji: string;
  heart: string;
}

interface Fish {
  id: number;
  x: number;
  y: number;
  speed: number;       // px/frame, positive = right
  type: FishType;
  size: number;        // render scale
  wobble: number;      // phase offset for vertical sine
  hooked: boolean;
  caught: boolean;
}

type FishType = '🐟' | '🐠' | '🐡' | '🦈' | '🐙';

interface Bubble {
  x: number;
  y: number;
  r: number;
  speed: number;
  alpha: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHARACTERS: Character[] = [
  { name: '승민', color: '#3B82F6', emoji: '🤖', heart: '💙' },
  { name: '건우', color: '#10B981', emoji: '🩺', heart: '💚' },
  { name: '강우', color: '#F59E0B', emoji: '👨‍🍳', heart: '🧡' },
  { name: '수현', color: '#EC4899', emoji: '💃', heart: '💗' },
  { name: '이현', color: '#FF69B4', emoji: '👸', heart: '💖' },
];

const FISH_CATALOG: { type: FishType; pts: number; weight: number; label: string }[] = [
  { type: '🐟', pts: 10,  weight: 50, label: '작은 물고기' },
  { type: '🐠', pts: 30,  weight: 25, label: '열대어' },
  { type: '🐡', pts: 50,  weight: 15, label: '복어' },
  { type: '🦈', pts: 100, weight: 5,  label: '상어!!' },
  { type: '🐙', pts: 80,  weight: 5,  label: '문어' },
];

const GAME_DURATION   = 60;       // seconds
const WATER_TOP_RATIO = 0.38;     // water starts this fraction down the screen
const MAX_FISH        = 10;
const FISH_SPAWN_INTERVAL = 900;  // ms between spawns
// EASY: forgiving gauge window – anything in the middle 55% counts
const GAUGE_GOOD_MIN  = 0.225;
const GAUGE_GOOD_MAX  = 0.775;
const GAUGE_SPEED     = 0.55;     // gauge cycles per second (slow = easy)

// ─── Audio helpers ────────────────────────────────────────────────────────────

function playCatchSound(ctx: AudioContext) {
  try {
    const notes = [523, 659, 784];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.08;
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  } catch { /* ignore */ }
}

function playMissSound(ctx: AudioContext) {
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch { /* ignore */ }
}

function playSplashSound(ctx: AudioContext) {
  try {
    // Short white-noise burst for splash
    const bufLen = ctx.sampleRate * 0.12;
    const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
    const src  = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(ctx.currentTime);
  } catch { /* ignore */ }
}

function playComboSound(ctx: AudioContext, combo: number) {
  try {
    const base = 440 + combo * 60;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(base * 1.5, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.18);
  } catch { /* ignore */ }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function weightedRandom<T>(items: { weight: number; value: T }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FishingGame() {
  const canvasRef         = useRef<HTMLCanvasElement>(null);
  const [selectedChar, setSelectedChar] = useState<number | null>(null);
  const [gameStarted, setGameStarted]   = useState(false);
  const [gameOver, setGameOver]         = useState(false);
  const [finalScore, setFinalScore]     = useState(0);
  const [finalCombo, setFinalCombo]     = useState(0);
  const [finalCaught, setFinalCaught]   = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const startGame = useCallback((charIdx: number) => {
    setSelectedChar(charIdx);
    setGameOver(false);
    setGameStarted(true);
    getAudioCtx();
  }, [getAudioCtx]);

  const restartGame = useCallback(() => {
    if (selectedChar === null) return;
    setGameOver(false);
    setGameStarted(false);
    // small delay so the effect re-fires cleanly
    setTimeout(() => setGameStarted(true), 50);
  }, [selectedChar]);

  // ─── Game Loop ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!gameStarted || selectedChar === null) return;

    const canvasMaybe = canvasRef.current;
    if (!canvasMaybe) return;
    const ctxMaybe = canvasMaybe.getContext('2d');
    if (!ctxMaybe) return;
    const canvas = canvasMaybe;
    const ctx    = ctxMaybe;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width  = W;
    canvas.height = H;

    const waterTop = H * WATER_TOP_RATIO;
    const char     = CHARACTERS[selectedChar];

    // ── State ──────────────────────────────────────────────────────────────
    let score      = 0;
    let combo      = 0;
    let maxCombo   = 0;
    let caught     = 0;
    let timeLeft   = GAME_DURATION;
    let lastTime   = performance.now();
    let elapsed    = 0;
    let isOver     = false;

    // Fishing line / rod state
    // Phases: 'idle' | 'casting' | 'fishing' | 'reeling'
    type Phase = 'idle' | 'casting' | 'fishing' | 'reeling';
    let phase: Phase      = 'idle';
    let lineY             = waterTop + 30;  // current hook Y
    let lineTargetY       = waterTop + 30;
    let gaugeValue        = 0;              // 0..1
    let gaugeDir          = 1;
    let hookFishId: number | null = null;   // fish near hook
    let reelingAnim       = 0;             // 0..1 for reel-in animation

    // Cast animation
    let castProgress      = 0;   // 0..1

    // Splash particles
    interface Splash { x: number; y: number; vx: number; vy: number; life: number; }
    let splashes: Splash[] = [];

    // Floating score texts
    let floatingTexts: FloatingText[] = [];

    // Fish
    let fishList: Fish[]   = [];
    let nextFishId         = 0;
    let lastSpawnTime      = 0;

    // Bubbles
    let bubbles: Bubble[]  = [];
    for (let i = 0; i < 18; i++) {
      bubbles.push({
        x: Math.random() * W,
        y: waterTop + Math.random() * (H - waterTop),
        r: 2 + Math.random() * 6,
        speed: 0.3 + Math.random() * 0.6,
        alpha: 0.15 + Math.random() * 0.3,
      });
    }

    // Wave offsets
    let wavePhase = 0;

    // Rod tip position (fixed in upper portion)
    const rodX  = W * 0.78;
    const rodY  = waterTop - 60;

    // ── Fish spawning ──────────────────────────────────────────────────────
    function spawnFish(now: number) {
      if (fishList.length >= MAX_FISH) return;
      if (now - lastSpawnTime < FISH_SPAWN_INTERVAL) return;
      lastSpawnTime = now;

      const type = weightedRandom(
        FISH_CATALOG.map(f => ({ weight: f.weight, value: f.type }))
      );
      const goRight = Math.random() > 0.5;
      // depth range: shallow to deep (avoid too near surface)
      const minY = waterTop + 60;
      const maxY = H - 50;
      const fishY = minY + Math.random() * (maxY - minY);
      // EASY: slow fish
      const baseSpeed = 0.6 + Math.random() * 1.1;

      fishList.push({
        id:     nextFishId++,
        x:      goRight ? -60 : W + 60,
        y:      fishY,
        speed:  goRight ? baseSpeed : -baseSpeed,
        type,
        size:   type === '🦈' ? 1.6 : type === '🐡' ? 1.2 : type === '🐙' ? 1.3 : 1.0,
        wobble: Math.random() * Math.PI * 2,
        hooked: false,
        caught: false,
      });
    }

    // ── Helpers ────────────────────────────────────────────────────────────
    function getHookPos(): { x: number; y: number } {
      return { x: rodX, y: lineY };
    }

    function findNearestFish(): Fish | null {
      const { x: hx, y: hy } = getHookPos();
      let nearest: Fish | null = null;
      let bestDist = 80; // catch radius
      for (const f of fishList) {
        if (f.caught) continue;
        const dx = f.x - hx;
        const dy = f.y - hy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          nearest  = f;
        }
      }
      return nearest;
    }

    function addFloatingText(x: number, y: number, text: string, color: string, size = 22) {
      floatingTexts.push({ x, y, text, life: 90, maxLife: 90, color, size });
    }

    function addSplash(x: number, y: number) {
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI + Math.random() * Math.PI; // upward spread
        const speed = 1.5 + Math.random() * 3;
        splashes.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3,
          life: 28 + Math.floor(Math.random() * 14),
        });
      }
    }

    // ── Input handler ──────────────────────────────────────────────────────
    function handleTap() {
      if (isOver) return;

      if (phase === 'idle') {
        // Cast line
        phase       = 'casting';
        castProgress = 0;
        lineTargetY = waterTop + 80 + Math.random() * (H - waterTop - 120);
        getAudioCtx();
        playSplashSound(getAudioCtx());
        addSplash(rodX, waterTop);
        return;
      }

      if (phase === 'fishing') {
        // Evaluate gauge
        const inZone = gaugeValue >= GAUGE_GOOD_MIN && gaugeValue <= GAUGE_GOOD_MAX;
        if (inZone && hookFishId !== null) {
          // SUCCESS – start reeling
          phase     = 'reeling';
          reelingAnim = 0;
          const fish = fishList.find(f => f.id === hookFishId);
          if (fish) fish.hooked = true;
          playCatchSound(getAudioCtx());
        } else {
          // MISS
          phase       = 'idle';
          lineY       = waterTop + 30;
          hookFishId  = null;
          combo       = 0;
          playMissSound(getAudioCtx());
          addFloatingText(rodX, waterTop - 20, '놓쳤다! 😢', '#FF6B6B');
        }
        return;
      }

      if (phase === 'casting') {
        // Allow cancelling cast? No – let it play out. Tap during casting does nothing.
        return;
      }
    }

    canvas.addEventListener('touchstart', handleTap, { passive: true });
    canvas.addEventListener('mousedown',  handleTap);

    // ── Draw helpers ───────────────────────────────────────────────────────

    function drawBackground() {
      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, waterTop);
      sky.addColorStop(0, '#B8E4F9');
      sky.addColorStop(1, '#D6F0FF');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, waterTop);

      // Pastel clouds
      const clouds = [
        { x: W * 0.12, y: H * 0.06, r: 28 },
        { x: W * 0.22, y: H * 0.04, r: 22 },
        { x: W * 0.17, y: H * 0.08, r: 18 },
        { x: W * 0.6,  y: H * 0.07, r: 32 },
        { x: W * 0.7,  y: H * 0.05, r: 24 },
        { x: W * 0.65, y: H * 0.09, r: 20 },
      ];
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const c of clouds) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sun
      ctx.fillStyle = '#FFE066';
      ctx.beginPath();
      ctx.arc(W * 0.88, H * 0.08, 26, 0, Math.PI * 2);
      ctx.fill();
      // Sun glow
      const sunGlow = ctx.createRadialGradient(W * 0.88, H * 0.08, 26, W * 0.88, H * 0.08, 48);
      sunGlow.addColorStop(0, 'rgba(255,224,102,0.35)');
      sunGlow.addColorStop(1, 'rgba(255,224,102,0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(W * 0.88, H * 0.08, 48, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawWater() {
      // Water body
      const waterGrad = ctx.createLinearGradient(0, waterTop, 0, H);
      waterGrad.addColorStop(0, '#A8D8EA');
      waterGrad.addColorStop(0.4, '#7EC8E3');
      waterGrad.addColorStop(1, '#4A90C4');
      ctx.fillStyle = waterGrad;
      ctx.fillRect(0, waterTop, W, H - waterTop);

      // Animated wave on surface
      ctx.beginPath();
      ctx.moveTo(0, waterTop);
      const waveAmp = 5;
      const waveLen = W / 4;
      for (let x = 0; x <= W; x += 4) {
        const y = waterTop + Math.sin((x / waveLen) * Math.PI * 2 + wavePhase) * waveAmp
                            + Math.sin((x / (waveLen * 0.6)) * Math.PI * 2 + wavePhase * 1.3) * (waveAmp * 0.4);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, waterTop - waveAmp * 2);
      ctx.lineTo(0, waterTop - waveAmp * 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(168, 216, 234, 0.7)';
      ctx.fill();

      // Water sheen streaks
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth   = 2;
      for (let i = 0; i < 5; i++) {
        const sx = W * (0.1 + i * 0.18) + Math.sin(wavePhase + i) * 10;
        const sw = 30 + i * 12;
        ctx.beginPath();
        ctx.moveTo(sx, waterTop + 20 + i * 15);
        ctx.lineTo(sx + sw, waterTop + 20 + i * 15);
        ctx.stroke();
      }
    }

    function drawBubbles() {
      for (const b of bubbles) {
        ctx.save();
        ctx.globalAlpha = b.alpha;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth   = 1.2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    function drawFish(f: Fish, now: number) {
      if (f.caught) return;
      ctx.save();
      ctx.font = `${Math.round(28 * f.size)}px serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      // Horizontal flip when going left
      if (f.speed < 0) {
        ctx.scale(-1, 1);
        ctx.translate(-f.x * 2, 0);
      }

      // Gentle vertical sine bob
      const bobY = f.y + Math.sin(now * 0.002 + f.wobble) * 4;
      ctx.fillText(f.type, f.x, bobY);
      ctx.restore();

      // Sparkle if hooked
      if (f.hooked) {
        ctx.save();
        ctx.font          = '14px serif';
        ctx.textAlign     = 'center';
        ctx.textBaseline  = 'middle';
        for (let i = 0; i < 4; i++) {
          const angle = (now * 0.004 + i * Math.PI / 2);
          const rx = f.x + Math.cos(angle) * 22;
          const ry = f.y + Math.sin(angle) * 14;
          ctx.fillText('✨', rx, ry);
        }
        ctx.restore();
      }
    }

    function drawRod() {
      // Simple fishing pole: diagonal line from corner to rodY
      const baseX = W * 0.62;
      const baseY = waterTop - 5;
      ctx.strokeStyle = '#8B5E3C';
      ctx.lineWidth   = 5;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(rodX, rodY);
      ctx.stroke();

      // Character emoji on rod handle
      ctx.font          = '28px serif';
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'middle';
      ctx.fillText(char.emoji, baseX - 12, baseY - 12);
    }

    function drawLine() {
      if (phase === 'idle') return;

      ctx.save();
      ctx.strokeStyle = 'rgba(160,160,180,0.85)';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(rodX, rodY);
      ctx.lineTo(rodX, lineY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Hook
      ctx.strokeStyle = '#AAAACC';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(rodX, lineY, 5, 0, Math.PI * 1.2);
      ctx.stroke();
      ctx.restore();
    }

    function drawGauge() {
      if (phase !== 'fishing') return;

      const gx  = W * 0.5 - 90;
      const gy  = waterTop - 50;
      const gw  = 180;
      const gh  = 28;
      const rad = 14;

      // Background
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      roundRect(ctx, gx, gy, gw, gh, rad);
      ctx.fill();
      ctx.strokeStyle = '#C8E6F5';
      ctx.lineWidth   = 2;
      ctx.stroke();

      // Green zone
      const zoneX  = gx + gw * GAUGE_GOOD_MIN;
      const zoneW  = gw * (GAUGE_GOOD_MAX - GAUGE_GOOD_MIN);
      ctx.fillStyle = 'rgba(130,210,130,0.55)';
      // Clip to rounded rect
      ctx.save();
      roundRect(ctx, gx, gy, gw, gh, rad);
      ctx.clip();
      ctx.fillRect(zoneX, gy, zoneW, gh);
      ctx.restore();

      // Marker
      const markerX = gx + gaugeValue * gw;
      ctx.fillStyle = char.color;
      ctx.shadowColor = char.color;
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.roundRect(markerX - 5, gy + 2, 10, gh - 4, 5);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      ctx.fillStyle    = '#5A7A8A';
      ctx.font         = 'bold 12px sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('탭!', W * 0.5, gy + gh / 2);
      ctx.restore();
    }

    function drawSplashes() {
      ctx.save();
      for (const s of splashes) {
        const alpha = s.life / 30;
        ctx.fillStyle = `rgba(168,216,234,${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawFloatingTexts() {
      for (const ft of floatingTexts) {
        const alpha = ft.life / ft.maxLife;
        ctx.save();
        ctx.globalAlpha  = alpha;
        ctx.fillStyle    = ft.color;
        ctx.font         = `bold ${ft.size}px sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = 'rgba(255,255,255,0.8)';
        ctx.shadowBlur   = 6;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }
    }

    function drawHUD() {
      // HUD backdrop
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      roundRect(ctx, 12, 12, 160, 76, 18);
      ctx.fill();

      ctx.fillStyle    = '#5A7A8A';
      ctx.font         = 'bold 13px sans-serif';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`⏱ ${timeLeft}초`, 24, 20);
      ctx.fillText(`🏆 ${score}점`, 24, 42);
      if (combo > 1) {
        ctx.fillStyle = char.color;
        ctx.fillText(`✨ ${combo} 콤보!`, 24, 62);
      } else {
        ctx.fillStyle = '#8AABBA';
        ctx.fillText(`잡은 물고기: ${caught}마리`, 24, 62);
      }
      ctx.restore();

      // Timer bar
      const barW = W - 24;
      const barH = 6;
      const barY = H - 14;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      roundRect(ctx, 12, barY, barW, barH, 3);
      ctx.fill();
      const ratio = Math.max(0, timeLeft / GAME_DURATION);
      const barColor = ratio > 0.4 ? '#6EC6A0' : ratio > 0.2 ? '#F0C060' : '#F07070';
      ctx.fillStyle = barColor;
      roundRect(ctx, 12, barY, barW * ratio, barH, 3);
      ctx.fill();
      ctx.restore();

      // Phase hint
      if (phase === 'idle') {
        ctx.save();
        ctx.fillStyle    = 'rgba(255,255,255,0.82)';
        const hint       = '탭해서 낚싯대를 던지세요!';
        ctx.font         = 'bold 15px sans-serif';
        const tw         = ctx.measureText(hint).width;
        roundRect(ctx, W / 2 - tw / 2 - 14, waterTop - 38, tw + 28, 30, 15);
        ctx.fill();
        ctx.fillStyle    = '#5A9AB5';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hint, W / 2, waterTop - 23);
        ctx.restore();
      } else if (phase === 'fishing' && hookFishId !== null) {
        ctx.save();
        ctx.fillStyle    = 'rgba(255,255,255,0.82)';
        const hint       = '물고기가 걸렸어요! 탭 타이밍을 맞춰요!';
        ctx.font         = 'bold 14px sans-serif';
        const tw         = ctx.measureText(hint).width;
        roundRect(ctx, W / 2 - tw / 2 - 14, waterTop - 38, tw + 28, 30, 15);
        ctx.fill();
        ctx.fillStyle    = char.color;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hint, W / 2, waterTop - 23);
        ctx.restore();
      }
    }

    // ── roundRect helper ───────────────────────────────────────────────────
    function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.lineTo(x + w - r, y);
      c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r);
      c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + r, y + h);
      c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r);
      c.quadraticCurveTo(x, y, x + r, y);
      c.closePath();
    }

    // ── Main loop ──────────────────────────────────────────────────────────
    let rafId: number;
    let lastSecond = 0;

    function loop(now: number) {
      const dt = Math.min(now - lastTime, 50); // cap at 50ms
      lastTime = now;
      elapsed += dt;

      // Update timer (tick every second)
      const secondsPassed = Math.floor(elapsed / 1000);
      if (secondsPassed > lastSecond) {
        lastSecond = secondsPassed;
        timeLeft   = Math.max(0, GAME_DURATION - secondsPassed);
        if (timeLeft <= 0 && !isOver) {
          isOver = true;
          setFinalScore(score);
          setFinalCombo(maxCombo);
          setFinalCaught(caught);
          setGameOver(true);
          if (selectedChar !== null) saveScore('fishing', CHARACTERS[selectedChar].name, score);
          return;
        }
      }

      // Spawn fish
      spawnFish(now);

      // Wave phase
      wavePhase += 0.02;

      // Update bubbles
      for (const b of bubbles) {
        b.y -= b.speed;
        b.x += Math.sin(now * 0.001 + b.r) * 0.3;
        if (b.y < waterTop) {
          b.y = H;
          b.x = Math.random() * W;
        }
      }

      // Update fish
      for (const f of fishList) {
        if (f.caught || f.hooked) continue;
        f.x += f.speed;
      }
      // Remove off-screen fish (not hooked)
      fishList = fishList.filter(f => f.hooked || f.caught || (f.x > -120 && f.x < W + 120));

      // Phase state machine
      if (phase === 'casting') {
        castProgress += 0.035;
        lineY = waterTop + (lineTargetY - waterTop) * Math.min(castProgress, 1);
        if (castProgress >= 1) {
          phase     = 'fishing';
          gaugeValue = 0.5;
          gaugeDir  = 1;
          // Check if any fish is near hook
          hookFishId = findNearestFish()?.id ?? null;
        }
      }

      if (phase === 'fishing') {
        // Move gauge
        gaugeValue += GAUGE_SPEED * gaugeDir * (dt / 1000);
        if (gaugeValue >= 1) { gaugeValue = 1; gaugeDir = -1; }
        if (gaugeValue <= 0) { gaugeValue = 0; gaugeDir =  1; }

        // Continuously check for nearby fish
        hookFishId = findNearestFish()?.id ?? null;

        // Auto-reel after 6 seconds without a tap (line drifts up)
        if (elapsed - (elapsed % 1) > 0) { /* just keep gauge going */ }
      }

      if (phase === 'reeling') {
        reelingAnim += 0.04;
        const hookedFish = fishList.find(f => f.id === hookFishId);
        if (hookedFish) {
          // Move fish up toward rod tip
          hookedFish.y += (rodY - hookedFish.y) * 0.1;
          hookedFish.x += (rodX - hookedFish.x) * 0.1;
          lineY = hookedFish.y;
        }
        if (reelingAnim >= 1) {
          // Fish caught!
          if (hookedFish) {
            hookedFish.caught = true;
            const catalogEntry = FISH_CATALOG.find(f => f.type === hookedFish.type)!;
            combo++;
            if (combo > maxCombo) maxCombo = combo;
            const pts = catalogEntry.pts * (combo > 2 ? Math.floor(combo / 2) + 1 : 1);
            score += pts;
            caught++;
            addFloatingText(rodX, rodY - 30, `+${pts}점 ${hookedFish.type}`, char.color, 24);
            if (combo > 1) {
              addFloatingText(rodX - 50, rodY - 55, `${combo}콤보! ✨`, '#FF9F43', 20);
              playComboSound(getAudioCtx(), combo);
            }
          }
          phase      = 'idle';
          lineY      = waterTop + 30;
          hookFishId = null;
        }
      }

      // Update splashes
      for (const s of splashes) {
        s.x  += s.vx;
        s.y  += s.vy;
        s.vy += 0.3;
        s.life--;
      }
      splashes = splashes.filter(s => s.life > 0);

      // Update floating texts
      for (const ft of floatingTexts) {
        ft.y    -= 0.8;
        ft.life -= 1;
      }
      floatingTexts = floatingTexts.filter(ft => ft.life > 0);

      // ── Draw ──────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H);
      drawBackground();
      drawWater();
      drawBubbles();

      for (const f of fishList) drawFish(f, now);

      drawLine();
      drawRod();
      drawSplashes();
      drawGauge();
      drawHUD();
      drawFloatingTexts();

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);

    // Resize
    function onResize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W;
      canvas.height = H;
    }
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('touchstart', handleTap);
      canvas.removeEventListener('mousedown',  handleTap);
      window.removeEventListener('resize', onResize);
    };
  }, [gameStarted, selectedChar, getAudioCtx]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Character Select Screen ─────────────────────────────────────────────

  if (selectedChar === null || !gameStarted) {
    return (
      <div
        style={{
          width: '100vw', height: '100dvh',
          background: 'linear-gradient(160deg, #B8E4F9 0%, #D6F0FF 40%, #FFE0F0 100%)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: 'sans-serif', overflow: 'hidden',
          touchAction: 'manipulation',
        }}
      >
        {/* Back button */}
        <Link
          href="/"
          style={{
            position: 'absolute', top: 16, left: 16,
            background: 'rgba(255,255,255,0.75)',
            borderRadius: 20, padding: '6px 14px',
            textDecoration: 'none', color: '#5A7A8A',
            fontSize: 14, fontWeight: 'bold',
          }}
        >
          ← 홈
        </Link>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 52, lineHeight: 1 }}>🎣</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#3A7CA5', marginTop: 6, letterSpacing: -1 }}>
            낚시왕
          </div>
          <div style={{ fontSize: 14, color: '#7AAEC4', marginTop: 4 }}>
            캐릭터를 선택하세요!
          </div>
        </div>

        {/* Character cards */}
        <div
          style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 14, padding: '0 24px', width: '100%', maxWidth: 380,
          }}
        >
          {CHARACTERS.map((c, i) => (
            <button
              key={c.name}
              onClick={() => startGame(i)}
              style={{
                background: 'rgba(255,255,255,0.88)',
                border: `3px solid ${c.color}40`,
                borderRadius: 22,
                padding: '18px 12px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 6,
                cursor: 'pointer',
                boxShadow: `0 4px 18px ${c.color}30`,
                transition: 'transform 0.12s',
                touchAction: 'manipulation',
              }}
              onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.95)')}
              onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <div style={{ fontSize: 38, lineHeight: 1 }}>{c.emoji}</div>
              <div style={{
                fontSize: 17, fontWeight: 800,
                color: c.color, letterSpacing: -0.5,
              }}>{c.name}</div>
              <div style={{ fontSize: 20 }}>{c.heart}</div>
            </button>
          ))}
        </div>

        {/* Instruction */}
        <div
          style={{
            marginTop: 26,
            background: 'rgba(255,255,255,0.7)',
            borderRadius: 16, padding: '10px 20px',
            fontSize: 13, color: '#5A7A8A',
            textAlign: 'center', lineHeight: 1.6,
            maxWidth: 300,
          }}
        >
          🎣 낚시줄을 던지고<br />
          🟢 초록 구간에서 탭하면 잡아요!<br />
          ⏱ 60초 안에 최고 점수를 노려봐요
        </div>
      </div>
    );
  }

  // ─── Game Over Screen ─────────────────────────────────────────────────────

  if (gameOver) {
    const char = CHARACTERS[selectedChar];
    const grade =
      finalScore >= 800 ? '낚시왕 👑' :
      finalScore >= 500 ? '고수 🏆' :
      finalScore >= 300 ? '숙련자 🎣' :
      finalScore >= 100 ? '초보자 🐟' : '입문자 😅';

    return (
      <div
        style={{
          width: '100vw', height: '100dvh',
          background: 'linear-gradient(160deg, #B8E4F9 0%, #D6F0FF 40%, #FFE0F0 100%)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: 'sans-serif', touchAction: 'manipulation',
        }}
      >
        <div
          style={{
            background: 'rgba(255,255,255,0.92)',
            borderRadius: 32, padding: '32px 28px',
            textAlign: 'center', width: '86%', maxWidth: 340,
            boxShadow: '0 8px 40px rgba(100,160,200,0.18)',
          }}
        >
          <div style={{ fontSize: 54 }}>🎣</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#3A7CA5', marginTop: 6 }}>
            게임 종료!
          </div>
          <div style={{ fontSize: 32, marginTop: 10 }}>{char.emoji}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: char.color, marginTop: 4 }}>
            {char.name}
          </div>
          <div style={{
            background: `${char.color}15`,
            borderRadius: 16, padding: '14px 0', margin: '16px 0',
          }}>
            <div style={{ fontSize: 42, fontWeight: 900, color: char.color }}>
              {finalScore}점
            </div>
            <div style={{ fontSize: 18, color: '#7AAEC4', marginTop: 2 }}>{grade}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 20, color: '#5A7A8A', fontSize: 14 }}>
            <div>
              <div style={{ fontSize: 22 }}>🐟</div>
              <div style={{ fontWeight: 700 }}>{finalCaught}마리</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>잡은 물고기</div>
            </div>
            <div>
              <div style={{ fontSize: 22 }}>✨</div>
              <div style={{ fontWeight: 700 }}>{finalCombo}콤보</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>최대 콤보</div>
            </div>
          </div>

          <button
            onClick={restartGame}
            style={{
              background: `linear-gradient(135deg, ${char.color}, ${char.color}CC)`,
              color: '#fff', border: 'none',
              borderRadius: 20, padding: '13px 0', width: '100%',
              fontSize: 16, fontWeight: 800, cursor: 'pointer',
              marginBottom: 10, touchAction: 'manipulation',
            }}
          >
            다시 하기 🎣
          </button>
          <Link
            href="/"
            style={{
              display: 'block',
              background: 'rgba(90,122,138,0.1)',
              color: '#5A7A8A', borderRadius: 20,
              padding: '12px 0', textDecoration: 'none',
              fontSize: 15, fontWeight: 700,
            }}
          >
            ← 홈으로
          </Link>
        </div>
      </div>
    );
  }

  // ─── Game Canvas ──────────────────────────────────────────────────────────

  return (
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', background: '#A8D8EA' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      />
      {/* Overlay back button during gameplay */}
      <Link
        href="/"
        style={{
          position: 'fixed', top: 14, right: 14,
          background: 'rgba(255,255,255,0.72)',
          borderRadius: 18, padding: '5px 12px',
          textDecoration: 'none', color: '#5A7A8A',
          fontSize: 13, fontWeight: 'bold', zIndex: 10,
        }}
      >
        홈
      </Link>
    </div>
  );
}
