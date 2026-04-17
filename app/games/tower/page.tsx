'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { saveScore } from '@/lib/ranking';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Character {
  name: string;
  emoji: string;
  color: string;
  heart: string;
}

interface Block {
  // World-space center position
  cx: number; // center x in world units
  cz: number; // center z in world units
  y: number;  // bottom y in world units (increases upward)
  w: number;  // width along X axis
  d: number;  // depth along Z axis
  h: number;  // block height (constant)
  color: string;
  hue: number;
}

interface Particle {
  x: number; // screen x
  y: number; // screen y
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHARACTERS: Character[] = [
  { name: '승민', emoji: '🤖', color: '#3B82F6', heart: '💙' },
  { name: '건우', emoji: '🩺', color: '#10B981', heart: '💚' },
  { name: '강우', emoji: '👨‍🍳', color: '#F59E0B', heart: '🧡' },
  { name: '수현', emoji: '💃', color: '#EC4899', heart: '💗' },
  { name: '이현', emoji: '👸', color: '#FF69B4', heart: '💖' },
];

const BLOCK_HEIGHT = 18;         // world units per block layer
const START_BLOCK_SIZE = 120;    // starting width/depth in world units
const MIN_BLOCK_SIZE = 14;       // game over below this
const PERFECT_TOLERANCE = 8;    // world units for perfect placement
const SLIDE_SPEED = 1.4;         // world units per frame
const SLIDE_RANGE = 110;         // max slide distance from center

// Isometric projection constants
const COS30 = Math.cos(Math.PI / 6);  // cos(30°)
const SIN30 = Math.sin(Math.PI / 6);  // sin(30°)

// ─── Isometric Projection ─────────────────────────────────────────────────────
// x_screen = (worldX - worldZ) * cos(30°)
// y_screen = (worldX + worldZ) * sin(30°) - worldY

function isoProject(
  worldX: number,
  worldZ: number,
  worldY: number,
  originX: number,
  originY: number
): { sx: number; sy: number } {
  return {
    sx: originX + (worldX - worldZ) * COS30,
    sy: originY + (worldX + worldZ) * SIN30 - worldY,
  };
}

// ─── Pastel Color from hue ─────────────────────────────────────────────────────

function pastelFromHue(hue: number): { base: string; top: string; front: string; side: string } {
  const h = hue % 360;
  const base = `hsl(${h}, 65%, 72%)`;
  const top = `hsl(${h}, 60%, 82%)`;
  const front = `hsl(${h}, 65%, 68%)`;
  const side = `hsl(${h}, 65%, 56%)`;
  return { base, top, front, side };
}

// ─── Audio ───────────────────────────────────────────────────────────────────

class SoundManager {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  place() {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch { /* ignore */ }
  }

