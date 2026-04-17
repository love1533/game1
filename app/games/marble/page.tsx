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

interface Vec2 {
  x: number;
  y: number;
}

interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Hole {
  x: number;
  y: number;
  r: number;
}

interface StarItem {
  x: number;
  y: number;
  collected: boolean;
  twinkle: number;
}

interface MovingObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface LevelDef {
  walls: Wall[];
  holes: Hole[];
  stars: Vec2[];
  goal: Vec2;
  start: Vec2;
  moving: MovingObstacle[];
}

interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  angle: number;
  spin: number;
  life: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const CHARACTERS: Character[] = [
  { name: '승민', color: '#3B82F6', emoji: '🤖', heart: '💙' },
  { name: '건우', color: '#10B981', emoji: '🩺', heart: '💚' },
  { name: '강우', color: '#F59E0B', emoji: '👨‍🍳', heart: '🧡' },
  { name: '수현', color: '#EC4899', emoji: '💃', heart: '💗' },
  { name: '이현', color: '#FF69B4', emoji: '👸', heart: '💖' },
];

const MARBLE_RADIUS = 14;
const FRICTION = 0.92;
const TILT_FORCE = 0.32;
const WALL_BOUNCE = 0.35;
const CELL = 44; // grid cell size for level layout

// Pastel board colors per level
const BOARD_COLORS = [
  '#FFF0F5', '#F0FFF4', '#F0F8FF', '#FFFAF0', '#F5F0FF',
  '#FFF0F0', '#F0FFFF', '#FFFFF0', '#FFF5F0', '#F0F0FF',
];

const WALL_COLOR = '#B8A4C8';
const WALL_SHADOW = '#9B8AAA';
const GOAL_PULSE_SPEED = 0.04;

