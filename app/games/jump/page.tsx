'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────
interface Character {
  name: string;
  color: string;
  emoji: string;
  heart: string;
}

interface Platform {
  x: number;
  y: number;
  w: number;
  type: 'normal' | 'moving' | 'breaking';
  moveDir?: number;
  broken?: boolean;
  crackTime?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  twinkle: number;
  speed: number;
}

// ─── Constants ───────────────────────────────────────────────────
const CHARACTERS: Character[] = [
  { name: '수현', color: '#9B59B6', emoji: '😎', heart: '💜' },
  { name: '이현', color: '#3498DB', emoji: '🤓', heart: '💙' },
  { name: '은영', color: '#E91E8C', emoji: '🥰', heart: '💗' },
  { name: '민구', color: '#2ECC71', emoji: '😜', heart: '💚' },
];

const GRAVITY = 0.4;
const JUMP_FORCE = -12;
const MOVE_SPEED = 6;
const PLATFORM_COUNT = 8;
const PLAYER_SIZE = 36;

const MILESTONES = [
  { score: 500, msg: '대박! 🌟' },
  { score: 1000, msg: '최고! ⭐' },
  { score: 2000, msg: '천재! 🎉' },
  { score: 3000, msg: '와아~ 멋져! 💫' },
  { score: 5000, msg: '레전드! 👑' },
  { score: 8000, msg: '우주최강! 🚀' },
  { score: 10000, msg: '신기록?! 🏆' },
];

// ─── Audio helpers ───────────────────────────────────────────────
function playJumpSound(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch { /* ignore */ }
}

function playBreakSound(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* ignore */ }
}

function playGameOverSound(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch { /* ignore */ }
}

function playMilestoneSound(ctx: AudioContext) {
  try {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.15);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.15);
    });
  } catch { /* ignore */ }
}

