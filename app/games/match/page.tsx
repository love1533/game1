'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { saveScore } from '@/lib/ranking';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Card {
  id: number;
  emoji: string;
  pairId: number;
  flipped: boolean;
  matched: boolean;
  flipProgress: number; // 0 = face down, 1 = face up
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotSpeed: number;
  life: number;
}

// ─── Characters ───────────────────────────────────────────────────────────────
const CHARACTERS = [
  { name: '승민', color: '#3B82F6', emoji: '🤖' },
  { name: '건우', color: '#10B981', emoji: '🩺' },
  { name: '강우', color: '#F59E0B', emoji: '👨‍🍳' },
  { name: '수현', color: '#EC4899', emoji: '💃' },
  { name: '이현', color: '#FF69B4', emoji: '👸' },
  { name: '준영', color: '#6366F1', emoji: '📚' },
  { name: '준우', color: '#0EA5E9', emoji: '✈️' },
];

const CARD_EMOJIS = ['🐰', '🐱', '🐻', '🦊', '🐼', '🐶'];

const PASTEL_BACKS = [
  '#FFD1DC', '#BAFFC9', '#BAE1FF', '#FFFFBA',
  '#E8BAFF', '#FFD8BA', '#C9BAFF', '#BAFFF5',
  '#FFBAE8', '#D1FFBA', '#BABFFF', '#FFF0BA',
  '#FFBABA', '#BAFFEE', '#E0BAFF', '#FFF5BA',
];

const ENCOURAGEMENTS = [
  '잘한다! 👏',
  '대박! ✨',
  '멋져~! 🌟',
  '거의 다 했어! 💪',
  '천재 아니야?! 🧠',
  '완전 잘하네! 🎉',
];

// ─── Audio ────────────────────────────────────────────────────────────────────
class SoundManager {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private play(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.15) {
    try {
      const c = this.getCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
      o.connect(g).connect(c.destination);
      o.start();
      o.stop(c.currentTime + duration);
    } catch {}
  }

  flip() {
    this.play(600, 0.1, 'sine', 0.1);
    setTimeout(() => this.play(800, 0.08, 'sine', 0.08), 50);
  }

  match() {
    this.play(523, 0.15, 'sine', 0.15);
    setTimeout(() => this.play(659, 0.15, 'sine', 0.15), 100);
    setTimeout(() => this.play(784, 0.2, 'sine', 0.2), 200);
  }

  mismatch() {
    this.play(300, 0.15, 'square', 0.08);
    setTimeout(() => this.play(250, 0.2, 'square', 0.08), 120);
  }

  win() {
    const notes = [523, 587, 659, 698, 784, 880, 988, 1047];
    notes.forEach((n, i) => {
      setTimeout(() => this.play(n, 0.25, 'sine', 0.12), i * 100);
    });
  }
}

// ─── Shuffle ──────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Component ────────────────────────────────────────────────────────────────
const PLAYABLE_CHARS = [
  { name: '승민', color: '#3B82F6', emoji: '🤖', heart: '💙' },
  { name: '건우', color: '#10B981', emoji: '🩺', heart: '💚' },
  { name: '강우', color: '#F59E0B', emoji: '👨‍🍳', heart: '🧡' },
  { name: '수현', color: '#EC4899', emoji: '💃', heart: '💗' },
  { name: '이현', color: '#FF69B4', emoji: '👸', heart: '💖' },
  { name: '준영', color: '#6366F1', emoji: '📚', heart: '💜' },
  { name: '준우', color: '#0EA5E9', emoji: '✈️', heart: '💎' },
];