// ─── Level Definitions ───────────────────────────────────────────────────────
// All coordinates are in "cell units" (multiplied by CELL at runtime)
// Board visible area: ~14 wide x 18 tall cells
function buildLevels(): LevelDef[] {
  const W = (x: number, y: number, w: number, h: number): Wall => ({ x, y, w, h });
  const H = (x: number, y: number, r: number): Hole => ({ x, y, r });
  const S = (x: number, y: number): Vec2 => ({ x, y });
  const M = (x: number, y: number, w: number, h: number, dx: number, dy: number, minX: number, maxX: number, minY: number, maxY: number): MovingObstacle =>
    ({ x, y, w, h, dx, dy, minX, maxX, minY, maxY });

  return [
    // Level 1: Straight path with one turn
    {
      start: S(3, 2),
      goal: S(3, 15),
      walls: [
        W(1, 0, 0.5, 17), W(5, 0, 0.5, 12), W(1, 12, 4.5, 0.5), W(5, 12, 0.5, 5), W(8, 12, 0.5, 5),
        W(5, 16.5, 4, 0.5), W(8, 0, 0.5, 17), W(1, 17, 7.5, 0.5), W(1, 0, 7.5, 0.5),
      ],
      holes: [],
      stars: [S(3, 5), S(3, 9)],
      moving: [],
    },
    // Level 2: S-curve
    {
      start: S(2, 1.5),
      goal: S(10, 15),
      walls: [
        W(0.5, 0.5, 0.5, 8), W(4.5, 0.5, 0.5, 7), W(0.5, 0.5, 4.5, 0.5), W(0.5, 8, 7, 0.5),
        W(4.5, 8, 0.5, 5), W(7.5, 3.5, 0.5, 5), W(4.5, 3, 3.5, 0.5), W(7.5, 8, 4, 0.5),
        W(11, 8, 0.5, 8.5), W(7.5, 16, 4, 0.5), W(0.5, 16, 0.5, 0.5),
      ],
      holes: [],
      stars: [S(2.5, 4.5), S(6.5, 6), S(9.5, 12)],
      moving: [],
    },
    // Level 3: L-shape with stars and one hole
    {
      start: S(2, 2),
      goal: S(11, 14),
      walls: [
        W(0.5, 0.5, 0.5, 13), W(4, 0.5, 0.5, 9), W(0.5, 0.5, 4, 0.5), W(0.5, 13, 10.5, 0.5),
        W(4, 9, 7.5, 0.5), W(11, 9, 0.5, 5), W(8, 9, 0.5, 4.5), W(11, 0.5, 0.5, 4), W(8, 0.5, 3.5, 0.5),
      ],
      holes: [H(6.5, 5, 0.55)],
      stars: [S(2, 6), S(9.5, 2), S(9.5, 5.5), S(9.5, 12)],
      moving: [],
    },
    // Level 4: More turns, dead end trap
    {
      start: S(2, 1.5),
      goal: S(12, 16),
      walls: [
        W(0.5, 0.5, 0.5, 5), W(4, 0.5, 0.5, 3.5), W(0.5, 0.5, 4, 0.5),
        W(0.5, 5.5, 5, 0.5), W(5, 2.5, 0.5, 3), W(5, 5.5, 0.5, 4.5),
        W(0.5, 9.5, 8, 0.5), W(8, 5.5, 0.5, 4), W(8, 5.5, 5, 0.5),
        W(12.5, 5.5, 0.5, 11), W(3.5, 9.5, 0.5, 7), W(3.5, 16, 9.5, 0.5),
        W(0.5, 16, 3, 0.5), W(0.5, 9.5, 0.5, 7),
      ],
      holes: [H(2, 13, 0.55), H(10.5, 9, 0.55)],
      stars: [S(2, 3.5), S(7, 3.5), S(6.5, 7.5), S(10.5, 14)],
      moving: [],
    },
    // Level 5: Zigzag corridor
    {
      start: S(1.5, 1.5),
      goal: S(13, 16),
      walls: [
        W(0.5, 0.5, 0.5, 4), W(3.5, 0.5, 0.5, 3), W(0.5, 0.5, 3.5, 0.5),
        W(0.5, 4, 7, 0.5), W(7, 1, 0.5, 3), W(7, 4, 3.5, 0.5),
        W(10, 4, 0.5, 3.5), W(10, 7, -6, 0.5), // W(4, 7)
        W(4, 7, 0.5, 4), W(4, 10.5, 7, 0.5), W(10.5, 7, 0.5, 3.5),
        W(10.5, 10.5, 3, 0.5), W(13, 10.5, 0.5, 6.5), W(0.5, 10.5, 4, 0.5),
        W(0.5, 10.5, 0.5, 6.5), W(0.5, 16.5, 13, 0.5),
      ],
      holes: [H(5.5, 2.5, 0.55), H(8.5, 5.5, 0.55), H(7, 9, 0.55)],
      stars: [S(2.5, 2.5), S(8.5, 2.5), S(6, 5.5), S(12, 9), S(12, 14)],
      moving: [],
    },
    // Level 6: Branching paths with dead ends
    {
      start: S(7, 1.5),
      goal: S(7, 16),
      walls: [
        W(5, 0.5, 4, 0.5), W(5, 0.5, 0.5, 4.5), W(8.5, 0.5, 0.5, 4.5),
        W(5, 4.5, 2, 0.5), W(7.5, 4.5, 1.5, 0.5), W(6, 4.5, 0.5, 3.5),
        W(8.5, 4.5, 0.5, 2.5), W(6, 7.5, 5, 0.5), W(2.5, 4.5, 0.5, 3.5),
        W(2.5, 4.5, 3, 0.5), W(2.5, 7.5, 4, 0.5), W(5, 7.5, 0.5, 2.5),
        W(2.5, 9.5, 9, 0.5), W(11, 7.5, 0.5, 2), W(10, 7.5, 1.5, 0.5),
        W(2.5, 9.5, 0.5, 4), W(5.5, 9.5, 0.5, 4), W(8, 9.5, 0.5, 4),
        W(11, 9.5, 0.5, 4), W(2.5, 13, 9.5, 0.5), W(5.5, 13, 0.5, 4),
        W(8, 13, 0.5, 4), W(5.5, 16.5, 3, 0.5),
      ],
      holes: [H(4, 6, 0.55), H(9.5, 6, 0.55), H(4, 11, 0.55), H(9.5, 11, 0.55)],
      stars: [S(7, 3), S(4, 8.5), S(10, 8.5), S(7, 11), S(7, 15)],
      moving: [],
    },
    // Level 7: Tight paths + first moving obstacle
    {
      start: S(1.5, 1.5),
      goal: S(12, 16),
      walls: [
        W(0.5, 0.5, 3, 0.5), W(3, 0.5, 0.5, 2.5), W(0.5, 0.5, 0.5, 3.5),
        W(0.5, 3.5, 5.5, 0.5), W(5.5, 0.5, 0.5, 3), W(5.5, 0.5, 3.5, 0.5),
        W(8.5, 0.5, 0.5, 5.5), W(5.5, 5.5, 3, 0.5), W(3, 3.5, 0.5, 4.5),
        W(3, 7.5, 9, 0.5), W(11.5, 0.5, 0.5, 7), W(11.5, 7.5, 1, 0.5),
        W(12, 7.5, 0.5, 9), W(3, 7.5, 0.5, 9.5), W(3, 16.5, 9.5, 0.5),
        W(0.5, 3.5, 0.5, 13), W(0.5, 16.5, 3, 0.5),
      ],
      holes: [H(2, 6, 0.55), H(7, 3, 0.55), H(10, 12, 0.55)],
      stars: [S(1.5, 5), S(7, 1.5), S(10, 9), S(7, 12), S(8, 15)],
      moving: [M(5 * CELL, 11 * CELL, CELL * 1.5, CELL * 0.5, 1.5, 0, 4 * CELL, 9 * CELL, 0, 0)],
    },
    // Level 8: Spiral-ish + 2 moving obstacles
    {
      start: S(1.5, 1.5),
      goal: S(13, 13),
      walls: [
        W(0.5, 0.5, 13, 0.5), W(13, 0.5, 0.5, 13), W(0.5, 13, 13.5, 0.5),
        W(0.5, 0.5, 0.5, 13), W(2.5, 2.5, 10, 0.5), W(2.5, 2.5, 0.5, 6.5),
        W(2.5, 8.5, 8, 0.5), W(10, 2.5, 0.5, 6.5), W(4.5, 4.5, 0.5, 4.5),
        W(4.5, 8.5, 5.5, 0.5), // inner walls cut short for path
        W(10, 8.5, 0.5, -6), // already covered
        W(4.5, 4.5, 4, 0.5), W(8, 4.5, 0.5, 4.5),
      ],
      holes: [H(7, 7, 0.6), H(3.5, 5.5, 0.5), H(9, 3.5, 0.5)],
      stars: [S(6, 3.5), S(9, 6), S(6, 7), S(3.5, 11), S(11.5, 11)],
      moving: [
        M(5 * CELL, 10.5 * CELL, CELL * 0.5, CELL * 1.5, 0, 1.5, 0, 0, 9 * CELL, 12 * CELL),
        M(9 * CELL, 10 * CELL, CELL * 1.5, CELL * 0.5, 1.8, 0, 8 * CELL, 12 * CELL, 0, 0),
      ],
    },
    // Level 9: Tight maze + 3 holes + 2 movers
    {
      start: S(1, 1),
      goal: S(13, 15),
      walls: [
        W(0.5, 0.5, 13.5, 0.5), W(13.5, 0.5, 0.5, 16), W(0.5, 16, 13.5, 0.5), W(0.5, 0.5, 0.5, 16),
        W(2.5, 2.5, 9, 0.5), W(2.5, 2.5, 0.5, 3), W(2.5, 5, 4, 0.5), W(6, 2.5, 0.5, 3),
        W(6, 5, 5.5, 0.5), W(11, 2.5, 0.5, 2.5), W(8.5, 5, 0.5, 3.5), W(11, 5, 0.5, 3.5),
        W(8.5, 8, 3, 0.5), W(2.5, 5, 0.5, 4), W(2.5, 8.5, 6.5, 0.5), W(8.5, 8.5, 0.5, 3),
        W(4.5, 8.5, 0.5, 3.5), W(4.5, 11.5, 4.5, 0.5), W(8.5, 11.5, 0.5, 4.5),
        W(2.5, 8.5, 0.5, 8), W(2.5, 16, 6.5, 0.5), W(6.5, 11.5, 0.5, 4.5), // path to goal
        W(11, 8.5, 0.5, 3), W(11, 11, 2.5, 0.5),
      ],
      holes: [H(4.5, 3.5, 0.5), H(9.5, 7, 0.5), H(3.5, 10, 0.5), H(7, 14, 0.5)],
      stars: [S(1.5, 3.5), S(7, 3.5), S(9.5, 3.5), S(10, 7), S(5.5, 10), S(12, 13)],
      moving: [
        M(3.5 * CELL, 6.5 * CELL, CELL * 0.5, CELL * 1.5, 0, 2, 0, 0, 5.5 * CELL, 7.5 * CELL),
        M(6 * CELL, 12.5 * CELL, CELL * 1.5, CELL * 0.5, 2, 0, 5 * CELL, 7.5 * CELL, 0, 0),
      ],
    },
    // Level 10: Ultimate challenge
    {
      start: S(1, 1),
      goal: S(13.5, 15.5),
      walls: [
        W(0.5, 0.5, 14, 0.5), W(14, 0.5, 0.5, 16), W(0.5, 16, 14, 0.5), W(0.5, 0.5, 0.5, 16),
        W(2, 2, 5, 0.5), W(2, 2, 0.5, 3.5), W(2, 5, 3.5, 0.5), W(5.5, 2, 0.5, 5.5),
        W(5.5, 7, 6, 0.5), W(11, 2, 0.5, 5), W(7.5, 2, 4, 0.5), W(7.5, 2, 0.5, 3),
        W(7.5, 4.5, 2.5, 0.5), W(9.5, 4.5, 0.5, 2.5), W(11, 7, 0.5, 4.5),
        W(8, 7, 3.5, 0.5), W(8, 7, 0.5, 4.5), W(8, 11, 4, 0.5), W(11, 11, 0.5, 5.5),
        W(2, 5, 0.5, 6.5), W(2, 11, 6.5, 0.5), W(5.5, 11, 0.5, 3.5), W(5.5, 14, 3, 0.5),
        W(2, 14, 0.5, 2.5), W(2, 16, 6.5, 0.5), W(8.5, 14, 0.5, -3),
        W(3.5, 7, 0.5, 4), W(3.5, 7, 2, 0.5),
      ],
      holes: [H(3, 3.5, 0.5), H(6.5, 4, 0.5), H(9, 3, 0.5), H(10, 9, 0.5), H(4, 9, 0.5), H(7, 13, 0.5), H(12, 14, 0.5)],
      stars: [S(1.5, 3.5), S(4.5, 3.5), S(8.5, 3.5), S(6.5, 9.5), S(10, 14), S(3.5, 15), S(13, 9)],
      moving: [
        M(3 * CELL, 8 * CELL, CELL * 0.5, CELL * 1.5, 0, 2.2, 0, 0, 7 * CELL, 10 * CELL),
        M(6 * CELL, 12.5 * CELL, CELL * 1.5, CELL * 0.5, 2.2, 0, 5 * CELL, 8 * CELL, 0, 0),
        M(9.5 * CELL, 8.5 * CELL, CELL * 0.5, CELL * 1.5, 0, 2.5, 0, 0, 7.5 * CELL, 10.5 * CELL),
      ],
    },
  ];
}

