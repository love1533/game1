'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { saveScore } from '@/lib/ranking';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Character {
  name: string;
  color: string;
  emoji: string;
  heart: string;
}

interface Recipe {
  name: string;
  steps: string[];
}

interface FlyingIngredient {
  emoji: string;
  x: number;
  y: number;
  tx: number; // target x (bowl)
  ty: number; // target y (bowl)
  alpha: number;
  scale: number;
  done: boolean;
}

interface Sparkle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  speed: number;
  angle: number;
  color: string;
}

interface ShakeBtn {
  idx: number;
  amount: number;
}

interface FloatingText {
  text: string;
  x: number;
  y: number;
  alpha: number;
  vy: number;
  color: string;
  size: number;
}

type GamePhase = 'select' | 'playing' | 'reaction' | 'gameover';

// ─── Constants ────────────────────────────────────────────────────────────────
const CHARACTERS: Character[] = [
  { name: '승민', color: '#3B82F6', emoji: '🤖', heart: '💙' },
  { name: '건우', color: '#10B981', emoji: '🩺', heart: '💚' },
  { name: '강우', color: '#F59E0B', emoji: '👨‍🍳', heart: '🧡' },
  { name: '수현', color: '#EC4899', emoji: '💃', heart: '💗' },
  { name: '이현', color: '#FF69B4', emoji: '👸', heart: '💖' },
];

const RECIPES: Recipe[] = [
  { name: '샌드위치', steps: ['🍞', '🥬', '🧀', '🍅', '🍞'] },
  { name: '비빔밥', steps: ['🍚', '🥕', '🥒', '🥩', '🍳'] },
  { name: '케이크', steps: ['🥚', '🧈', '🍫', '🍓', '🎂'] },
  { name: '피자', steps: ['🍕', '🧀', '🍅', '🌽', '🫑'] },
  { name: '김밥', steps: ['🍚', '🥕', '🥒', '🥩', '🍙'] },
  { name: '햄버거', steps: ['🍞', '🥬', '🍖', '🧀', '🍞'] },
  { name: '아이스크림', steps: ['🍦', '🍫', '🍓', '🍌', '🍒'] },
  { name: '라면', steps: ['🍜', '🥚', '🧅', '🌶️', '🍥'] },
  { name: '떡볶이', steps: ['🍡', '🌶️', '🧀', '🥚', '🍢'] },
  { name: '초밥', steps: ['🍚', '🐟', '🥑', '🍋', '🍣'] },
];

const MAX_HEARTS = 3;
const RECIPE_TIME = 30; // seconds per recipe
const BOWL_EMOJI = '🍲';

// ─── Audio ────────────────────────────────────────────────────────────────────
function createAudioCtx(): AudioContext | null {
  try {
    return new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch {
    return null;
  }
}

function playCorrectSound(ctx: AudioContext) {
  const now = ctx.currentTime;
  [523, 659, 784].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.25, now + i * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.2);
    osc.start(now + i * 0.08);
    osc.stop(now + i * 0.08 + 0.2);
  });
}

function playWrongSound(ctx: AudioContext) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(120, now + 0.25);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
  osc.start(now);
  osc.stop(now + 0.3);
}