  perfect() {
    try {
      const ctx = this.getCtx();
      const notes = [880, 1100, 1320];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.07 + 0.2);
        osc.start(ctx.currentTime + i * 0.07);
        osc.stop(ctx.currentTime + i * 0.07 + 0.2);
      });
    } catch { /* ignore */ }
  }

  cut() {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch { /* ignore */ }
  }

  gameOver() {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } catch { /* ignore */ }
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TowerGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedChar, setSelectedChar] = useState<number | null>(null);
  const [gameState, setGameState] = useState<'select' | 'playing' | 'over'>('select');
  const [finalScore, setFinalScore] = useState(0);
  const [finalPerfects, setFinalPerfects] = useState(0);
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tower-highscore');
      if (saved) setHighScore(parseInt(saved, 10));
    } catch { /* ignore */ }
  }, []);

  const startGame = useCallback((charIndex: number) => {
    setSelectedChar(charIndex);
    setGameState('playing');
  }, []);

  // ─── Game Loop ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (gameState !== 'playing' || selectedChar === null) return;

    const canvas = canvasRef.current!;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    if (!ctx) return;

    const sound = new SoundManager();
    let animId: number;
    let destroyed = false;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const char = CHARACTERS[selectedChar];

    // ── Game State Variables ──

    // The isometric origin: center of screen at a certain height
    // Camera scrolls up as tower grows
    let cameraY = 0; // world Y of the camera's focal point, increases with tower height

    // Placed blocks
    const blocks: Block[] = [];

    // The very first (base) block
    const firstHue = 180; // start at a pleasant cyan-blue
    const firstColors = pastelFromHue(firstHue);
    blocks.push({
      cx: 0, cz: 0, y: 0,
      w: START_BLOCK_SIZE, d: START_BLOCK_SIZE, h: BLOCK_HEIGHT,
      color: firstColors.base, hue: firstHue,
    });

    // Current moving block
    let currentBlock: Block = {
      cx: 0, cz: 0, y: BLOCK_HEIGHT,
      w: START_BLOCK_SIZE, d: START_BLOCK_SIZE, h: BLOCK_HEIGHT,
      color: firstColors.base, hue: firstHue + 20,
    };

    // Sliding state
    // direction: 'x' or 'z', alternates per level
    let slideAxis: 'x' | 'z' = 'x';
    let slideDir = 1; // +1 or -1
    let slidePos = -SLIDE_RANGE; // current offset from previous block center

    // Prepare first moving block
    function initMovingBlock(level: number) {
      const prev = blocks[blocks.length - 1];
      const hue = (firstHue + level * 22) % 360;
      const colors = pastelFromHue(hue);
      slideAxis = level % 2 === 0 ? 'x' : 'z';
      slideDir = 1;
      slidePos = -SLIDE_RANGE;
      currentBlock = {
        cx: slideAxis === 'x' ? prev.cx + slidePos : prev.cx,
        cz: slideAxis === 'z' ? prev.cz + slidePos : prev.cz,
        y: prev.y + BLOCK_HEIGHT,
        w: prev.w,
        d: prev.d,
        h: BLOCK_HEIGHT,
        color: colors.base,
        hue,
      };
    }
    initMovingBlock(1);

    // Falling cut piece animation
    interface FallingPiece {
      cx: number; cz: number; y: number;
      w: number; d: number; h: number;
      vy: number; color: string; hue: number;
      life: number;
    }
    let fallingPieces: FallingPiece[] = [];

    // Particles & floating texts
    let particles: Particle[] = [];
    let floatingTexts: FloatingText[] = [];

    // Score
    let score = 0;
    let perfectCount = 0;

    // Drop animation
    let dropping = false;
    let dropY = 0;
    let dropTargetY = 0;
    const DROP_SPEED = 8;

    // Perfect flash
    let perfectFlash = 0;

    // Game over state
    let isGameOver = false;

    // ── Helper: screen origin ──
    // We want the isometric origin to be at center-bottom area of screen,
    // scrolling up as tower grows.
    function getOrigin() {
      const baseOriginX = canvas.width / 2;
      // cameraY tracks the top of the placed stack; we want to keep it ~60% from top
      const baseOriginY = canvas.height * 0.7 - cameraY * SIN30 * 0.5 +
        (blocks.length > 0 ? (blocks[blocks.length - 1].y + BLOCK_HEIGHT) * 1.0 : 0);
      return { ox: baseOriginX, oy: baseOriginY };
    }

    // ── Draw a single 3D block ──
    function drawBlock(
      block: Block,
      ox: number, oy: number,
      alpha = 1,
      overrideHue?: number
    ) {
      const hue = overrideHue !== undefined ? overrideHue : block.hue;
      const colors = pastelFromHue(hue);

      const hw = block.w / 2;
      const hd = block.d / 2;
      const y0 = block.y;         // bottom world Y
      const y1 = block.y + block.h; // top world Y

      const cx = block.cx;
      const cz = block.cz;

      // 8 corners of the box in world space (cx/cz centered)
      // top face: y1; bottom face: y0
      // front-left  = (cx-hw, cz+hd)
      // front-right = (cx+hw, cz+hd)
      // back-right  = (cx+hw, cz-hd)
      // back-left   = (cx-hw, cz-hd)

      const tFL = isoProject(cx - hw, cz + hd, y1, ox, oy);
      const tFR = isoProject(cx + hw, cz + hd, y1, ox, oy);
      const tBR = isoProject(cx + hw, cz - hd, y1, ox, oy);
      const tBL = isoProject(cx - hw, cz - hd, y1, ox, oy);
      const bFL = isoProject(cx - hw, cz + hd, y0, ox, oy);
      const bFR = isoProject(cx + hw, cz + hd, y0, ox, oy);
      const bBR = isoProject(cx + hw, cz - hd, y0, ox, oy);
      // bBL not needed (hidden back face)

      ctx.globalAlpha = alpha;

      // ── Left side face (front-left column) ──
      // Vertices: bFL → tFL → tBL → (bBL implied)
      // Actually we draw the face visible from our isometric view:
      // Left face: bFL, tFL, tBL(approx), bBL(approx)
      // In isometric view from ~southeast, the visible faces are:
      //   TOP face, RIGHT face (front-right), LEFT face (front-left)
      // Let's label: "front face" = the face facing +Z (front-right and front-left)
      // Actually in standard iso: viewer is at positive X, Z, above.
      // Visible: top, front (+Z face = FL↔FR), right (+X face = FR↔BR)

      // Front face (+Z face): bFL, bFR, tFR, tFL
      ctx.fillStyle = colors.front;
      ctx.beginPath();
      ctx.moveTo(bFL.sx, bFL.sy);
      ctx.lineTo(bFR.sx, bFR.sy);
      ctx.lineTo(tFR.sx, tFR.sy);
      ctx.lineTo(tFL.sx, tFL.sy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Right face (+X face): bFR, bBR, tBR, tFR
      ctx.fillStyle = colors.side;
      ctx.beginPath();
      ctx.moveTo(bFR.sx, bFR.sy);
      ctx.lineTo(bBR.sx, bBR.sy);
      ctx.lineTo(tBR.sx, tBR.sy);
      ctx.lineTo(tFR.sx, tFR.sy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Top face: tFL, tFR, tBR, tBL
      ctx.fillStyle = colors.top;
      ctx.beginPath();
      ctx.moveTo(tFL.sx, tFL.sy);
      ctx.lineTo(tFR.sx, tFR.sy);
      ctx.lineTo(tBR.sx, tBR.sy);
      ctx.lineTo(tBL.sx, tBL.sy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Edge highlights on top face
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tFL.sx, tFL.sy);
      ctx.lineTo(tFR.sx, tFR.sy);
      ctx.lineTo(tBR.sx, tBR.sy);
      ctx.stroke();

      ctx.globalAlpha = 1;
    }

    // ── Draw ground shadow ──
    function drawShadow(block: Block, ox: number, oy: number) {
      const hw = block.w / 2;
      const hd = block.d / 2;
      const groundY = 0;
      const cx = block.cx;
      const cz = block.cz;

      const tFL = isoProject(cx - hw, cz + hd, groundY, ox, oy);
      const tFR = isoProject(cx + hw, cz + hd, groundY, ox, oy);
      const tBR = isoProject(cx + hw, cz - hd, groundY, ox, oy);
      const tBL = isoProject(cx - hw, cz - hd, groundY, ox, oy);

      ctx.fillStyle = 'rgba(100, 80, 120, 0.12)';
      ctx.beginPath();
      ctx.moveTo(tFL.sx, tFL.sy + 6);
      ctx.lineTo(tFR.sx, tFR.sy + 6);
      ctx.lineTo(tBR.sx, tBR.sy + 6);
      ctx.lineTo(tBL.sx, tBL.sy + 6);
      ctx.closePath();
      ctx.fill();
    }

    // ── Update camera ──
    function updateCamera() {
      const targetCameraY = blocks.length > 1
        ? (blocks[blocks.length - 1].y + BLOCK_HEIGHT) * 0.8
        : 0;
      cameraY += (targetCameraY - cameraY) * 0.06;
    }

    // ── Spawn particles ──
    function spawnParticles(sx: number, sy: number, color: string, count: number) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3;
        particles.push({
          x: sx, y: sy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          life: 35 + Math.random() * 25,
          maxLife: 35 + Math.random() * 25,
          size: 3 + Math.random() * 5,
          color,
        });
      }
    }

    // ── Drop / place logic ──
    function dropBlock() {
      if (dropping || isGameOver) return;

      const prev = blocks[blocks.length - 1];

      // Calculate overlap
      let newCX = currentBlock.cx;
      let newCZ = currentBlock.cz;
      let newW = currentBlock.w;
      let newD = currentBlock.d;
      let isPerfect = false;

      if (slideAxis === 'x') {
        const offset = currentBlock.cx - prev.cx;
        if (Math.abs(offset) <= PERFECT_TOLERANCE) {
          // Perfect!
          newCX = prev.cx;
          newW = prev.w;
          isPerfect = true;
        } else {
          const overlapW = prev.w / 2 + newW / 2 - Math.abs(offset);
          if (overlapW <= 0) {
            // Complete miss → game over
            isGameOver = true;
            sound.gameOver();
            const { ox, oy } = getOrigin();
            const topPt = isoProject(currentBlock.cx, currentBlock.cz, currentBlock.y + BLOCK_HEIGHT, ox, oy);
            spawnParticles(topPt.sx, topPt.sy, currentBlock.color, 18);
            setTimeout(() => {
              const finalS = score;
              const finalP = perfectCount;
              try { localStorage.setItem('tower-highscore', String(Math.max(finalS, highScore))); } catch { /* */ }
              setFinalScore(finalS);
              setFinalPerfects(finalP);
              setHighScore(h => Math.max(h, finalS));
              if (selectedChar !== null) saveScore('tower', CHARACTERS[selectedChar].name, finalS);
              setGameState('over');
            }, 1200);
            return;
          }
          newCX = prev.cx + (offset > 0 ? overlapW / 2 - prev.w / 2 + prev.cx - prev.cx : prev.cx - prev.cx - overlapW / 2 + prev.w / 2) + prev.cx - prev.cx;
          // Recompute: center of overlap region
          if (offset > 0) {
            // block is to the right: overlap region's center
            newCX = prev.cx + (prev.w - overlapW) / 2;
          } else {
            newCX = prev.cx - (prev.w - overlapW) / 2;
          }
          newW = overlapW;

          // Falling piece
          const cutW = currentBlock.w - overlapW;
          const cutCX = offset > 0
            ? currentBlock.cx - overlapW / 2 + (currentBlock.w / 2) - cutW / 2
              // left edge of currentBlock to right edge of overlap
            : currentBlock.cx + overlapW / 2 - (currentBlock.w / 2) + cutW / 2;
          // Simpler: cut piece is on the overhanging side
          const cutCX2 = offset > 0
            ? newCX + newW / 2 + cutW / 2    // right of overlap
            : newCX - newW / 2 - cutW / 2;   // left of overlap

          fallingPieces.push({
            cx: cutCX2, cz: currentBlock.cz,
            y: currentBlock.y,
            w: cutW, d: currentBlock.d,
            h: BLOCK_HEIGHT, vy: 0,
            color: currentBlock.color, hue: currentBlock.hue, life: 60,
          });
        }
      } else {
        // slideAxis === 'z'
        const offset = currentBlock.cz - prev.cz;
        if (Math.abs(offset) <= PERFECT_TOLERANCE) {
          newCZ = prev.cz;
          newD = prev.d;
          isPerfect = true;
        } else {
          const overlapD = prev.d / 2 + newD / 2 - Math.abs(offset);
          if (overlapD <= 0) {
            isGameOver = true;
            sound.gameOver();
            const { ox, oy } = getOrigin();
            const topPt = isoProject(currentBlock.cx, currentBlock.cz, currentBlock.y + BLOCK_HEIGHT, ox, oy);
            spawnParticles(topPt.sx, topPt.sy, currentBlock.color, 18);
            setTimeout(() => {
              const finalS = score;
              const finalP = perfectCount;
              try { localStorage.setItem('tower-highscore', String(Math.max(finalS, highScore))); } catch { /* */ }
              setFinalScore(finalS);
              setFinalPerfects(finalP);
              setHighScore(h => Math.max(h, finalS));
              if (selectedChar !== null) saveScore('tower', CHARACTERS[selectedChar].name, finalS);
              setGameState('over');
            }, 1200);
            return;
          }
          if (offset > 0) {
            newCZ = prev.cz + (prev.d - overlapD) / 2;
          } else {
            newCZ = prev.cz - (prev.d - overlapD) / 2;
          }
          newD = overlapD;

          const cutD = currentBlock.d - overlapD;
          const cutCZ = offset > 0
            ? newCZ + newD / 2 + cutD / 2
            : newCZ - newD / 2 - cutD / 2;

          fallingPieces.push({
            cx: currentBlock.cx, cz: cutCZ,
            y: currentBlock.y,
            w: currentBlock.w, d: cutD,
            h: BLOCK_HEIGHT, vy: 0,
            color: currentBlock.color, hue: currentBlock.hue, life: 60,
          });
        }
      }

      // Check if resulting block is too small
      if (newW < MIN_BLOCK_SIZE || newD < MIN_BLOCK_SIZE) {
        isGameOver = true;
        sound.gameOver();
        const { ox, oy } = getOrigin();
        const topPt = isoProject(newCX, newCZ, currentBlock.y + BLOCK_HEIGHT, ox, oy);
        spawnParticles(topPt.sx, topPt.sy, currentBlock.color, 18);
        setTimeout(() => {
          const finalS = score;
          const finalP = perfectCount;
          try { localStorage.setItem('tower-highscore', String(Math.max(finalS, highScore))); } catch { /* */ }
          setFinalScore(finalS);
          setFinalPerfects(finalP);
          setHighScore(h => Math.max(h, finalS));
          if (selectedChar !== null) saveScore('tower', CHARACTERS[selectedChar].name, finalS);
          setGameState('over');
        }, 1200);
        return;
      }

      // Place block
      const placedBlock: Block = {
        cx: newCX, cz: newCZ,
        y: currentBlock.y,
        w: newW, d: newD, h: BLOCK_HEIGHT,
        color: currentBlock.color, hue: currentBlock.hue,
      };
      blocks.push(placedBlock);
      score = blocks.length - 1;

      const { ox, oy } = getOrigin();
      const topPt = isoProject(newCX, newCZ, placedBlock.y + BLOCK_HEIGHT, ox, oy);

      if (isPerfect) {
        perfectCount++;
        perfectFlash = 40;
        sound.perfect();
        spawnParticles(topPt.sx, topPt.sy, '#FFD700', 24);
        spawnParticles(topPt.sx, topPt.sy, currentBlock.color, 16);
        floatingTexts.push({
          x: topPt.sx, y: topPt.sy - 20,
          text: 'PERFECT! ✨',
          life: 70, maxLife: 70,
          color: '#FF69B4',
        });
      } else {
        sound.place();
        spawnParticles(topPt.sx, topPt.sy, currentBlock.color, 10);
      }

      // Start drop animation for visual feedback (brief)
      dropping = true;
      dropY = placedBlock.y + BLOCK_HEIGHT * 0.5; // start slightly above
      dropTargetY = placedBlock.y;

      // Init next moving block
      initMovingBlock(blocks.length);
    }

    // ── Input ──
    const handleTap = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      dropBlock();
    };

    canvas.addEventListener('mousedown', handleTap);
    canvas.addEventListener('touchstart', handleTap, { passive: false });

    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'Enter') {
        e.preventDefault();
        dropBlock();
      }
    };
    window.addEventListener('keydown', handleKey);

    // ── Game Loop ──
    const gameLoop = () => {
      if (destroyed) return;

      // ── Update ──

      // Update sliding block position
      if (!isGameOver) {
        slidePos += SLIDE_SPEED * slideDir;
        if (slidePos > SLIDE_RANGE) { slidePos = SLIDE_RANGE; slideDir = -1; }
        if (slidePos < -SLIDE_RANGE) { slidePos = -SLIDE_RANGE; slideDir = 1; }

        const prev = blocks[blocks.length - 1];
        if (slideAxis === 'x') {
          currentBlock.cx = prev.cx + slidePos;
          currentBlock.cz = prev.cz;
        } else {
          currentBlock.cx = prev.cx;
          currentBlock.cz = prev.cz + slidePos;
        }
      }

      // Drop anim
      if (dropping) {
        dropY += (dropTargetY - dropY) * 0.3;
        if (Math.abs(dropY - dropTargetY) < 0.5) dropping = false;
      }

      // Falling pieces
      fallingPieces = fallingPieces.filter(fp => {
        fp.vy += 0.8;
        fp.y -= fp.vy; // world Y decreases (fall down)
        fp.life--;
        return fp.life > 0 && fp.y > -200;
      });

      // Particles
      particles = particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.life--;
        return p.life > 0;
      });

      // Floating texts
      floatingTexts = floatingTexts.filter(ft => {
        ft.y -= 1.2;
        ft.life--;
        return ft.life > 0;
      });

      if (perfectFlash > 0) perfectFlash--;

      updateCamera();

      // ── Draw ──
      const { ox, oy } = getOrigin();

      // Background gradient (soft sky)
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, '#E8D5F5');
      bgGrad.addColorStop(0.45, '#F5E8FF');
      bgGrad.addColorStop(1, '#FFE8F5');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Perfect flash overlay
      if (perfectFlash > 0) {
        ctx.fillStyle = `rgba(255, 240, 120, ${(perfectFlash / 40) * 0.12})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Decorative background circles (subtle)
      ctx.fillStyle = 'rgba(255,200,230,0.12)';
      ctx.beginPath();
      ctx.arc(canvas.width * 0.15, canvas.height * 0.2, 100, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(canvas.width * 0.85, canvas.height * 0.35, 80, 0, Math.PI * 2);
      ctx.fill();

      // Ground shadow under base block
      if (blocks.length > 0) {
        drawShadow(blocks[0], ox, oy);
      }

      // Draw all placed blocks (bottom to top)
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        // Slight alpha fade on very bottom blocks when tower is tall
        const alpha = 1.0;
        drawBlock(b, ox, oy, alpha);
      }

      // Draw falling pieces
      for (const fp of fallingPieces) {
        const alpha = Math.max(0, fp.life / 60);
        drawBlock(fp as Block, ox, oy, alpha);
      }

      // Draw current moving block (with slight transparency if over)
      if (!isGameOver) {
        drawBlock(currentBlock, ox, oy, 0.92);

        // Draw slide direction indicator (small arrow on top face)
        const prev = blocks[blocks.length - 1];
        const topCenter = isoProject(currentBlock.cx, currentBlock.cz, currentBlock.y + BLOCK_HEIGHT + 2, ox, oy);
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `${Math.max(12, Math.min(18, currentBlock.w * 0.15))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const arrow = slideAxis === 'x' ? (slideDir > 0 ? '→' : '←') : (slideDir > 0 ? '↓' : '↑');
        ctx.fillText(arrow, topCenter.sx, topCenter.sy);
        ctx.globalAlpha = 1;

        // Guide line from previous block top to current block
        const prevTop = isoProject(prev.cx, prev.cz, prev.y + BLOCK_HEIGHT, ox, oy);
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = '#9B7DC0';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(prevTop.sx, prevTop.sy);
        ctx.lineTo(topCenter.sx, topCenter.sy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      // Particles
      for (const p of particles) {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const sz = p.size * alpha;
        ctx.moveTo(p.x, p.y - sz);
        ctx.lineTo(p.x + sz * 0.35, p.y - sz * 0.35);
        ctx.lineTo(p.x + sz, p.y);
        ctx.lineTo(p.x + sz * 0.35, p.y + sz * 0.35);
        ctx.lineTo(p.x, p.y + sz);
        ctx.lineTo(p.x - sz * 0.35, p.y + sz * 0.35);
        ctx.lineTo(p.x - sz, p.y);
        ctx.lineTo(p.x - sz * 0.35, p.y - sz * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Floating texts
      for (const ft of floatingTexts) {
        const alpha = Math.min(1, ft.life / ft.maxLife * 2);
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 22px sans-serif';
        ctx.fillStyle = ft.color;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.globalAlpha = 1;
      }

      // ── HUD ──
      // Score badge
      const hue = currentBlock.hue;
      const hudColor = `hsl(${hue}, 60%, 55%)`;

      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.roundRect(12, 12, 160, 56, 16);
      ctx.fill();
      ctx.strokeStyle = `hsl(${hue}, 60%, 75%)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(12, 12, 160, 56, 16);
      ctx.stroke();

      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = hudColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${char.heart} ${score}`, 28, 30);

      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#8888AA';
      ctx.fillText(`✨ PERFECT ×${perfectCount}`, 28, 52);

      // Character badge top-right
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.roundRect(canvas.width - 100, 12, 88, 44, 14);
      ctx.fill();
      ctx.strokeStyle = `${char.color}99`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(canvas.width - 100, 12, 88, 44, 14);
      ctx.stroke();

      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char.emoji, canvas.width - 80, 34);
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = char.color;
      ctx.fillText(char.name, canvas.width - 55, 34);

      // Tap hint (fade out after first few blocks)
      if (score < 3) {
        const hintAlpha = Math.max(0, 1 - score * 0.35);
        ctx.globalAlpha = hintAlpha;
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#9B7DC0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('화면을 탭해서 블록을 쌓으세요! 👆', canvas.width / 2, canvas.height - 40);
        ctx.globalAlpha = 1;
      }

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);

    return () => {
      destroyed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', handleKey);
      canvas.removeEventListener('mousedown', handleTap);
      canvas.removeEventListener('touchstart', handleTap);
    };
  }, [gameState, selectedChar, highScore]);

  // ─── Character Select Screen ──────────────────────────────────────────────

  if (gameState === 'select') {
    return (
      <div
        style={{
          width: '100vw',
          height: '100dvh',
          background: 'linear-gradient(135deg, #F0E6FF 0%, #FFE6F4 50%, #E6F0FF 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Decorative circles */}
        <div style={{
          position: 'absolute', top: -60, left: -60,
          width: 200, height: 200, borderRadius: '50%',
          background: 'rgba(180,140,240,0.15)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -40, right: -40,
          width: 160, height: 160, borderRadius: '50%',
          background: 'rgba(255,180,220,0.15)', pointerEvents: 'none',
        }} />

        {/* Back button */}
        <a
          href="/"
          style={{
            position: 'absolute', top: 16, left: 16,
            color: '#9B7DC0',
            textDecoration: 'none',
            fontSize: 17,
            background: 'rgba(255,255,255,0.65)',
            borderRadius: 20,
            padding: '8px 18px',
            backdropFilter: 'blur(4px)',
            border: '1.5px solid rgba(180,140,255,0.3)',
          }}
        >
          ← 홈으로
        </a>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 'clamp(40px, 10vw, 64px)', marginBottom: 4 }}>🏗️</div>
          <h1
            style={{
              color: '#8860C0',
              fontSize: 'clamp(24px, 5.5vw, 42px)',
              fontWeight: 'bold',
              margin: 0,
              textShadow: '1px 2px 8px rgba(140,90,200,0.2)',
            }}
          >
            3D 블록 쌓기
          </h1>
          <p
            style={{
              color: '#AA88CC',
              fontSize: 'clamp(13px, 2.8vw, 17px)',
              marginTop: 6,
              marginBottom: 0,
            }}
          >
            캐릭터를 선택해서 타워를 쌓아보자!
          </p>
        </div>

        {highScore > 0 && (
          <p style={{
            color: '#C0A000', fontSize: 15, margin: '10px 0 16px',
            background: 'rgba(255,220,60,0.15)', borderRadius: 12,
            padding: '6px 18px', border: '1px solid rgba(200,170,0,0.2)',
          }}>
            🏆 최고기록: {highScore}층
          </p>
        )}

        {/* Character grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 14,
            padding: '0 20px',
            maxWidth: 380,
            width: '100%',
            marginTop: highScore > 0 ? 0 : 16,
          }}
        >
          {CHARACTERS.map((c, i) => (
            <button
              key={c.name}
              onClick={() => startGame(i)}
              style={{
                background: 'rgba(255,255,255,0.7)',
                backdropFilter: 'blur(8px)',
                border: `2.5px solid ${c.color}99`,
                borderRadius: 20,
                padding: '18px 10px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                color: '#555',
                transition: 'transform 0.15s, box-shadow 0.15s',
                WebkitTapHighlightColor: 'transparent',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.06)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 24px ${c.color}50`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
              }}
            >
              <span style={{ fontSize: 44 }}>{c.emoji}</span>
              <span style={{ fontSize: 17, fontWeight: 'bold', color: c.color }}>
                {c.heart} {c.name}
              </span>
            </button>
          ))}
        </div>

        {/* Instructions */}
        <div
          style={{
            marginTop: 22,
            background: 'rgba(255,255,255,0.55)',
            borderRadius: 16,
            padding: '12px 22px',
            color: '#9988BB',
            textAlign: 'center',
            fontSize: 'clamp(12px, 2.5vw, 14px)',
            lineHeight: 1.7,
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(180,160,220,0.25)',
          }}
        >
          <p style={{ margin: 0 }}>📱 화면 탭 / 스페이스바 = 블록 놓기</p>
          <p style={{ margin: 0 }}>✨ 정확히 맞추면 PERFECT 보너스!</p>
          <p style={{ margin: 0 }}>🌈 높이 쌓을수록 블록이 무지개색으로!</p>
        </div>
      </div>
    );
  }

  // ─── Game Over Screen ─────────────────────────────────────────────────────

  if (gameState === 'over') {
    const isNewHigh = finalScore >= highScore && finalScore > 0;
    return (
      <div
        style={{
          width: '100vw',
          height: '100dvh',
          background: 'linear-gradient(135deg, #F0E6FF 0%, #FFE6F4 50%, #E6F0FF 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            background: 'rgba(255,255,255,0.82)',
            backdropFilter: 'blur(12px)',
            borderRadius: 28,
            padding: '32px 36px',
            textAlign: 'center',
            maxWidth: 340,
            width: 'calc(100% - 48px)',
            border: '2px solid rgba(200,170,240,0.4)',
            boxShadow: '0 8px 40px rgba(160,120,220,0.2)',
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 6 }}>
            {isNewHigh ? '🎉' : '🏗️'}
          </div>
          <h2 style={{ color: '#9060C0', fontSize: 26, fontWeight: 'bold', margin: '0 0 6px' }}>
            게임 오버!
          </h2>
          {selectedChar !== null && (
            <p style={{ color: '#AA88CC', fontSize: 15, margin: '0 0 16px' }}>
              {CHARACTERS[selectedChar].heart} {CHARACTERS[selectedChar].name}의 타워
            </p>
          )}

          <div
            style={{
              background: 'linear-gradient(135deg, #F5EEFF, #FFE8F5)',
              borderRadius: 18,
              padding: '14px 20px',
              marginBottom: 16,
            }}
          >
            <p style={{ color: '#7050A0', fontSize: 28, fontWeight: 'bold', margin: '0 0 4px' }}>
              🏗️ {finalScore}층
            </p>
            <p style={{ color: '#AA88CC', fontSize: 14, margin: 0 }}>
              ✨ PERFECT {finalPerfects}회
            </p>
          </div>

          {isNewHigh && (
            <p style={{ color: '#D0A000', fontSize: 15, marginBottom: 14, fontWeight: 'bold' }}>
              🎊 새 최고기록 달성! 🎊
            </p>
          )}
          {!isNewHigh && highScore > 0 && (
            <p style={{ color: '#AAA', fontSize: 14, marginBottom: 14 }}>
              🏆 최고기록: {highScore}층
            </p>
          )}

          {/* Play again */}
          <button
            onClick={() => {
              if (selectedChar !== null) {
                setGameState('playing');
              }
            }}
            style={{
              background: 'linear-gradient(135deg, #C080FF, #FF80C0)',
              border: 'none',
              borderRadius: 24,
              padding: '14px 36px',
              color: '#fff',
              fontSize: 17,
              fontWeight: 'bold',
              cursor: 'pointer',
              width: '100%',
              marginBottom: 10,
              boxShadow: '0 4px 16px rgba(180,100,220,0.35)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            다시 쌓기! 🏗️
          </button>

          {/* Change character */}
          <button
            onClick={() => setGameState('select')}
            style={{
              background: 'rgba(200,180,230,0.3)',
              border: '1.5px solid rgba(180,150,220,0.4)',
              borderRadius: 20,
              padding: '10px 24px',
              color: '#9070B0',
              fontSize: 15,
              cursor: 'pointer',
              width: '100%',
              marginBottom: 10,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            캐릭터 변경
          </button>

          {/* Home */}
          <a
            href="/"
            style={{
              display: 'block',
              color: '#B0A0C0',
              fontSize: 14,
              textDecoration: 'none',
              marginTop: 4,
            }}
          >
            🏠 홈으로
          </a>
        </div>
      </div>
    );
  }

  // ─── Game Canvas ──────────────────────────────────────────────────────────

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        userSelect: 'none',
        cursor: 'pointer',
      }}
    />
  );
}
