'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { saveScore } from '@/lib/ranking';

// ─── Types ───────────────────────────────────────────────────────────
interface Character {
  name: string;
  emoji: string;
  color: string;
  heart: string;
}

interface Question {
  text: string;
  answer: boolean; // true = O, false = X
  explanation: string;
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

interface FloatingText {
  text: string;
  x: number;
  y: number;
  alpha: number;
  vy: number;
  color: string;
  size: number;
}

type GamePhase = 'select' | 'playing' | 'result';

// ─── Data ────────────────────────────────────────────────────────────
const CHARACTERS: Character[] = [
  { name: '승민', emoji: '🤖', color: '#3B82F6', heart: '💙' },
  { name: '건우', emoji: '🩺', color: '#10B981', heart: '💚' },
  { name: '강우', emoji: '👨‍🍳', color: '#F59E0B', heart: '🧡' },
  { name: '수현', emoji: '💃', color: '#EC4899', heart: '💗' },
  { name: '이현', emoji: '👸', color: '#FF69B4', heart: '💖' },
];

const QUESTIONS: Question[] = [
  { text: '7 + 8 = 16이다', answer: false, explanation: '7 + 8 = 15예요! 하나 더 빼야 해요~' },
  { text: '무지개는 빨주노초파남보 7가지 색이다', answer: true, explanation: '맞아요! 빨강-주황-노랑-초록-파랑-남색-보라!' },
  { text: '대한민국의 수도는 서울이다', answer: true, explanation: '맞아요! 서울은 우리나라의 수도예요!' },
  { text: '식물은 햇빛으로 양분을 만든다', answer: true, explanation: '광합성이라고 해요! 식물의 밥 만들기~' },
  { text: '"Apple"은 한국어로 바나나이다', answer: false, explanation: 'Apple은 사과예요! Banana가 바나나!' },
  { text: '물은 100도에서 끓는다', answer: true, explanation: '맞아요! 섭씨 100도에서 물이 끓어요!' },
  { text: '지구는 태양 주위를 돈다', answer: true, explanation: '맞아요! 1년에 한 바퀴 돌아요~' },
  { text: '삼각형의 꼭짓점은 4개이다', answer: false, explanation: '삼각형은 꼭짓점이 3개예요! 삼(3)각형이니까~' },
  { text: '한글을 만든 사람은 세종대왕이다', answer: true, explanation: '세종대왕님이 훈민정음을 만드셨어요!' },
  { text: '곤충의 다리는 6개이다', answer: true, explanation: '맞아요! 곤충은 다리가 항상 6개!' },
  { text: '1시간은 100분이다', answer: false, explanation: '1시간은 60분이에요! 100분이 아니에요~' },
  { text: '"고맙습니다"를 영어로 하면 "Thank you"이다', answer: true, explanation: '맞아요! Thank you = 고맙습니다!' },
  { text: '바다의 물은 짠맛이 난다', answer: true, explanation: '맞아요! 바닷물에는 소금이 녹아 있어요!' },
  { text: '5 × 3 = 15이다', answer: true, explanation: '맞아요! 5를 3번 더하면 15!' },
  { text: '펭귄은 새가 아니다', answer: false, explanation: '펭귄은 새 맞아요! 날지 못하는 새예요~' },
  { text: '우리 몸에서 가장 큰 뼈는 다리뼈이다', answer: true, explanation: '넓적다리뼈(대퇴골)가 가장 커요!' },
  { text: '독도는 우리나라 땅이다', answer: true, explanation: '맞아요! 독도는 대한민국의 아름다운 섬이에요!' },
  { text: '"Dog"은 한국어로 고양이이다', answer: false, explanation: 'Dog은 강아지예요! Cat이 고양이!' },
  { text: '사계절은 봄여름가을겨울 4개이다', answer: true, explanation: '맞아요! 봄→여름→가을→겨울 4계절!' },
  { text: '12 ÷ 4 = 4이다', answer: false, explanation: '12 ÷ 4 = 3이에요! 12를 4로 나누면 3!' },
  { text: '달은 스스로 빛을 낸다', answer: false, explanation: '달은 태양빛을 반사하는 거예요!' },
  { text: '김치는 한국의 전통 음식이다', answer: true, explanation: '맞아요! 김치는 우리나라의 자랑스러운 음식!' },
  { text: '공룡은 지금도 살아있다', answer: false, explanation: '공룡은 약 6500만 년 전에 멸종했어요!' },
  { text: '1 킬로미터는 1000 미터이다', answer: true, explanation: '맞아요! 킬로(kilo)는 1000이라는 뜻!' },
  { text: '태양계에서 가장 큰 행성은 목성이다', answer: true, explanation: '목성(Jupiter)은 태양계에서 가장 커요!' },
];

const STREAK_MESSAGES: Record<number, string> = {
  3: '연속 3개! 대단해! 🔥',
  5: '연속 5개! 천재다! ⭐',
  7: '연속 7개! 레전드! 👑',
  10: '연속 10개! 신이야?! 🌟',
};

const CORRECT_MESSAGES = ['정답! 🎉', '맞아요! 👏', '천재! 🌟', '대박! ✨', '완벽해! 💯'];
const WRONG_MESSAGES = ['아쉽다~ 😢', '다음엔 맞히자! 💪', '괜찮아! 😊', '힘내! 🍀'];

const TIMER_SECONDS = 20;
const TOTAL_QUESTIONS = 10;

// ─── Audio ───────────────────────────────────────────────────────────
function createAudioContext(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch {
    return null;
  }
}

function playCorrectSound(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(523, ctx.currentTime);
  osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
  osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
}

function playWrongSound(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.setValueAtTime(150, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
}

function playStreakFanfare(ctx: AudioContext) {
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.3);
    osc.start(ctx.currentTime + i * 0.12);
    osc.stop(ctx.currentTime + i * 0.12 + 0.3);
  });
}

