'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Character {
  name: string;
  emoji: string;
  color: string;
  heart: string;
}

interface Obstacle {
  x: number;
  type: 'rock' | 'gap' | 'tree';
  width: number;
  height: number;
  passed: boolean;
}

interface Collectible {
  x: number;
  y: number;
  type: 'star' | 'heart';
  collected: boolean;
}

interface Cloud {
  x: number;
  y: number;
  size: number;
  speed: number;
}

interface Hill {
  x: number;
  width: number;
  height: number;
  color: string;
}

interface Sparkle {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  size: number;
  angle: number;
  speed: number;
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
  { name: '수현', emoji: '😎', color: '#9B59B6', heart: '💜' },
  { name: '이현', emoji: '🤓', color: '#3498DB', heart: '💙' },
  { name: '은영', emoji: '🥰', color: '#E91E8C', heart: '💗' },
  { name: '민구', emoji: '😜', color: '#2ECC71', heart: '💚' },
];

const GRAVITY = 0.6;
const JUMP_FORCE = -13;
const HIGH_JUMP_FORCE = -16;
const GROUND_HEIGHT_RATIO = 0.18;
const PLAYER_SIZE = 40;
const MIN_OBSTACLE_GAP = 280;

// ─── Audio ───────────────────────────────────────────────────────────────────

class SoundManager {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  jump() {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch { /* ignore */ }
  }

  collect() {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
      osc.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
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
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch { /* ignore */ }
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RunnerGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedChar, setSelectedChar] = useState<number | null>(null);
  const [gameState, setGameState] = useState<'select' | 'playing' | 'over'>('select');
  const [finalScore, setFinalScore] = useState(0);
  const [highScore, setHighScore] = useState(0);

  // Load high score
  useEffect(() => {
    try {
      const saved = localStorage.getItem('runner-highscore');
      if (saved) setHighScore(parseInt(saved, 10));
    } catch { /* ignore */ }
  }, []);

  // ─── Game loop ───────────────────────────────────────────────────────────

  const startGame = useCallback((charIndex: number) => {
    setSelectedChar(charIndex);
    setGameState('playing');
  }, []);

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

    // Game state
    let groundH = canvas.height * GROUND_HEIGHT_RATIO;
    let groundY = canvas.height - groundH;
    let speed = 5;
    let score = 0;
    let distance = 0;
    let collectibleScore = 0;

    // Player
    let playerX = 80;
    let playerY = groundY - PLAYER_SIZE;
    let velY = 0;
    let isJumping = false;
    let jumpHeld = false;
    let jumpHeldTime = 0;
    let bouncePhase = 0;
    let alive = true;

    // World
    let obstacles: Obstacle[] = [];
    let collectibles: Collectible[] = [];
    let clouds: Cloud[] = [];
    let hills: Hill[] = [];
    let sparkles: Sparkle[] = [];
    let floatingTexts: FloatingText[] = [];
    let lastObstacleX = canvas.width + 200;
    let messageTimer = 0;
    let currentMessage = '';

    const messages = ['달려라! 🏃‍♀️', '최고! ⭐', '멋져! 💫', '파이팅! 💪', '대박! 🎉', '짱! 👍'];

    // Init clouds
    for (let i = 0; i < 6; i++) {
      clouds.push({
        x: Math.random() * canvas.width,
        y: 40 + Math.random() * (canvas.height * 0.25),
        size: 30 + Math.random() * 50,
        speed: 0.3 + Math.random() * 0.7,
      });
    }

    // Init hills
    for (let i = 0; i < 8; i++) {
      hills.push({
        x: i * (canvas.width / 4) - 100,
        width: 200 + Math.random() * 300,
        height: 60 + Math.random() * 100,
        color: `hsl(${120 + Math.random() * 30}, ${50 + Math.random() * 20}%, ${55 + Math.random() * 20}%)`,
      });
    }