// ─── Audio helpers ────────────────────────────────────────────────────────────
function createAudioCtx(): AudioContext | null {
  try { return new AudioContext(); } catch { return null; }
}

function playStarSound(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
  } catch { /* ignore */ }
}

function playFallSound(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
  } catch { /* ignore */ }
}

function playVictorySound(ctx: AudioContext) {
  try {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.start(t); osc.stop(t + 0.25);
    });
  } catch { /* ignore */ }
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────
function drawMarble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  // Shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 4;

  // Base sphere gradient
  const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.05, x, y, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, color);
  grad.addColorStop(0.7, shadeColor(color, -35));
  grad.addColorStop(1, shadeColor(color, -60));

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // Specular highlight
  ctx.save();
  const spec = ctx.createRadialGradient(x - r * 0.38, y - r * 0.38, 0, x - r * 0.2, y - r * 0.2, r * 0.55);
  spec.addColorStop(0, 'rgba(255,255,255,0.85)');
  spec.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = spec;
  ctx.fill();
  ctx.restore();
}

function shadeColor(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + pct));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + pct));
  const b = Math.min(255, Math.max(0, (n & 0xff) + pct));
  return `rgb(${r},${g},${b})`;
}

function drawWall(ctx: CanvasRenderingContext2D, wx: number, wy: number, ww: number, wh: number, offX: number, offY: number) {
  const x = wx + offX, y = wy + offY;
  const w = ww, h = wh;

  // Shadow / depth
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(x + 3, y + 4, w, h);
  ctx.restore();

  // Wall face
  ctx.save();
  ctx.fillStyle = WALL_COLOR;
  ctx.fillRect(x, y, w, h);

  // Top highlight
  const grad = ctx.createLinearGradient(x, y, x, y + Math.min(h, 10));
  grad.addColorStop(0, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, Math.min(h, 10));

  // Border
  ctx.strokeStyle = WALL_SHADOW;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawHole(ctx: CanvasRenderingContext2D, hx: number, hy: number, hr: number, offX: number, offY: number) {
  const x = hx + offX, y = hy + offY;
  ctx.save();
  const grad = ctx.createRadialGradient(x, y, 0, x, y, hr);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(0.6, '#2d2d44');
  grad.addColorStop(0.85, '#4a4a6a');
  grad.addColorStop(1, 'rgba(74,74,106,0)');
  ctx.beginPath();
  ctx.arc(x, y, hr, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

function drawGoal(ctx: CanvasRenderingContext2D, gx: number, gy: number, pulse: number, offX: number, offY: number) {
  const x = gx + offX, y = gy + offY;
  const r = 16 + Math.sin(pulse) * 3;

  ctx.save();
  // Glow
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 18 + Math.sin(pulse) * 6;

  // Outer ring
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Inner ring
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
  ctx.strokeStyle = '#FFF176';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Center sparkle
  const sparkGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 0.5);
  sparkGrad.addColorStop(0, `rgba(255,215,0,${0.4 + Math.sin(pulse) * 0.2})`);
  sparkGrad.addColorStop(1, 'rgba(255,215,0,0)');
  ctx.beginPath();
  ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = sparkGrad;
  ctx.fill();
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, sx: number, sy: number, twinkle: number, offX: number, offY: number) {
  const x = sx + offX, y = sy + offY;
  ctx.save();
  ctx.font = `${18 + Math.sin(twinkle) * 3}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.85 + Math.sin(twinkle) * 0.15;
  ctx.shadowColor = 'rgba(255,200,0,0.7)';
  ctx.shadowBlur = 8;
  ctx.fillText('⭐', x, y);
  ctx.restore();
}

function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  // Wood / pastel texture
  ctx.save();
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, color);
  bg.addColorStop(0.5, shadeColor(color, -8));
  bg.addColorStop(1, color);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle grain lines
  ctx.strokeStyle = 'rgba(200,180,220,0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i < h; i += 18) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(w, i + 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMovingObstacle(ctx: CanvasRenderingContext2D, obs: MovingObstacle, offX: number, offY: number) {
  const x = obs.x + offX, y = obs.y + offY;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(x + 3, y + 4, obs.w, obs.h);
  ctx.fillStyle = '#C2677A';
  ctx.fillRect(x, y, obs.w, obs.h);
  const g = ctx.createLinearGradient(x, y, x, y + Math.min(obs.h, 10));
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, obs.w, Math.min(obs.h, 10));
  ctx.strokeStyle = '#A0506A';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, obs.w, obs.h);
  ctx.restore();
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MarblePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Game state stored in refs to avoid re-render loops inside RAF
  const stateRef = useRef({
    phase: 'select' as 'select' | 'playing' | 'levelComplete' | 'gameover' | 'win',
    character: CHARACTERS[0],
    level: 0,
    score: 0,
    totalScore: 0,
    timer: 0,
    marble: { x: 0, y: 0, vx: 0, vy: 0 },
    tilt: { x: 0, y: 0 },
    stars: [] as StarItem[],
    moving: [] as MovingObstacle[],
    levels: buildLevels(),
    goalPulse: 0,
    confetti: [] as Confetti[],
    falling: false,
    fallAlpha: 1,
    touchStart: null as Vec2 | null,
    boardOffset: { x: 0, y: 0 },
    rollPhase: 0,
    levelTime: 0,
  });

  // React state only for things that trigger re-render (overlay screens)
  const [phase, setPhase] = useState<'select' | 'playing' | 'levelComplete' | 'gameover' | 'win'>('select');
  const [selectedChar, setSelectedChar] = useState(0);
  const [levelCompleteData, setLevelCompleteData] = useState({ level: 0, stars: 0, time: 0, bonus: 0 });
  const audioCtxRef = useRef<AudioContext | null>(null);

  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Rolling sound node refs
  const rollOscRef = useRef<OscillatorNode | null>(null);
  const rollGainRef = useRef<GainNode | null>(null);

  const startRollSound = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || rollOscRef.current) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 80;
      gain.gain.value = 0.04;
      osc.start();
      rollOscRef.current = osc;
      rollGainRef.current = gain;
    } catch { /* ignore */ }
  }, []);

  const stopRollSound = useCallback(() => {
    if (rollOscRef.current) {
      try { rollOscRef.current.stop(); } catch { /* ignore */ }
      rollOscRef.current = null;
      rollGainRef.current = null;
    }
  }, []);

  const initLevel = useCallback((levelIdx: number) => {
    const s = stateRef.current;
    const def = s.levels[levelIdx];
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cw = canvas.width, ch = canvas.height;
    // Board offset: center level on canvas
    const boardW = 15 * CELL, boardH = 18 * CELL;
    s.boardOffset = {
      x: Math.max(0, (cw - boardW) / 2),
      y: Math.max(0, (ch - boardH) / 2),
    };

    s.marble = {
      x: def.start.x * CELL,
      y: def.start.y * CELL,
      vx: 0,
      vy: 0,
    };
    s.tilt = { x: 0, y: 0 };
    s.stars = def.stars.map(p => ({ x: p.x * CELL, y: p.y * CELL, collected: false, twinkle: Math.random() * Math.PI * 2 }));
    s.moving = def.moving.map(m => ({ ...m }));
    s.goalPulse = 0;
    s.confetti = [];
    s.falling = false;
    s.fallAlpha = 1;
    s.levelTime = 0;
    s.rollPhase = 0;
  }, []);

  const spawnConfetti = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = stateRef.current;
    s.confetti = [];
    const colors = ['#FF6B9D', '#FFD700', '#7BC8FF', '#98FF98', '#FFB347', '#DDA0DD'];
    for (let i = 0; i < 80; i++) {
      s.confetti.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.6,
        y: canvas.height * 0.3 + Math.random() * canvas.height * 0.2,
        vx: (Math.random() - 0.5) * 5,
        vy: Math.random() * -5 - 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 6 + Math.random() * 8,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.2,
        life: 1,
      });
    }
  }, []);

  const startGame = useCallback((charIdx: number) => {
    const s = stateRef.current;
    s.character = CHARACTERS[charIdx];
    s.level = 0;
    s.score = 0;
    s.totalScore = 0;
    s.phase = 'playing';
    setPhase('playing');
    initLevel(0);
    if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
  }, [initLevel]);

  // Physics update
  const updatePhysics = useCallback((dt: number) => {
    const s = stateRef.current;
    if (s.phase !== 'playing') return;
    if (s.falling) {
      s.fallAlpha -= dt * 2.5;
      if (s.fallAlpha <= 0) {
        s.falling = false;
        s.fallAlpha = 1;
        initLevel(s.level);
      }
      return;
    }

    const def = s.levels[s.level];
    s.levelTime += dt;

    // Apply tilt force
    s.marble.vx += s.tilt.x * TILT_FORCE;
    s.marble.vy += s.tilt.y * TILT_FORCE;

    // Friction
    s.marble.vx *= FRICTION;
    s.marble.vy *= FRICTION;

    // Clamp speed
    const spd = Math.sqrt(s.marble.vx ** 2 + s.marble.vy ** 2);
    const maxSpd = 6;
    if (spd > maxSpd) {
      s.marble.vx = (s.marble.vx / spd) * maxSpd;
      s.marble.vy = (s.marble.vy / spd) * maxSpd;
    }

    // Update position
    s.marble.x += s.marble.vx;
    s.marble.y += s.marble.vy;

    // Roll visual phase
    s.rollPhase += spd * 0.08;

    // Update moving obstacles
    s.moving.forEach(m => {
      if (m.dx !== 0) {
        m.x += m.dx;
        if (m.x <= m.minX || m.x + m.w >= m.maxX + m.w) m.dx *= -1;
      }
      if (m.dy !== 0) {
        m.y += m.dy;
        if (m.y <= m.minY || m.y + m.h >= m.maxY + m.h) m.dy *= -1;
      }
    });

    // Collide with walls
    const allWalls = [
      ...def.walls.map(w => ({
        x: w.x * CELL, y: w.y * CELL, w: w.w * CELL, h: w.h * CELL
      })),
      ...s.moving.map(m => ({ x: m.x, y: m.y, w: m.w, h: m.h })),
    ];

    const mr = MARBLE_RADIUS;
    allWalls.forEach(w => {
      // Normalize negative dimensions
      const wx = w.w < 0 ? w.x + w.w : w.x;
      const wy = w.h < 0 ? w.y + w.h : w.y;
      const ww = Math.abs(w.w);
      const wh = Math.abs(w.h);

      const nearX = Math.max(wx, Math.min(s.marble.x, wx + ww));
      const nearY = Math.max(wy, Math.min(s.marble.y, wy + wh));
      const dx = s.marble.x - nearX;
      const dy = s.marble.y - nearY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < mr && dist > 0) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = mr - dist;
        s.marble.x += nx * overlap;
        s.marble.y += ny * overlap;
        // Bounce
        const dot = s.marble.vx * nx + s.marble.vy * ny;
        if (dot < 0) {
          s.marble.vx -= (1 + WALL_BOUNCE) * dot * nx;
          s.marble.vy -= (1 + WALL_BOUNCE) * dot * ny;
        }
      }
    });

    // Twinkle stars
    s.stars.forEach(st => { st.twinkle += dt * 3; });
    s.goalPulse += GOAL_PULSE_SPEED * 60 * dt;

    // Check star collection
    s.stars.forEach(st => {
      if (st.collected) return;
      const dx = s.marble.x - st.x, dy = s.marble.y - st.y;
      if (Math.sqrt(dx * dx + dy * dy) < mr + 14) {
        st.collected = true;
        s.score += 100;
        if (audioCtxRef.current) playStarSound(audioCtxRef.current);
      }
    });

    // Check holes
    def.holes.forEach(h => {
      const dx = s.marble.x - h.x * CELL, dy = s.marble.y - h.y * CELL;
      if (Math.sqrt(dx * dx + dy * dy) < h.r * CELL) {
        if (!s.falling) {
          s.falling = true;
          if (audioCtxRef.current) playFallSound(audioCtxRef.current);
          stopRollSound();
        }
      }
    });

    // Check goal
    const gx = def.goal.x * CELL, gy = def.goal.y * CELL;
    const gdx = s.marble.x - gx, gdy = s.marble.y - gy;
    if (Math.sqrt(gdx * gdx + gdy * gdy) < 18) {
      const starsCollected = s.stars.filter(st => st.collected).length;
      const timeBonus = Math.max(0, Math.floor((60 - s.levelTime) * 10));
      const starScore = starsCollected * 100;
      s.score += timeBonus + starScore;

      if (audioCtxRef.current) playVictorySound(audioCtxRef.current);
      stopRollSound();
      spawnConfetti();

      setLevelCompleteData({
        level: s.level + 1,
        stars: starsCollected,
        time: Math.floor(s.levelTime),
        bonus: timeBonus,
      });

      if (s.level >= s.levels.length - 1) {
        s.totalScore += s.score;
        s.phase = 'win';
        saveScore('marble', s.character.name, s.totalScore);
        setPhase('win');
      } else {
        s.phase = 'levelComplete';
        setPhase('levelComplete');
      }
    }

    // Roll sound based on speed
    if (spd > 0.5) {
      startRollSound();
      if (rollGainRef.current) {
        rollGainRef.current.gain.value = Math.min(0.06, spd * 0.008);
      }
    } else {
      stopRollSound();
    }
  }, [initLevel, spawnConfetti, startRollSound, stopRollSound]);

  // Main render
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = stateRef.current;
    const cw = canvas.width, ch = canvas.height;
    const def = s.levels[s.level];
    const off = s.boardOffset;

    // Clear
    ctx.fillStyle = '#F8F0FF';
    ctx.fillRect(0, 0, cw, ch);

    if (s.phase !== 'playing' && s.phase !== 'levelComplete' && s.phase !== 'gameover') return;

    // Board background
    drawBoard(ctx, cw, ch, BOARD_COLORS[s.level % BOARD_COLORS.length]);

    // Grid dots (subtle)
    ctx.save();
    ctx.fillStyle = 'rgba(180,160,200,0.15)';
    for (let gx = off.x % CELL; gx < cw; gx += CELL) {
      for (let gy = off.y % CELL; gy < ch; gy += CELL) {
        ctx.beginPath();
        ctx.arc(gx, gy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Draw holes
    def.holes.forEach(h => drawHole(ctx, h.x * CELL, h.y * CELL, h.r * CELL, off.x, off.y));

    // Draw goal
    drawGoal(ctx, def.goal.x * CELL, def.goal.y * CELL, s.goalPulse, off.x, off.y);

    // Draw stars
    s.stars.forEach(st => {
      if (!st.collected) drawStar(ctx, st.x, st.y, st.twinkle, off.x, off.y);
    });

    // Draw walls
    def.walls.forEach(w => {
      const wx = w.w < 0 ? (w.x + w.w) * CELL : w.x * CELL;
      const wy = w.h < 0 ? (w.y + w.h) * CELL : w.y * CELL;
      drawWall(ctx, wx, wy, Math.abs(w.w) * CELL, Math.abs(w.h) * CELL, off.x, off.y);
    });

    // Draw moving obstacles
    s.moving.forEach(m => drawMovingObstacle(ctx, m, off.x, off.y));

    // Draw marble (with falling shrink effect)
    const mx = s.marble.x + off.x, my = s.marble.y + off.y;
    let mr = MARBLE_RADIUS;
    let marbleAlpha = 1;
    if (s.falling) {
      marbleAlpha = Math.max(0, s.fallAlpha);
      mr = MARBLE_RADIUS * (0.3 + marbleAlpha * 0.7);
    }
    ctx.save();
    ctx.globalAlpha = marbleAlpha;
    drawMarble(ctx, mx, my, mr, s.character.color);
    // Character emoji on marble
    ctx.font = `${mr * 1.1}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.character.emoji, mx, my);
    ctx.restore();

    // HUD
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 160, 56, 12);
    ctx.fill();
    ctx.fillStyle = '#5D4E75';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Level ${s.level + 1}/10`, 18, 26);
    ctx.fillText(`Score: ${s.score}`, 18, 44);
    // Timer
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.floor(s.levelTime)}s`, cw - 16, 26);
    // Stars collected
    const totalStars = s.stars.length;
    const collectedStars = s.stars.filter(st => st.collected).length;
    ctx.textAlign = 'center';
    ctx.fillText(`⭐ ${collectedStars}/${totalStars}`, cw / 2, 26);
    ctx.restore();

    // Confetti
    if (s.confetti.length > 0) {
      s.confetti.forEach(c => {
        ctx.save();
        ctx.globalAlpha = c.life;
        ctx.translate(c.x, c.y);
        ctx.rotate(c.angle);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
        ctx.restore();
        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.15;
        c.vx *= 0.99;
        c.angle += c.spin;
        c.life -= 0.008;
      });
      s.confetti = s.confetti.filter(c => c.life > 0);
    }
  }, []);

  // Game loop
  const gameLoop = useCallback((ts: number) => {
    const dt = Math.min((ts - lastTimeRef.current) / 1000, 0.05);
    lastTimeRef.current = ts;
    updatePhysics(dt);
    render();
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [updatePhysics, render]);

  // Touch handling
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const s = stateRef.current;
    if (s.phase !== 'playing') return;
    const t = e.touches[0];
    s.touchStart = { x: t.clientX, y: t.clientY };
    if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const s = stateRef.current;
    if (s.phase !== 'playing' || !s.touchStart) return;
    const t = e.touches[0];
    const dx = t.clientX - s.touchStart.x;
    const dy = t.clientY - s.touchStart.y;
    const maxTilt = 60;
    s.tilt.x = Math.max(-1, Math.min(1, dx / maxTilt));
    s.tilt.y = Math.max(-1, Math.min(1, dy / maxTilt));
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const s = stateRef.current;
    s.touchStart = null;
    s.tilt = { x: 0, y: 0 };
  }, []);

  // Mouse handling for desktop
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    if (s.phase !== 'playing') return;
    s.touchStart = { x: e.clientX, y: e.clientY };
    if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    if (s.phase !== 'playing' || !s.touchStart) return;
    const dx = e.clientX - s.touchStart.x;
    const dy = e.clientY - s.touchStart.y;
    const maxTilt = 80;
    s.tilt.x = Math.max(-1, Math.min(1, dx / maxTilt));
    s.tilt.y = Math.max(-1, Math.min(1, dy / maxTilt));
  }, []);

  const handleMouseUp = useCallback(() => {
    const s = stateRef.current;
    s.touchStart = null;
    s.tilt = { x: 0, y: 0 };
  }, []);

  // Canvas resize
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const s = stateRef.current;
    if (s.phase === 'playing') {
      const boardW = 15 * CELL, boardH = 18 * CELL;
      s.boardOffset = {
        x: Math.max(0, (canvas.width - boardW) / 2),
        y: Math.max(0, (canvas.height - boardH) / 2),
      };
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(gameLoop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resizeCanvas);
      stopRollSound();
      audioCtxRef.current?.close();
    };
  }, [gameLoop, resizeCanvas, stopRollSound]);

  // Keyboard for desktop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (s.phase !== 'playing') return;
      const force = 1;
      if (e.key === 'ArrowLeft' || e.key === 'a') s.tilt.x = -force;
      else if (e.key === 'ArrowRight' || e.key === 'd') s.tilt.x = force;
      else if (e.key === 'ArrowUp' || e.key === 'w') s.tilt.y = -force;
      else if (e.key === 'ArrowDown' || e.key === 's') s.tilt.y = force;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const s = stateRef.current;
      const hKeys = ['ArrowLeft', 'ArrowRight', 'a', 'd'];
      const vKeys = ['ArrowUp', 'ArrowDown', 'w', 's'];
      if (hKeys.includes(e.key)) s.tilt.x = 0;
      if (vKeys.includes(e.key)) s.tilt.y = 0;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, []);

  const nextLevel = useCallback(() => {
    const s = stateRef.current;
    s.totalScore += s.score;
    s.score = 0;
    s.level += 1;
    s.phase = 'playing';
    setPhase('playing');
    initLevel(s.level);
  }, [initLevel]);

  const restartGame = useCallback(() => {
    const s = stateRef.current;
    s.level = 0;
    s.score = 0;
    s.totalScore = 0;
    s.phase = 'playing';
    setPhase('playing');
    initLevel(0);
  }, [initLevel]);

  return (
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', background: '#F8F0FF', position: 'relative', touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', touchAction: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* Character Select Screen */}
      {phase === 'select' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #FFF0F5 0%, #F0E8FF 50%, #E8F4FF 100%)',
        }}>
          <a href="/" style={{
            position: 'absolute', top: 16, left: 16,
            textDecoration: 'none', color: '#9B8AAA', fontSize: 14,
            background: 'rgba(255,255,255,0.8)', padding: '6px 14px',
            borderRadius: 20, border: '1px solid #DDD0EE',
          }}>← 홈</a>

          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 52, marginBottom: 8 }}>🔮</div>
            <h1 style={{
              fontSize: 28, fontWeight: 900, color: '#5D4E75',
              margin: 0, letterSpacing: 2,
              textShadow: '0 2px 8px rgba(150,100,200,0.3)',
            }}>구슬 굴리기</h1>
            <p style={{ color: '#9B8AAA', margin: '8px 0 0', fontSize: 14 }}>캐릭터를 선택하세요!</p>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 16, padding: '0 24px', width: '100%', maxWidth: 380,
          }}>
            {CHARACTERS.map((c, i) => (
              <button
                key={c.name}
                onClick={() => setSelectedChar(i)}
                style={{
                  background: selectedChar === i
                    ? `linear-gradient(135deg, ${c.color}33, ${c.color}66)`
                    : 'rgba(255,255,255,0.85)',
                  border: selectedChar === i ? `3px solid ${c.color}` : '2px solid rgba(200,180,220,0.4)',
                  borderRadius: 18,
                  padding: '18px 12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  transform: selectedChar === i ? 'scale(1.05)' : 'scale(1)',
                  boxShadow: selectedChar === i
                    ? `0 8px 24px ${c.color}44`
                    : '0 2px 8px rgba(150,100,200,0.1)',
                }}
              >
                <div style={{ fontSize: 38 }}>{c.emoji}</div>
                <div style={{ fontWeight: 700, color: '#5D4E75', fontSize: 15, marginTop: 4 }}>{c.name}</div>
                <div style={{ fontSize: 16, marginTop: 2 }}>{c.heart}</div>
              </button>
            ))}
          </div>

          <button
            onClick={() => startGame(selectedChar)}
            style={{
              marginTop: 32,
              background: `linear-gradient(135deg, ${CHARACTERS[selectedChar].color}, ${shadeColor(CHARACTERS[selectedChar].color, -30)})`,
              color: '#fff',
              border: 'none',
              borderRadius: 50,
              padding: '16px 56px',
              fontSize: 18,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: `0 8px 24px ${CHARACTERS[selectedChar].color}55`,
              letterSpacing: 1,
            }}
          >
            시작! 🎮
          </button>

          <div style={{ marginTop: 20, color: '#B8A4C8', fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
            드래그로 구슬을 굴리세요<br />
            ⭐ 별 수집 + 빠른 클리어 = 보너스!
          </div>
        </div>
      )}

      {/* Level Complete Overlay */}
      {phase === 'levelComplete' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(248,240,255,0.88)',
          backdropFilter: 'blur(6px)',
        }}>
          <div style={{
            background: 'white',
            borderRadius: 28,
            padding: '36px 40px',
            textAlign: 'center',
            boxShadow: '0 16px 48px rgba(150,100,200,0.25)',
            maxWidth: 320, width: '85%',
          }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>🎉</div>
            <h2 style={{ color: '#5D4E75', fontSize: 24, fontWeight: 900, margin: '0 0 4px' }}>
              레벨 {levelCompleteData.level} 클리어!
            </h2>
            <div style={{ color: '#B8A4C8', fontSize: 13, marginBottom: 20 }}>
              다음 레벨로 가볼까요?
            </div>
            <div style={{
              background: '#F8F0FF', borderRadius: 16, padding: '16px', marginBottom: 24,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7D6E8A', fontSize: 14 }}>
                <span>⭐ 별 수집</span>
                <span style={{ fontWeight: 700 }}>{levelCompleteData.stars}개 × 100</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7D6E8A', fontSize: 14 }}>
                <span>⚡ 스피드 보너스</span>
                <span style={{ fontWeight: 700 }}>+{levelCompleteData.bonus}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7D6E8A', fontSize: 14 }}>
                <span>⏱ 소요 시간</span>
                <span style={{ fontWeight: 700 }}>{levelCompleteData.time}초</span>
              </div>
              <div style={{
                borderTop: '1px solid #E8D8F8', paddingTop: 10, marginTop: 4,
                display: 'flex', justifyContent: 'space-between',
                color: '#5D4E75', fontWeight: 900, fontSize: 15,
              }}>
                <span>누적 점수</span>
                <span>{stateRef.current.totalScore + stateRef.current.score}</span>
              </div>
            </div>
            <button
              onClick={nextLevel}
              style={{
                background: `linear-gradient(135deg, ${stateRef.current.character.color}, ${shadeColor(stateRef.current.character.color, -30)})`,
                color: '#fff', border: 'none', borderRadius: 50,
                padding: '14px 48px', fontSize: 17, fontWeight: 700,
                cursor: 'pointer', width: '100%',
                boxShadow: `0 6px 20px ${stateRef.current.character.color}44`,
              }}
            >
              다음 레벨 →
            </button>
          </div>
        </div>
      )}

      {/* Win Screen */}
      {phase === 'win' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #FFF0F5, #F0E8FF, #E8F8FF)',
        }}>
          <div style={{
            textAlign: 'center', background: 'white',
            borderRadius: 32, padding: '40px 36px',
            boxShadow: '0 20px 60px rgba(150,100,200,0.3)',
            maxWidth: 340, width: '88%',
          }}>
            <div style={{ fontSize: 64, marginBottom: 4 }}>🏆</div>
            <h1 style={{ color: '#5D4E75', fontSize: 26, fontWeight: 900, margin: '0 0 4px' }}>
              전체 클리어!
            </h1>
            <div style={{ fontSize: 22, marginBottom: 16 }}>
              {stateRef.current.character.emoji} {stateRef.current.character.name}
              <span style={{ color: '#FFD700' }}> 최고! </span>
              {stateRef.current.character.heart}
            </div>
            <div style={{
              background: 'linear-gradient(135deg, #FFD70022, #FFD70044)',
              border: '2px solid #FFD700',
              borderRadius: 18, padding: '18px',
              marginBottom: 24,
            }}>
              <div style={{ color: '#9B8000', fontSize: 13, marginBottom: 4 }}>최종 점수</div>
              <div style={{ color: '#5D4000', fontSize: 38, fontWeight: 900 }}>
                {stateRef.current.totalScore + stateRef.current.score}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
              <button
                onClick={restartGame}
                style={{
                  background: `linear-gradient(135deg, ${stateRef.current.character.color}, ${shadeColor(stateRef.current.character.color, -30)})`,
                  color: '#fff', border: 'none', borderRadius: 50,
                  padding: '14px', fontSize: 16, fontWeight: 700, cursor: 'pointer',
                  boxShadow: `0 6px 20px ${stateRef.current.character.color}44`,
                }}
              >
                다시 하기 🔄
              </button>
              <a
                href="/"
                style={{
                  display: 'block', textDecoration: 'none',
                  background: 'rgba(200,180,220,0.2)',
                  color: '#9B8AAA', borderRadius: 50, padding: '12px',
                  fontSize: 15, fontWeight: 600, border: '1px solid rgba(200,180,220,0.4)',
                  textAlign: 'center',
                }}
              >
                홈으로 🏠
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Back button during play */}
      {phase === 'playing' && (
        <a
          href="/"
          style={{
            position: 'absolute', bottom: 16, right: 16,
            textDecoration: 'none', color: '#9B8AAA', fontSize: 13,
            background: 'rgba(255,255,255,0.75)', padding: '6px 14px',
            borderRadius: 20, border: '1px solid #DDD0EE',
            backdropFilter: 'blur(4px)',
          }}
        >
          ← 홈
        </a>
      )}
    </div>
  );
}
