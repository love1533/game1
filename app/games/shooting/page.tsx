'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { saveScore } from '@/lib/ranking';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Character {
  name: string;
  color: string;
  emoji: string;
  heart: string;
  desc: string;
}

interface Laser {
  x: number;
  y: number;
  vy: number;
  width: number;
  height: number;
  color: string;
  type: 'normal' | 'triple';
}

interface EnemyBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Enemy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  radius: number;
  type: 'small' | 'medium' | 'large' | 'boss';
  emoji: string;
  points: number;
  canShoot: boolean;
  shootTimer: number;
  shootInterval: number;
  entryAnim: number; // 0-1 scale in
  bobOffset: number;
  dirTimer: number;
  color: string;
}

interface PowerUp {
  x: number;
  y: number;
  vy: number;
  type: 'triple' | 'speed' | 'shield' | 'bomb';
  radius: number;
  bobOffset: number;
}

interface Particle {
  x: number;
  y: number;
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
  vy: number;
  size: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CHARACTERS: Character[] = [
  { name: '승민', color: '#3B82F6', emoji: '🤖', heart: '💙', desc: 'AI과학자' },
  { name: '건우', color: '#10B981', emoji: '🩺', heart: '💚', desc: '의사' },
  { name: '강우', color: '#F59E0B', emoji: '👨‍🍳', heart: '🧡', desc: '요리사' },
  { name: '수현', color: '#EC4899', emoji: '💃', heart: '💗', desc: '13살' },
  { name: '이현', color: '#FF69B4', emoji: '👸', heart: '💖', desc: '7살 공주' },
  { name: '준영', color: '#6366F1', emoji: '📚', heart: '💜', desc: '독서왕' },
  { name: '준우', color: '#0EA5E9', emoji: '✈️', heart: '💎', desc: '파일럿' },
];

const ENEMY_EMOJIS_SMALL = ['👾', '🛸', '🤡', '👻', '🐙'];
const ENEMY_EMOJIS_MEDIUM = ['🦑', '🦀', '🦠', '🐲', '🤖'];
const ENEMY_EMOJIS_LARGE = ['🦕', '🐳', '🦖'];
const BOSS_EMOJIS = ['👹', '🤑', '🦑'];

// ─── Sound Manager ──────────────────────────────────────────────────────────────

class SoundManager {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  laser() {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch { /* ignore */ }
  }

  explosion(big = false) {
    try {
      const ctx = this.getCtx();
      const bufLen = ctx.sampleRate * (big ? 0.5 : 0.25);
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = big ? 600 : 1200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(big ? 0.3 : 0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (big ? 0.5 : 0.25));
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    } catch { /* ignore */ }
  }