function playCompleteFanfare(ctx: AudioContext) {
  const notes = [523, 659, 784, 1047];
  const now = ctx.currentTime;
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, now + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
    osc.start(now + i * 0.1);
    osc.stop(now + i * 0.1 + 0.35);
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function CookingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Phase & selection
  const [phase, setPhase] = useState<GamePhase>('select');
  const [selectedChar, setSelectedChar] = useState(0);

  // Game state
  const [recipeIdx, setRecipeIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);      // which recipe step we're waiting for
  const [shuffledIngredients, setShuffledIngredients] = useState<string[]>([]);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(RECIPE_TIME);
  const [reactionMsg, setReactionMsg] = useState('');

  // Animation refs (read inside rAF — avoid stale closures)
  const sparklesRef = useRef<Sparkle[]>([]);
  const flyingRef = useRef<FlyingIngredient[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const shakeBtnsRef = useRef<ShakeBtn[]>([]);
  const charBounceRef = useRef(0);
  const animFrameRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hoverCharRef = useRef(-1);
  const hoverBtnRef = useRef(-1);

  // Mirrors of state needed inside canvas handlers (avoid stale event closures)
  const phaseRef = useRef<GamePhase>('select');
  const recipeIdxRef = useRef(0);
  const stepIdxRef = useRef(0);
  const shuffledRef = useRef<string[]>([]);
  const heartsRef = useRef(MAX_HEARTS);
  const scoreRef = useRef(0);
  const timeLeftRef = useRef(RECIPE_TIME);

  // Sync refs with state
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { recipeIdxRef.current = recipeIdx; }, [recipeIdx]);
  useEffect(() => { stepIdxRef.current = stepIdx; }, [stepIdx]);
  useEffect(() => { shuffledRef.current = shuffledIngredients; }, [shuffledIngredients]);
  useEffect(() => { heartsRef.current = hearts; }, [hearts]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  // ─── Audio ─────────────────────────────────────────────────────────────────
  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  // ─── Particle helpers ──────────────────────────────────────────────────────
  const addSparkles = useCallback((cx: number, cy: number, count: number, color?: string) => {
    const colors = color ? [color] : ['#FFD700', '#FF6B6B', '#4ECDC4', '#A78BFA', '#FB7185', '#FFA07A'];
    for (let i = 0; i < count; i++) {
      sparklesRef.current.push({
        x: cx,
        y: cy,
        size: 3 + Math.random() * 5,
        alpha: 1,
        speed: 1.5 + Math.random() * 3,
        angle: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }, []);

  const addFloatingText = useCallback((text: string, x: number, y: number, color: string, size = 26) => {
    floatingTextsRef.current.push({ text, x, y, alpha: 1, vy: -2.2, color, size });
  }, []);

  // ─── Timer ─────────────────────────────────────────────────────────────────
  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    setTimeLeft(RECIPE_TIME);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearTimer();
          // Time ran out – lose a heart
          setHearts(h => {
            const next = h - 1;
            if (next <= 0) {
              saveScore('cooking', CHARACTERS[selectedChar].name, scoreRef.current);
              setPhase('gameover');
            }
            return Math.max(next, 0);
          });
          addFloatingText('시간 초과! ⏰', window.innerWidth / 2, window.innerHeight * 0.4, '#FB7185');
          // Advance recipe anyway after short pause
          setTimeout(() => {
            const ri = recipeIdxRef.current + 1;
            if (ri >= RECIPES.length || heartsRef.current <= 0) {
              saveScore('cooking', CHARACTERS[selectedChar].name, scoreRef.current);
              setPhase('gameover');
            } else {
              setRecipeIdx(ri);
              setStepIdx(0);
              setShuffledIngredients(shuffle(RECIPES[ri].steps));
              setPhase('playing');
              startTimer();
            }
          }, 1200);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer, addFloatingText]);

  // ─── Start game ────────────────────────────────────────────────────────────
  const startGame = useCallback((charIdx: number) => {
    ensureAudio();
    setSelectedChar(charIdx);
    setRecipeIdx(0);
    setStepIdx(0);
    setHearts(MAX_HEARTS);
    setScore(0);
    setShuffledIngredients(shuffle(RECIPES[0].steps));
    sparklesRef.current = [];
    flyingRef.current = [];
    floatingTextsRef.current = [];
    shakeBtnsRef.current = [];
    setPhase('playing');
    startTimer();
  }, [ensureAudio, startTimer]);

  // ─── Handle ingredient tap ─────────────────────────────────────────────────
  const handleIngredientTap = useCallback((btnIdx: number, W: number, H: number) => {
    const ri = recipeIdxRef.current;
    const si = stepIdxRef.current;
    const shuffled = shuffledRef.current;
    const tapped = shuffled[btnIdx];
    const expected = RECIPES[ri].steps[si];
    const ctx = ensureAudio();

    // Compute bowl position (center-top area)
    const bowlX = W / 2;
    const bowlY = H * 0.28;

    // Compute button position for flight animation
    const cols = shuffled.length;
    const btnSize = Math.min(W / cols - 12, 72);
    const totalW = cols * (btnSize + 10) - 10;
    const startX = (W - totalW) / 2;
    const btnX = startX + btnIdx * (btnSize + 10) + btnSize / 2;
    const btnY = H * 0.82;

    if (tapped === expected) {
      // Correct!
      if (ctx) playCorrectSound(ctx);
      addSparkles(btnX, btnY, 18);

      // Fly to bowl
      flyingRef.current.push({
        emoji: tapped,
        x: btnX,
        y: btnY,
        tx: bowlX,
        ty: bowlY,
        alpha: 1,
        scale: 1,
        done: false,
      });

      charBounceRef.current = 12;

      const nextStep = si + 1;
      if (nextStep >= RECIPES[ri].steps.length) {
        // Recipe complete!
        clearTimer();
        if (ctx) playCompleteFanfare(ctx);
        const timebonus = Math.round(timeLeftRef.current * 5);
        const newScore = scoreRef.current + 100 + timebonus;
        setScore(newScore);
        addSparkles(W / 2, H / 2, 50);
        addFloatingText(`+${100 + timebonus}점! 🎉`, W / 2, H * 0.35, '#FFD700', 32);

        const nextRi = ri + 1;
        if (nextRi >= RECIPES.length || heartsRef.current <= 0) {
          setTimeout(() => { saveScore('cooking', CHARACTERS[selectedChar].name, scoreRef.current); setPhase('gameover'); }, 1800);
        } else {
          setReactionMsg(getReactionMsg(true));
          setTimeout(() => {
            setRecipeIdx(nextRi);
            setStepIdx(0);
            setShuffledIngredients(shuffle(RECIPES[nextRi].steps));
            setPhase('playing');
            startTimer();
          }, 1800);
        }
      } else {
        setStepIdx(nextStep);
        addFloatingText('굿! ✨', btnX, btnY - 20, '#4ADE80');
      }
    } else {
      // Wrong!
      if (ctx) playWrongSound(ctx);
      shakeBtnsRef.current.push({ idx: btnIdx, amount: 10 });
      const newHearts = heartsRef.current - 1;
      setHearts(Math.max(newHearts, 0));
      addFloatingText('틀렸어! 💦', btnX, btnY - 20, '#FB7185');
      if (newHearts <= 0) {
        clearTimer();
        setTimeout(() => { saveScore('cooking', CHARACTERS[selectedChar].name, scoreRef.current); setPhase('gameover'); }, 800);
      }
    }
  }, [ensureAudio, addSparkles, addFloatingText, clearTimer, startTimer]);

  function getReactionMsg(success: boolean): string {
    const good = ['완벽해! 👨‍🍳', '요리왕! 🏆', '맛있겠다! 😋', '천재 요리사! ✨'];
    const bad = ['다음엔 잘할 수 있어! 💪', '파이팅! 🍀', '열심히 해보자! 😊'];
    const msgs = success ? good : bad;
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  // ─── Canvas input ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width / (window.devicePixelRatio || 1);
      const scaleY = canvas.height / rect.height / (window.devicePixelRatio || 1);
      if ('touches' in e && e.touches.length > 0) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY,
        };
      }
      if ('clientX' in e) {
        return {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top) * scaleY,
        };
      }
      return { x: 0, y: 0 };
    };

    const handleClick = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const { x, y } = getPos(e);
      const W = window.innerWidth;
      const H = window.innerHeight;

      // Back / home button always
      if (x <= 100 && y <= 60) {
        clearTimer();
        if (phaseRef.current !== 'select') {
          setPhase('select');
        } else {
          window.location.href = '/';
        }
        return;
      }

      if (phaseRef.current === 'select') {
        const cardW = W * 0.42;
        const cardH = H * 0.16;
        const startY = H * 0.32;
        const gap = H * 0.025;
        for (let i = 0; i < CHARACTERS.length; i++) {
          const row = Math.floor(i / 2);
          const col = i % 2;
          const cx = col === 0 ? W * 0.26 : W * 0.74;
          const cy = startY + row * (cardH + gap) + cardH / 2;
          if (x >= cx - cardW / 2 && x <= cx + cardW / 2 && y >= cy - cardH / 2 && y <= cy + cardH / 2) {
            startGame(i);
            return;
          }
        }
        return;
      }

      if (phaseRef.current === 'playing') {
        const shuffled = shuffledRef.current;
        const cols = shuffled.length;
        const btnSize = Math.min(W / cols - 12, 72);
        const totalW = cols * (btnSize + 10) - 10;
        const startX = (W - totalW) / 2;
        const btnY = H * 0.82;

        for (let i = 0; i < cols; i++) {
          const bx = startX + i * (btnSize + 10);
          const by = btnY - btnSize / 2 - 10;
          if (x >= bx && x <= bx + btnSize && y >= by && y <= by + btnSize + 20) {
            handleIngredientTap(i, W, H);
            return;
          }
        }
        return;
      }

      if (phaseRef.current === 'gameover') {
        // Retry button
        const btnW = W * 0.55;
        const btnH = 56;
        const btnX = W / 2 - btnW / 2;
        const btnY2 = H * 0.76 - btnH / 2;
        if (x >= btnX && x <= btnX + btnW && y >= btnY2 && y <= btnY2 + btnH) {
          setPhase('select');
          return;
        }
        return;
      }
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const { x, y } = getPos(e);
      const W = window.innerWidth;
      const H = window.innerHeight;

      if (phaseRef.current === 'select') {
        const cardW = W * 0.42;
        const cardH = H * 0.16;
        const startY = H * 0.32;
        const gap = H * 0.025;
        hoverCharRef.current = -1;
        for (let i = 0; i < CHARACTERS.length; i++) {
          const row = Math.floor(i / 2);
          const col = i % 2;
          const cx = col === 0 ? W * 0.26 : W * 0.74;
          const cy = startY + row * (cardH + gap) + cardH / 2;
          if (x >= cx - cardW / 2 && x <= cx + cardW / 2 && y >= cy - cardH / 2 && y <= cy + cardH / 2) {
            hoverCharRef.current = i;
          }
        }
      }

      if (phaseRef.current === 'playing') {
        const shuffled = shuffledRef.current;
        const cols = shuffled.length;
        const btnSize = Math.min(W / cols - 12, 72);
        const totalW = cols * (btnSize + 10) - 10;
        const startX = (W - totalW) / 2;
        const btnY = H * 0.82;
        hoverBtnRef.current = -1;
        for (let i = 0; i < cols; i++) {
          const bx = startX + i * (btnSize + 10);
          const by = btnY - btnSize / 2 - 10;
          if (x >= bx && x <= bx + btnSize && y >= by && y <= by + btnSize + 20) {
            hoverBtnRef.current = i;
          }
        }
      }
    };

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', handleClick, { passive: false });
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('touchmove', handleMove, { passive: false });

    return () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('touchstart', handleClick);
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('touchmove', handleMove);
    };
  }, [handleIngredientTap, startGame, clearTimer]);

  // ─── Render loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameTime = 0;

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

    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    // ── Drawing helpers ──────────────────────────────────────────────────────
    const rr = (x: number, y: number, w: number, h: number, r: number) => {
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
    };

    const drawBackBtn = () => {
      ctx.save();
      ctx.shadowColor = '#FFB3D940';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#FDE8F5';
      rr(8, 10, 80, 34, 17);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#F9A8D4';
      ctx.lineWidth = 1.5;
      rr(8, 10, 80, 34, 17);
      ctx.stroke();
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#E91E8C';
      ctx.textAlign = 'left';
      ctx.fillText('🏠 홈', 18, 32);
      ctx.restore();
    };

    const drawKitchenBg = () => {
      const w = W();
      const h = H();
      // Sky-pastel gradient
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#FFF0F8');
      grad.addColorStop(0.5, '#FFF8E8');
      grad.addColorStop(1, '#E8F8FF');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Pastel checkerboard floor at bottom
      const tileSize = 36;
      const floorTop = h * 0.88;
      ctx.save();
      for (let col = 0; col < Math.ceil(w / tileSize) + 1; col++) {
        for (let row = 0; row < Math.ceil((h - floorTop) / tileSize) + 1; row++) {
          ctx.fillStyle = (col + row) % 2 === 0 ? '#FFE8F5' : '#FFF0E8';
          ctx.fillRect(col * tileSize, floorTop + row * tileSize, tileSize, tileSize);
        }
      }
      ctx.restore();

      // Counter shelf
      ctx.save();
      ctx.fillStyle = '#FADADD';
      rr(0, h * 0.88, w, 10, 4);
      ctx.fill();
      ctx.restore();

      // Deco: little stars/dots scattered in bg
      const decorDots = [
        { x: 0.08, y: 0.15, emoji: '⭐', size: 18 },
        { x: 0.92, y: 0.12, emoji: '✨', size: 16 },
        { x: 0.05, y: 0.55, emoji: '🌟', size: 14 },
        { x: 0.95, y: 0.6, emoji: '💫', size: 16 },
        { x: 0.5, y: 0.07, emoji: '🍴', size: 20 },
      ];
      ctx.save();
      ctx.globalAlpha = 0.25;
      decorDots.forEach(d => {
        ctx.font = `${d.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.emoji, w * d.x, h * d.y);
      });
      ctx.restore();
    };

    // ── Select screen ────────────────────────────────────────────────────────
    const drawSelectScreen = () => {
      drawKitchenBg();

      const w = W();
      const h = H();

      // Title
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.min(w * 0.09, 44)}px sans-serif`;
      ctx.fillStyle = '#E91E8C';
      ctx.shadowColor = '#FFB3D9';
      ctx.shadowBlur = 14;
      ctx.fillText('🍳 요리사 게임', w / 2, h * 0.12);
      ctx.shadowColor = 'transparent';
      ctx.font = `${Math.min(w * 0.045, 22)}px sans-serif`;
      ctx.fillStyle = '#9B59B6';
      ctx.fillText('요리사를 골라보세요!', w / 2, h * 0.20);
      ctx.restore();

      const cardW = w * 0.42;
      const cardH = h * 0.16;
      const startY = h * 0.28;
      const gap = h * 0.03;

      CHARACTERS.forEach((char, i) => {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const cx = col === 0 ? w * 0.26 : w * 0.74;
        const cy = startY + row * (cardH + gap) + cardH / 2;
        const isHover = hoverCharRef.current === i;
        const cw = cardW * (isHover ? 1.04 : 1);
        const ch = cardH * (isHover ? 1.04 : 1);

        ctx.save();
        ctx.shadowColor = char.color + '50';
        ctx.shadowBlur = isHover ? 22 : 10;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = isHover ? '#FFFFFF' : '#FDF5FF';
        rr(cx - cw / 2, cy - ch / 2, cw, ch, 22);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = char.color + (isHover ? 'FF' : '99');
        ctx.lineWidth = isHover ? 3 : 2;
        rr(cx - cw / 2, cy - ch / 2, cw, ch, 22);
        ctx.stroke();

        const emojiSize = Math.min(cw * 0.27, 50);
        ctx.font = `${emojiSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char.emoji, cx, cy - ch * 0.1);

        ctx.font = `bold ${Math.min(cw * 0.13, 19)}px sans-serif`;
        ctx.fillStyle = char.color;
        ctx.fillText(`${char.heart} ${char.name}`, cx, cy + ch * 0.3);
      });

      // Hint text
      ctx.font = `${Math.min(w * 0.038, 18)}px sans-serif`;
      ctx.fillStyle = '#AAAAAA';
      ctx.textAlign = 'center';
      ctx.fillText('재료를 올바른 순서대로 탭하세요!', w / 2, h * 0.78);
      ctx.fillText('10가지 레시피 도전! 🍽️', w / 2, h * 0.83);

      drawBackBtn();
    };

    // ── Playing screen ────────────────────────────────────────────────────────
    const drawPlayingScreen = () => {
      const w = W();
      const h = H();
      const char = CHARACTERS[selectedChar];
      const recipe = RECIPES[recipeIdx];

      drawKitchenBg();

      // ── Top HUD ──
      // Hearts
      const heartStr = '❤️'.repeat(hearts) + '🖤'.repeat(MAX_HEARTS - hearts);
      ctx.font = `${Math.min(w * 0.055, 26)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(heartStr, 10, h * 0.06);

      // Score
      ctx.font = `bold ${Math.min(w * 0.042, 20)}px sans-serif`;
      ctx.fillStyle = '#9B59B6';
      ctx.textAlign = 'right';
      ctx.fillText(`${score}점`, w - 12, h * 0.06);

      // Recipe name + number
      ctx.font = `bold ${Math.min(w * 0.055, 26)}px sans-serif`;
      ctx.fillStyle = '#E91E8C';
      ctx.textAlign = 'center';
      ctx.fillText(`${recipeIdx + 1}. ${recipe.name}`, w / 2, h * 0.065);

      // Timer bar
      const timerBarW = w - 24;
      const timerBarH = 10;
      const timerBarY = h * 0.09;
      ctx.fillStyle = '#FADADD';
      rr(12, timerBarY, timerBarW, timerBarH, 5);
      ctx.fill();
      const pct = timeLeft / RECIPE_TIME;
      const fillColor = pct > 0.5 ? '#4ADE80' : pct > 0.25 ? '#FBBF24' : '#FB7185';
      ctx.fillStyle = fillColor;
      rr(12, timerBarY, Math.max(timerBarW * pct, 0), timerBarH, 5);
      ctx.fill();
      ctx.font = `bold ${Math.min(w * 0.038, 17)}px sans-serif`;
      ctx.fillStyle = pct < 0.25 ? '#FB7185' : '#666';
      ctx.textAlign = 'center';
      ctx.fillText(`${timeLeft}초`, w / 2, timerBarY + 26);

      // ── Recipe strip ──────────────────────────────────────────────────────
      const stripY = h * 0.14;
      const stripH = h * 0.14;

      ctx.save();
      ctx.shadowColor = '#FFB3D940';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#FFFBFE';
      rr(12, stripY, w - 24, stripH, 16);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#F9A8D4';
      ctx.lineWidth = 2;
      rr(12, stripY, w - 24, stripH, 16);
      ctx.stroke();

      // Label
      ctx.font = `bold ${Math.min(w * 0.037, 16)}px sans-serif`;
      ctx.fillStyle = '#E91E8C';
      ctx.textAlign = 'left';
      ctx.fillText('레시피:', 22, stripY + stripH * 0.35);

      // Steps
      const steps = recipe.steps;
      const stepAreaW = w - 100;
      const stepX0 = 90;
      const stepSpacing = Math.min(stepAreaW / steps.length, 60);
      const stepEmojSize = Math.min(stepSpacing * 0.7, 36);

      steps.forEach((emoji, si) => {
        const sx = stepX0 + si * stepSpacing + stepSpacing / 2;
        const sy = stripY + stripH * 0.5;

        // Highlight current step
        if (si === stepIdx) {
          ctx.save();
          ctx.shadowColor = '#FFD70080';
          ctx.shadowBlur = 16;
          ctx.fillStyle = '#FFD700';
          ctx.beginPath();
          ctx.arc(sx, sy, stepEmojSize * 0.75, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (si < stepIdx) {
          // Done
          ctx.save();
          ctx.fillStyle = '#D1FAE560';
          ctx.beginPath();
          ctx.arc(sx, sy, stepEmojSize * 0.65, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        ctx.font = `${stepEmojSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = si < stepIdx ? 0.4 : 1;
        ctx.fillText(emoji, sx, sy);
        ctx.globalAlpha = 1;

        // Arrow between steps
        if (si < steps.length - 1) {
          ctx.font = `${stepEmojSize * 0.5}px sans-serif`;
          ctx.fillStyle = '#CCAACC';
          ctx.fillText('→', sx + stepSpacing / 2, sy);
        }
      });

      // ── Bowl area ─────────────────────────────────────────────────────────
      const bowlY = h * 0.33;
      const bowlSize = Math.min(w * 0.22, 90);
      ctx.font = `${bowlSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Glow behind bowl
      ctx.save();
      ctx.shadowColor = char.color + '60';
      ctx.shadowBlur = 20;
      ctx.fillText(BOWL_EMOJI, w / 2, bowlY);
      ctx.restore();

      // Character reaction
      const charEmoji = char.emoji;
      const charSize = Math.min(w * 0.13, 56);
      const charX = w * 0.2;
      const charY2 = bowlY + charBounceRef.current * -1;
      ctx.font = `${charSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(charEmoji, charX, charY2);

      // Character name label
      ctx.font = `bold ${Math.min(w * 0.035, 15)}px sans-serif`;
      ctx.fillStyle = char.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(char.name, charX, charY2 + charSize * 0.7);

      // Instruction text
      const nextIngredient = steps[stepIdx];
      ctx.font = `bold ${Math.min(w * 0.047, 22)}px sans-serif`;
      ctx.fillStyle = '#555';
      ctx.textAlign = 'center';
      const instY = h * 0.53;
      ctx.fillText(`다음 재료를 탭하세요!`, w / 2, instY);
      ctx.font = `${Math.min(w * 0.09, 44)}px sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(nextIngredient, w / 2, instY + 36);
      ctx.textBaseline = 'alphabetic';

      // ── Ingredient buttons ────────────────────────────────────────────────
      const shuffled = shuffledIngredients;
      const cols = shuffled.length;
      const btnSize = Math.min(W() / cols - 12, 72);
      const totalBtnW = cols * (btnSize + 10) - 10;
      const bStartX = (w - totalBtnW) / 2;
      const bY = h * 0.82;

      // Platform shelf behind buttons
      ctx.save();
      ctx.fillStyle = '#FDE8F580';
      rr(bStartX - 14, bY - btnSize / 2 - 16, totalBtnW + 28, btnSize + 40, 18);
      ctx.fill();
      ctx.strokeStyle = '#F9A8D4';
      ctx.lineWidth = 1.5;
      rr(bStartX - 14, bY - btnSize / 2 - 16, totalBtnW + 28, btnSize + 40, 18);
      ctx.stroke();
      ctx.restore();

      shuffled.forEach((emoji, i) => {
        const bx = bStartX + i * (btnSize + 10);
        const by = bY - btnSize / 2 - 6;
        const isHover = hoverBtnRef.current === i;

        // Shake offset
        const shake = shakeBtnsRef.current.find(s => s.idx === i);
        const shakeX = shake && shake.amount > 0.1 ? (Math.random() - 0.5) * shake.amount : 0;

        ctx.save();
        ctx.translate(shakeX, 0);

        // Button bg
        ctx.shadowColor = '#F9A8D480';
        ctx.shadowBlur = isHover ? 18 : 8;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = isHover ? '#FFFFFF' : '#FFF5FC';
        rr(bx, by, btnSize, btnSize, 16);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = isHover ? char.color : '#F9A8D4';
        ctx.lineWidth = isHover ? 2.5 : 1.5;
        rr(bx, by, btnSize, btnSize, 16);
        ctx.stroke();

        // Emoji
        const emojiSize = btnSize * 0.62;
        ctx.font = `${emojiSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 1;
        ctx.fillText(emoji, bx + btnSize / 2, by + btnSize / 2);

        ctx.restore();
      });

      drawBackBtn();
    };

    // ── Gameover screen ───────────────────────────────────────────────────────
    const drawGameoverScreen = () => {
      const w = W();
      const h = H();
      const char = CHARACTERS[selectedChar];
      const completed = recipeIdx;
      const allDone = recipeIdx >= RECIPES.length;

      drawKitchenBg();

      // Result emoji
      ctx.font = `${Math.min(w * 0.2, 90)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(allDone ? '🏆' : '😢', w / 2, h * 0.18);

      // Title
      ctx.font = `bold ${Math.min(w * 0.08, 38)}px sans-serif`;
      ctx.fillStyle = allDone ? '#FFD700' : '#E74C3C';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(allDone ? '모든 레시피 완성!' : '게임 오버!', w / 2, h * 0.32);

      // Stats card
      const cardY = h * 0.36;
      const cardH2 = h * 0.3;
      ctx.save();
      ctx.shadowColor = char.color + '30';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#FFFFFF';
      rr(24, cardY, w - 48, cardH2, 20);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = char.color + '60';
      ctx.lineWidth = 2;
      rr(24, cardY, w - 48, cardH2, 20);
      ctx.stroke();

      const lh = cardH2 / 4.5;
      ctx.font = `${Math.min(w * 0.047, 22)}px sans-serif`;
      ctx.fillStyle = '#555';
      ctx.textAlign = 'center';
      ctx.fillText(`🍳 완성한 레시피: ${completed}개 / ${RECIPES.length}개`, w / 2, cardY + lh);
      ctx.fillText(`💰 최종 점수: ${score}점`, w / 2, cardY + lh * 2);
      ctx.fillText(`${char.heart} 캐릭터: ${char.name} ${char.emoji}`, w / 2, cardY + lh * 3);
      ctx.fillText(
        completed >= 8 ? '⭐ 요리왕!' : completed >= 5 ? '👨‍🍳 주방장!' : '🥄 견습생!',
        w / 2,
        cardY + lh * 4,
      );

      // Retry button
      const btnW = w * 0.55;
      const btnH = 56;
      const btnX = w / 2 - btnW / 2;
      const btnY2 = h * 0.76 - btnH / 2;
      ctx.save();
      ctx.shadowColor = char.color + '50';
      ctx.shadowBlur = 14;
      ctx.fillStyle = char.color;
      rr(btnX, btnY2, btnW, btnH, 28);
      ctx.fill();
      ctx.restore();
      ctx.font = `bold ${Math.min(w * 0.053, 24)}px sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText('다시 도전! 🔄', w / 2, btnY2 + btnH * 0.62);

      drawBackBtn();
    };

    // ── Main loop ─────────────────────────────────────────────────────────────
    const loop = (time: number) => {
      frameTime = time / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();

      if (phase === 'select') {
        drawSelectScreen();
      } else if (phase === 'playing' || phase === 'reaction') {
        drawPlayingScreen();
      } else if (phase === 'gameover') {
        drawGameoverScreen();
      }

      // Flying ingredients
      flyingRef.current = flyingRef.current.filter(f => !f.done);
      flyingRef.current.forEach(f => {
        const dx = f.tx - f.x;
        const dy = f.ty - f.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 6) {
          f.done = true;
          return;
        }
        f.x += dx * 0.14;
        f.y += dy * 0.14;
        f.scale *= 0.97;
        ctx.save();
        ctx.globalAlpha = f.alpha;
        ctx.font = `${36 * f.scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(f.emoji, f.x, f.y);
        ctx.restore();
      });

      // Sparkles
      sparklesRef.current = sparklesRef.current.filter(s => s.alpha > 0.01);
      sparklesRef.current.forEach(s => {
        s.x += Math.cos(s.angle) * s.speed;
        s.y += Math.sin(s.angle) * s.speed + 0.4;
        s.alpha *= 0.95;
        s.size *= 0.97;
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        const sp = 4;
        const or = s.size;
        const ir = s.size * 0.4;
        for (let k = 0; k < sp * 2; k++) {
          const r2 = k % 2 === 0 ? or : ir;
          const a2 = (k * Math.PI) / sp - Math.PI / 2;
          if (k === 0) ctx.moveTo(s.x + r2 * Math.cos(a2), s.y + r2 * Math.sin(a2));
          else ctx.lineTo(s.x + r2 * Math.cos(a2), s.y + r2 * Math.sin(a2));
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });

      // Floating texts
      floatingTextsRef.current = floatingTextsRef.current.filter(t => t.alpha > 0.01);
      floatingTextsRef.current.forEach(t => {
        t.y += t.vy;
        t.alpha *= 0.96;
        ctx.save();
        ctx.globalAlpha = t.alpha;
        ctx.font = `bold ${t.size}px sans-serif`;
        ctx.fillStyle = t.color;
        ctx.textAlign = 'center';
        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
      });

      // Decay
      charBounceRef.current *= 0.88;
      if (charBounceRef.current < 0.1) charBounceRef.current = 0;
      shakeBtnsRef.current = shakeBtnsRef.current
        .map(s => ({ ...s, amount: s.amount * 0.82 }))
        .filter(s => s.amount > 0.1);

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animFrameRef.current);
    };
    // Re-mount render loop whenever displayed state changes
  }, [phase, selectedChar, recipeIdx, stepIdx, shuffledIngredients, hearts, score, timeLeft, reactionMsg]);

  // Cleanup
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        cursor: 'pointer',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    />
  );
}