    // Spawn helpers
    const spawnObstacle = () => {
      const types: Obstacle['type'][] = ['rock', 'tree', 'gap'];
      const type = types[Math.floor(Math.random() * types.length)];
      let width = 30;
      let height = 30;

      if (type === 'rock') {
        width = 25 + Math.random() * 20;
        height = 20 + Math.random() * 15;
      } else if (type === 'tree') {
        width = 30;
        height = 50 + Math.random() * 30;
      } else {
        width = 50 + Math.random() * 40;
        height = groundH + 10;
      }

      obstacles.push({ x: canvas.width + 50, type, width, height, passed: false });
      lastObstacleX = canvas.width + 50;

      // Maybe spawn a collectible near obstacle
      if (Math.random() < 0.6) {
        const cy = groundY - PLAYER_SIZE - 40 - Math.random() * 60;
        collectibles.push({
          x: canvas.width + 50 + (type === 'gap' ? width / 2 : -30 - Math.random() * 40),
          y: cy,
          type: Math.random() < 0.7 ? 'star' : 'heart',
          collected: false,
        });
      }
    };

    const addSparkles = (x: number, y: number, color: string, count = 8) => {
      for (let i = 0; i < count; i++) {
        sparkles.push({
          x, y,
          life: 30 + Math.random() * 20,
          maxLife: 30 + Math.random() * 20,
          size: 2 + Math.random() * 4,
          angle: Math.random() * Math.PI * 2,
          speed: 1 + Math.random() * 3,
          color,
        });
      }
    };

    // ─── Input ───────────────────────────────────────────────────────────