  powerUp() {
    try {
      const ctx = this.getCtx();
      const freqs = [800, 1000, 1200, 1600];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.06;
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.1);
      });
    } catch { /* ignore */ }
  }

  bossWarning() {
    try {
      const ctx = this.getCtx();
      [200, 180, 160, 200, 180, 160].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.1);
      });
    } catch { /* ignore */ }
  }

  hit() {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch { /* ignore */ }
  }

  gameOver() {
    try {
      const ctx = this.getCtx();
      [500, 400, 300, 200, 100].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.2);
      });
    } catch { /* ignore */ }
  }
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function ShootingGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedChar, setSelectedChar] = useState<number | null>(null);
  const [gameState, setGameState] = useState<'select' | 'playing' | 'over'>('select');
  const [finalScore, setFinalScore] = useState(0);

  const startGame = useCallback((charIndex: number) => {
    setSelectedChar(charIndex);
    setGameState('playing');
  }, []);

  const restartGame = useCallback(() => {
    if (selectedChar !== null) {
      setGameState('playing');
    }
  }, [selectedChar]);

  // ─── Game Loop ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (gameState !== 'playing' || selectedChar === null) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sound = new SoundManager();
    let animId: number;
    let destroyed = false;

    // Resize
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const char = CHARACTERS[selectedChar];

    // ── Stars (parallax background) ───────────────────────────────────────────
    const stars: Star[] = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2.5 + 0.5,
      speed: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.6 + 0.4,
    }));

    // ── Player ship ───────────────────────────────────────────────────────────
    const SHIP_W = 48;
    const SHIP_H = 56;
    const player = {
      x: canvas.width / 2,
      y: canvas.height - 80,
      targetX: canvas.width / 2,
      vx: 0,
      lives: 3,
      invincible: 0,
      shield: false,
      speed: 6,
      fireMode: 'normal' as 'normal' | 'triple',
      fireModeTimer: 0,
      speedBoostTimer: 0,
      bombReady: false,
    };

    // ── Touch input ───────────────────────────────────────────────────────────
    let touchActive = false;
    let touchX = canvas.width / 2;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      touchActive = true;
      touchX = e.touches[0].clientX;
      player.targetX = touchX;
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!touchActive) return;
      touchX = e.touches[0].clientX;
      player.targetX = touchX;
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      touchActive = false;
    };
    const onMouseDown = (e: MouseEvent) => {
      touchActive = true;
      player.targetX = e.clientX;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!touchActive) return;
      player.targetX = e.clientX;
    };
    const onMouseUp = () => { touchActive = false; };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);

    // ── Game state ────────────────────────────────────────────────────────────
    let lasers: Laser[] = [];
    let enemyBullets: EnemyBullet[] = [];
    let enemies: Enemy[] = [];
    let powerUps: PowerUp[] = [];
    let particles: Particle[] = [];
    let floatingTexts: FloatingText[] = [];

    let score = 0;
    let frame = 0;
    let fireTimer = 0;
    const FIRE_RATE = 14; // frames between shots

    let wave = 0;
    let waveActive = false;
    let waveEnemiesLeft = 0;
    let waveDelayCounter = 0;
    let waveAnnounceTimer = 0;
    const WAVE_ANNOUNCE_DURATION = 120;
    let bossActive = false;
    let bossWarningShown = false;
    let screenFlash = 0;

    // ── Spawn enemy helper ────────────────────────────────────────────────────
    const makeEnemy = (waveNum: number, index: number, total: number): Enemy => {
      const isBossWave = waveNum % 3 === 0 && waveNum > 0;
      let type: Enemy['type'];
      let emoji: string;
      let hp: number;
      let radius: number;
      let points: number;
      let canShoot: boolean;
      let shootInterval: number;
      let color: string;

      if (isBossWave && index === 0) {
        type = 'boss';
        emoji = BOSS_EMOJIS[(Math.floor(waveNum / 3) - 1) % BOSS_EMOJIS.length];
        hp = 10;
        radius = 44;
        points = 1000;
        canShoot = true;
        shootInterval = 50;
        color = '#FF2244';
      } else if (waveNum >= 7 && Math.random() < 0.2) {
        type = 'large';
        emoji = ENEMY_EMOJIS_LARGE[Math.floor(Math.random() * ENEMY_EMOJIS_LARGE.length)];
        hp = 3;
        radius = 28;
        points = 300;
        canShoot = waveNum >= 5;
        shootInterval = 90;
        color = '#FF6600';
      } else if (waveNum >= 4 && Math.random() < 0.35) {
        type = 'medium';
        emoji = ENEMY_EMOJIS_MEDIUM[Math.floor(Math.random() * ENEMY_EMOJIS_MEDIUM.length)];
        hp = 2;
        radius = 22;
        points = 300;
        canShoot = waveNum >= 4;
        shootInterval = 100;
        color = '#AA44FF';
      } else {
        type = 'small';
        emoji = ENEMY_EMOJIS_SMALL[Math.floor(Math.random() * ENEMY_EMOJIS_SMALL.length)];
        hp = 1;
        radius = 16;
        points = 100;
        canShoot = false;
        shootInterval = 120;
        color = '#44BBFF';
      }

      const spacing = canvas.width / (total + 1);
      const baseX = spacing * (index + 1) + (Math.random() - 0.5) * spacing * 0.4;
      const baseSpeed = Math.min(0.8 + waveNum * 0.15, 3.0);

      return {
        x: Math.max(radius + 10, Math.min(canvas.width - radius - 10, baseX)),
        y: -radius - 20 - index * 15,
        vx: (Math.random() < 0.5 ? 1 : -1) * (0.4 + Math.random() * baseSpeed),
        vy: 0.3 + Math.random() * 0.5,
        hp,
        maxHp: hp,
        radius,
        type,
        emoji,
        points,
        canShoot,
        shootTimer: Math.floor(Math.random() * shootInterval),
        shootInterval,
        entryAnim: 0,
        bobOffset: Math.random() * Math.PI * 2,
        dirTimer: 60 + Math.floor(Math.random() * 80),
        color,
      };
    };

    const spawnWave = () => {
      wave++;
      waveActive = true;
      bossActive = wave % 3 === 0;
      bossWarningShown = false;

      const isBossWave = bossActive;
      let count: number;
      if (isBossWave) {
        count = 1 + Math.floor(wave / 3);
      } else {
        count = Math.min(4 + wave, 10);
      }

      enemies = Array.from({ length: count }, (_, i) => makeEnemy(wave, i, count));
      waveEnemiesLeft = count;

      if (isBossWave) {
        waveAnnounceTimer = WAVE_ANNOUNCE_DURATION;
        sound.bossWarning();
        bossWarningShown = true;
      } else {
        waveAnnounceTimer = WAVE_ANNOUNCE_DURATION;
      }
    };

    // ── Bomb ──────────────────────────────────────────────────────────────────
    const useBomb = () => {
      if (!player.bombReady) return;
      player.bombReady = false;
      screenFlash = 30;
      enemies.forEach(e => {
        for (let i = 0; i < 14; i++) {
          const angle = (i / 14) * Math.PI * 2;
          particles.push({
            x: e.x, y: e.y,
            vx: Math.cos(angle) * (Math.random() * 5 + 2),
            vy: Math.sin(angle) * (Math.random() * 5 + 2),
            life: 1, maxLife: 1,
            size: Math.random() * 8 + 4,
            color: e.color,
          });
        }
        score += e.points;
        floatingTexts.push({ x: e.x, y: e.y - 20, text: `+${e.points}`, life: 60, maxLife: 60, color: '#FFD700', vy: -1.5, size: 16 });
      });
      enemies = [];
      enemyBullets = [];
      sound.explosion(true);
    };

    // ── Draw helpers ──────────────────────────────────────────────────────────
    const drawBackground = () => {
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#050820');
      grad.addColorStop(0.5, '#0A1040');
      grad.addColorStop(1, '#150830');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const drawStars = () => {
      stars.forEach(s => {
        s.y += s.speed;
        if (s.y > canvas.height) {
          s.y = -5;
          s.x = Math.random() * canvas.width;
        }
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    };

    const drawShip = () => {
      const x = player.x;
      const y = player.y;
      const inv = player.invincible > 0;
      if (inv && Math.floor(frame / 4) % 2 === 0) return;

      ctx.save();

      // Engine glow
      const engineGlow = ctx.createRadialGradient(x, y + SHIP_H * 0.5, 0, x, y + SHIP_H * 0.5, 22);
      engineGlow.addColorStop(0, char.color + 'AA');
      engineGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = engineGlow;
      ctx.beginPath();
      ctx.ellipse(x, y + SHIP_H * 0.5, 22, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ship body
      ctx.shadowBlur = 20;
      ctx.shadowColor = char.color;
      ctx.beginPath();
      ctx.moveTo(x, y - SHIP_H * 0.5);
      ctx.bezierCurveTo(x + SHIP_W * 0.5, y - SHIP_H * 0.1, x + SHIP_W * 0.45, y + SHIP_H * 0.3, x + SHIP_W * 0.28, y + SHIP_H * 0.5);
      ctx.lineTo(x - SHIP_W * 0.28, y + SHIP_H * 0.5);
      ctx.bezierCurveTo(x - SHIP_W * 0.45, y + SHIP_H * 0.3, x - SHIP_W * 0.5, y - SHIP_H * 0.1, x, y - SHIP_H * 0.5);
      const bodyGrad = ctx.createLinearGradient(x - SHIP_W * 0.5, y, x + SHIP_W * 0.5, y);
      bodyGrad.addColorStop(0, char.color + 'CC');
      bodyGrad.addColorStop(0.5, char.color);
      bodyGrad.addColorStop(1, char.color + 'CC');
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // Cockpit window
      ctx.beginPath();
      ctx.arc(x, y - SHIP_H * 0.1, SHIP_W * 0.22, 0, Math.PI * 2);
      const winGrad = ctx.createRadialGradient(x - 3, y - SHIP_H * 0.15, 1, x, y - SHIP_H * 0.1, SHIP_W * 0.22);
      winGrad.addColorStop(0, '#FFFFFF');
      winGrad.addColorStop(0.5, '#D0F0FF');
      winGrad.addColorStop(1, '#90D0FF');
      ctx.fillStyle = winGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      // Character emoji
      ctx.save();
      if (inv && Math.floor(frame / 4) % 2 === 0) ctx.globalAlpha = 0.4;
      ctx.font = `${SHIP_W * 0.3}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char.emoji, x, y - SHIP_H * 0.1);
      ctx.restore();

      // Shield bubble
      if (player.shield) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, SHIP_W * 0.8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(100,220,255,${0.4 + Math.sin(frame * 0.15) * 0.2})`;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#44DDFF';
        ctx.stroke();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = '#44DDFF';
        ctx.fill();
        ctx.restore();
      }

      // Flame exhaust
      ctx.save();
      const flameH = 16 + Math.sin(frame * 0.35) * 6;
      const fg = ctx.createLinearGradient(x, y + SHIP_H * 0.5, x, y + SHIP_H * 0.5 + flameH);
      fg.addColorStop(0, '#FFEE44');
      fg.addColorStop(0.5, '#FF8800');
      fg.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(x - SHIP_W * 0.18, y + SHIP_H * 0.5);
      ctx.quadraticCurveTo(x, y + SHIP_H * 0.5 + flameH * 1.3, x + SHIP_W * 0.18, y + SHIP_H * 0.5);
      ctx.fill();
      ctx.restore();
    };

    const drawLaser = (l: Laser) => {
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.shadowColor = l.color;

      // Beam
      const grad = ctx.createLinearGradient(l.x, l.y - l.height, l.x, l.y);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.3, l.color);
      grad.addColorStop(1, l.color + '44');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(l.x - l.width / 2, l.y - l.height, l.width, l.height, l.width / 2);
      ctx.fill();

      // Core glow
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.roundRect(l.x - l.width / 4, l.y - l.height, l.width / 2, l.height * 0.6, l.width / 4);
      ctx.fill();
      ctx.restore();
    };

    const drawEnemy = (e: Enemy) => {
      const scale = Math.min(e.entryAnim, 1);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(scale, scale);

      // Shadow/glow
      ctx.shadowBlur = 14;
      ctx.shadowColor = e.color;

      // Background circle for enemy
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
      const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, e.radius);
      bg.addColorStop(0, e.color + '55');
      bg.addColorStop(1, e.color + '22');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = e.color + '99';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Emoji
      ctx.font = `${e.radius * 1.5}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.emoji, 0, 2);

      // HP bar for multi-hp enemies
      if (e.maxHp > 1) {
        const barW = e.radius * 2.2;
        const barH = e.type === 'boss' ? 10 : 6;
        const barY = e.radius + 10;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(-barW / 2, barY, barW, barH, barH / 2);
        ctx.fill();
        const hpRatio = e.hp / e.maxHp;
        const hpColor = hpRatio > 0.5 ? '#44FF88' : hpRatio > 0.25 ? '#FFCC00' : '#FF4444';
        ctx.fillStyle = hpColor;
        ctx.beginPath();
        ctx.roundRect(-barW / 2, barY, barW * hpRatio, barH, barH / 2);
        ctx.fill();
        ctx.restore();
        return;
      }
      ctx.restore();
    };

    const drawEnemyBullet = (b: EnemyBullet) => {
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#FF4444';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 6);
      g.addColorStop(0, '#FFEEEE');
      g.addColorStop(0.5, '#FF8888');
      g.addColorStop(1, '#FF2222');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    };

    const drawPowerUp = (p: PowerUp) => {
      const bob = Math.sin(frame * 0.08 + p.bobOffset) * 4;
      const icons: Record<PowerUp['type'], string> = { triple: '🔵', speed: '🟡', shield: '🔴', bomb: '⭐' };
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#FFFFFF';
      ctx.font = `${p.radius * 2}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icons[p.type], p.x, p.y + bob);
      ctx.restore();
    };

    const drawParticles = () => {
      particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.shadowBlur = 6;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    };

    const drawFloatingTexts = () => {
      floatingTexts.forEach(t => {
        const alpha = t.life / t.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${t.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = t.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = t.color;
        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
      });
    };

    const drawHUD = () => {
      // Lives
      const hSize = 24;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = i < player.lives ? 1 : 0.2;
        ctx.font = `${hSize}px serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(char.heart, 14 + i * (hSize + 6), 14);
      }
      ctx.globalAlpha = 1;

      // Power-up indicators
      let indicatorX = 14;
      const indicatorY = 46;
      if (player.shield) {
        ctx.font = '18px serif';
        ctx.fillText('🔴', indicatorX, indicatorY);
        indicatorX += 26;
      }
      if (player.fireModeTimer > 0) {
        ctx.font = '18px serif';
        ctx.fillText('🔵', indicatorX, indicatorY);
        indicatorX += 26;
      }
      if (player.speedBoostTimer > 0) {
        ctx.font = '18px serif';
        ctx.fillText('🟡', indicatorX, indicatorY);
        indicatorX += 26;
      }
      if (player.bombReady) {
        ctx.font = '18px serif';
        ctx.fillText('⭐', indicatorX, indicatorY);
      }

      // Score
      ctx.save();
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowBlur = 8;
      ctx.shadowColor = char.color;
      ctx.textBaseline = 'top';
      ctx.fillText(`${score}`, canvas.width - 14, 14);
      ctx.restore();

      // Wave
      ctx.save();
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#AAAAFF';
      ctx.shadowBlur = 0;
      ctx.textBaseline = 'top';
      ctx.fillText(`Wave ${wave}`, canvas.width - 14, 38);
      ctx.restore();
    };

    const drawWaveAnnounce = () => {
      if (waveAnnounceTimer <= 0) return;
      const alpha = Math.min(waveAnnounceTimer / 30, (WAVE_ANNOUNCE_DURATION - waveAnnounceTimer) / 30, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const isBoss = bossWarningShown;
      const text = isBoss ? `⚠️ BOSS WAVE ${wave}! ⚠️` : `Wave ${wave}`;
      const subText = isBoss ? '보스가 나타났다!' : '준비!';
      const fontSize = isBoss ? 34 : 28;

      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.shadowBlur = 20;
      ctx.shadowColor = isBoss ? '#FF3333' : char.color;
      ctx.fillStyle = isBoss ? '#FF6666' : '#FFFFFF';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 - 20);

      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = isBoss ? '#FFAAAA' : '#AAAAFF';
      ctx.shadowBlur = 10;
      ctx.fillText(subText, canvas.width / 2, canvas.height / 2 + 20);
      ctx.restore();
    };

    const drawScreenFlash = () => {
      if (screenFlash <= 0) return;
      ctx.save();
      ctx.globalAlpha = screenFlash / 30 * 0.4;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    };

    // ── Main loop ─────────────────────────────────────────────────────────────
    const loop = () => {
      if (destroyed) return;
      frame++;

      // Start first wave or next wave
      if (!waveActive && enemies.length === 0 && waveAnnounceTimer <= 0) {
        if (wave === 0) {
          spawnWave();
        } else {
          // Use a counter for delay between waves instead of frame % check
          if (!waveDelayCounter) waveDelayCounter = 1;
          else waveDelayCounter++;
          if (waveDelayCounter >= 90) {
            waveDelayCounter = 0;
            spawnWave();
          }
        }
      } else {
        waveDelayCounter = 0;
      }

      // Player movement
      const maxSpeed = player.speedBoostTimer > 0 ? player.speed * 1.8 : player.speed;
      const dx = player.targetX - player.x;
      if (Math.abs(dx) > 1) {
        player.vx = dx * 0.14;
        if (Math.abs(player.vx) > maxSpeed) player.vx = Math.sign(player.vx) * maxSpeed;
      } else {
        player.vx *= 0.8;
      }
      player.x += player.vx;
      player.x = Math.max(SHIP_W * 0.6, Math.min(canvas.width - SHIP_W * 0.6, player.x));

      // Power-up timers
      if (player.fireModeTimer > 0) player.fireModeTimer--;
      else player.fireMode = 'normal';
      if (player.speedBoostTimer > 0) player.speedBoostTimer--;

      // Invincibility
      if (player.invincible > 0) player.invincible--;

      // Auto-fire
      if (waveActive || enemies.length > 0) {
        fireTimer++;
        if (fireTimer >= FIRE_RATE) {
          fireTimer = 0;
          const laserColor = char.color;
          if (player.fireMode === 'triple') {
            lasers.push({ x: player.x - 18, y: player.y - SHIP_H * 0.5, vy: -14, width: 5, height: 22, color: laserColor, type: 'triple' });
            lasers.push({ x: player.x, y: player.y - SHIP_H * 0.5, vy: -14, width: 6, height: 26, color: '#FFFFFF', type: 'triple' });
            lasers.push({ x: player.x + 18, y: player.y - SHIP_H * 0.5, vy: -14, width: 5, height: 22, color: laserColor, type: 'triple' });
          } else {
            lasers.push({ x: player.x, y: player.y - SHIP_H * 0.5, vy: -14, width: 6, height: 26, color: laserColor, type: 'normal' });
          }
          if (frame % 3 === 0) sound.laser();
        }
      }

      // Update lasers
      lasers.forEach(l => { l.y += l.vy; });
      lasers = lasers.filter(l => l.y + l.height > -10);

      // Update enemies
      enemies.forEach(e => {
        // Entry animation
        if (e.entryAnim < 1) {
          e.entryAnim = Math.min(e.entryAnim + 0.05, 1);
        }

        // Movement
        e.x += e.vx;
        if (e.type === 'boss') {
          // Boss floats down slowly then stays in upper area
          if (e.y < canvas.height * 0.18) {
            e.y += 1.2;
          }
          // Boss bounces left/right
          if (e.x <= e.radius + 10 || e.x >= canvas.width - e.radius - 10) e.vx *= -1;
          e.x = Math.max(e.radius + 10, Math.min(canvas.width - e.radius - 10, e.x));
        } else {
          // Normal enemies drift left/right + down slowly
          e.y += e.vy;
          e.dirTimer--;
          if (e.dirTimer <= 0) {
            e.vx *= -1;
            e.dirTimer = 60 + Math.floor(Math.random() * 80);
          }
          if (e.x <= e.radius + 5 || e.x >= canvas.width - e.radius - 5) {
            e.vx *= -1;
            e.x = Math.max(e.radius + 5, Math.min(canvas.width - e.radius - 5, e.x));
          }
          // Keep in top area
          if (e.y > canvas.height * 0.55) e.vy = -Math.abs(e.vy);
          if (e.y < e.radius + 5) e.vy = Math.abs(e.vy);
        }

        // Enemy shooting
        if (e.canShoot && e.entryAnim >= 1) {
          e.shootTimer--;
          if (e.shootTimer <= 0) {
            e.shootTimer = e.shootInterval;
            if (e.type === 'boss') {
              // Boss shoots spread pattern
              for (let angle = -30; angle <= 30; angle += 15) {
                const rad = (angle * Math.PI) / 180;
                enemyBullets.push({
                  x: e.x, y: e.y + e.radius,
                  vx: Math.sin(rad) * 2.5,
                  vy: Math.cos(rad) * 2.5,
                });
              }
            } else {
              // Aim at player
              const aDx = player.x - e.x;
              const aDy = player.y - e.y;
              const dist = Math.sqrt(aDx * aDx + aDy * aDy);
              const speed = 2.2;
              enemyBullets.push({
                x: e.x, y: e.y + e.radius,
                vx: (aDx / dist) * speed,
                vy: (aDy / dist) * speed,
              });
            }
          }
        }

        // Laser collisions
        lasers.forEach((l, li) => {
          if (l.y > e.y - e.radius * 1.3 && l.y < e.y + e.radius * 1.3 &&
              Math.abs(l.x - e.x) < e.radius * 1.3) {
            e.hp--;
            lasers.splice(li, 1);

            // Hit particles
            for (let i = 0; i < 6; i++) {
              const angle = Math.random() * Math.PI * 2;
              particles.push({
                x: l.x, y: l.y,
                vx: Math.cos(angle) * (Math.random() * 4 + 1),
                vy: Math.sin(angle) * (Math.random() * 4 + 1),
                life: 1, maxLife: 1,
                size: Math.random() * 5 + 2,
                color: e.color,
              });
            }

            if (e.hp <= 0) {
              // Death explosion
              for (let i = 0; i < 16; i++) {
                const angle = (i / 16) * Math.PI * 2;
                particles.push({
                  x: e.x, y: e.y,
                  vx: Math.cos(angle) * (Math.random() * 6 + 2),
                  vy: Math.sin(angle) * (Math.random() * 6 + 2),
                  life: 1, maxLife: 1,
                  size: Math.random() * 8 + 4,
                  color: e.color,
                });
              }
              // Extra sparks
              for (let i = 0; i < 8; i++) {
                particles.push({
                  x: e.x + (Math.random() - 0.5) * 20,
                  y: e.y + (Math.random() - 0.5) * 20,
                  vx: (Math.random() - 0.5) * 3,
                  vy: (Math.random() - 0.5) * 3,
                  life: 1, maxLife: 1,
                  size: Math.random() * 4 + 2,
                  color: '#FFEE44',
                });
              }

              score += e.points;
              floatingTexts.push({ x: e.x, y: e.y - 10, text: `+${e.points}`, life: 70, maxLife: 70, color: '#FFD700', vy: -1.5, size: 16 });
              sound.explosion(e.type === 'boss');

              // Power-up drop
              const dropRoll = Math.random();
              const dropChance = e.type === 'boss' ? 1.0 : e.type === 'large' ? 0.5 : 0.25;
              if (dropRoll < dropChance) {
                const types: PowerUp['type'][] = ['triple', 'speed', 'shield', 'bomb'];
                const weights = [0.35, 0.3, 0.25, 0.1];
                let cumulative = 0;
                const roll2 = Math.random();
                let chosenType: PowerUp['type'] = 'triple';
                for (let w = 0; w < weights.length; w++) {
                  cumulative += weights[w];
                  if (roll2 < cumulative) { chosenType = types[w]; break; }
                }
                powerUps.push({ x: e.x, y: e.y, vy: 1.5, type: chosenType, radius: 16, bobOffset: Math.random() * Math.PI * 2 });
              }

              if (e.type === 'boss') bossActive = false;
              e.hp = -99; // mark dead
            }
          }
        });
      });

      // Remove dead enemies
      const deadCount = enemies.filter(e => e.hp <= -99).length;
      enemies = enemies.filter(e => e.hp > -99);
      waveEnemiesLeft -= deadCount;
      if (waveEnemiesLeft <= 0 && waveActive) {
        waveActive = false;
        waveAnnounceTimer = 0;
      }

      // Update enemy bullets
      enemyBullets.forEach(b => {
        b.x += b.vx;
        b.y += b.vy;

        // Hit player
        if (player.invincible <= 0) {
          const dx = b.x - player.x;
          const dy = b.y - player.y;
          const hitR = SHIP_W * 0.35;
          if (dx * dx + dy * dy < hitR * hitR) {
            if (player.shield) {
              player.shield = false;
              b.vx = 0; b.vy = -999; // remove
              screenFlash = 10;
              floatingTexts.push({ x: player.x, y: player.y - 30, text: '🔴 막았다!', life: 60, maxLife: 60, color: '#FF6666', vy: -1.2, size: 16 });
            } else {
              player.lives--;
              player.invincible = 120;
              b.vx = 0; b.vy = -999;
              screenFlash = 20;
              sound.hit();
              for (let i = 0; i < 10; i++) {
                const angle = Math.random() * Math.PI * 2;
                particles.push({
                  x: player.x, y: player.y,
                  vx: Math.cos(angle) * (Math.random() * 4 + 2),
                  vy: Math.sin(angle) * (Math.random() * 4 + 2),
                  life: 1, maxLife: 1, size: Math.random() * 6 + 3, color: '#FF6666',
                });
              }
              floatingTexts.push({ x: player.x, y: player.y - 30, text: '💥', life: 60, maxLife: 60, color: '#FF4444', vy: -1.5, size: 24 });
              if (player.lives <= 0) {
                setFinalScore(score);
                saveScore('shooting', char.name, score);
                setGameState('over');
                sound.gameOver();
                destroyed = true;
                return;
              }
            }
          }
        }
      });
      enemyBullets = enemyBullets.filter(b => b.y < canvas.height + 20 && b.y > -100);

      // Enemy-player collision
      enemies.forEach(e => {
        if (player.invincible <= 0) {
          const dx = e.x - player.x;
          const dy = e.y - player.y;
          const hitR = (SHIP_W * 0.4 + e.radius * 0.6);
          if (dx * dx + dy * dy < hitR * hitR) {
            if (player.shield) {
              player.shield = false;
              e.hp = -99;
              screenFlash = 10;
            } else {
              player.lives--;
              player.invincible = 120;
              screenFlash = 20;
              sound.hit();
              if (player.lives <= 0) {
                setFinalScore(score);
                saveScore('shooting', char.name, score);
                setGameState('over');
                sound.gameOver();
                destroyed = true;
                return;
              }
            }
          }
        }
      });

      // Update power-ups
      powerUps.forEach(p => {
        p.y += p.vy;
        // Collect
        const dx = p.x - player.x;
        const dy = p.y - player.y;
        const hitR = SHIP_W * 0.55 + p.radius * 0.8;
        if (dx * dx + dy * dy < hitR * hitR) {
          sound.powerUp();
          screenFlash = 15;
          floatingTexts.push({ x: p.x, y: p.y - 20, text: { triple: '🔵 트리플샷!', speed: '🟡 스피드!', shield: '🔴 실드!', bomb: '⭐ 폭탄!' }[p.type], life: 90, maxLife: 90, color: '#FFFFFF', vy: -1.0, size: 15 });

          switch (p.type) {
            case 'triple':
              player.fireMode = 'triple';
              player.fireModeTimer = 480;
              break;
            case 'speed':
              player.speedBoostTimer = 480;
              break;
            case 'shield':
              player.shield = true;
              break;
            case 'bomb':
              player.bombReady = true;
              break;
          }
          p.vy = -999; // remove
        }
      });
      powerUps = powerUps.filter(p => p.y < canvas.height + 30 && p.vy > -100);

      // Bomb: tap anywhere when bomb ready
      // (handled via touch/click on canvas - trigger bomb if player has it)
      // Actually auto-trigger bomb after a small delay
      if (player.bombReady && enemies.length > 0 && frame % 180 === 0) {
        useBomb();
      }

      // Update particles
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= 0.025;
      });
      particles = particles.filter(p => p.life > 0);

      // Update floating texts
      floatingTexts.forEach(t => { t.y += t.vy; t.life--; });
      floatingTexts = floatingTexts.filter(t => t.life > 0);

      // Screen flash decay
      if (screenFlash > 0) screenFlash--;

      // Wave announce timer
      if (waveAnnounceTimer > 0) waveAnnounceTimer--;

      // ─── Draw ──────────────────────────────────────────────────────────────
      drawBackground();
      drawStars();
      drawParticles();
      powerUps.forEach(drawPowerUp);
      enemies.forEach(drawEnemy);
      enemyBullets.forEach(drawEnemyBullet);
      lasers.forEach(drawLaser);
      drawShip();
      drawFloatingTexts();
      drawHUD();
      drawWaveAnnounce();
      drawScreenFlash();

      if (!destroyed) animId = requestAnimationFrame(loop);
    };

    // Small initial delay then start
    const startDelay = setTimeout(() => {
      animId = requestAnimationFrame(loop);
    }, 200);

    return () => {
      destroyed = true;
      clearTimeout(startDelay);
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
    };
  }, [gameState, selectedChar]);

  // ─── Select Screen ──────────────────────────────────────────────────────────

  if (gameState === 'select') {
    return (
      <>
        <style>{`
          @keyframes float-ship { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
          @keyframes twinkle-s { 0%,100%{opacity:.3;transform:scale(1)} 50%{opacity:1;transform:scale(1.4)} }
          @keyframes char-bounce { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-5px) scale(1.02)} }
          .char-card { transition: transform 0.15s ease, box-shadow 0.15s ease; }
          .char-card:active { transform: scale(0.94); }
        `}</style>
        <div style={{
          minHeight: '100dvh',
          background: 'linear-gradient(180deg, #050820 0%, #0A1040 50%, #150830 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '24px 20px', position: 'relative', overflow: 'hidden',
        }}>
          {/* Background stars */}
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} style={{
              position: 'absolute',
              width: `${Math.random() * 3 + 1}px`,
              height: `${Math.random() * 3 + 1}px`,
              borderRadius: '50%',
              background: '#FFFFFF',
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animation: `twinkle-s ${2 + i * 0.3}s ease-in-out infinite`,
              animationDelay: `${i * 0.2}s`,
              pointerEvents: 'none',
            }} />
          ))}

          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ fontSize: '56px', marginBottom: '8px', animation: 'float-ship 2.5s ease-in-out infinite' }}>🚀</div>
            <h1 style={{
              fontSize: '28px', fontWeight: 900,
              background: 'linear-gradient(135deg, #60A5FA, #A78BFA, #F472B6)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              margin: 0, letterSpacing: '1px',
            }}>슈팅 게임</h1>
            <p style={{ color: '#6B7DB3', fontSize: '13px', marginTop: '6px', fontWeight: 600 }}>
              누가 우주를 지킬까? 👾
            </p>
          </div>

          {/* Character select */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '320px' }}>
            {CHARACTERS.map((c, i) => (
              <button
                key={c.name}
                className="char-card"
                onClick={() => startGame(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  background: 'rgba(255,255,255,0.07)',
                  border: `2px solid ${c.color}55`,
                  borderRadius: '18px', padding: '14px 18px',
                  cursor: 'pointer',
                  boxShadow: `0 0 20px ${c.color}22`,
                  animation: `char-bounce ${2.2 + i * 0.18}s ease-in-out infinite`,
                  animationDelay: `${i * 0.25}s`,
                }}
              >
                <div style={{
                  width: '50px', height: '50px', borderRadius: '50%',
                  background: `radial-gradient(circle at 35% 35%, ${c.color}99, ${c.color}33)`,
                  border: `2.5px solid ${c.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '24px', flexShrink: 0,
                  boxShadow: `0 0 14px ${c.color}66`,
                }}>
                  {c.emoji}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: '#E0E8FF', lineHeight: 1.2 }}>{c.name}</div>
                  <div style={{ fontSize: '12px', color: c.color, marginTop: '3px', fontWeight: 600 }}>{c.desc}</div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: '20px' }}>{c.heart}</div>
              </button>
            ))}
          </div>

          <p style={{ color: '#3A4A7A', fontSize: '11px', marginTop: '22px', textAlign: 'center', lineHeight: 1.7 }}>
            드래그해서 우주선을 조종해요!<br />
            자동으로 레이저가 발사돼요 ✨
          </p>

          <Link href="/" style={{
            marginTop: '14px', color: '#4A5A8A', fontSize: '13px',
            textDecoration: 'none', fontWeight: 600,
          }}>← 홈으로</Link>
        </div>
      </>
    );
  }

  // ─── Game Over Screen ───────────────────────────────────────────────────────

  if (gameState === 'over') {
    const c = CHARACTERS[selectedChar!];
    const grade = finalScore >= 5000 ? '🏆 전설!' : finalScore >= 3000 ? '🥇 최고야!' : finalScore >= 1500 ? '🥈 잘했어!' : finalScore >= 500 ? '🥉 굿!' : '🚀 다음엔 더 잘할거야!';

    return (
      <>
        <style>{`
          @keyframes pop-in-s { 0%{transform:scale(0.4);opacity:0} 70%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
          @keyframes float-s { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
          @keyframes neon-glow { 0%,100%{text-shadow:0 0 12px currentColor} 50%{text-shadow:0 0 28px currentColor,0 0 50px currentColor} }
        `}</style>
        <div style={{
          minHeight: '100dvh',
          background: 'linear-gradient(180deg, #050820 0%, #0A1040 50%, #150830 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '24px', textAlign: 'center',
        }}>
          <div style={{ animation: 'pop-in-s 0.5s ease-out forwards', width: '100%', maxWidth: '320px' }}>
            <div style={{ fontSize: '62px', marginBottom: '6px', animation: 'float-s 2.2s ease-in-out infinite' }}>💥</div>
            <h2 style={{
              fontSize: '26px', fontWeight: 900, color: c.color, margin: '0 0 4px',
              animation: 'neon-glow 2s ease-in-out infinite',
            }}>게임 오버!</h2>
            <p style={{ color: '#6B7DB3', fontSize: '14px', margin: '0 0 20px' }}>{c.name} {c.heart}</p>

            <div style={{
              background: 'rgba(255,255,255,0.07)',
              border: `2px solid ${c.color}44`,
              borderRadius: '22px', padding: '22px 28px', marginBottom: '22px',
              boxShadow: `0 0 30px ${c.color}22`,
            }}>
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>{grade}</div>
              <div style={{ fontSize: '13px', color: '#6B7DB3', fontWeight: 600, marginBottom: '6px' }}>최종 점수</div>
              <div style={{ fontSize: '44px', fontWeight: 900, color: '#FFD700', lineHeight: 1.1,
                textShadow: '0 0 20px #FFD700' }}>{finalScore.toLocaleString()}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={restartGame}
                style={{
                  background: `linear-gradient(135deg, ${c.color}, ${c.color}99)`,
                  color: 'white', border: 'none', borderRadius: '16px',
                  padding: '16px 24px', fontSize: '17px', fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: `0 0 24px ${c.color}66`,
                }}
              >
                🚀 다시 도전!
              </button>
              <button
                onClick={() => setGameState('select')}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: '#A0B0D0',
                  border: '2px solid rgba(255,255,255,0.15)',
                  borderRadius: '16px', padding: '14px 24px', fontSize: '15px', fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                👾 캐릭터 바꾸기
              </button>
              <Link href="/" style={{
                color: '#3A4A7A', fontSize: '13px', textDecoration: 'none',
                fontWeight: 600, marginTop: '6px', display: 'block',
              }}>← 홈으로 돌아가기</Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ─── Playing ──────────────────────────────────────────────────────────────────

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: 'none',
        background: '#050820',
      }}
    />
  );
}