// ─── Component ───────────────────────────────────────────────────
export default function JumpJumpGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedChar, setSelectedChar] = useState<number | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  // ─── Character Select Screen ─────────────────────────────────
  const startGame = useCallback((charIndex: number) => {
    setSelectedChar(charIndex);
    setGameStarted(true);
    setGameOver(false);
    getAudioCtx();
  }, [getAudioCtx]);

  // ─── Game Loop ────────────────────────────────────────────────
  useEffect(() => {
    if (!gameStarted || selectedChar === null) return;

    const canvasMaybe = canvasRef.current;
    if (!canvasMaybe) return;
    const ctxMaybe = canvasMaybe.getContext('2d');
    if (!ctxMaybe) return;
    const canvas = canvasMaybe;
    const ctx = ctxMaybe;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    const char = CHARACTERS[selectedChar];

    // Game state
    let playerX = W / 2;
    let playerY = H - 100;
    let velocityY = JUMP_FORCE;
    let moveDir = 0; // -1 left, 0 none, 1 right
    let score = 0;
    let highestY = playerY;
    let cameraY = 0;
    let running = true;
    let frameCount = 0;

    // Milestone tracking
    const reachedMilestones = new Set<number>();
    let milestoneMsg = '';
    let milestoneTimer = 0;

    // Particles
    let particles: Particle[] = [];

    // Background stars
    let stars: Star[] = [];
    for (let i = 0; i < 50; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H * 3,
        size: Math.random() * 3 + 1,
        twinkle: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.5 + 0.2,
      });
    }

    // Generate platforms
    let platforms: Platform[] = [];

    function makePlatform(y: number): Platform {
      const r = Math.random();
      let type: Platform['type'] = 'normal';
      if (score > 1000 && r < 0.15) type = 'breaking';
      else if (score > 500 && r < 0.3) type = 'moving';

      return {
        x: Math.random() * (W - 80) + 10,
        y,
        w: type === 'breaking' ? 60 : 70,
        type,
        moveDir: type === 'moving' ? (Math.random() < 0.5 ? 1 : -1) : 0,
        broken: false,
      };
    }

    // Initial platforms
    for (let i = 0; i < PLATFORM_COUNT; i++) {
      const p = makePlatform(H - 60 - i * (H / PLATFORM_COUNT));
      if (i === 0) {
        p.type = 'normal';
        p.x = W / 2 - 35;
        p.w = 70;
      }
      platforms.push(p);
    }

    // Spawn particles on jump
    function spawnJumpParticles(x: number, y: number) {
      for (let i = 0; i < 8; i++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 4,
          vy: Math.random() * -3 - 1,
          life: 1,
          color: char.color,
          size: Math.random() * 4 + 2,
        });
      }
    }

    // Touch / keyboard controls
    const keys: Record<string, boolean> = {};

    function onKeyDown(e: KeyboardEvent) {
      keys[e.key] = true;
    }
    function onKeyUp(e: KeyboardEvent) {
      keys[e.key] = false;
    }

    let touchLeft = false;
    let touchRight = false;

    function onTouchStart(e: TouchEvent) {
      e.preventDefault();
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.clientX < W / 2) touchLeft = true;
        else touchRight = true;
      }
    }
    function onTouchEnd(e: TouchEvent) {
      e.preventDefault();
      touchLeft = false;
      touchRight = false;
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.clientX < W / 2) touchLeft = true;
        else touchRight = true;
      }
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });

    function onResize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W;
      canvas.height = H;
    }
    window.addEventListener('resize', onResize);

    // ─── Main loop ──────────────────────────────────────────────
    function update() {
      frameCount++;

      // Input
      moveDir = 0;
      if (keys['ArrowLeft'] || keys['a'] || touchLeft) moveDir = -1;
      if (keys['ArrowRight'] || keys['d'] || touchRight) moveDir = 1;

      // Move player
      playerX += moveDir * MOVE_SPEED;

      // Wrap around screen edges
      if (playerX < -PLAYER_SIZE / 2) playerX = W + PLAYER_SIZE / 2;
      if (playerX > W + PLAYER_SIZE / 2) playerX = -PLAYER_SIZE / 2;

      // Apply gravity
      velocityY += GRAVITY;
      playerY += velocityY;

      // Camera tracking - move camera up when player goes above mid screen
      const screenPlayerY = playerY - cameraY;
      if (screenPlayerY < H * 0.4) {
        const diff = H * 0.4 - screenPlayerY;
        cameraY -= diff;

        // Update score
        score = Math.max(score, Math.floor(-cameraY / 3));
      }

      // Check milestones
      for (const m of MILESTONES) {
        if (score >= m.score && !reachedMilestones.has(m.score)) {
          reachedMilestones.add(m.score);
          milestoneMsg = m.msg;
          milestoneTimer = 90;
          try { playMilestoneSound(getAudioCtx()); } catch { /* */ }
        }
      }
      if (milestoneTimer > 0) milestoneTimer--;

      // Move moving platforms
      for (const p of platforms) {
        if (p.type === 'moving' && !p.broken) {
          p.x += (p.moveDir || 1) * 1.5;
          if (p.x <= 0 || p.x + p.w >= W) p.moveDir = -(p.moveDir || 1);
        }
      }

      // Platform collision (only when falling)
      if (velocityY > 0) {
        for (const p of platforms) {
          if (p.broken) continue;
          const py = p.y - cameraY;
          const px = p.x;
          if (
            playerX + PLAYER_SIZE / 2 > px &&
            playerX - PLAYER_SIZE / 2 < px + p.w &&
            playerY - cameraY + PLAYER_SIZE / 2 > py &&
            playerY - cameraY + PLAYER_SIZE / 2 < py + 12 &&
            velocityY > 0
          ) {
            if (p.type === 'breaking') {
              p.broken = true;
              p.crackTime = frameCount;
              try { playBreakSound(getAudioCtx()); } catch { /* */ }
            } else {
              velocityY = JUMP_FORCE;
              spawnJumpParticles(playerX, playerY - cameraY + PLAYER_SIZE / 2);
              try { playJumpSound(getAudioCtx()); } catch { /* */ }
            }
          }
        }
      }

      // Recycle platforms: remove below screen, add above
      platforms = platforms.filter(p => {
        const sy = p.y - cameraY;
        return sy < H + 50;
      });

      while (platforms.length < PLATFORM_COUNT) {
        let topY = Infinity;
        for (const p of platforms) {
          if (p.y < topY) topY = p.y;
        }
        const gap = Math.min(H / PLATFORM_COUNT, Math.max(60, 120 - score / 200));
        platforms.push(makePlatform(topY - gap - Math.random() * 30));
      }

      // Update particles
      particles = particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life -= 0.025;
        return p.life > 0;
      });

      // Game over check
      if (playerY - cameraY > H + 50) {
        running = false;
        try { playGameOverSound(getAudioCtx()); } catch { /* */ }
        setFinalScore(score);
        setGameOver(true);
        return;
      }
    }

    function draw() {
      // Background gradient - changes color with height
      const hue = (score / 50) % 360;
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, `hsl(${(240 + hue) % 360}, 30%, 15%)`);
      grad.addColorStop(1, `hsl(${(260 + hue) % 360}, 40%, 25%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Stars
      for (const s of stars) {
        const sy = ((s.y - cameraY * s.speed) % (H * 2) + H * 2) % (H * 2) - H * 0.5;
        const alpha = 0.3 + Math.sin(frameCount * 0.03 + s.twinkle) * 0.3;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, sy, s.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw platforms
      for (const p of platforms) {
        const sy = p.y - cameraY;
        if (sy < -20 || sy > H + 20) continue;

        ctx.save();
        if (p.type === 'normal') {
          ctx.fillStyle = '#7BED9F';
          ctx.shadowColor = '#2ECC71';
          ctx.shadowBlur = 8;
          roundRect(ctx, p.x, sy, p.w, 12, 6);
          ctx.fill();
          // grass details
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#55D67B';
          for (let i = 0; i < 3; i++) {
            const gx = p.x + 10 + i * 20;
            ctx.fillRect(gx, sy - 3, 3, 5);
          }
        } else if (p.type === 'moving') {
          ctx.fillStyle = '#74B9FF';
          ctx.shadowColor = '#3498DB';
          ctx.shadowBlur = 8;
          roundRect(ctx, p.x, sy, p.w, 12, 6);
          ctx.fill();
          // arrows
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#FFF';
          ctx.font = '10px sans-serif';
          ctx.fillText('⇄', p.x + p.w / 2 - 5, sy + 10);
        } else if (p.type === 'breaking') {
          if (p.broken) {
            // Breaking animation
            const dt = frameCount - (p.crackTime || 0);
            ctx.globalAlpha = Math.max(0, 1 - dt / 15);
            ctx.fillStyle = '#E74C3C';
            const half = p.w / 2;
            roundRect(ctx, p.x - dt * 2, sy + dt * 3, half - 2, 10, 3);
            ctx.fill();
            roundRect(ctx, p.x + half + dt * 2, sy + dt * 3, half - 2, 10, 3);
            ctx.fill();
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = '#FF6B6B';
            ctx.shadowColor = '#E74C3C';
            ctx.shadowBlur = 6;
            roundRect(ctx, p.x, sy, p.w, 12, 6);
            ctx.fill();
            // crack lines
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#C0392B';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p.x + p.w * 0.3, sy + 2);
            ctx.lineTo(p.x + p.w * 0.5, sy + 10);
            ctx.moveTo(p.x + p.w * 0.6, sy + 1);
            ctx.lineTo(p.x + p.w * 0.7, sy + 11);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // Draw particles
      for (const p of particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Draw player
      const drawX = playerX;
      const drawY = playerY - cameraY;

      // Body (circle)
      ctx.save();
      ctx.shadowColor = char.color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = char.color;
      ctx.beginPath();
      ctx.arc(drawX, drawY, PLAYER_SIZE / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Face emoji
      ctx.font = `${PLAYER_SIZE - 8}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char.emoji, drawX, drawY);

      // Squash/stretch based on velocity
      const stretch = 1 + Math.abs(velocityY) * 0.015;
      const squash = 1 / stretch;

      // Trail effect when moving fast
      if (Math.abs(velocityY) > 8) {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = char.color;
        ctx.beginPath();
        ctx.arc(drawX, drawY + velocityY * 2, PLAYER_SIZE / 2 * squash, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // ─── UI ───────────────────────────────────────────────────
      // Score
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      roundRect(ctx, 10, 10, 140, 45, 12);
      ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${char.heart} ${char.name}`, 20, 28);
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`${score}점`, 20, 48);

      // Milestone message
      if (milestoneTimer > 0) {
        const scale = milestoneTimer > 70 ? (90 - milestoneTimer) / 20 : milestoneTimer > 10 ? 1 : milestoneTimer / 10;
        ctx.save();
        ctx.globalAlpha = Math.min(1, scale);
        ctx.font = `bold ${36 * Math.min(1.2, scale + 0.3)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FF6B00';
        ctx.shadowBlur = 20;
        ctx.fillText(milestoneMsg, W / 2, H * 0.3);
        ctx.restore();
      }

      // Mobile touch indicators
      if ('ontouchstart' in window) {
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#FFF';
        // left half
        ctx.fillRect(0, H - 80, W / 2, 80);
        // right half
        ctx.fillRect(W / 2, H - 80, W / 2, 80);
        ctx.globalAlpha = 0.3;
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('◀', W * 0.25, H - 35);
        ctx.fillText('▶', W * 0.75, H - 35);
        ctx.globalAlpha = 1;
      }
    }

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

    let animId: number;
    function loop() {
      if (!running) return;
      update();
      if (!running) return;
      draw();
      animId = requestAnimationFrame(loop);
    }
    animId = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('resize', onResize);
    };
  }, [gameStarted, selectedChar, getAudioCtx]);

  // ─── Restart handler ──────────────────────────────────────────
  const restart = useCallback(() => {
    setGameOver(false);
    setGameStarted(false);
    setSelectedChar(null);
  }, []);

  const restartSameChar = useCallback(() => {
    setGameOver(false);
    setGameStarted(false);
    // Brief delay then restart with same char
    setTimeout(() => {
      if (selectedChar !== null) {
        startGame(selectedChar);
      }
    }, 50);
  }, [selectedChar, startGame]);

  // ─── Character Select UI ─────────────────────────────────────
  if (!gameStarted || selectedChar === null) {
    return (
      <div style={{
        width: '100vw',
        height: '100dvh',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'sans-serif',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Back button */}
        <a href="/" style={{
          position: 'absolute',
          top: 16,
          left: 16,
          color: '#FFF',
          textDecoration: 'none',
          fontSize: '18px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '12px',
          padding: '8px 16px',
          backdropFilter: 'blur(10px)',
        }}>
          ← 홈으로
        </a>

        <div style={{
          fontSize: '48px',
          marginBottom: '8px',
          animation: 'bounce 1s ease infinite',
        }}>
          🐰
        </div>
        <h1 style={{
          color: '#FFF',
          fontSize: '32px',
          marginBottom: '8px',
          textShadow: '0 0 20px rgba(255,200,100,0.5)',
        }}>
          점프점프!
        </h1>
        <p style={{
          color: 'rgba(255,255,255,0.6)',
          fontSize: '14px',
          marginBottom: '32px',
        }}>
          캐릭터를 선택하세요!
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          maxWidth: '320px',
          width: '90%',
        }}>
          {CHARACTERS.map((c, i) => (
            <button
              key={c.name}
              onClick={() => startGame(i)}
              style={{
                background: `linear-gradient(135deg, ${c.color}33, ${c.color}66)`,
                border: `2px solid ${c.color}`,
                borderRadius: '20px',
                padding: '20px 12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: `0 4px 20px ${c.color}44`,
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.transform = 'scale(1.08)';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.transform = 'scale(1)';
              }}
            >
              <span style={{ fontSize: '40px' }}>{c.emoji}</span>
              <span style={{ color: '#FFF', fontSize: '16px', fontWeight: 'bold' }}>
                {c.heart} {c.name}
              </span>
            </button>
          ))}
        </div>

        <p style={{
          color: 'rgba(255,255,255,0.4)',
          fontSize: '12px',
          marginTop: '24px',
          textAlign: 'center',
        }}>
          좌우 터치 또는 ←→ 키로 이동!
        </p>

        <style>{`
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-15px); }
          }
        `}</style>
      </div>
    );
  }

  // ─── Game Over UI ─────────────────────────────────────────────
  if (gameOver) {
    const char = CHARACTERS[selectedChar];
    let encouragement = '다시 도전해봐! 💪';
    if (finalScore >= 10000) encouragement = '전설이야!! 👑✨';
    else if (finalScore >= 5000) encouragement = '어마어마해! 🌟';
    else if (finalScore >= 3000) encouragement = '진짜 잘한다! 🎉';
    else if (finalScore >= 1000) encouragement = '대단해! ⭐';
    else if (finalScore >= 500) encouragement = '잘했어! 😊';

    return (
      <div style={{
        width: '100vw',
        height: '100dvh',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'sans-serif',
        gap: '16px',
      }}>
        <div style={{ fontSize: '64px' }}>{char.emoji}</div>
        <h2 style={{ color: '#FFF', fontSize: '28px', margin: 0 }}>게임 오버!</h2>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '20px',
          padding: '20px 40px',
          textAlign: 'center',
        }}>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', margin: '0 0 4px' }}>
            점수
          </p>
          <p style={{
            color: char.color,
            fontSize: '48px',
            fontWeight: 'bold',
            margin: 0,
            textShadow: `0 0 20px ${char.color}88`,
          }}>
            {finalScore}
          </p>
        </div>
        <p style={{
          color: '#FFD700',
          fontSize: '20px',
          fontWeight: 'bold',
          textShadow: '0 0 10px rgba(255,215,0,0.5)',
        }}>
          {encouragement}
        </p>

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button
            onClick={restartSameChar}
            style={{
              background: char.color,
              color: '#FFF',
              border: 'none',
              borderRadius: '16px',
              padding: '14px 32px',
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: `0 4px 15px ${char.color}66`,
            }}
          >
            다시하기! 🔄
          </button>
          <button
            onClick={restart}
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#FFF',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '16px',
              padding: '14px 24px',
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            캐릭터 변경
          </button>
        </div>

        <a href="/" style={{
          color: 'rgba(255,255,255,0.5)',
          textDecoration: 'none',
          fontSize: '14px',
          marginTop: '16px',
        }}>
          ← 홈으로 돌아가기
        </a>
      </div>
    );
  }

  // ─── Canvas Game Screen ───────────────────────────────────────
  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100vw',
          height: '100dvh',
          touchAction: 'none',
        }}
      />
      {/* Back button overlay */}
      <a href="/" style={{
        position: 'fixed',
        top: 12,
        right: 12,
        color: 'rgba(255,255,255,0.5)',
        textDecoration: 'none',
        fontSize: '14px',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '10px',
        padding: '6px 12px',
        zIndex: 10,
      }}>
        ✕
      </a>
    </>
  );
}