    const handleDown = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!alive) return;
      if (!isJumping) {
        velY = JUMP_FORCE;
        isJumping = true;
        jumpHeld = true;
        jumpHeldTime = 0;
        sound.jump();
      }
    };

    const handleUp = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      jumpHeld = false;
    };

    canvas.addEventListener('mousedown', handleDown);
    canvas.addEventListener('mouseup', handleUp);
    canvas.addEventListener('touchstart', handleDown, { passive: false });
    canvas.addEventListener('touchend', handleUp, { passive: false });

    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (!alive) return;
        if (!isJumping) {
          velY = JUMP_FORCE;
          isJumping = true;
          jumpHeld = true;
          jumpHeldTime = 0;
          sound.jump();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        jumpHeld = false;
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKeyUp);

    // ─── Draw helpers ────────────────────────────────────────────────────

    const drawCloud = (cx: number, cy: number, s: number) => {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2);
      ctx.arc(cx - s * 0.4, cy + s * 0.1, s * 0.35, 0, Math.PI * 2);
      ctx.arc(cx + s * 0.4, cy + s * 0.1, s * 0.4, 0, Math.PI * 2);
      ctx.arc(cx - s * 0.15, cy - s * 0.2, s * 0.35, 0, Math.PI * 2);
      ctx.arc(cx + s * 0.2, cy - s * 0.15, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawCharacter = (x: number, y: number, bounce: number) => {
      const s = PLAYER_SIZE;
      const bOff = Math.sin(bounce) * 3;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(x + s / 2, groundY, s * 0.4, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body
      const bodyY = y + bOff;
      ctx.fillStyle = char.color;
      ctx.beginPath();
      ctx.arc(x + s / 2, bodyY + s / 2, s / 2, 0, Math.PI * 2);
      ctx.fill();

      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(x + s / 2 - 4, bodyY + s / 2 - 6, s / 5, 0, Math.PI * 2);
      ctx.fill();

      // Face emoji
      ctx.font = `${s * 0.65}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char.emoji, x + s / 2, bodyY + s / 2);

      // Running legs animation
      if (!isJumping) {
        const legPhase = bounce * 3;
        ctx.strokeStyle = char.color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        // Left leg
        ctx.beginPath();
        ctx.moveTo(x + s / 2 - 6, bodyY + s - 4);
        ctx.lineTo(x + s / 2 - 6 + Math.sin(legPhase) * 8, bodyY + s + 8);
        ctx.stroke();

        // Right leg
        ctx.beginPath();
        ctx.moveTo(x + s / 2 + 6, bodyY + s - 4);
        ctx.lineTo(x + s / 2 + 6 + Math.sin(legPhase + Math.PI) * 8, bodyY + s + 8);
        ctx.stroke();
      } else {
        // Tucked legs while jumping
        ctx.strokeStyle = char.color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + s / 2 - 6, bodyY + s - 2);
        ctx.lineTo(x + s / 2 - 10, bodyY + s + 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + s / 2 + 6, bodyY + s - 2);
        ctx.lineTo(x + s / 2 + 10, bodyY + s + 2);
        ctx.stroke();
      }

      // Trail sparkle when running
      if (!isJumping && Math.random() < 0.3) {
        addSparkles(x - 5, bodyY + s, char.color, 1);
      }
    };

    const drawRock = (obs: Obstacle) => {
      const rx = obs.x + obs.width / 2;
      const ry = groundY - obs.height / 2;
      ctx.fillStyle = '#7f8c8d';
      ctx.beginPath();
      ctx.ellipse(rx, ry + obs.height * 0.1, obs.width / 2, obs.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#95a5a6';
      ctx.beginPath();
      ctx.ellipse(rx - 3, ry - 2, obs.width / 3, obs.height / 3, -0.2, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawTree = (obs: Obstacle) => {
      const tx = obs.x + obs.width / 2;
      const ty = groundY;
      // Trunk
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(tx - 5, ty - obs.height, 10, obs.height);
      // Leaves
      ctx.fillStyle = '#27ae60';
      ctx.beginPath();
      ctx.arc(tx, ty - obs.height, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      ctx.arc(tx - 8, ty - obs.height + 8, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tx + 8, ty - obs.height + 8, 14, 0, Math.PI * 2);
      ctx.fill();
    };

    // ─── Game loop ───────────────────────────────────────────────────────

    const gameLoop = () => {
      if (destroyed) return;

      // Recalc ground in case of resize
      groundH = canvas.height * GROUND_HEIGHT_RATIO;
      groundY = canvas.height - groundH;

      // ── Update ──
      if (alive) {
        distance += speed;
        score = Math.floor(distance / 10) + collectibleScore;
        speed = 5 + Math.floor(distance / 800) * 0.5;
        if (speed > 15) speed = 15;
        bouncePhase += 0.15 * speed;

        // Jump physics
        if (isJumping) {
          if (jumpHeld && jumpHeldTime < 10) {
            velY += (HIGH_JUMP_FORCE - JUMP_FORCE) / 10;
            jumpHeldTime++;
          }
          velY += GRAVITY;
          playerY += velY;
          if (playerY >= groundY - PLAYER_SIZE) {
            playerY = groundY - PLAYER_SIZE;
            velY = 0;
            isJumping = false;
          }
        }

        // Check if player is over a gap
        let overGap = false;
        for (const obs of obstacles) {
          if (obs.type === 'gap') {
            if (playerX + PLAYER_SIZE > obs.x + 5 && playerX < obs.x + obs.width - 5) {
              overGap = true;
            }
          }
        }

        if (overGap && !isJumping && playerY >= groundY - PLAYER_SIZE) {
          // Fall into gap
          alive = false;
          sound.gameOver();
          messageTimer = 0;
        }

        // Move obstacles
        for (const obs of obstacles) {
          obs.x -= speed;

          // Collision
          if (obs.type !== 'gap') {
            const obsLeft = obs.x;
            const obsRight = obs.x + obs.width;
            const obsTop = groundY - obs.height;

            const pLeft = playerX + 5;
            const pRight = playerX + PLAYER_SIZE - 5;
            const pBottom = playerY + PLAYER_SIZE;

            if (pRight > obsLeft && pLeft < obsRight && pBottom > obsTop + 5) {
              alive = false;
              sound.gameOver();
            }
          }

          if (!obs.passed && obs.x + obs.width < playerX) {
            obs.passed = true;
          }
        }

        // Move collectibles
        for (const col of collectibles) {
          col.x -= speed;
          if (!col.collected) {
            const dx = (playerX + PLAYER_SIZE / 2) - col.x;
            const dy = (playerY + PLAYER_SIZE / 2) - col.y;
            if (Math.sqrt(dx * dx + dy * dy) < PLAYER_SIZE * 0.7) {
              col.collected = true;
              collectibleScore += col.type === 'star' ? 50 : 30;
              sound.collect();
              addSparkles(col.x, col.y, col.type === 'star' ? '#f1c40f' : '#e74c3c', 12);
              floatingTexts.push({
                x: col.x,
                y: col.y,
                text: col.type === 'star' ? '+50 ⭐' : '+30 ❤️',
                life: 40,
                maxLife: 40,
                color: col.type === 'star' ? '#f1c40f' : '#e74c3c',
              });
            }
          }
        }

        // Cleanup off-screen
        obstacles = obstacles.filter(o => o.x + o.width > -50);
        collectibles = collectibles.filter(c => c.x > -50);

        // Spawn obstacles
        if (lastObstacleX - (canvas.width + 50) < -MIN_OBSTACLE_GAP || obstacles.length === 0) {
          const gapVariation = Math.max(0, MIN_OBSTACLE_GAP - Math.floor(distance / 500) * 10);
          if (canvas.width + 50 - (obstacles.length > 0 ? obstacles[obstacles.length - 1].x : 0) > gapVariation) {
            spawnObstacle();
          }
        }
        // Force spawn if nothing ahead
        if (obstacles.filter(o => o.x > playerX).length === 0) {
          spawnObstacle();
        }

        // Update clouds
        for (const cloud of clouds) {
          cloud.x -= cloud.speed;
          if (cloud.x + cloud.size < -50) {
            cloud.x = canvas.width + 50 + Math.random() * 100;
            cloud.y = 40 + Math.random() * (canvas.height * 0.25);
            cloud.size = 30 + Math.random() * 50;
          }
        }

        // Update hills
        for (const hill of hills) {
          hill.x -= speed * 0.3;
          if (hill.x + hill.width < -50) {
            hill.x = canvas.width + 50 + Math.random() * 200;
            hill.width = 200 + Math.random() * 300;
            hill.height = 60 + Math.random() * 100;
          }
        }

        // Messages
        if (messageTimer > 0) {
          messageTimer--;
        }
        if (Math.floor(distance) % 1000 < speed && distance > 100) {
          currentMessage = messages[Math.floor(Math.random() * messages.length)];
          messageTimer = 90;
        }
      }

      // Update sparkles
      sparkles = sparkles.filter(s => {
        s.x += Math.cos(s.angle) * s.speed;
        s.y += Math.sin(s.angle) * s.speed - 0.5;
        s.life--;
        return s.life > 0;
      });

      // Update floating texts
      floatingTexts = floatingTexts.filter(ft => {
        ft.y -= 1.5;
        ft.life--;
        return ft.life > 0;
      });

      // ── Draw ──
      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      skyGrad.addColorStop(0, '#87CEEB');
      skyGrad.addColorStop(0.6, '#B5E8F7');
      skyGrad.addColorStop(1, '#E8F8E8');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Sun
      ctx.fillStyle = '#FDB813';
      ctx.beginPath();
      ctx.arc(canvas.width - 80, 70, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(253, 184, 19, 0.2)';
      ctx.beginPath();
      ctx.arc(canvas.width - 80, 70, 50, 0, Math.PI * 2);
      ctx.fill();

      // Clouds
      for (const cloud of clouds) {
        drawCloud(cloud.x, cloud.y, cloud.size);
      }

      // Hills
      for (const hill of hills) {
        ctx.fillStyle = hill.color;
        ctx.beginPath();
        ctx.ellipse(hill.x + hill.width / 2, groundY, hill.width / 2, hill.height, 0, Math.PI, 0);
        ctx.fill();
      }

      // Ground
      const groundGrad = ctx.createLinearGradient(0, groundY, 0, canvas.height);
      groundGrad.addColorStop(0, '#7CB342');
      groundGrad.addColorStop(0.3, '#689F38');
      groundGrad.addColorStop(1, '#558B2F');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, groundY, canvas.width, groundH);

      // Ground detail line
      ctx.strokeStyle = '#8BC34A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(canvas.width, groundY);
      ctx.stroke();

      // Ground grass tufts
      ctx.fillStyle = '#8BC34A';
      for (let gx = 0; gx < canvas.width; gx += 40) {
        const offset = (gx + distance * 0.5) % 40;
        ctx.beginPath();
        ctx.moveTo(gx - offset - 3, groundY);
        ctx.lineTo(gx - offset, groundY - 6);
        ctx.lineTo(gx - offset + 3, groundY);
        ctx.fill();
      }

      // Draw gaps (cut ground)
      for (const obs of obstacles) {
        if (obs.type === 'gap') {
          ctx.fillStyle = '#3E2723';
          ctx.fillRect(obs.x, groundY, obs.width, groundH);
          // Gap edges
          ctx.fillStyle = '#5D4037';
          ctx.fillRect(obs.x, groundY, 4, groundH);
          ctx.fillRect(obs.x + obs.width - 4, groundY, 4, groundH);
        }
      }

      // Draw obstacles
      for (const obs of obstacles) {
        if (obs.type === 'rock') drawRock(obs);
        if (obs.type === 'tree') drawTree(obs);
      }

      // Draw collectibles
      for (const col of collectibles) {
        if (col.collected) continue;
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const bobY = col.y + Math.sin(Date.now() / 200 + col.x) * 5;
        // Glow
        ctx.fillStyle = col.type === 'star' ? 'rgba(241,196,15,0.3)' : 'rgba(231,76,60,0.3)';
        ctx.beginPath();
        ctx.arc(col.x, bobY, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(col.type === 'star' ? '⭐' : '❤️', col.x, bobY);
      }

      // Draw player
      if (alive) {
        drawCharacter(playerX, playerY, bouncePhase);
      }

      // Sparkles
      for (const sp of sparkles) {
        const alpha = sp.life / sp.maxLife;
        ctx.fillStyle = sp.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        // 4-point star shape
        const sz = sp.size * alpha;
        ctx.moveTo(sp.x, sp.y - sz);
        ctx.lineTo(sp.x + sz * 0.3, sp.y - sz * 0.3);
        ctx.lineTo(sp.x + sz, sp.y);
        ctx.lineTo(sp.x + sz * 0.3, sp.y + sz * 0.3);
        ctx.lineTo(sp.x, sp.y + sz);
        ctx.lineTo(sp.x - sz * 0.3, sp.y + sz * 0.3);
        ctx.lineTo(sp.x - sz, sp.y);
        ctx.lineTo(sp.x - sz * 0.3, sp.y - sz * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Floating texts
      for (const ft of floatingTexts) {
        const alpha = ft.life / ft.maxLife;
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = ft.color;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.globalAlpha = 1;
      }

      // Message
      if (messageTimer > 0 && alive) {
        const msgAlpha = Math.min(1, messageTimer / 20);
        ctx.globalAlpha = msgAlpha;
        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = char.color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';
        ctx.strokeText(currentMessage, canvas.width / 2, canvas.height * 0.2);
        ctx.fillText(currentMessage, canvas.width / 2, canvas.height * 0.2);
        ctx.globalAlpha = 1;
      }

      // HUD
      // Score
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      const hudW = 160;
      const hudH = 44;
      const hudR = 12;
      ctx.beginPath();
      ctx.moveTo(16 + hudR, 16);
      ctx.lineTo(16 + hudW - hudR, 16);
      ctx.quadraticCurveTo(16 + hudW, 16, 16 + hudW, 16 + hudR);
      ctx.lineTo(16 + hudW, 16 + hudH - hudR);
      ctx.quadraticCurveTo(16 + hudW, 16 + hudH, 16 + hudW - hudR, 16 + hudH);
      ctx.lineTo(16 + hudR, 16 + hudH);
      ctx.quadraticCurveTo(16, 16 + hudH, 16, 16 + hudH - hudR);
      ctx.lineTo(16, 16 + hudR);
      ctx.quadraticCurveTo(16, 16, 16 + hudR, 16);
      ctx.fill();

      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${char.heart} ${score}점`, 28, 38);

      // Character name badge
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(`${char.emoji} ${char.name}`, 28, 54);

      // ── Game over ──
      if (!alive) {
        // Darken
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        // Panel
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        const pw = Math.min(360, canvas.width - 40);
        const ph = 280;
        const px = cx - pw / 2;
        const py = cy - ph / 2;
        const pr = 20;
        ctx.beginPath();
        ctx.moveTo(px + pr, py);
        ctx.lineTo(px + pw - pr, py);
        ctx.quadraticCurveTo(px + pw, py, px + pw, py + pr);
        ctx.lineTo(px + pw, py + ph - pr);
        ctx.quadraticCurveTo(px + pw, py + ph, px + pw - pr, py + ph);
        ctx.lineTo(px + pr, py + ph);
        ctx.quadraticCurveTo(px, py + ph, px, py + ph - pr);
        ctx.lineTo(px, py + pr);
        ctx.quadraticCurveTo(px, py, px + pr, py);
        ctx.fill();

        ctx.shadowColor = 'transparent';

        ctx.font = 'bold 32px sans-serif';
        ctx.fillStyle = '#e74c3c';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('게임 오버! 😢', cx, py + 45);

        ctx.font = '22px sans-serif';
        ctx.fillStyle = '#333';
        ctx.fillText(`${char.heart} 점수: ${score}점`, cx, py + 95);

        // High score
        const isNewHigh = score > highScore;
        const displayHigh = isNewHigh ? score : highScore;
        ctx.font = '18px sans-serif';
        ctx.fillStyle = isNewHigh ? '#e74c3c' : '#888';
        ctx.fillText(isNewHigh ? '🎉 새 최고기록! 🎉' : `🏆 최고기록: ${displayHigh}점`, cx, py + 130);

        // Restart button
        ctx.fillStyle = char.color;
        const bw = 180;
        const bh = 48;
        const bx = cx - bw / 2;
        const by = py + 165;
        const br = 24;
        ctx.beginPath();
        ctx.moveTo(bx + br, by);
        ctx.lineTo(bx + bw - br, by);
        ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
        ctx.lineTo(bx + bw, by + bh - br);
        ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
        ctx.lineTo(bx + br, by + bh);
        ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
        ctx.lineTo(bx, by + br);
        ctx.quadraticCurveTo(bx, by, bx + br, by);
        ctx.fill();

        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('다시 달리기! 🏃‍♀️', cx, by + bh / 2);

        // Home button
        ctx.fillStyle = '#95a5a6';
        const hbw = 140;
        const hbh = 40;
        const hbx = cx - hbw / 2;
        const hby = by + bh + 16;
        const hbr = 20;
        ctx.beginPath();
        ctx.moveTo(hbx + hbr, hby);
        ctx.lineTo(hbx + hbw - hbr, hby);
        ctx.quadraticCurveTo(hbx + hbw, hby, hbx + hbw, hby + hbr);
        ctx.lineTo(hbx + hbw, hby + hbh - hbr);
        ctx.quadraticCurveTo(hbx + hbw, hby + hbh, hbx + hbw - hbr, hby + hbh);
        ctx.lineTo(hbx + hbr, hby + hbh);
        ctx.quadraticCurveTo(hbx, hby + hbh, hbx, hby + hbh - hbr);
        ctx.lineTo(hbx, hby + hbr);
        ctx.quadraticCurveTo(hbx, hby, hbx + hbr, hby);
        ctx.fill();

        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('🏠 홈으로', cx, hby + hbh / 2);

        // Handle end-screen clicks
        const endClick = (e: MouseEvent | TouchEvent) => {
          const rect = canvas.getBoundingClientRect();
          const ex = ('touches' in e ? e.changedTouches[0].clientX : e.clientX) - rect.left;
          const ey = ('touches' in e ? e.changedTouches[0].clientY : e.clientY) - rect.top;

          // Restart button
          if (ex >= bx && ex <= bx + bw && ey >= by && ey <= by + bh) {
            canvas.removeEventListener('click', endClick);
            canvas.removeEventListener('touchend', endClick);
            // Save high score
            const newHigh = Math.max(score, highScore);
            try { localStorage.setItem('runner-highscore', String(newHigh)); } catch { /* */ }
            setHighScore(newHigh);
            setFinalScore(score);
            setGameState('select');
          }

          // Home button
          if (ex >= hbx && ex <= hbx + hbw && ey >= hby && ey <= hby + hbh) {
            window.location.href = '/';
          }
        };

        // Only attach once
        if (!alive && !(canvas as unknown as { _endHandlerAttached?: boolean })._endHandlerAttached) {
          (canvas as unknown as { _endHandlerAttached?: boolean })._endHandlerAttached = true;
          // Remove game input handlers
          canvas.removeEventListener('mousedown', handleDown);
          canvas.removeEventListener('mouseup', handleUp);
          canvas.removeEventListener('touchstart', handleDown);
          canvas.removeEventListener('touchend', handleUp);

          canvas.addEventListener('click', endClick);
          canvas.addEventListener('touchend', endClick);
        }
      }

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);

    return () => {
      destroyed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, selectedChar, highScore]);

  // ─── Character Select Screen ─────────────────────────────────────────────

  if (gameState === 'select') {
    return (
      <div
        style={{
          width: '100vw',
          height: '100dvh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Back button */}
        <a
          href="/"
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            color: '#fff',
            textDecoration: 'none',
            fontSize: '18px',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: 20,
            padding: '8px 16px',
            backdropFilter: 'blur(4px)',
          }}
        >
          ← 홈으로
        </a>

        {/* Title */}
        <h1
          style={{
            color: '#fff',
            fontSize: 'clamp(28px, 6vw, 48px)',
            fontWeight: 'bold',
            marginBottom: 8,
            textShadow: '2px 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          🏃‍♀️ 캐릭터 달리기
        </h1>
        <p
          style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: 'clamp(14px, 3vw, 18px)',
            marginBottom: 32,
          }}
        >
          캐릭터를 선택해서 달려보자!
        </p>

        {/* High Score */}
        {highScore > 0 && (
          <p style={{ color: '#ffd700', fontSize: 16, marginBottom: 16 }}>
            🏆 최고기록: {highScore}점
          </p>
        )}

        {/* Character grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
            padding: '0 20px',
            maxWidth: 400,
            width: '100%',
          }}
        >
          {CHARACTERS.map((c, i) => (
            <button
              key={c.name}
              onClick={() => startGame(i)}
              style={{
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(8px)',
                border: `3px solid ${c.color}`,
                borderRadius: 20,
                padding: '20px 12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                transition: 'transform 0.15s, box-shadow 0.15s',
                color: '#fff',
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.transform = 'scale(1.05)';
                (e.target as HTMLElement).style.boxShadow = `0 0 20px ${c.color}60`;
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.transform = 'scale(1)';
                (e.target as HTMLElement).style.boxShadow = 'none';
              }}
            >
              <span style={{ fontSize: 48 }}>{c.emoji}</span>
              <span style={{ fontSize: 18, fontWeight: 'bold' }}>
                {c.heart} {c.name}
              </span>
            </button>
          ))}
        </div>

        {/* Instructions */}
        <div
          style={{
            marginTop: 28,
            color: 'rgba(255,255,255,0.8)',
            textAlign: 'center',
            fontSize: 'clamp(12px, 2.5vw, 14px)',
            lineHeight: 1.6,
          }}
        >
          <p>📱 터치 / 스페이스바 = 점프</p>
          <p>👆 꾹 누르면 더 높이 점프!</p>
          <p>⭐ 별과 ❤️ 하트를 모아보세요!</p>
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
        cursor: gameState === 'over' ? 'pointer' : 'default',
      }}
    />
  );
}