export default function MatchGame() {
  const [screen, setScreen] = useState<'select' | 'game'>('select');
  const [selectedCharIdx, setSelectedCharIdx] = useState(-1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef<SoundManager | null>(null);
  const rafRef = useRef<number>(0);
  const selectedCharRef = useRef(-1);
  const stateRef = useRef({
    cards: [] as Card[],
    flippedIds: [] as number[],
    moves: 0,
    matchedPairs: 0,
    startTime: 0,
    elapsed: 0,
    gameOver: false,
    locked: false,
    confetti: [] as ConfettiParticle[],
    encourageMsg: '',
    encourageTimer: 0,
    sparklePhase: 0,
    winCharIdx: 0,
    restartBtn: { x: 0, y: 0, w: 0, h: 0 },
    backBtn: { x: 0, y: 0, w: 0, h: 0 },
  });

  const initCards = useCallback(() => {
    const pairs = shuffle(CARD_EMOJIS);
    const allCards: Omit<Card, 'x' | 'y' | 'w' | 'h'>[] = [];
    pairs.forEach((emoji, i) => {
      allCards.push({ id: i * 2, emoji, pairId: i, flipped: false, matched: false, flipProgress: 0 });
      allCards.push({ id: i * 2 + 1, emoji, pairId: i, flipped: false, matched: false, flipProgress: 0 });
    });
    return shuffle(allCards).map(c => ({ ...c, x: 0, y: 0, w: 0, h: 0 }));
  }, []);

  const restart = useCallback(() => {
    const s = stateRef.current;
    s.cards = initCards();
    s.flippedIds = [];
    s.moves = 0;
    s.matchedPairs = 0;
    s.startTime = Date.now();
    s.elapsed = 0;
    s.gameOver = false;
    s.locked = false;
    s.confetti = [];
    s.encourageMsg = '';
    s.encourageTimer = 0;
    s.winCharIdx = Math.floor(Math.random() * CHARACTERS.length);
  }, [initCards]);

  useEffect(() => {
    if (screen !== 'game') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    soundRef.current = new SoundManager();
    restart();

    // ── Resize ──────────────────────────────────────────────────────────────
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // ── Layout Cards ────────────────────────────────────────────────────────
    const layoutCards = () => {
      const s = stateRef.current;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const topBar = 90;
      const bottomPad = 20;
      const areaW = W - 20;
      const areaH = H - topBar - bottomPad;
      const cols = 3;
      const rows = 4;
      const gap = Math.min(10, areaW * 0.02);
      const cardW = Math.min(120, (areaW - gap * (cols + 1)) / cols);
      const cardH = Math.min(140, (areaH - gap * (rows + 1)) / rows);
      const totalW = cols * cardW + (cols - 1) * gap;
      const totalH = rows * cardH + (rows - 1) * gap;
      const startX = (W - totalW) / 2;
      const startY = topBar + (areaH - totalH) / 2;

      s.cards.forEach((card, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        card.x = startX + col * (cardW + gap);
        card.y = startY + row * (cardH + gap);
        card.w = cardW;
        card.h = cardH;
      });
    };

    // ── Spawn Confetti ──────────────────────────────────────────────────────
    const spawnConfetti = () => {
      const s = stateRef.current;
      const W = window.innerWidth;
      const colors = ['#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96CEB4',
        '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
        '#FF9FF3', '#54A0FF', '#5F27CD', '#01A3A4', '#F368E0'];
      for (let i = 0; i < 120; i++) {
        s.confetti.push({
          x: W / 2 + (Math.random() - 0.5) * W * 0.3,
          y: -20 - Math.random() * 100,
          vx: (Math.random() - 0.5) * 8,
          vy: Math.random() * 3 + 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: Math.random() * 8 + 4,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.2,
          life: 1,
        });
      }
    };

    // ── Draw ────────────────────────────────────────────────────────────────
    const draw = () => {
      const s = stateRef.current;
      const W = window.innerWidth;
      const H = window.innerHeight;
      layoutCards();

      // Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#FFE8F5');
      bgGrad.addColorStop(0.5, '#EDE8FF');
      bgGrad.addColorStop(1, '#FFE8F0');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Update timer
      if (!s.gameOver && s.startTime > 0) {
        s.elapsed = Math.floor((Date.now() - s.startTime) / 1000);
      }

      s.sparklePhase += 0.03;

      // ── Top Bar ─────────────────────────────────────────────────────────
      ctx.fillStyle = 'rgba(255,240,250,0.92)';
      ctx.fillRect(0, 0, W, 80);
      ctx.strokeStyle = '#E8A0CC';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 80);
      ctx.lineTo(W, 80);
      ctx.stroke();

      // Back button
      const backBtnW = 44;
      const backBtnH = 36;
      s.backBtn = { x: 10, y: 22, w: backBtnW, h: backBtnH };
      ctx.fillStyle = '#F8E0F0';
      ctx.beginPath();
      ctx.roundRect(10, 22, backBtnW, backBtnH, 12);
      ctx.fill();
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔙', 10 + backBtnW / 2, 22 + backBtnH / 2);

      // Title
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = '#9B59B6';
      ctx.textAlign = 'center';
      ctx.fillText('🐾 짝맞추기 🐾', W / 2, 30);

      // Stats
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#666';
      const mins = Math.floor(s.elapsed / 60);
      const secs = s.elapsed % 60;
      const timeStr = `⏱ ${mins}:${secs.toString().padStart(2, '0')}`;
      const moveStr = `👆 ${s.moves}번`;
      const pairStr = `🐾 ${s.matchedPairs}/6`;
      ctx.textAlign = 'left';
      ctx.fillText(timeStr, 65, 55);
      ctx.textAlign = 'center';
      ctx.fillText(pairStr, W / 2, 55);
      ctx.textAlign = 'right';
      ctx.fillText(moveStr, W - 15, 55);

      // Progress bar
      const progW = W - 30;
      const progH = 6;
      const progX = 15;
      const progY = 70;
      ctx.fillStyle = '#F5D0E8';
      ctx.beginPath();
      ctx.roundRect(progX, progY, progW, progH, 3);
      ctx.fill();
      const fillW = (s.matchedPairs / 6) * progW;
      if (fillW > 0) {
        const progGrad = ctx.createLinearGradient(progX, 0, progX + fillW, 0);
        progGrad.addColorStop(0, '#FFB3D9');
        progGrad.addColorStop(0.5, '#E88BD4');
        progGrad.addColorStop(1, '#C78FFF');
        ctx.fillStyle = progGrad;
        ctx.beginPath();
        ctx.roundRect(progX, progY, fillW, progH, 3);
        ctx.fill();
      }

      // ── Cards ───────────────────────────────────────────────────────────
      for (const card of s.cards) {
        // Animate flip
        const targetFlip = (card.flipped || card.matched) ? 1 : 0;
        const speed = 0.12;
        if (card.flipProgress < targetFlip) {
          card.flipProgress = Math.min(1, card.flipProgress + speed);
        } else if (card.flipProgress > targetFlip) {
          card.flipProgress = Math.max(0, card.flipProgress - speed);
        }

        const fp = card.flipProgress;
        const scaleX = Math.abs(Math.cos(fp * Math.PI));
        const centerX = card.x + card.w / 2;
        const centerY = card.y + card.h / 2;
        const showFace = fp > 0.5;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(scaleX, 1);
        ctx.translate(-card.w / 2, -card.h / 2);

        // Card shadow
        ctx.shadowColor = 'rgba(0,0,0,0.1)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;

        const r = Math.min(18, card.w * 0.15);

        if (showFace) {
          // Face side
          ctx.fillStyle = card.matched ? '#FFFDE8' : '#FFFFFF';
          ctx.beginPath();
          ctx.roundRect(0, 0, card.w, card.h, r);
          ctx.fill();

          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = card.matched ? '#FFD700' : '#E8D0F0';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Emoji
          const emojiSize = Math.min(card.w, card.h) * 0.45;
          ctx.font = `${emojiSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(card.emoji, card.w / 2, card.h / 2);

          // Matched glow
          if (card.matched) {
            const glowAlpha = 0.3 + 0.15 * Math.sin(s.sparklePhase * 3);
            ctx.strokeStyle = `rgba(255,215,0,${glowAlpha})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(0, 0, card.w, card.h, r);
            ctx.stroke();
          }
        } else {
          // Back side – pastel color
          const backColor = PASTEL_BACKS[card.id % PASTEL_BACKS.length];
          ctx.fillStyle = backColor;
          ctx.beginPath();
          ctx.roundRect(0, 0, card.w, card.h, r);
          ctx.fill();

          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Paw print pattern
          const pawSize = Math.min(card.w, card.h) * 0.14;
          ctx.font = `${pawSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const positions = [
            [0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75],
          ];
          for (const [px, py] of positions) {
            const pawAlpha = 0.45 + 0.25 * Math.sin(s.sparklePhase + (px + py) * 3);
            ctx.globalAlpha = pawAlpha;
            ctx.fillText('🐾', card.w * px, card.h * py);
          }
          ctx.globalAlpha = 1;

          // Center heart
          const heartSize = Math.min(card.w, card.h) * 0.28;
          ctx.font = `${heartSize}px sans-serif`;
          ctx.globalAlpha = 0.55 + 0.2 * Math.sin(s.sparklePhase * 2);
          ctx.fillText('💗', card.w / 2, card.h / 2);
          ctx.globalAlpha = 1;
        }

        ctx.restore();
      }

      // ── Encouragement message ───────────────────────────────────────────
      if (s.encourageTimer > 0) {
        s.encourageTimer--;
        const alpha = Math.min(1, s.encourageTimer / 30);
        const yOff = (1 - alpha) * 20;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FF6B9D';
        ctx.fillText(s.encourageMsg, W / 2, 115 - yOff);
        ctx.restore();
      }

      // ── Confetti ────────────────────────────────────────────────────────
      for (let i = s.confetti.length - 1; i >= 0; i--) {
        const p = s.confetti[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.vx *= 0.99;
        p.rotation += p.rotSpeed;
        p.life -= 0.004;

        if (p.life <= 0 || p.y > H + 20) {
          s.confetti.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }

      // ── Win Screen ──────────────────────────────────────────────────────
      if (s.gameOver) {
        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(0, 0, W, H);

        const ch = CHARACTERS[s.winCharIdx];
        const boxW = Math.min(320, W - 40);
        const boxH = 320;
        const boxX = (W - boxW) / 2;
        const boxY = (H - boxH) / 2 - 20;

        // Win box
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 20);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Border gradient
        ctx.strokeStyle = ch.color;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Character emoji
        ctx.font = '70px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ch.emoji, W / 2, boxY + 65);

        // Congratulations
        ctx.font = 'bold 24px sans-serif';
        ctx.fillStyle = ch.color;
        ctx.fillText('축하해요! 🎊🐾🎊', W / 2, boxY + 112);

        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#666';
        ctx.fillText(`${ch.name}(이)가 응원해요!`, W / 2, boxY + 138);

        // Stats
        const score = Math.max(0, 10000 - s.moves * 80 - s.elapsed * 5);
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = '#333';
        ctx.fillText(`점수: ${score}점`, W / 2, boxY + 175);

        ctx.font = '15px sans-serif';
        ctx.fillStyle = '#888';
        const fMins = Math.floor(s.elapsed / 60);
        const fSecs = s.elapsed % 60;
        ctx.fillText(`시간: ${fMins}분 ${fSecs}초  |  시도: ${s.moves}번`, W / 2, boxY + 202);

        // Rating stars
        let stars = 1;
        if (s.moves <= 12) stars = 3;
        else if (s.moves <= 18) stars = 2;
        const starStr = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
        ctx.font = '34px sans-serif';
        ctx.fillText(starStr, W / 2, boxY + 244);

        // Restart button
        const btnW = 160;
        const btnH = 44;
        const btnX = (W - btnW) / 2;
        const btnY = boxY + boxH - 65;
        s.restartBtn = { x: btnX, y: btnY, w: btnW, h: btnH };

        const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
        btnGrad.addColorStop(0, '#FF6B9D');
        btnGrad.addColorStop(1, '#C44EFF');
        ctx.fillStyle = btnGrad;
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, btnW, btnH, 22);
        ctx.fill();

        ctx.font = 'bold 17px sans-serif';
        ctx.fillStyle = '#FFF';
        ctx.fillText('다시 하기 🔄', btnX + btnW / 2, btnY + btnH / 2 + 1);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    // ── Input ─────────────────────────────────────────────────────────────
    const handleClick = (clientX: number, clientY: number) => {
      const s = stateRef.current;
      const sound = soundRef.current;

      // Back button
      const bb = s.backBtn;
      if (clientX >= bb.x && clientX <= bb.x + bb.w &&
          clientY >= bb.y && clientY <= bb.y + bb.h) {
        window.location.href = '/';
        return;
      }

      if (s.gameOver) {
        const rb = s.restartBtn;
        if (clientX >= rb.x && clientX <= rb.x + rb.w &&
            clientY >= rb.y && clientY <= rb.y + rb.h) {
          restart();
          sound?.flip();
        }
        return;
      }

      if (s.locked) return;

      for (const card of s.cards) {
        if (clientX >= card.x && clientX <= card.x + card.w &&
            clientY >= card.y && clientY <= card.y + card.h) {
          if (card.flipped || card.matched) continue;
          if (s.flippedIds.length >= 2) continue;

          card.flipped = true;
          s.flippedIds.push(card.id);
          sound?.flip();

          if (s.flippedIds.length === 2) {
            s.moves++;
            s.locked = true;
            const c1 = s.cards.find(c => c.id === s.flippedIds[0])!;
            const c2 = s.cards.find(c => c.id === s.flippedIds[1])!;

            if (c1.pairId === c2.pairId) {
              // Match!
              setTimeout(() => {
                c1.matched = true;
                c2.matched = true;
                s.matchedPairs++;
                s.flippedIds = [];
                s.locked = false;
                sound?.match();

                // Show encouragement
                if (s.matchedPairs < 6) {
                  if (s.matchedPairs % 2 === 0 || s.matchedPairs >= 4) {
                    s.encourageMsg = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
                    s.encourageTimer = 90;
                  }
                }

                // Check win
                if (s.matchedPairs === 6) {
                  s.gameOver = true;
                  const matchScore = Math.max(0, 10000 - s.moves * 80 - s.elapsed * 5);
                  const charName = selectedCharRef.current >= 0 ? PLAYABLE_CHARS[selectedCharRef.current].name : CHARACTERS[s.winCharIdx].name;
                  saveScore('match', charName, matchScore);
                  sound?.win();
                  spawnConfetti();
                  setTimeout(() => spawnConfetti(), 500);
                  setTimeout(() => spawnConfetti(), 1000);
                }
              }, 400);
            } else {
              // Mismatch
              setTimeout(() => {
                sound?.mismatch();
                c1.flipped = false;
                c2.flipped = false;
                s.flippedIds = [];
                s.locked = false;
              }, 1200);
            }
          }
          break;
        }
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      handleClick(t.clientX, t.clientY);
    };
    const onMouseDown = (e: MouseEvent) => {
      handleClick(e.clientX, e.clientY);
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('mousedown', onMouseDown);
    };
  }, [restart, screen]);

  if (screen === 'select') {
    return (
      <div style={{
        width: '100vw', height: '100dvh',
        background: 'linear-gradient(135deg, #FFF5F9, #F0F4FF, #FFF0F5)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'sans-serif', padding: 20,
      }}>
        <a href="/" style={{
          position: 'absolute', top: 16, left: 16, color: '#9B59B6', textDecoration: 'none',
          fontSize: 14, background: 'rgba(255,255,255,0.8)', borderRadius: 12, padding: '6px 14px',
        }}>← 홈</a>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🐾</div>
        <h1 style={{ fontSize: 28, fontWeight: 'bold', color: '#6B21A8', marginBottom: 4 }}>짝맞추기</h1>
        <p style={{ fontSize: 14, color: '#9B59B6', marginBottom: 24 }}>캐릭터를 선택하세요!</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, maxWidth: 340, width: '100%' }}>
          {PLAYABLE_CHARS.map((c, i) => (
            <button key={c.name} onClick={() => { setSelectedCharIdx(i); }}
              style={{
                background: selectedCharIdx === i ? `${c.color}22` : 'rgba(255,255,255,0.9)',
                border: selectedCharIdx === i ? `3px solid ${c.color}` : '3px solid transparent',
                borderRadius: 16, padding: '14px 4px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                transition: 'all 0.15s',
              }}>
              <span style={{ fontSize: 32 }}>{c.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: c.color }}>{c.name}</span>
            </button>
          ))}
        </div>
        {selectedCharIdx >= 0 && (
          <button onClick={() => { selectedCharRef.current = selectedCharIdx; setScreen('game'); }}
            style={{
              marginTop: 20, padding: '14px 48px', borderRadius: 24, border: 'none',
              background: PLAYABLE_CHARS[selectedCharIdx].color, color: '#fff',
              fontSize: 18, fontWeight: 'bold', cursor: 'pointer',
              boxShadow: `0 4px 15px ${PLAYABLE_CHARS[selectedCharIdx].color}66`,
            }}>
            시작하기! 🎮
          </button>
        )}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100vh',
        touchAction: 'none',
        cursor: 'pointer',
      }}
    />
  );
}
