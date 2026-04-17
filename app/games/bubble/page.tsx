'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { saveScore } from '@/lib/ranking';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Character {
  name: string;
  color: string;
  emoji: string;
  heart: string;
}

interface Bubble {
  color: number; // index into BUBBLE_COLORS, -1 = rainbow
  popping: boolean;
  popTime: number;
  falling: boolean;
  fallY: number;  // visual offset during fall animation
  targetY: number;
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
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  vy: number;
  color: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const CHARACTERS: Character[] = [
  { name: '승민', color: '#3B82F6', emoji: '🤖', heart: '💙' },
  { name: '건우', color: '#10B981', emoji: '🩺', heart: '💚' },
  { name: '강우', color: '#F59E0B', emoji: '👨‍🍳', heart: '🧡' },
  { name: '수현', color: '#EC4899', emoji: '💃', heart: '💗' },
  { name: '이현', color: '#FF69B4', emoji: '👸', heart: '💖' },
];

const COLS = 6;
const ROWS = 10;
const GAME_TIME = 90;

// Pastel bubble colors: pink, mint, lavender, yellow, peach
const BUBBLE_COLORS = [
  '#FFB3C6', // pink
  '#B3F0E0', // mint
  '#D4B3FF', // lavender
  '#FFE8A3', // yellow
  '#FFD4B3', // peach
];

const BUBBLE_COLORS_DARK = [
  '#FF6B9D',
  '#4ECDC4',
  '#9B59B6',
  '#F39C12',
  '#E67E22',
];

const RAINBOW_CHANCE = 0.035; // ~3.5% chance per new bubble

// Score formula: n bubbles popped → exponential
function calcScore(n: number, combo: number): number {
  if (n < 3) return 0;
  const base = Math.round(10 * Math.pow(n - 2, 1.8));
  const comboMult = 1 + (combo - 1) * 0.3;
  return Math.round(base * comboMult);
}

// ─── Audio ────────────────────────────────────────────────────────────────────
function createAudioCtx(): AudioContext {
  return new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
}

function playPopSound(ctx: AudioContext, combo: number) {
  try {
    const baseFreq = 440 + combo * 80;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.06);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch { /* ignore */ }
}

function playRainbowSound(ctx: AudioContext) {
  try {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.07 + 0.15);
      osc.start(ctx.currentTime + i * 0.07);
      osc.stop(ctx.currentTime + i * 0.07 + 0.15);
    });
  } catch { /* ignore */ }
}

function playGameOverSound(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.8);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch { /* ignore */ }
}

// ─── Grid helpers ─────────────────────────────────────────────────────────────
function randomColor(): number {
  return Math.floor(Math.random() * BUBBLE_COLORS.length);
}

function makeBubble(colorIdx: number): Bubble {
  return {
    color: colorIdx,
    popping: false,
    popTime: 0,
    falling: false,
    fallY: 0,
    targetY: 0,
  };
}

function makeGrid(): Bubble[][] {
  const grid: Bubble[][] = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      const isRainbow = Math.random() < RAINBOW_CHANCE;
      grid[r][c] = makeBubble(isRainbow ? -1 : randomColor());
    }
  }
  return grid;
}

// Flood-fill: returns list of [row, col] of same-color connected bubbles
function floodFill(grid: Bubble[][], startR: number, startC: number): [number, number][] {
  const targetColor = grid[startR][startC].color;
  const visited = new Set<string>();
  const result: [number, number][] = [];
  const queue: [number, number][] = [[startR, startC]];

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
    const b = grid[r][c];
    if (!b || b.popping) continue;
    // Rainbow bubble counts as any color — skip it in flood-fill (handled separately)
    if (b.color === -1) continue;
    if (b.color !== targetColor) continue;
    visited.add(key);
    result.push([r, c]);
    queue.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
  }
  return result;
}