function playTickSound(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.05);
}

// ─── Component ───────────────────────────────────────────────────────
export default function QuizBattlePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Game state
  const [phase, setPhase] = useState<GamePhase>('select');
  const [selectedChar, setSelectedChar] = useState<number>(-1);
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [answered, setAnswered] = useState(false);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [feedbackText, setFeedbackText] = useState('');

  // Animation state refs
  const sparklesRef = useRef<Sparkle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const animFrameRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const charBounceRef = useRef(0);
  const shakeRef = useRef(0);
  const hoverCharRef = useRef(-1);

  // Shuffle and pick questions
  const initQuestions = useCallback(() => {
    const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5);
    setQuestions(shuffled.slice(0, TOTAL_QUESTIONS));
  }, []);

  // Ensure audio context
  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = createAudioContext();
    }
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Add sparkles
  const addSparkles = useCallback((cx: number, cy: number, count: number, color?: string) => {
    const colors = color ? [color] : ['#FFD700', '#FF6B6B', '#4ECDC4', '#A78BFA', '#FB7185'];
    for (let i = 0; i < count; i++) {
      sparklesRef.current.push({
        x: cx,
        y: cy,
        size: 2 + Math.random() * 4,
        alpha: 1,
        speed: 1 + Math.random() * 3,
        angle: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }, []);

  // Add floating text
  const addFloatingText = useCallback((text: string, x: number, y: number, color: string, size = 24) => {
    floatingTextsRef.current.push({ text, x, y, alpha: 1, vy: -2, color, size });
  }, []);

  // Start timer
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(TIMER_SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Time's up - give half points as consolation
          setAnswered(true);
          setLastCorrect(null);
          setShowExplanation(true);
          setStreak(0);
          setScore(s => s + 50);
          setFeedbackText('시간 초과! 반반 점수! ⏰');
          shakeRef.current = 6;
          return 0;
        }
        if (prev <= 4) {
          const ctx = audioCtxRef.current;
          if (ctx) playTickSound(ctx);
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Handle answer
  const handleAnswer = useCallback((playerAnswer: boolean) => {
    if (answered || phase !== 'playing' || currentQ >= questions.length) return;

    const ctx = ensureAudio();
    setAnswered(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const correct = playerAnswer === questions[currentQ].answer;
    setLastCorrect(correct);
    setShowExplanation(true);

    if (correct) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      setBestStreak(prev => Math.max(prev, newStreak));
      const bonus = newStreak >= 7 ? 3 : newStreak >= 5 ? 2 : newStreak >= 3 ? 1.5 : 1;
      const points = Math.round(100 * bonus);
      setScore(prev => prev + points);
      setFeedbackText(CORRECT_MESSAGES[Math.floor(Math.random() * CORRECT_MESSAGES.length)]);

      if (ctx) playCorrectSound(ctx);

      const canvas = canvasRef.current;
      if (canvas) {
        addSparkles(canvas.width / 2, canvas.height / 2, 30);
      }

      // Streak bonus
      if (STREAK_MESSAGES[newStreak]) {
        if (ctx) playStreakFanfare(ctx);
        setFeedbackText(STREAK_MESSAGES[newStreak]);
        const canvas = canvasRef.current;
        if (canvas) {
          addSparkles(canvas.width / 2, canvas.height / 3, 50, '#FFD700');
          addFloatingText(STREAK_MESSAGES[newStreak], canvas.width / 2, canvas.height / 3, '#FFD700', 32);
        }
      }

      charBounceRef.current = 15;
    } else {
      setStreak(0);
      setFeedbackText(WRONG_MESSAGES[Math.floor(Math.random() * WRONG_MESSAGES.length)]);
      if (ctx) playWrongSound(ctx);
      shakeRef.current = 10;
    }
  }, [answered, phase, currentQ, questions, streak, ensureAudio, addSparkles, addFloatingText]);

  // Next question
  const nextQuestion = useCallback(() => {
    const next = currentQ + 1;
    if (next >= questions.length) {
      setPhase('result');
      if (timerRef.current) clearInterval(timerRef.current);
      if (selectedChar >= 0) saveScore('quiz', CHARACTERS[selectedChar].name, score);
    } else {
      setCurrentQ(next);
      setAnswered(false);
      setLastCorrect(null);
      setShowExplanation(false);
      setFeedbackText('');
      startTimer();
    }
  }, [currentQ, questions.length, startTimer, selectedChar, score]);

  // Start game
  const startGame = useCallback((charIndex: number) => {
    ensureAudio();
    setSelectedChar(charIndex);
    setPhase('playing');
    setCurrentQ(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setAnswered(false);
    setLastCorrect(null);
    setShowExplanation(false);
    setFeedbackText('');
    initQuestions();
    startTimer();
  }, [ensureAudio, initQuestions, startTimer]);

  // Get grade
  const getGrade = useCallback(() => {
    const maxScore = questions.length * 300; // theoretical max with all streak bonuses
    const pct = score / Math.max(maxScore, 1);
    if (pct >= 0.7) return { grade: 'S', label: '완전 천재! 퀴즈왕! 👑', color: '#FFD700' };
    if (pct >= 0.5) return { grade: 'A', label: '정말 잘했어요! 🌟', color: '#FF6B6B' };
    if (pct >= 0.3) return { grade: 'B', label: '잘했어요! 짱이에요! ✨', color: '#4ECDC4' };
    if (pct >= 0.15) return { grade: 'C', label: '좋은 시도! 파이팅! 💪', color: '#A78BFA' };
    return { grade: 'D', label: '다음엔 더 잘할 수 있어! 🍀', color: '#94A3B8' };
  }, [questions.length, score]);

  // ─── Canvas click handling ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if ('touches' in e) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    };

    const handleClick = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const { x, y } = getPos(e);
      const W = canvas.width;
      const H = canvas.height;

      if (phase === 'select') {
        // Character selection
        const cardW = W * 0.4;
        const cardH = H * 0.18;
        const startY = H * 0.3;
        const gap = H * 0.02;

        for (let i = 0; i < CHARACTERS.length; i++) {
          const row = Math.floor(i / 2);
          const col = i % 2;
          const cx = col === 0 ? W * 0.27 : W * 0.73;
          const cy = startY + row * (cardH + gap) + cardH / 2;

          if (x >= cx - cardW / 2 && x <= cx + cardW / 2 && y >= cy - cardH / 2 && y <= cy + cardH / 2) {
            startGame(i);
            return;
          }
        }

        // Back button
        if (x <= 100 && y <= 60) {
          window.location.href = '/';
          return;
        }
      } else if (phase === 'playing') {
        // Back button
        if (x <= 100 && y <= 60) {
          if (timerRef.current) clearInterval(timerRef.current);
          setPhase('select');
          return;
        }

        if (showExplanation) {
          // Tap to continue
          nextQuestion();
          return;
        }

        if (!answered) {
          // O button (left)
          const btnY = H * 0.75;
          const btnR = Math.min(W * 0.2, 100);
          const oX = W * 0.3;
          const xX = W * 0.7;

          const distO = Math.sqrt((x - oX) ** 2 + (y - btnY) ** 2);
          const distX = Math.sqrt((x - xX) ** 2 + (y - btnY) ** 2);

          if (distO < btnR + 20) {
            handleAnswer(true);
          } else if (distX < btnR + 20) {
            handleAnswer(false);
          }
        }
      } else if (phase === 'result') {
        // Retry button
        const btnW = W * 0.5;
        const btnH = 60;
        const btnX = W / 2;
        const btnY = H * 0.78;
        if (x >= btnX - btnW / 2 && x <= btnX + btnW / 2 && y >= btnY - btnH / 2 && y <= btnY + btnH / 2) {
          setPhase('select');
          return;
        }

        // Back button
        if (x <= 100 && y <= 60) {
          window.location.href = '/';
          return;
        }
      }
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (phase !== 'select') return;
      const { x, y } = getPos(e);
      const W = canvas.width;
      const H = canvas.height;
      const cardW = W * 0.4;
      const cardH = H * 0.18;
      const startY = H * 0.3;
      const gap = H * 0.02;

      hoverCharRef.current = -1;
      for (let i = 0; i < CHARACTERS.length; i++) {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const cx = col === 0 ? W * 0.27 : W * 0.73;
        const cy = startY + row * (cardH + gap) + cardH / 2;
        if (x >= cx - cardW / 2 && x <= cx + cardW / 2 && y >= cy - cardH / 2 && y <= cy + cardH / 2) {
          hoverCharRef.current = i;
        }
      }
    };

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', handleClick, { passive: false });
    canvas.addEventListener('mousemove', handleMove);

    return () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('touchstart', handleClick);
      canvas.removeEventListener('mousemove', handleMove);
    };
  }, [phase, answered, showExplanation, handleAnswer, nextQuestion, startGame]);

  // ─── Main render loop ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    let frameTime = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    // ─── Drawing helpers ───
    const drawRoundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx2d.beginPath();
      ctx2d.moveTo(x + r, y);
      ctx2d.lineTo(x + w - r, y);
      ctx2d.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx2d.lineTo(x + w, y + h - r);
      ctx2d.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx2d.lineTo(x + r, y + h);
      ctx2d.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx2d.lineTo(x, y + r);
      ctx2d.quadraticCurveTo(x, y, x + r, y);
      ctx2d.closePath();
    };

    const drawBackButton = () => {
      ctx2d.save();
      // Pill background
      ctx2d.shadowColor = '#F9A8D440';
      ctx2d.shadowBlur = 8;
      ctx2d.fillStyle = '#FDE8F5';
      drawRoundRect(8, 12, 76, 32, 16);
      ctx2d.fill();
      ctx2d.shadowColor = 'transparent';
      ctx2d.strokeStyle = '#F9A8D4';
      ctx2d.lineWidth = 1.5;
      drawRoundRect(8, 12, 76, 32, 16);
      ctx2d.stroke();
      ctx2d.font = 'bold 16px sans-serif';
      ctx2d.fillStyle = '#E91E8C';
      ctx2d.textAlign = 'left';
      ctx2d.fillText('🏠 홈', 18, 33);
      ctx2d.restore();
    };

    const drawCharacter = (emoji: string, x: number, y: number, size: number, bounce = 0) => {
      ctx2d.save();
      ctx2d.font = `${size}px sans-serif`;
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'middle';
      ctx2d.fillText(emoji, x, y - bounce);
      ctx2d.restore();
    };

    // ─── Select screen ───
    const drawSelectScreen = () => {
      // Background gradient
      const grad = ctx2d.createLinearGradient(0, 0, W(), H());
      grad.addColorStop(0, '#FFE8F5');
      grad.addColorStop(0.5, '#E8F0FF');
      grad.addColorStop(1, '#FFF0E8');
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(0, 0, W(), H());

      // Title
      ctx2d.save();
      ctx2d.font = `bold ${Math.min(W() * 0.08, 40)}px sans-serif`;
      ctx2d.textAlign = 'center';
      ctx2d.fillStyle = '#E91E8C';
      ctx2d.fillText('퀴즈 대결! OX', W() / 2, H() * 0.1);

      ctx2d.font = `${Math.min(W() * 0.045, 22)}px sans-serif`;
      ctx2d.fillStyle = '#9B59B6';
      ctx2d.fillText('캐릭터를 선택하세요!', W() / 2, H() * 0.18);
      ctx2d.restore();

      // Character cards
      const cardW = W() * 0.4;
      const cardH = H() * 0.18;
      const startY = H() * 0.3;
      const gap = H() * 0.02;

      CHARACTERS.forEach((char, i) => {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const cx = col === 0 ? W() * 0.27 : W() * 0.73;
        const cy = startY + row * (cardH + gap) + cardH / 2;

        const isHover = hoverCharRef.current === i;
        const scale = isHover ? 1.05 : 1;
        const w = cardW * scale;
        const h = cardH * scale;

        // Card shadow
        ctx2d.save();
        ctx2d.shadowColor = char.color + '40';
        ctx2d.shadowBlur = isHover ? 20 : 10;
        ctx2d.shadowOffsetY = 4;

        // Card bg - pastel tint based on character color
        const pastelBgs = ['#F8F0FF', '#EEF5FF', '#FFF0F8', '#EDFFF5'];
        ctx2d.fillStyle = isHover ? '#FFFFFF' : pastelBgs[i] || '#FAFAFA';
        drawRoundRect(cx - w / 2, cy - h / 2, w, h, 20);
        ctx2d.fill();

        // Border
        ctx2d.strokeStyle = char.color + (isHover ? 'FF' : 'AA');
        ctx2d.lineWidth = isHover ? 3 : 1.5;
        drawRoundRect(cx - w / 2, cy - h / 2, w, h, 20);
        ctx2d.stroke();
        ctx2d.restore();

        // Emoji
        const emojiSize = Math.min(w * 0.25, 48);
        ctx2d.font = `${emojiSize}px sans-serif`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText(char.emoji, cx, cy - h * 0.1);

        // Name
        ctx2d.font = `bold ${Math.min(w * 0.12, 18)}px sans-serif`;
        ctx2d.fillStyle = char.color;
        ctx2d.fillText(`${char.heart} ${char.name}`, cx, cy + h * 0.3);
      });

      drawBackButton();
    };

    // ─── Playing screen ───
    const drawPlayingScreen = () => {
      const w = W();
      const h = H();
      const q = questions[currentQ];
      if (!q) return;

      const char = CHARACTERS[selectedChar];
      const shakeX = shakeRef.current > 0 ? (Math.random() - 0.5) * shakeRef.current : 0;

      ctx2d.save();
      ctx2d.translate(shakeX, 0);

      // Background - soft pastel
      const grad = ctx2d.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#FDF0FF');
      grad.addColorStop(0.5, '#F0F4FF');
      grad.addColorStop(1, '#F0FFF4');
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(-10, 0, w + 20, h);

      // Top bar - score & streak
      ctx2d.fillStyle = '#FFFFFF';
      drawRoundRect(10, 8, w - 20, 50, 12);
      ctx2d.fill();
      ctx2d.shadowColor = 'transparent';

      ctx2d.font = `bold ${Math.min(w * 0.04, 18)}px sans-serif`;
      ctx2d.textAlign = 'left';
      ctx2d.fillStyle = char.color;
      ctx2d.fillText(`${char.heart} ${char.name}`, 70, 38);

      ctx2d.textAlign = 'center';
      ctx2d.fillStyle = '#E91E8C';
      ctx2d.fillText(`점수: ${score}`, w / 2, 38);

      ctx2d.textAlign = 'right';
      ctx2d.fillStyle = streak >= 3 ? '#FF6B6B' : '#64748B';
      ctx2d.fillText(streak > 0 ? `🔥 연속 ${streak}개` : '', w - 20, 38);

      // Question counter
      ctx2d.font = `${Math.min(w * 0.035, 15)}px sans-serif`;
      ctx2d.textAlign = 'center';
      ctx2d.fillStyle = '#94A3B8';
      ctx2d.fillText(`문제 ${currentQ + 1} / ${questions.length}`, w / 2, 78);

      // Timer bar
      const timerW = w - 60;
      const timerH = 8;
      const timerY = 88;
      ctx2d.fillStyle = '#E2E8F0';
      drawRoundRect(30, timerY, timerW, timerH, 4);
      ctx2d.fill();

      const timerFill = (timeLeft / TIMER_SECONDS) * timerW;
      ctx2d.fillStyle = timeLeft <= 5 ? '#FB7185' : timeLeft <= 10 ? '#FBBF24' : '#4ADE80';
      drawRoundRect(30, timerY, Math.max(timerFill, 0), timerH, 4);
      ctx2d.fill();

      // Timer text
      ctx2d.font = `bold ${Math.min(w * 0.04, 18)}px sans-serif`;
      ctx2d.fillStyle = timeLeft <= 5 ? '#FB7185' : '#64748B';
      ctx2d.fillText(`${timeLeft}초`, w / 2, timerY + 28);

      // Character
      const charY = h * 0.22;
      const bounce = charBounceRef.current;
      const charEmoji = answered
        ? (lastCorrect ? '🎉' : '😢')
        : char.emoji;
      drawCharacter(charEmoji, w / 2, charY, Math.min(w * 0.15, 64), bounce);

      // Question box
      const qBoxY = h * 0.30;
      const qBoxH = h * 0.18;
      const qBoxW = w - 40;

      ctx2d.save();
      ctx2d.shadowColor = char.color + '30';
      ctx2d.shadowBlur = 20;
      ctx2d.shadowOffsetY = 6;
      ctx2d.fillStyle = '#FFFBFF';
      drawRoundRect(20, qBoxY, qBoxW, qBoxH, 22);
      ctx2d.fill();
      ctx2d.restore();

      ctx2d.strokeStyle = char.color + '70';
      ctx2d.lineWidth = 2.5;
      drawRoundRect(20, qBoxY, qBoxW, qBoxH, 22);
      ctx2d.stroke();

      // Question text (wrap if needed)
      ctx2d.font = `bold ${Math.min(w * 0.05, 24)}px sans-serif`;
      ctx2d.fillStyle = '#1E293B';
      ctx2d.textAlign = 'center';

      const maxTextW = qBoxW - 40;
      const words = q.text.split('');
      let lines: string[] = [];
      let currentLine = '';
      for (const ch of words) {
        const test = currentLine + ch;
        if (ctx2d.measureText(test).width > maxTextW) {
          lines.push(currentLine);
          currentLine = ch;
        } else {
          currentLine = test;
        }
      }
      if (currentLine) lines.push(currentLine);

      const lineH = Math.min(w * 0.06, 30);
      const textStartY = qBoxY + qBoxH / 2 - ((lines.length - 1) * lineH) / 2;
      lines.forEach((line, i) => {
        ctx2d.fillText(line, w / 2, textStartY + i * lineH);
      });

      // O/X label
      ctx2d.font = `bold ${Math.min(w * 0.04, 18)}px sans-serif`;
      ctx2d.fillStyle = '#94A3B8';
      ctx2d.fillText('O / X ?', w / 2, qBoxY + qBoxH + 20);

      // O and X buttons
      if (!answered) {
        const btnY = h * 0.75;
        const btnR = Math.min(w * 0.2, 100);

        // O button
        const oX = w * 0.3;
        ctx2d.save();
        ctx2d.shadowColor = '#4ADE8060';
        ctx2d.shadowBlur = 20;
        ctx2d.beginPath();
        ctx2d.arc(oX, btnY, btnR, 0, Math.PI * 2);
        ctx2d.fillStyle = '#4ADE80';
        ctx2d.fill();
        ctx2d.restore();

        ctx2d.beginPath();
        ctx2d.arc(oX, btnY, btnR - 4, 0, Math.PI * 2);
        ctx2d.strokeStyle = '#FFFFFF50';
        ctx2d.lineWidth = 4;
        ctx2d.stroke();

        ctx2d.font = `bold ${btnR * 0.8}px sans-serif`;
        ctx2d.fillStyle = '#FFFFFF';
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('O', oX, btnY);

        // X button
        const xX = w * 0.7;
        ctx2d.save();
        ctx2d.shadowColor = '#FB718560';
        ctx2d.shadowBlur = 20;
        ctx2d.beginPath();
        ctx2d.arc(xX, btnY, btnR, 0, Math.PI * 2);
        ctx2d.fillStyle = '#FB7185';
        ctx2d.fill();
        ctx2d.restore();

        ctx2d.beginPath();
        ctx2d.arc(xX, btnY, btnR - 4, 0, Math.PI * 2);
        ctx2d.strokeStyle = '#FFFFFF50';
        ctx2d.lineWidth = 4;
        ctx2d.stroke();

        ctx2d.font = `bold ${btnR * 0.8}px sans-serif`;
        ctx2d.fillStyle = '#FFFFFF';
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('X', xX, btnY);
      }

      // Feedback & explanation overlay
      if (answered && showExplanation) {
        // Dim overlay - softer
        ctx2d.fillStyle = 'rgba(80,20,80,0.18)';
        ctx2d.fillRect(-10, h * 0.55, w + 20, h * 0.45);

        // Feedback box
        const fbY = h * 0.58;
        const fbH = h * 0.35;
        const isTimeout = lastCorrect === null;
        ctx2d.save();
        ctx2d.shadowColor = lastCorrect ? '#4ADE8040' : isTimeout ? '#FBBF2440' : '#FB718540';
        ctx2d.shadowBlur = 18;
        ctx2d.fillStyle = lastCorrect ? '#F0FFF8' : isTimeout ? '#FFFBEB' : '#FFF0F5';
        drawRoundRect(20, fbY, w - 40, fbH, 22);
        ctx2d.fill();
        ctx2d.restore();
        ctx2d.strokeStyle = lastCorrect ? '#4ADE80' : isTimeout ? '#FBBF24' : '#FB7185';
        ctx2d.lineWidth = 2.5;
        drawRoundRect(20, fbY, w - 40, fbH, 22);
        ctx2d.stroke();

        // Big O or X
        ctx2d.font = `bold ${Math.min(w * 0.15, 60)}px sans-serif`;
        ctx2d.textAlign = 'center';
        ctx2d.fillStyle = lastCorrect ? '#4ADE80' : isTimeout ? '#FBBF24' : '#FB7185';
        ctx2d.fillText(
          isTimeout ? '⏰ 시간 초과!' : q.answer ? 'O 정답!' : 'X 정답!',
          w / 2,
          fbY + fbH * 0.2,
        );

        // Feedback text
        ctx2d.font = `bold ${Math.min(w * 0.05, 22)}px sans-serif`;
        ctx2d.fillStyle = lastCorrect ? '#4ADE80' : isTimeout ? '#F59E0B' : '#FB7185';
        ctx2d.fillText(feedbackText, w / 2, fbY + fbH * 0.4);

        // Explanation
        ctx2d.font = `${Math.min(w * 0.04, 18)}px sans-serif`;
        ctx2d.fillStyle = '#475569';
        ctx2d.fillText(q.explanation, w / 2, fbY + fbH * 0.6);

        // Tap to continue
        ctx2d.font = `${Math.min(w * 0.035, 16)}px sans-serif`;
        ctx2d.fillStyle = '#94A3B8';
        const tapAlpha = 0.5 + 0.5 * Math.sin(frameTime * 3);
        ctx2d.globalAlpha = tapAlpha;
        ctx2d.fillText('탭하면 다음 문제! 👆', w / 2, fbY + fbH * 0.82);
        ctx2d.globalAlpha = 1;
      }

      ctx2d.restore(); // end shake transform

      drawBackButton();
    };

    // ─── Result screen ───
    const drawResultScreen = () => {
      const w = W();
      const h = H();
      const char = CHARACTERS[selectedChar];
      const gradeInfo = getGrade();

      // Background - cute pastel gradient
      const grad = ctx2d.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#FFE8F5');
      grad.addColorStop(0.4, '#EEE8FF');
      grad.addColorStop(0.7, '#E8F4FF');
      grad.addColorStop(1, '#E8FFF4');
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(0, 0, w, h);

      // Title
      ctx2d.font = `bold ${Math.min(w * 0.08, 36)}px sans-serif`;
      ctx2d.textAlign = 'center';
      ctx2d.fillStyle = '#E91E8C';
      ctx2d.fillText('퀴즈 결과! 🏆', w / 2, h * 0.08);

      // Character - bigger on result screen
      drawCharacter(char.emoji, w / 2, h * 0.17, Math.min(w * 0.22, 88), charBounceRef.current);

      // Grade circle
      const gradeY = h * 0.32;
      const gradeR = Math.min(w * 0.14, 65);

      ctx2d.save();
      ctx2d.shadowColor = gradeInfo.color + '60';
      ctx2d.shadowBlur = 25;
      ctx2d.beginPath();
      ctx2d.arc(w / 2, gradeY, gradeR, 0, Math.PI * 2);
      ctx2d.fillStyle = gradeInfo.color;
      ctx2d.fill();
      ctx2d.restore();

      ctx2d.font = `bold ${gradeR * 1.1}px sans-serif`;
      ctx2d.fillStyle = '#FFFFFF';
      ctx2d.textBaseline = 'middle';
      ctx2d.fillText(gradeInfo.grade, w / 2, gradeY);
      ctx2d.textBaseline = 'alphabetic';

      ctx2d.font = `bold ${Math.min(w * 0.05, 22)}px sans-serif`;
      ctx2d.fillStyle = gradeInfo.color;
      ctx2d.fillText(gradeInfo.label, w / 2, gradeY + gradeR + 30);

      // Stats box
      const statsY = h * 0.52;
      const statsH = h * 0.2;
      ctx2d.fillStyle = '#FFFFFF';
      drawRoundRect(30, statsY, w - 60, statsH, 16);
      ctx2d.fill();
      ctx2d.strokeStyle = char.color + '40';
      ctx2d.lineWidth = 2;
      ctx2d.stroke();

      const statsFont = `${Math.min(w * 0.042, 19)}px sans-serif`;
      ctx2d.font = statsFont;
      ctx2d.fillStyle = '#475569';
      const lineGap = statsH / 5;
      ctx2d.fillText(`💰 총 점수: ${score}점`, w / 2, statsY + lineGap * 1.2);
      ctx2d.fillText(`✅ 맞힌 문제: 계산중...`, w / 2, statsY + lineGap * 2.2);
      ctx2d.fillText(`🔥 최고 연속 정답: ${bestStreak}개`, w / 2, statsY + lineGap * 3.2);
      ctx2d.fillText(`${char.heart} 캐릭터: ${char.name} ${char.emoji}`, w / 2, statsY + lineGap * 4.2);

      // Retry button
      const btnY = h * 0.78;
      const btnW = w * 0.5;
      const btnH2 = 54;

      ctx2d.save();
      ctx2d.shadowColor = char.color + '40';
      ctx2d.shadowBlur = 15;
      ctx2d.fillStyle = char.color;
      drawRoundRect(w / 2 - btnW / 2, btnY - btnH2 / 2, btnW, btnH2, 27);
      ctx2d.fill();
      ctx2d.restore();

      ctx2d.font = `bold ${Math.min(w * 0.05, 22)}px sans-serif`;
      ctx2d.fillStyle = '#FFFFFF';
      ctx2d.fillText('다시 도전! 🔄', w / 2, btnY + 7);

      drawBackButton();
    };

    // ─── Animation loop ───
    const animate = (time: number) => {
      frameTime = time / 1000;
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);

      ctx2d.save();

      if (phase === 'select') {
        drawSelectScreen();
      } else if (phase === 'playing') {
        drawPlayingScreen();
      } else if (phase === 'result') {
        drawResultScreen();
      }

      // Update and draw sparkles
      sparklesRef.current = sparklesRef.current.filter(s => s.alpha > 0.01);
      sparklesRef.current.forEach(s => {
        s.x += Math.cos(s.angle) * s.speed;
        s.y += Math.sin(s.angle) * s.speed + 0.5;
        s.alpha *= 0.96;
        s.size *= 0.98;

        ctx2d.save();
        ctx2d.globalAlpha = s.alpha;
        ctx2d.fillStyle = s.color;
        ctx2d.beginPath();

        // Star shape
        const spikes = 4;
        const outerR = s.size;
        const innerR = s.size * 0.4;
        for (let i = 0; i < spikes * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const a = (i * Math.PI) / spikes - Math.PI / 2;
          if (i === 0) ctx2d.moveTo(s.x + r * Math.cos(a), s.y + r * Math.sin(a));
          else ctx2d.lineTo(s.x + r * Math.cos(a), s.y + r * Math.sin(a));
        }
        ctx2d.closePath();
        ctx2d.fill();
        ctx2d.restore();
      });

      // Update and draw floating texts
      floatingTextsRef.current = floatingTextsRef.current.filter(t => t.alpha > 0.01);
      floatingTextsRef.current.forEach(t => {
        t.y += t.vy;
        t.alpha *= 0.97;

        ctx2d.save();
        ctx2d.globalAlpha = t.alpha;
        ctx2d.font = `bold ${t.size}px sans-serif`;
        ctx2d.fillStyle = t.color;
        ctx2d.textAlign = 'center';
        ctx2d.fillText(t.text, t.x, t.y);
        ctx2d.restore();
      });

      // Decay animations
      if (charBounceRef.current > 0) charBounceRef.current *= 0.9;
      if (charBounceRef.current < 0.1) charBounceRef.current = 0;
      if (shakeRef.current > 0) shakeRef.current *= 0.85;
      if (shakeRef.current < 0.1) shakeRef.current = 0;

      ctx2d.restore();

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animFrameRef.current);
    };
    // We intentionally include all state that affects rendering
  }, [phase, selectedChar, currentQ, score, streak, bestStreak, timeLeft, answered, lastCorrect, showExplanation, questions, feedbackText, getGrade]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

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