// Find all bubbles of a specific color (for rainbow pop)
function findAllOfColor(grid: Bubble[][], colorIdx: number): [number, number][] {
  const result: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!grid[r][c].popping && grid[r][c].color === colorIdx) {
        result.push([r, c]);
      }
    }
  }
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BubblePopGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedChar, setSelectedChar] = useState<number | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = createAudioCtx();
    }
    return audioCtxRef.current;
  }, []);

  const startGame = useCallback(
    (charIndex: number) => {
      setSelectedChar(charIndex);
      setGameStarted(true);
      setGameOver(false);
      setFinalScore(0);
      getAudioCtx();
    },
    [getAudioCtx],
  );

  const restartGame = useCallback(() => {
    if (selectedChar !== null) {
      setGameOver(false);
      setGameStarted(false);
      // small timeout so state resets before re-mount
      setTimeout(() => setGameStarted(true), 30);
    }
  }, [selectedChar]);

  // ─── Main Game Effect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameStarted || selectedChar === null) return;
    const charIndex: number = selectedChar;
    const canvas = canvasRef.current as HTMLCanvasElement;
    if (!canvas) return;

    // ── Size ──
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d')!;

    // ── State ──
    const grid = makeGrid();
    let score = 0;
    let combo = 0;
    let comboTimer = 0; // frames since last pop
    let timeLeft = GAME_TIME;
    let lastTimestamp = 0;
    let over = false;

    const particles: Particle[] = [];
    const floatingTexts: FloatingText[] = [];

    // ── Layout helpers ──
    function getBubbleLayout() {
      const w = canvas.width;
      const h = canvas.height;
      const padding = 12;
      const topBar = 68;
      const availW = w - padding * 2;
      const availH = h - topBar - padding;
      const cellSize = Math.min(availW / COLS, availH / ROWS);
      const r = cellSize * 0.44;
      const gridW = COLS * cellSize;
      const gridH = ROWS * cellSize;
      const startX = (w - gridW) / 2 + cellSize / 2;
      const startY = topBar + (availH - gridH) / 2 + cellSize / 2;
      return { cellSize, r, startX, startY };
    }

    function bubbleCenter(row: number, col: number) {
      const { cellSize, startX, startY } = getBubbleLayout();
      return {
        x: startX + col * cellSize,
        y: startY + row * cellSize,
      };
    }

    // ── Drawing ──
    function drawBubble(
      bx: number,
      by: number,
      r: number,
      colorIdx: number,
      alpha = 1,
      scale = 1,
    ) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(bx, by);
      ctx.scale(scale, scale);

      if (colorIdx === -1) {
        // Rainbow
        const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.05, 0, 0, r);
        const hue = (Date.now() / 10) % 360;
        grad.addColorStop(0, `hsl(${hue}, 100%, 90%)`);
        grad.addColorStop(0.4, `hsl(${(hue + 90) % 360}, 100%, 75%)`);
        grad.addColorStop(0.8, `hsl(${(hue + 200) % 360}, 100%, 65%)`);
        grad.addColorStop(1, `hsl(${(hue + 300) % 360}, 100%, 55%)`);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        // border
        ctx.strokeStyle = `hsla(${(hue + 60) % 360}, 80%, 60%, 0.7)`;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        const light = BUBBLE_COLORS[colorIdx];
        const dark = BUBBLE_COLORS_DARK[colorIdx];
        // gradient fill
        const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.25, light);
        grad.addColorStop(0.8, dark);
        grad.addColorStop(1, dark);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        // soft border
        ctx.strokeStyle = `${dark}88`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // White shine highlight
      const shine = ctx.createRadialGradient(
        -r * 0.3, -r * 0.38, 0,
        -r * 0.25, -r * 0.3, r * 0.48,
      );
      shine.addColorStop(0, 'rgba(255,255,255,0.85)');
      shine.addColorStop(0.5, 'rgba(255,255,255,0.25)');
      shine.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = shine;
      ctx.fill();

      // Rainbow sparkle symbol
      if (colorIdx === -1) {
        ctx.font = `${r * 0.9}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🌈', 0, r * 0.05);
      }

      ctx.restore();
    }

    function drawGrid() {
      const { r, startX, startY, cellSize } = getBubbleLayout();
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const b = grid[row][col];
          if (!b) continue;
          const cx = startX + col * cellSize;
          const cy = startY + row * cellSize + (b.falling ? b.fallY : 0);

          if (b.popping) {
            const age = (Date.now() - b.popTime) / 300; // 0..1
            if (age < 1) {
              drawBubble(cx, cy, r, b.color, 1 - age, 1 + age * 0.4);
            }
          } else {
            drawBubble(cx, cy, r, b.color);
          }
        }
      }
    }

    function drawParticles() {
      for (const p of particles) {
        const alpha = p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function drawFloatingTexts() {
      for (const ft of floatingTexts) {
        const alpha = ft.life / 60;
        ctx.save();
        ctx.globalAlpha = Math.min(alpha, 1);
        ctx.fillStyle = ft.color;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }
    }

    function drawHUD() {
      const w = canvas.width;
      const char = CHARACTERS[charIndex];

      // Background bar
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).roundRect?.(8, 8, w - 16, 52, 14);
      ctx.fill();

      // Score
      ctx.fillStyle = '#555';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('점수', 20, 26);
      ctx.fillStyle = char.color;
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(String(score), 20, 46);

      // Combo
      if (combo > 1) {
        ctx.fillStyle = '#FF6B9D';
        ctx.font = `bold ${14 + combo}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`${combo}x 콤보! 🔥`, w / 2, 34);
      } else {
        ctx.fillStyle = '#888';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${char.emoji} ${char.name}`, w / 2, 34);
      }

      // Timer
      const pct = timeLeft / GAME_TIME;
      const timerColor = pct > 0.4 ? '#4ECDC4' : pct > 0.2 ? '#F39C12' : '#E74C3C';
      ctx.fillStyle = '#555';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('시간', w - 20, 26);
      ctx.fillStyle = timerColor;
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(String(Math.ceil(timeLeft)), w - 20, 46);

      // Timer bar at top of screen
      const barY = 62;
      const barH = 4;
      ctx.fillStyle = '#eee';
      ctx.fillRect(0, barY, w, barH);
      ctx.fillStyle = timerColor;
      ctx.fillRect(0, barY, w * pct, barH);
    }

    function drawBackground() {
      const w = canvas.width;
      const h = canvas.height;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#FFF0F8');
      grad.addColorStop(1, '#F0FFF8');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // ── Particles ──
    function spawnParticles(bx: number, by: number, colorIdx: number, count = 10) {
      const colors =
        colorIdx === -1
          ? ['#FF6B9D', '#4ECDC4', '#FFE66D', '#A8E6CF', '#D4B3FF']
          : [BUBBLE_COLORS[colorIdx], BUBBLE_COLORS_DARK[colorIdx], '#ffffff'];
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const speed = 2 + Math.random() * 4;
        particles.push({
          x: bx,
          y: by,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 40 + Math.random() * 20,
          maxLife: 60,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 3 + Math.random() * 4,
        });
      }
    }

    // ── Pop logic ──
    function popBubbles(cells: [number, number][]) {
      const now = Date.now();
      for (const [r, c] of cells) {
        grid[r][c].popping = true;
        grid[r][c].popTime = now;
        const center = bubbleCenter(r, c);
        spawnParticles(center.x, center.y, grid[r][c].color, 8);
      }
      // Remove after animation
      setTimeout(() => {
        for (const [r, c] of cells) {
          grid[r][c] = null as unknown as Bubble;
        }
        dropBubbles();
        fillTopRow();
      }, 320);
    }

    function dropBubbles() {
      // For each column, compact non-null bubbles downward
      for (let c = 0; c < COLS; c++) {
        const col: Bubble[] = [];
        for (let r = 0; r < ROWS; r++) {
          if (grid[r][c]) col.push(grid[r][c]);
        }
        // Fill from bottom: last items go to bottom rows
        for (let r = ROWS - 1; r >= 0; r--) {
          const b = col.pop();
          if (b) {
            grid[r][c] = b;
            b.falling = true;
            b.fallY = -40 * (ROWS - 1 - r + 1);
            // Animate fallY toward 0
            const anim = setInterval(() => {
              b.fallY += 12;
              if (b.fallY >= 0) {
                b.fallY = 0;
                b.falling = false;
                clearInterval(anim);
              }
            }, 16);
          } else {
            grid[r][c] = null as unknown as Bubble;
          }
        }
      }
    }

    function fillTopRow() {
      // Find and fill any empty cells
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!grid[r][c]) {
            const isRainbow = Math.random() < RAINBOW_CHANCE;
            const nb = makeBubble(isRainbow ? -1 : randomColor());
            nb.falling = true;
            nb.fallY = -(r + 1) * 48;
            grid[r][c] = nb;
            const anim = setInterval(() => {
              nb.fallY += 14;
              if (nb.fallY >= 0) {
                nb.fallY = 0;
                nb.falling = false;
                clearInterval(anim);
              }
            }, 16);
          }
        }
      }
    }

    function handleTap(tapX: number, tapY: number) {
      if (over) return;
      const { cellSize, startX, startY, r } = getBubbleLayout();

      let hitRow = -1;
      let hitCol = -1;
      let minDist = Infinity;

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          if (!grid[row][col] || grid[row][col].popping) continue;
          const cx = startX + col * cellSize;
          const cy = startY + row * cellSize + (grid[row][col].falling ? grid[row][col].fallY : 0);
          const dist = Math.hypot(tapX - cx, tapY - cy);
          if (dist < r * 1.2 && dist < minDist) {
            minDist = dist;
            hitRow = row;
            hitCol = col;
          }
        }
      }

      if (hitRow === -1) return;

      const b = grid[hitRow][hitCol];
      const audioCtx = getAudioCtx();

      if (b.color === -1) {
        // Rainbow: pop most common color
        const counts: Record<number, number> = {};
        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            const bb = grid[row][col];
            if (bb && !bb.popping && bb.color !== -1) {
              counts[bb.color] = (counts[bb.color] || 0) + 1;
            }
          }
        }
        let maxColor = 0;
        let maxCount = 0;
        for (const [ci, cnt] of Object.entries(counts)) {
          if (cnt > maxCount) { maxCount = cnt; maxColor = Number(ci); }
        }

        const targets: [number, number][] = [[hitRow, hitCol], ...findAllOfColor(grid, maxColor)];
        combo++;
        comboTimer = 0;
        const pts = calcScore(targets.length, combo);
        score += pts;

        const center = bubbleCenter(hitRow, hitCol);
        floatingTexts.push({
          x: center.x,
          y: center.y - 20,
          text: `🌈 +${pts}`,
          life: 70,
          vy: -1.2,
          color: '#FF6B9D',
        });

        playRainbowSound(audioCtx);
        popBubbles(targets);
      } else {
        const connected = floodFill(grid, hitRow, hitCol);
        if (connected.length < 3) {
          // Too few — shake effect via floating text
          const center = bubbleCenter(hitRow, hitCol);
          floatingTexts.push({
            x: center.x,
            y: center.y - 10,
            text: '3개 이상!',
            life: 40,
            vy: -0.8,
            color: '#aaa',
          });
          combo = 0;
          return;
        }

        combo++;
        comboTimer = 0;
        const pts = calcScore(connected.length, combo);
        score += pts;

        const center = bubbleCenter(hitRow, hitCol);
        const scoreText =
          combo > 2
            ? `${combo}x 콤보! +${pts} ${CHARACTERS[charIndex].heart}`
            : `+${pts}`;
        floatingTexts.push({
          x: center.x,
          y: center.y - 20,
          text: scoreText,
          life: 70,
          vy: -1.2,
          color: combo > 2 ? '#FF6B9D' : BUBBLE_COLORS_DARK[b.color],
        });

        playPopSound(audioCtx, combo);
        popBubbles(connected);
      }
    }

    // ── Touch / click handlers ──
    function onTouchStart(e: TouchEvent) {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const rect = canvas.getBoundingClientRect();
      handleTap(touch.clientX - rect.left, touch.clientY - rect.top);
    }

    function onClick(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      handleTap(e.clientX - rect.left, e.clientY - rect.top);
    }

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('click', onClick);

    // ── Game Loop ──
    let rafId: number;

    function gameLoop(timestamp: number) {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const dt = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      if (!over) {
        timeLeft -= dt;
        if (timeLeft <= 0) {
          timeLeft = 0;
          over = true;
          try { playGameOverSound(getAudioCtx()); } catch { /* ignore */ }
          setFinalScore(score);
          setGameOver(true);
          saveScore('bubble', CHARACTERS[charIndex].name, score);
        }
      }

      // Combo decay
      comboTimer++;
      if (comboTimer > 180) {
        combo = 0;
      }

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // Update floating texts
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.y += ft.vy;
        ft.life--;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
      }

      // ── Draw ──
      drawBackground();
      drawGrid();
      drawParticles();
      drawFloatingTexts();
      drawHUD();

      rafId = requestAnimationFrame(gameLoop);
    }

    rafId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('resize', resize);
    };
  }, [gameStarted, selectedChar, getAudioCtx]);

  // ─── Character Select ────────────────────────────────────────────────────────
  if (!gameStarted) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #FFF0F8 0%, #F0FFF8 100%)',
          fontFamily: 'sans-serif',
          userSelect: 'none',
        }}
      >
        {/* Back link */}
        <a
          href="/"
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            fontSize: 14,
            color: '#aaa',
            textDecoration: 'none',
            padding: '6px 14px',
            background: 'white',
            borderRadius: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          ← 홈
        </a>

        <div style={{ fontSize: 48, marginBottom: 8 }}>🫧</div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 900,
            color: '#FF6B9D',
            margin: '0 0 4px',
            letterSpacing: -0.5,
          }}
        >
          버블팝
        </h1>
        <p style={{ color: '#aaa', fontSize: 14, margin: '0 0 32px' }}>
          캐릭터를 선택하세요!
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            padding: '0 24px',
            width: '100%',
            maxWidth: 360,
          }}
        >
          {CHARACTERS.map((char, i) => (
            <button
              key={char.name}
              onClick={() => startGame(i)}
              style={{
                background: 'white',
                border: `3px solid ${char.color}`,
                borderRadius: 20,
                padding: '20px 12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                boxShadow: `0 4px 16px ${char.color}44`,
                transition: 'transform 0.1s',
                WebkitTapHighlightColor: 'transparent',
              }}
              onTouchStart={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.95)';
              }}
              onTouchEnd={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
              }}
            >
              <span style={{ fontSize: 40 }}>{char.emoji}</span>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: char.color,
                }}
              >
                {char.name}
              </span>
              <span style={{ fontSize: 18 }}>{char.heart}</span>
            </button>
          ))}
        </div>

        <p
          style={{
            marginTop: 28,
            fontSize: 13,
            color: '#bbb',
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          3개 이상 연결된 같은 색 버블을 탭해서 터트려요! 🌈
        </p>
      </div>
    );
  }

  // ─── Game Over Overlay ───────────────────────────────────────────────────────
  if (gameOver && selectedChar !== null) {
    const char = CHARACTERS[selectedChar];
    return (
      <div
        style={{
          width: '100vw',
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #FFF0F8 0%, #F0FFF8 100%)',
          fontFamily: 'sans-serif',
          userSelect: 'none',
        }}
      >
        <div style={{ fontSize: 64, marginBottom: 8 }}>🫧</div>
        <h2
          style={{
            fontSize: 30,
            fontWeight: 900,
            color: '#FF6B9D',
            margin: '0 0 6px',
          }}
        >
          게임 종료!
        </h2>
        <p
          style={{
            fontSize: 16,
            color: '#aaa',
            margin: '0 0 24px',
          }}
        >
          {char.emoji} {char.name}의 도전
        </p>

        <div
          style={{
            background: 'white',
            borderRadius: 24,
            padding: '28px 48px',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(255,107,157,0.15)',
            marginBottom: 28,
          }}
        >
          <p style={{ color: '#aaa', fontSize: 14, margin: '0 0 4px' }}>최종 점수</p>
          <p
            style={{
              fontSize: 52,
              fontWeight: 900,
              color: char.color,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {finalScore.toLocaleString()}
          </p>
          <p style={{ fontSize: 28, marginTop: 6 }}>
            {finalScore >= 3000
              ? '🏆 레전드!'
              : finalScore >= 1500
                ? '🌟 멋져요!'
                : finalScore >= 600
                  ? '👍 잘했어요!'
                  : '💪 다시 도전!'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={restartGame}
            style={{
              background: char.color,
              color: 'white',
              border: 'none',
              borderRadius: 16,
              padding: '14px 28px',
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: `0 4px 16px ${char.color}66`,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            🔄 다시하기
          </button>
          <button
            onClick={() => {
              setGameStarted(false);
              setGameOver(false);
              setSelectedChar(null);
            }}
            style={{
              background: 'white',
              color: '#aaa',
              border: '2px solid #eee',
              borderRadius: 16,
              padding: '14px 28px',
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            캐릭터 변경
          </button>
        </div>

        <a
          href="/"
          style={{
            marginTop: 16,
            fontSize: 14,
            color: '#bbb',
            textDecoration: 'none',
          }}
        >
          ← 홈으로
        </a>
      </div>
    );
  }

  // ─── Canvas Game Screen ───────────────────────────────────────────────────────
  return (
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      />
      {/* Back to home */}
      <a
        href="/"
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 13,
          color: 'rgba(0,0,0,0.3)',
          textDecoration: 'none',
          padding: '6px 18px',
          background: 'rgba(255,255,255,0.7)',
          borderRadius: 20,
          backdropFilter: 'blur(4px)',
        }}
      >
        ← 홈
      </a>
    </div>
  );
}
