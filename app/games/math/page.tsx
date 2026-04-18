'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { saveScore } from '@/lib/ranking';

// ─── Types ───────────────────────────────────────────────────────────
interface Character {
  name: string;
  color: string;
  emoji: string;
  heart: string;
}

type Difficulty = 'easy' | 'medium' | 'hard';

interface MathProblem {
  display: string;         // primary question text
  subDisplay?: string;     // secondary line (e.g. emoji grid label)
  emojiItems?: string[];   // for counting problems
  fractionN?: number;      // numerator for fraction
  fractionD?: number;      // denominator for fraction
  type: 'text' | 'counting' | 'fraction' | 'comparison';
  correctAnswer: number | string;
  choices: (number | string)[];
  questionText: string;    // plain text for review panel
}

interface MissedProblem {
  questionText: string;
  yourAnswer: number | string;
  correctAnswer: number | string;
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

type GamePhase = 'select' | 'difficulty' | 'playing' | 'result';

// ─── Constants ───────────────────────────────────────────────────────
const CHARACTERS: Character[] = [
  { name: '승민', color: '#3B82F6', emoji: '🤖', heart: '💙' },
  { name: '건우', color: '#10B981', emoji: '🩺', heart: '💚' },
  { name: '강우', color: '#F59E0B', emoji: '👨‍🍳', heart: '🧡' },
  { name: '수현', color: '#EC4899', emoji: '💃', heart: '💗' },
  { name: '이현', color: '#FF69B4', emoji: '👸', heart: '💖' },
  { name: '준영', color: '#6366F1', emoji: '📚', heart: '💜' },
  { name: '준우', color: '#0EA5E9', emoji: '✈️', heart: '💎' },
];

const TOTAL_ROUNDS = 20;

const TIMER: Record<Difficulty, number> = {
  easy: 20,
  medium: 15,
  hard: 12,
};

const DIFF_MULTIPLIER: Record<Difficulty, number> = {
  easy: 1,
  medium: 1.5,
  hard: 2,
};

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: '⭐ 쉬움',
  medium: '⭐⭐ 보통',
  hard: '⭐⭐⭐ 어려움',
};

const DIFF_SUBTITLE: Record<Difficulty, string> = {
  easy: '1학년~2학년 (한 자리 덧셈·뺄셈)',
  medium: '3학년~4학년 (두 자리, 곱셈·나눗셈)',
  hard: '5학년~6학년 (큰 수, 분수, 혼합)',
};

const DIFF_COLOR: Record<Difficulty, string> = {
  easy: '#4ADE80',
  medium: '#FBBF24',
  hard: '#F87171',
};

const COUNTING_EMOJIS = ['🍎', '🍊', '🍋', '🍇', '🍓', '⭐', '🌸', '🦋', '🐶', '🐱'];
const CORRECT_MSGS = ['정답! 🎉', '맞아요! 👏', '천재! 🌟', '완벽해! 💯', '대박! ✨'];
const WRONG_MSGS = ['아쉽다~ 😢', '다음엔 맞히자! 💪', '괜찮아요! 😊', '힘내! 🍀'];

// ─── Random helpers ───────────────────────────────────────────────────
const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uniqueWrongNumbers(correct: number, count: number, spread: number): number[] {
  const wrongs: Set<number> = new Set();
  let attempts = 0;
  while (wrongs.size < count && attempts < 200) {
    attempts++;
    let w = correct + rnd(-spread, spread);
    if (w === correct || w < 0) continue;
    wrongs.add(w);
  }
  // fallback if not enough
  let fallback = 1;
  while (wrongs.size < count) {
    if (fallback !== correct) wrongs.add(fallback);
    fallback++;
  }
  return [...wrongs].slice(0, count);
}

// ─── Problem generators ───────────────────────────────────────────────
function generateEasy(): MathProblem {
  const kind = rnd(0, 2);
  if (kind === 0) {
    // Addition
    const a = rnd(1, 9), b = rnd(1, 9);
    const correct = a + b;
    const wrongs = uniqueWrongNumbers(correct, 3, 3);
    return {
      type: 'text',
      display: `${a} + ${b} = ?`,
      correctAnswer: correct,
      choices: shuffle([correct, ...wrongs]),
      questionText: `${a} + ${b} = ?`,
    };
  } else if (kind === 1) {
    // Subtraction
    const a = rnd(2, 9), b = rnd(1, a - 1);
    const correct = a - b;
    const wrongs = uniqueWrongNumbers(correct, 3, 3);
    return {
      type: 'text',
      display: `${a} - ${b} = ?`,
      correctAnswer: correct,
      choices: shuffle([correct, ...wrongs]),
      questionText: `${a} - ${b} = ?`,
    };
  } else {
    // Counting
    const count = rnd(2, 9);
    const emoji = COUNTING_EMOJIS[rnd(0, COUNTING_EMOJIS.length - 1)];
    const items = Array(count).fill(emoji);
    const wrongs = uniqueWrongNumbers(count, 3, 3);
    return {
      type: 'counting',
      display: '몇 개일까요?',
      emojiItems: items,
      correctAnswer: count,
      choices: shuffle([count, ...wrongs]),
      questionText: `${emoji} ${count}개 세기`,
    };
  }
}

function generateMedium(): MathProblem {
  const kind = rnd(0, 4);
  if (kind === 0) {
    const a = rnd(10, 50), b = rnd(10, 50);
    const correct = a + b;
    const wrongs = uniqueWrongNumbers(correct, 3, 10);
    return {
      type: 'text',
      display: `${a} + ${b} = ?`,
      correctAnswer: correct,
      choices: shuffle([correct, ...wrongs]),
      questionText: `${a} + ${b} = ?`,
    };
  } else if (kind === 1) {
    const b = rnd(10, 40), a = rnd(b + 1, 50);
    const correct = a - b;
    const wrongs = uniqueWrongNumbers(correct, 3, 10);
    return {
      type: 'text',
      display: `${a} - ${b} = ?`,
      correctAnswer: correct,
      choices: shuffle([correct, ...wrongs]),
      questionText: `${a} - ${b} = ?`,
    };
  } else if (kind === 2) {
    const a = rnd(2, 9), b = rnd(1, 9);
    const correct = a * b;
    const wrongs = uniqueWrongNumbers(correct, 3, 8);
    return {
      type: 'text',
      display: `${a} × ${b} = ?`,
      correctAnswer: correct,
      choices: shuffle([correct, ...wrongs]),
      questionText: `${a} × ${b} = ?`,
    };
  } else if (kind === 3) {
    const b = rnd(2, 9), a = b * rnd(1, 9);
    const correct = a / b;
    const wrongs = uniqueWrongNumbers(correct, 3, 5);
    return {
      type: 'text',
      display: `${a} ÷ ${b} = ?`,
      correctAnswer: correct,
      choices: shuffle([correct, ...wrongs]),
      questionText: `${a} ÷ ${b} = ?`,
    };
  } else {
    // Comparison
    const a = rnd(10, 99), b = rnd(10, 99);
    const correct: string = a > b ? '>' : a < b ? '<' : '=';
    const allSymbols: string[] = ['>', '<', '='];
    const wrongs = allSymbols.filter(s => s !== correct);
    return {
      type: 'comparison',
      display: `${a}  ○  ${b}`,
      subDisplay: '○ 안에 알맞은 기호는?',
      correctAnswer: correct,
      choices: shuffle([correct, ...wrongs]),
      questionText: `${a} ○ ${b} (비교 기호)`,
    };
  }
}

function generateHard(): MathProblem {
  const kind = rnd(0, 4);
  if (kind === 0) {
    const a = rnd(2, 12), b = rnd(2, 12);
    const correct = a * b;
    const wrongs = uniqueWrongNumbers(correct, 3, 15);
    return {
      type: 'text',
      display: `${a} × ${b} = ?`,
      correctAnswer: correct,
      choices: shuffle([correct, ...wrongs]),
      questionText: `${a} × ${b} = ?`,
    };
  } else if (kind === 1) {
    const b = rnd(3, 12), a = b * rnd(3, 12);
    const correct = a / b;
    const wrongs = uniqueWrongNumbers(correct, 3, 10);
    return {
      type: 'text',
      display: `${a} ÷ ${b} = ?`,
      correctAnswer: correct,
      choices: shuffle([correct, ...wrongs]),
      questionText: `${a} ÷ ${b} = ?`,
    };
  } else if (kind === 2) {
    // Mixed: a + b × c (order of operations)
    const a = rnd(1, 10), b = rnd(2, 9), c = rnd(2, 9);
    const correct = a + b * c;
    const wrongWithoutOrder = (a + b) * c;
    const wrongs = uniqueWrongNumbers(correct, 2, 15);
    const choices4 = [correct, wrongWithoutOrder, ...wrongs].filter((v, i, arr) => arr.indexOf(v) === i && v >= 0).slice(0, 4);
    while (choices4.length < 4) choices4.push(correct + choices4.length * 3);
    return {
      type: 'text',
      display: `${a} + ${b} × ${c} = ?`,
      subDisplay: '(연산 순서에 주의!)',
      correctAnswer: correct,
      choices: shuffle(choices4),
      questionText: `${a} + ${b} × ${c} = ? (연산 순서)`,
    };
  } else if (kind === 3) {
    // Word problem
    const items = [
      { a: rnd(3, 9), b: rnd(2, 8), nameA: '사과', nameB: '바나나' },
      { a: rnd(4, 9), b: rnd(2, 7), nameA: '연필', nameB: '지우개' },
      { a: rnd(3, 8), b: rnd(3, 8), nameA: '강아지', nameB: '고양이' },
      { a: rnd(5, 12), b: rnd(3, 10), nameA: '별', nameB: '달' },
    ];
    const item = items[rnd(0, items.length - 1)];
    const correct = item.a + item.b;
    const wrongs = uniqueWrongNumbers(correct, 3, 8);
    return {
      type: 'text',
      display: `${item.nameA} ${item.a}개,`,
      subDisplay: `${item.nameB} ${item.b}개. 합하면?`,
      correctAnswer: correct,
      choices: shuffle([correct, ...wrongs]),
      questionText: `${item.nameA} ${item.a}개 + ${item.nameB} ${item.b}개 = ?`,
    };
  } else {
    // Fraction visual
    const d = rnd(2, 8);
    const n = rnd(1, d - 1);
    const correct = `${n}/${d}`;
    const wrongFracs: string[] = [];
    const used = new Set([correct]);
    while (wrongFracs.length < 3) {
      let wn = rnd(1, d), wd = rnd(2, 8);
      if (wn >= wd) wn = wd - 1;
      const wf = `${wn}/${wd}`;
      if (!used.has(wf)) {
        used.add(wf);
        wrongFracs.push(wf);
      }
    }
    return {
      type: 'fraction',
      display: '색칠된 부분은 몇 분의 몇?',
      fractionN: n,
      fractionD: d,
      correctAnswer: correct,
      choices: shuffle([correct, ...wrongFracs]),
      questionText: `분수 시각화: ${n}/${d}`,
    };
  }
}

function generateProblem(difficulty: Difficulty): MathProblem {
  if (difficulty === 'easy') return generateEasy();
  if (difficulty === 'medium') return generateMedium();
  return generateHard();
}

// ─── Audio ───────────────────────────────────────────────────────────
function createAudioCtx(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch {
    return null;
  }
}

function playCorrect(ctx: AudioContext) {
  [523, 659, 784, 1047].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.1);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.25);
    osc.start(ctx.currentTime + i * 0.1);
    osc.stop(ctx.currentTime + i * 0.1 + 0.3);
  });
}

function playWrong(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(160, ctx.currentTime + 0.3);
  g.gain.setValueAtTime(0.2, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.35);
}

function playStreak(ctx: AudioContext) {
  [523, 587, 659, 698, 784, 880, 988, 1047].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.08 + 0.2);
    osc.start(ctx.currentTime + i * 0.08);
    osc.stop(ctx.currentTime + i * 0.08 + 0.22);
  });
}

function playTick(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = 1047;
  g.gain.setValueAtTime(0.07, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.07);
}

function playFanfare(ctx: AudioContext) {
  const melody = [784, 784, 784, 1047, 784, 0, 659, 0, 784];
  const dur = 0.12;
  melody.forEach((freq, i) => {
    if (freq === 0) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.3, ctx.currentTime + i * dur);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * dur + dur * 0.9);
    osc.start(ctx.currentTime + i * dur);
    osc.stop(ctx.currentTime + i * dur + dur);
  });
}

// ─── Component ───────────────────────────────────────────────────────
export default function MathGeniusPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioContext | null>(null);

  // ── state ──
  const [phase, setPhase] = useState<GamePhase>('select');
  const [selectedChar, setSelectedChar] = useState(-1);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [answered, setAnswered] = useState(false);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [chosenAnswer, setChosenAnswer] = useState<number | string | null>(null);
  const [problems, setProblems] = useState<MathProblem[]>([]);
  const [missedProblems, setMissedProblems] = useState<MissedProblem[]>([]);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [showStreakMsg, setShowStreakMsg] = useState('');
  const [scorePopup, setScorePopup] = useState(0);

  // ── animation refs ──
  const sparklesRef = useRef<Sparkle[]>([]);
  const floatTextsRef = useRef<FloatingText[]>([]);
  const animRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const charBounceRef = useRef(0);
  const shakeRef = useRef(0);
  const hoverCharRef = useRef(-1);
  const hoverDiffRef = useRef(-1);
  const hoverChoiceRef = useRef(-1);
  const frameTimeRef = useRef(0);

  // ── helpers ──
  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = createAudioCtx();
    if (audioRef.current?.state === 'suspended') audioRef.current.resume();
    return audioRef.current;
  }, []);

  const addSparkles = useCallback((cx: number, cy: number, n: number, color?: string) => {
    const colors = color ? [color] : ['#FFD700', '#FF6B9D', '#4ECDC4', '#A78BFA', '#FFA07A'];
    for (let i = 0; i < n; i++) {
      sparklesRef.current.push({
        x: cx, y: cy,
        size: 3 + Math.random() * 5,
        alpha: 1,
        speed: 1.5 + Math.random() * 3.5,
        angle: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }, []);

  const addFloat = useCallback((text: string, x: number, y: number, color: string, size = 28) => {
    floatTextsRef.current.push({ text, x, y, alpha: 1, vy: -2.5, color, size });
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startTimer = useCallback((seconds: number) => {
    stopTimer();
    setTimeLeft(seconds);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          stopTimer();
          return 0;
        }
        if (prev <= 6) {
          const ctx = audioRef.current;
          if (ctx) playTick(ctx);
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopTimer]);

  // ── Generate problems ──
  const generateProblems = useCallback((diff: Difficulty) => {
    return Array.from({ length: TOTAL_ROUNDS }, () => generateProblem(diff));
  }, []);

  // ── Handle time out ──
  useEffect(() => {
    if (phase !== 'playing' || answered || timeLeft !== 0) return;
    // time expired
    const ctx = ensureAudio();
    if (ctx) playWrong(ctx);
    setAnswered(true);
    setLastCorrect(false);
    setChosenAnswer(null);
    setStreak(0);
    setFeedbackMsg('시간 초과! ⏰');
    shakeRef.current = 10;
    const prob = problems[round];
    if (prob) {
      setMissedProblems(prev => [...prev, {
        questionText: prob.questionText,
        yourAnswer: '시간 초과',
        correctAnswer: prob.correctAnswer,
      }]);
    }
  }, [timeLeft, phase, answered, problems, round, ensureAudio]);

  // ── Handle answer ──
  const handleAnswer = useCallback((choice: number | string) => {
    if (answered || phase !== 'playing') return;
    ensureAudio();
    stopTimer();
    const prob = problems[round];
    if (!prob) return;

    const correct = String(choice) === String(prob.correctAnswer);
    setAnswered(true);
    setLastCorrect(correct);
    setChosenAnswer(choice);

    const canvas = canvasRef.current;
    const cx = canvas ? canvas.width / (window.devicePixelRatio || 1) / 2 : 200;
    const cy = canvas ? canvas.height / (window.devicePixelRatio || 1) / 2 : 300;

    if (correct) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      setBestStreak(prev => Math.max(prev, newStreak));

      const streakMult = newStreak >= 5 ? 2 : newStreak >= 3 ? 1.5 : 1;
      const diffMult = DIFF_MULTIPLIER[difficulty];
      const speedBonus = problems[round] && timeLeft >= TIMER[difficulty] - 3 ? 50 : 0;
      const pts = Math.round(100 * streakMult * diffMult + speedBonus);
      setScore(prev => prev + pts);
      setScorePopup(pts);
      setFeedbackMsg(CORRECT_MSGS[Math.floor(Math.random() * CORRECT_MSGS.length)]);
      charBounceRef.current = 18;

      const actx = audioRef.current;
      if (actx) {
        if (newStreak === 3 || newStreak === 5 || newStreak === 10) {
          playStreak(actx);
          const label = newStreak >= 10 ? `연속 ${newStreak}개! 🌟🌟🌟` : newStreak >= 5 ? `연속 ${newStreak}개! 🔥🔥` : `연속 ${newStreak}개! 🔥`;
          setShowStreakMsg(label);
          addSparkles(cx, cy * 0.5, 60, '#FFD700');
          addFloat(label, cx, cy * 0.4, '#FFD700', 32);
          setTimeout(() => setShowStreakMsg(''), 2000);
        } else {
          playCorrect(actx);
        }
      }
      addSparkles(cx, cy, 30);
      addFloat(`+${pts}`, cx, cy - 60, '#FFD700');
    } else {
      setStreak(0);
      setFeedbackMsg(WRONG_MSGS[Math.floor(Math.random() * WRONG_MSGS.length)]);
      const actx = audioRef.current;
      if (actx) playWrong(actx);
      shakeRef.current = 12;
      setMissedProblems(prev => [...prev, {
        questionText: prob.questionText,
        yourAnswer: choice,
        correctAnswer: prob.correctAnswer,
      }]);
    }
  }, [answered, phase, problems, round, streak, difficulty, timeLeft, stopTimer, ensureAudio, addSparkles, addFloat]);

  // ── Next round ──
  const nextRound = useCallback(() => {
    const next = round + 1;
    if (next >= TOTAL_ROUNDS) {
      stopTimer();
      setPhase('result');
      const char = CHARACTERS[selectedChar];
      const actx = ensureAudio();
      if (actx) playFanfare(actx);
      // saveScore after small delay so score state is settled
      setTimeout(() => saveScore('math', char.name, score), 50);
    } else {
      setRound(next);
      setAnswered(false);
      setLastCorrect(null);
      setChosenAnswer(null);
      setFeedbackMsg('');
      setScorePopup(0);
      startTimer(TIMER[difficulty]);
    }
  }, [round, stopTimer, startTimer, difficulty, selectedChar, score, ensureAudio]);

  // ── Start game ──
  const startGame = useCallback((charIdx: number, diff: Difficulty) => {
    ensureAudio();
    setSelectedChar(charIdx);
    setDifficulty(diff);
    setPhase('playing');
    setRound(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setAnswered(false);
    setLastCorrect(null);
    setChosenAnswer(null);
    setFeedbackMsg('');
    setShowStreakMsg('');
    setScorePopup(0);
    setMissedProblems([]);
    const probs = generateProblems(diff);
    setProblems(probs);
    startTimer(TIMER[diff]);
  }, [ensureAudio, generateProblems, startTimer]);

  // ── Grade ──
  const getGrade = useCallback(() => {
    const correctCount = TOTAL_ROUNDS - missedProblems.length;
    const pct = correctCount / TOTAL_ROUNDS;
    if (pct >= 0.9) return { stars: '⭐⭐⭐', label: '수학 천재! 완벽해요! 👑', color: '#FFD700' };
    if (pct >= 0.7) return { stars: '⭐⭐', label: '정말 잘했어요! 훌륭해요! 🌟', color: '#4ADE80' };
    if (pct >= 0.5) return { stars: '⭐', label: '좋은 시도! 계속 연습해요! 💪', color: '#60A5FA' };
    return { stars: '🌱', label: '다음엔 더 잘할 수 있어요! 🍀', color: '#94A3B8' };
  }, [missedProblems]);

  // ─── Input handler ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      if ('touches' in e) {
        return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy };
      }
      return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
    };

    const dpr = () => window.devicePixelRatio || 1;
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    const handleInput = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const raw = getPos(e);
      // Convert from canvas pixel coords to logical coords
      const x = raw.x / dpr();
      const y = raw.y / dpr();
      const w = W(), h = H();

      // Back button always available
      if (x <= 100 && y <= 60) {
        stopTimer();
        if (phase === 'playing' || phase === 'difficulty') {
          setPhase('select');
        } else if (phase === 'result') {
          window.location.href = '/';
        } else {
          window.location.href = '/';
        }
        return;
      }

      if (phase === 'select') {
        const cardW = w * 0.4, cardH = h * 0.14;
        const startY = h * 0.28, gap = h * 0.015;
        for (let i = 0; i < CHARACTERS.length; i++) {
          const row = Math.floor(i / 2), col = i % 2;
          const cx = col === 0 ? w * 0.27 : w * 0.73;
          const cy = startY + row * (cardH + gap) + cardH / 2;
          if (x >= cx - cardW / 2 && x <= cx + cardW / 2 && y >= cy - cardH / 2 && y <= cy + cardH / 2) {
            ensureAudio();
            setSelectedChar(i);
            setPhase('difficulty');
            return;
          }
        }
      } else if (phase === 'difficulty') {
        const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
        const btnH = h * 0.13, btnW = w * 0.78;
        const startY = h * 0.35;
        const gap = h * 0.03;
        for (let i = 0; i < 3; i++) {
          const by = startY + i * (btnH + gap);
          if (x >= w / 2 - btnW / 2 && x <= w / 2 + btnW / 2 && y >= by && y <= by + btnH) {
            startGame(selectedChar, difficulties[i]);
            return;
          }
        }
      } else if (phase === 'playing') {
        if (answered) {
          nextRound();
          return;
        }
        const prob = problems[round];
        if (!prob) return;
        const choices = prob.choices;

        // 2×2 grid of answer buttons
        const btnW = w * 0.42, btnH = h * 0.1;
        const gridTop = h * 0.72;
        const gapX = w * 0.04, gapY = h * 0.02;
        const startX = w / 2 - btnW - gapX / 2;
        for (let i = 0; i < 4; i++) {
          const col = i % 2, row = Math.floor(i / 2);
          const bx = startX + col * (btnW + gapX);
          const by = gridTop + row * (btnH + gapY);
          if (x >= bx && x <= bx + btnW && y >= by && y <= by + btnH) {
            handleAnswer(choices[i]);
            return;
          }
        }
      } else if (phase === 'result') {
        const bw = w * 0.45, bh = 56;
        // Restart button
        const r1x = w / 2 - bw - 8, r1y = h * 0.88;
        if (x >= r1x && x <= r1x + bw && y >= r1y && y <= r1y + bh) {
          setPhase('select');
          return;
        }
        // Home button
        const r2x = w / 2 + 8, r2y = h * 0.88;
        if (x >= r2x && x <= r2x + bw && y >= r2y && y <= r2y + bh) {
          window.location.href = '/';
          return;
        }
      }
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const raw = getPos(e);
      const x = raw.x / dpr();
      const y = raw.y / dpr();
      const w = W(), h = H();

      if (phase === 'select') {
        const cardW = w * 0.4, cardH = h * 0.14;
        const startY = h * 0.28, gap = h * 0.015;
        hoverCharRef.current = -1;
        for (let i = 0; i < CHARACTERS.length; i++) {
          const row = Math.floor(i / 2), col = i % 2;
          const cx = col === 0 ? w * 0.27 : w * 0.73;
          const cy = startY + row * (cardH + gap) + cardH / 2;
          if (x >= cx - cardW / 2 && x <= cx + cardW / 2 && y >= cy - cardH / 2 && y <= cy + cardH / 2) {
            hoverCharRef.current = i;
          }
        }
      } else if (phase === 'difficulty') {
        const btnH = h * 0.13, btnW = w * 0.78;
        const startY = h * 0.35, gap = h * 0.03;
        hoverDiffRef.current = -1;
        for (let i = 0; i < 3; i++) {
          const by = startY + i * (btnH + gap);
          if (x >= w / 2 - btnW / 2 && x <= w / 2 + btnW / 2 && y >= by && y <= by + btnH) {
            hoverDiffRef.current = i;
          }
        }
      } else if (phase === 'playing') {
        const prob = problems[round];
        if (!prob || answered) return;
        const btnW = w * 0.42, btnH = h * 0.1;
        const gridTop = h * 0.72, gapX = w * 0.04, gapY = h * 0.02;
        const startX = w / 2 - btnW - gapX / 2;
        hoverChoiceRef.current = -1;
        for (let i = 0; i < 4; i++) {
          const col = i % 2, row = Math.floor(i / 2);
          const bx = startX + col * (btnW + gapX);
          const by = gridTop + row * (btnH + gapY);
          if (x >= bx && x <= bx + btnW && y >= by && y <= by + btnH) {
            hoverChoiceRef.current = i;
          }
        }
      }
    };

    canvas.addEventListener('click', handleInput);
    canvas.addEventListener('touchstart', handleInput, { passive: false });
    canvas.addEventListener('mousemove', handleMove);
    return () => {
      canvas.removeEventListener('click', handleInput);
      canvas.removeEventListener('touchstart', handleInput);
      canvas.removeEventListener('mousemove', handleMove);
    };
  }, [phase, answered, problems, round, selectedChar, handleAnswer, nextRound, startGame, stopTimer, ensureAudio]);

  // ─── Render loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    // ── draw helpers ──
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

    const drawBack = () => {
      ctx.save();
      ctx.shadowColor = '#F9A8D430';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#FDE8F5';
      rr(8, 12, 78, 34, 17);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#F9A8D4';
      ctx.lineWidth = 1.5;
      rr(8, 12, 78, 34, 17);
      ctx.stroke();
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#E91E8C';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏠 홈', 18, 29);
      ctx.restore();
    };

    // ── Fraction pie chart ──
    const drawPie = (cx: number, cy: number, radius: number, n: number, d: number) => {
      const startAngle = -Math.PI / 2;
      const slice = (Math.PI * 2) / d;

      for (let i = 0; i < d; i++) {
        const s = startAngle + i * slice;
        const e = s + slice;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, s, e);
        ctx.closePath();
        ctx.fillStyle = i < n ? '#FF7EB3' : '#F8E8FF';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // outline
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#D946EF';
      ctx.lineWidth = 3;
      ctx.stroke();
    };

    // ── SELECT SCREEN ──
    const drawSelect = () => {
      const w = W(), h = H();
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#E0F7FA');
      grad.addColorStop(0.5, '#E8F4FF');
      grad.addColorStop(1, '#FFF0E8');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Title
      ctx.save();
      ctx.font = `bold ${Math.min(w * 0.1, 44)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#1E40AF';
      ctx.fillText('수학 천재! 🧠', w / 2, h * 0.1);
      ctx.font = `${Math.min(w * 0.045, 20)}px sans-serif`;
      ctx.fillStyle = '#6366F1';
      ctx.fillText('캐릭터를 선택하세요!', w / 2, h * 0.17);
      ctx.font = `${Math.min(w * 0.038, 16)}px sans-serif`;
      ctx.fillStyle = '#94A3B8';
      ctx.fillText('수학 문제를 풀고 점수를 올려봐요!', w / 2, h * 0.225);
      ctx.restore();

      const cardW = w * 0.4, cardH = h * 0.14;
      const startY = h * 0.28, gap = h * 0.015;

      CHARACTERS.forEach((char, i) => {
        const row = Math.floor(i / 2), col = i % 2;
        const cx = col === 0 ? w * 0.27 : w * 0.73;
        const cy = startY + row * (cardH + gap) + cardH / 2;
        const hover = hoverCharRef.current === i;
        const scale = hover ? 1.05 : 1;
        const cw = cardW * scale, ch = cardH * scale;

        ctx.save();
        ctx.shadowColor = char.color + '50';
        ctx.shadowBlur = hover ? 22 : 10;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = hover ? '#FFFFFF' : '#F8FFFE';
        rr(cx - cw / 2, cy - ch / 2, cw, ch, 18);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = char.color + (hover ? 'FF' : '90');
        ctx.lineWidth = hover ? 3 : 1.5;
        rr(cx - cw / 2, cy - ch / 2, cw, ch, 18);
        ctx.stroke();
        ctx.restore();

        ctx.font = `${Math.min(cw * 0.22, 42)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char.emoji, cx, cy - ch * 0.08);

        ctx.font = `bold ${Math.min(cw * 0.11, 17)}px sans-serif`;
        ctx.fillStyle = char.color;
        ctx.fillText(`${char.heart} ${char.name}`, cx, cy + ch * 0.32);
      });

      drawBack();
    };

    // ── DIFFICULTY SCREEN ──
    const drawDifficulty = () => {
      const w = W(), h = H();
      const char = CHARACTERS[selectedChar] || CHARACTERS[0];

      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#E8F4FF');
      grad.addColorStop(1, '#FFF0FA');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.font = `bold ${Math.min(w * 0.08, 36)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = char.color;
      ctx.fillText(`${char.emoji} ${char.name}`, w / 2, h * 0.1);

      ctx.font = `bold ${Math.min(w * 0.065, 30)}px sans-serif`;
      ctx.fillStyle = '#1E293B';
      ctx.fillText('난이도를 선택하세요!', w / 2, h * 0.2);

      ctx.font = `${Math.min(w * 0.04, 17)}px sans-serif`;
      ctx.fillStyle = '#64748B';
      ctx.fillText('총 20문제 도전!', w / 2, h * 0.27);

      const diffs: Difficulty[] = ['easy', 'medium', 'hard'];
      const btnH = h * 0.13, btnW = w * 0.78;
      const startY = h * 0.35, gapY = h * 0.03;

      diffs.forEach((d, i) => {
        const bx = w / 2 - btnW / 2;
        const by = startY + i * (btnH + gapY);
        const hover = hoverDiffRef.current === i;

        ctx.save();
        ctx.shadowColor = DIFF_COLOR[d] + '60';
        ctx.shadowBlur = hover ? 20 : 10;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = hover ? DIFF_COLOR[d] : DIFF_COLOR[d] + '30';
        rr(bx, by, btnW, btnH, 18);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = DIFF_COLOR[d];
        ctx.lineWidth = hover ? 3 : 2;
        rr(bx, by, btnW, btnH, 18);
        ctx.stroke();
        ctx.restore();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = hover ? '#FFFFFF' : '#1E293B';
        ctx.font = `bold ${Math.min(w * 0.055, 24)}px sans-serif`;
        ctx.fillText(DIFF_LABEL[d], w / 2, by + btnH * 0.38);
        ctx.font = `${Math.min(w * 0.035, 15)}px sans-serif`;
        ctx.fillStyle = hover ? '#FFFFFFCC' : '#64748B';
        ctx.fillText(DIFF_SUBTITLE[d], w / 2, by + btnH * 0.72);
      });

      drawBack();
    };

    // ── PLAYING SCREEN ──
    const drawPlaying = () => {
      const w = W(), h = H();
      const prob = problems[round];
      if (!prob) return;
      const char = CHARACTERS[selectedChar] || CHARACTERS[0];
      const timerSecs = TIMER[difficulty];

      const shakeX = shakeRef.current > 0 ? (Math.random() - 0.5) * shakeRef.current : 0;
      ctx.save();
      ctx.translate(shakeX, 0);

      // BG
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#E0F2FE');
      grad.addColorStop(0.5, '#F0F4FF');
      grad.addColorStop(1, '#FFF0F9');
      ctx.fillStyle = grad;
      ctx.fillRect(-10, 0, w + 20, h);

      // ── Top bar ──
      ctx.save();
      ctx.shadowColor = '#00000015';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#FFFFFF';
      rr(10, 8, w - 20, 52, 14);
      ctx.fill();
      ctx.restore();

      // char name
      ctx.font = `bold ${Math.min(w * 0.038, 16)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = char.color;
      ctx.fillText(`${char.heart} ${char.name}`, 70, 34);

      // difficulty badge
      ctx.font = `bold ${Math.min(w * 0.032, 13)}px sans-serif`;
      const diffLabel = DIFF_LABEL[difficulty];
      const dlw = ctx.measureText(diffLabel).width + 16;
      ctx.fillStyle = DIFF_COLOR[difficulty] + '30';
      rr(w / 2 - dlw / 2, 20, dlw, 28, 14);
      ctx.fill();
      ctx.fillStyle = '#1E293B';
      ctx.textAlign = 'center';
      ctx.fillText(diffLabel, w / 2, 34);

      // score
      ctx.font = `bold ${Math.min(w * 0.04, 17)}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#6366F1';
      ctx.fillText(`💎 ${score}`, w - 15, 34);

      // Progress + round counter
      ctx.font = `${Math.min(w * 0.034, 14)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(`${round + 1} / ${TOTAL_ROUNDS}`, w / 2, 74);

      // progress bar
      const pbarW = w - 40, pbarH = 7, pbarY = 78;
      ctx.fillStyle = '#E2E8F0';
      rr(20, pbarY, pbarW, pbarH, 4);
      ctx.fill();
      ctx.fillStyle = char.color;
      rr(20, pbarY, (round / TOTAL_ROUNDS) * pbarW, pbarH, 4);
      ctx.fill();

      // streak indicator
      if (streak >= 3) {
        ctx.font = `${Math.min(w * 0.035, 14)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillStyle = streak >= 5 ? '#F59E0B' : '#FB923C';
        ctx.fillText(`🔥 ${streak}연속`, 15, 108);
      }

      // ── Timer bar ──
      const tbarW = w - 40, tbarH = 10, tbarY = 94;
      ctx.fillStyle = '#E2E8F0';
      rr(20, tbarY, tbarW, tbarH, 5);
      ctx.fill();
      const tpct = timeLeft / timerSecs;
      ctx.fillStyle = tpct <= 0.25 ? '#F87171' : tpct <= 0.5 ? '#FBBF24' : '#4ADE80';
      rr(20, tbarY, Math.max(tpct * tbarW, 0), tbarH, 5);
      ctx.fill();

      // timer number
      ctx.font = `bold ${Math.min(w * 0.042, 18)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = timeLeft <= 5 ? '#EF4444' : '#475569';
      ctx.fillText(`${timeLeft}초`, w / 2, tbarY + 28);

      // ── Character display ──
      const charY = h * 0.2;
      const bounce = charBounceRef.current;
      const charEmoji = answered ? (lastCorrect ? '🎉' : '😢') : char.emoji;
      ctx.font = `${Math.min(w * 0.14, 60)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(charEmoji, w / 2, charY - bounce);

      // ── Question box ──
      const qboxY = h * 0.28;
      const qboxH = prob.type === 'counting' ? h * 0.22 :
                    prob.type === 'fraction' ? h * 0.26 : h * 0.18;
      const qboxW = w - 36;

      ctx.save();
      ctx.shadowColor = char.color + '25';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#FFFBFF';
      rr(18, qboxY, qboxW, qboxH, 22);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = char.color + '60';
      ctx.lineWidth = 2.5;
      rr(18, qboxY, qboxW, qboxH, 22);
      ctx.stroke();

      if (prob.type === 'counting' && prob.emojiItems) {
        // Display emoji in grid
        const items = prob.emojiItems;
        const cols = Math.min(items.length, 5);
        const rows = Math.ceil(items.length / cols);
        const cellSize = Math.min((qboxW - 40) / cols, (qboxH - 60) / rows, 40);
        const gridW = cols * cellSize, gridH = rows * cellSize;
        const gridStartX = 18 + (qboxW - gridW) / 2;
        const gridStartY = qboxY + 18;

        ctx.font = `${cellSize * 0.85}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        items.forEach((em, idx) => {
          const c = idx % cols, r = Math.floor(idx / cols);
          ctx.fillText(em, gridStartX + c * cellSize + cellSize / 2, gridStartY + r * cellSize + cellSize / 2);
        });

        ctx.font = `bold ${Math.min(w * 0.05, 21)}px sans-serif`;
        ctx.fillStyle = '#1E293B';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(prob.display, w / 2, qboxY + qboxH - 14);
      } else if (prob.type === 'fraction' && prob.fractionN !== undefined && prob.fractionD !== undefined) {
        const pieR = Math.min(qboxW * 0.22, 70);
        drawPie(w / 2, qboxY + qboxH * 0.48, pieR, prob.fractionN, prob.fractionD);
        ctx.font = `bold ${Math.min(w * 0.048, 21)}px sans-serif`;
        ctx.fillStyle = '#1E293B';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(prob.display, w / 2, qboxY + qboxH - 12);
      } else {
        // Text problem
        ctx.font = `bold ${Math.min(w * 0.075, 34)}px sans-serif`;
        ctx.fillStyle = '#1E293B';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(prob.display, w / 2, qboxY + qboxH * (prob.subDisplay ? 0.38 : 0.5));

        if (prob.subDisplay) {
          ctx.font = `${Math.min(w * 0.044, 19)}px sans-serif`;
          ctx.fillStyle = '#64748B';
          ctx.fillText(prob.subDisplay, w / 2, qboxY + qboxH * 0.7);
        }
      }

      // ── Answer buttons 2×2 ──
      const btnW = w * 0.42, btnH = h * 0.1;
      const gridTop = h * 0.72, gapX = w * 0.04, gapY = h * 0.02;
      const startX = w / 2 - btnW - gapX / 2;

      const choiceBgColors = ['#FEE2E2', '#FEF9C3', '#DCFCE7', '#DBEAFE'];
      const choiceBorderColors = ['#FCA5A5', '#FDE68A', '#86EFAC', '#93C5FD'];
      const choiceTextColors = ['#DC2626', '#D97706', '#16A34A', '#2563EB'];

      const prob2 = prob;
      prob.choices.forEach((choice, i) => {
        const col = i % 2, row2 = Math.floor(i / 2);
        const bx = startX + col * (btnW + gapX);
        const by = gridTop + row2 * (btnH + gapY);
        const hover = !answered && hoverChoiceRef.current === i;

        let bgColor = choiceBgColors[i];
        let borderColor = choiceBorderColors[i];

        if (answered) {
          if (String(choice) === String(prob2.correctAnswer)) {
            bgColor = '#DCFCE7'; borderColor = '#22C55E';
          } else if (String(choice) === String(chosenAnswer)) {
            bgColor = '#FEE2E2'; borderColor = '#EF4444';
          } else {
            bgColor = '#F8FAFC'; borderColor = '#CBD5E1';
          }
        }

        ctx.save();
        if (!answered && hover) {
          ctx.shadowColor = choiceBorderColors[i] + '80';
          ctx.shadowBlur = 14;
        }
        ctx.fillStyle = bgColor;
        rr(bx, by, btnW, btnH, 16);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = answered && String(choice) === String(prob2.correctAnswer) ? '#22C55E' : borderColor;
        ctx.lineWidth = answered && String(choice) === String(prob2.correctAnswer) ? 3 : hover ? 2.5 : 1.5;
        rr(bx, by, btnW, btnH, 16);
        ctx.stroke();

        // Answered marks
        if (answered) {
          if (String(choice) === String(prob2.correctAnswer)) {
            ctx.font = `${Math.min(btnH * 0.45, 28)}px sans-serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText('✅', bx + btnW - 10, by + btnH / 2);
          } else if (String(choice) === String(chosenAnswer)) {
            ctx.font = `${Math.min(btnH * 0.45, 28)}px sans-serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText('❌', bx + btnW - 10, by + btnH / 2);
          }
        }

        // Choice label
        ctx.font = `bold ${Math.min(btnW * 0.16, 26)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = answered
          ? (String(choice) === String(prob2.correctAnswer) ? '#15803D' :
             String(choice) === String(chosenAnswer) ? '#B91C1C' : '#94A3B8')
          : choiceTextColors[i];
        ctx.fillText(String(choice), bx + btnW / 2, by + btnH / 2);
      });

      // ── Feedback overlay ──
      if (answered) {
        const isCorrect = lastCorrect === true;
        const fbH = h * 0.12;
        const fbY = h * 0.615;

        ctx.save();
        ctx.shadowColor = isCorrect ? '#22C55E40' : '#EF444440';
        ctx.shadowBlur = 16;
        ctx.fillStyle = isCorrect ? '#F0FFF4' : '#FFF5F5';
        rr(18, fbY, w - 36, fbH, 16);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = isCorrect ? '#86EFAC' : '#FCA5A5';
        ctx.lineWidth = 2;
        rr(18, w - 36, fbY, fbH, 16);
        ctx.stroke();

        ctx.font = `bold ${Math.min(w * 0.053, 23)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isCorrect ? '#16A34A' : '#DC2626';
        ctx.fillText(feedbackMsg, w / 2, fbY + fbH * 0.45);

        // Tap to continue hint
        const tapAlpha = 0.5 + 0.5 * Math.sin(frameTimeRef.current * 4);
        ctx.globalAlpha = tapAlpha;
        ctx.font = `${Math.min(w * 0.036, 15)}px sans-serif`;
        ctx.fillStyle = '#64748B';
        ctx.fillText('탭하면 다음 문제! 👆', w / 2, fbY + fbH * 0.8);
        ctx.globalAlpha = 1;
      }

      // ── Streak overlay message ──
      if (showStreakMsg) {
        ctx.font = `bold ${Math.min(w * 0.065, 28)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FFD70080';
        ctx.shadowBlur = 12;
        ctx.fillText(showStreakMsg, w / 2, h * 0.52);
        ctx.shadowBlur = 0;
      }

      ctx.restore(); // end shake

      drawBack();
    };

    // ── RESULT SCREEN ──
    const drawResult = () => {
      const w = W(), h = H();
      const char = CHARACTERS[selectedChar] || CHARACTERS[0];
      const correctCount = TOTAL_ROUNDS - missedProblems.length;
      const accuracy = Math.round((correctCount / TOTAL_ROUNDS) * 100);
      const grade = getGrade();

      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#E0F2FE');
      grad.addColorStop(0.5, '#EEF2FF');
      grad.addColorStop(1, '#FDF4FF');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Title
      ctx.font = `bold ${Math.min(w * 0.08, 36)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#1E40AF';
      ctx.fillText('수학 결과! 🏆', w / 2, h * 0.08);

      // Character
      ctx.font = `${Math.min(w * 0.18, 76)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char.emoji, w / 2, h * 0.16);

      // Grade stars
      ctx.font = `bold ${Math.min(w * 0.07, 30)}px sans-serif`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = grade.color;
      ctx.fillText(grade.stars, w / 2, h * 0.25);
      ctx.font = `bold ${Math.min(w * 0.048, 21)}px sans-serif`;
      ctx.fillText(grade.label, w / 2, h * 0.31);

      // Difficulty badge
      ctx.font = `bold ${Math.min(w * 0.04, 17)}px sans-serif`;
      ctx.fillStyle = DIFF_COLOR[difficulty];
      ctx.fillText(DIFF_LABEL[difficulty], w / 2, h * 0.37);

      // Stats card
      const scY = h * 0.4, scH = h * 0.22, scW = w - 40;
      ctx.save();
      ctx.shadowColor = '#00000012';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#FFFFFF';
      rr(20, scY, scW, scH, 18);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = char.color + '40';
      ctx.lineWidth = 2;
      rr(20, scY, scW, scH, 18);
      ctx.stroke();

      const statsFont = `${Math.min(w * 0.042, 18)}px sans-serif`;
      const lh = scH / 5.5;
      ctx.font = statsFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#374151';
      ctx.fillText(`💎 총 점수: ${score}점`, w / 2, scY + lh * 1.2);
      ctx.fillText(`✅ 맞힌 문제: ${correctCount} / ${TOTAL_ROUNDS}`, w / 2, scY + lh * 2.2);
      ctx.fillText(`📊 정답률: ${accuracy}%`, w / 2, scY + lh * 3.2);
      ctx.fillStyle = bestStreak >= 5 ? '#F59E0B' : '#374151';
      ctx.fillText(`🔥 최고 연속: ${bestStreak}개`, w / 2, scY + lh * 4.2);

      // Missed problems review
      if (missedProblems.length > 0) {
        const revY = h * 0.645;
        ctx.font = `bold ${Math.min(w * 0.042, 18)}px sans-serif`;
        ctx.fillStyle = '#EF4444';
        ctx.textAlign = 'center';
        ctx.fillText('틀린 문제 복습 📖', w / 2, revY);

        const revH = h * 0.17;
        ctx.save();
        ctx.shadowColor = '#EF444420';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#FFF5F5';
        rr(20, revY + 8, w - 40, revH, 14);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = '#FCA5A5';
        ctx.lineWidth = 1.5;
        rr(20, revY + 8, w - 40, revH, 14);
        ctx.stroke();

        const show = missedProblems.slice(0, 3);
        ctx.font = `${Math.min(w * 0.033, 14)}px sans-serif`;
        ctx.fillStyle = '#7C3AED';
        ctx.textAlign = 'center';
        show.forEach((mp, i) => {
          const ty = revY + 8 + (revH / (show.length + 1)) * (i + 1);
          ctx.fillText(`${mp.questionText} → 정답: ${mp.correctAnswer}`, w / 2, ty);
        });
        if (missedProblems.length > 3) {
          ctx.fillStyle = '#94A3B8';
          ctx.fillText(`외 ${missedProblems.length - 3}개 더...`, w / 2, revY + revH - 4);
        }
      }

      // Buttons
      const bh = 56, bw = w * 0.42, by = h * 0.88;
      const gap = 16;

      // Restart
      ctx.save();
      ctx.shadowColor = char.color + '50';
      ctx.shadowBlur = 14;
      ctx.fillStyle = char.color;
      rr(w / 2 - bw - gap / 2, by, bw, bh, bh / 2);
      ctx.fill();
      ctx.restore();
      ctx.font = `bold ${Math.min(w * 0.046, 20)}px sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('다시 도전! 🔄', w / 2 - bw / 2 - gap / 2, by + bh / 2);

      // Home
      ctx.save();
      ctx.shadowColor = '#94A3B850';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#E2E8F0';
      rr(w / 2 + gap / 2, by, bw, bh, bh / 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#475569';
      ctx.fillText('🏠 홈으로', w / 2 + bw / 2 + gap / 2, by + bh / 2);

      drawBack();
    };

    // ── Animation loop ──
    const animate = (time: number) => {
      frameTimeRef.current = time / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();

      if (phase === 'select') drawSelect();
      else if (phase === 'difficulty') drawDifficulty();
      else if (phase === 'playing') drawPlaying();
      else if (phase === 'result') drawResult();

      // Sparkles
      sparklesRef.current = sparklesRef.current.filter(s => s.alpha > 0.02);
      sparklesRef.current.forEach(s => {
        s.x += Math.cos(s.angle) * s.speed;
        s.y += Math.sin(s.angle) * s.speed + 0.4;
        s.alpha *= 0.955;
        s.size *= 0.975;
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        const spikes = 4, or = s.size, ir = s.size * 0.4;
        for (let i = 0; i < spikes * 2; i++) {
          const r = i % 2 === 0 ? or : ir;
          const a = (i * Math.PI) / spikes - Math.PI / 2;
          if (i === 0) ctx.moveTo(s.x + r * Math.cos(a), s.y + r * Math.sin(a));
          else ctx.lineTo(s.x + r * Math.cos(a), s.y + r * Math.sin(a));
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });

      // Floating texts
      floatTextsRef.current = floatTextsRef.current.filter(t => t.alpha > 0.02);
      floatTextsRef.current.forEach(t => {
        t.y += t.vy;
        t.alpha *= 0.965;
        ctx.save();
        ctx.globalAlpha = t.alpha;
        ctx.font = `bold ${t.size}px sans-serif`;
        ctx.fillStyle = t.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
      });

      // Decay
      if (charBounceRef.current > 0.1) charBounceRef.current *= 0.88; else charBounceRef.current = 0;
      if (shakeRef.current > 0.1) shakeRef.current *= 0.82; else shakeRef.current = 0;

      ctx.restore();
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [phase, selectedChar, difficulty, round, score, streak, bestStreak, timeLeft,
      answered, lastCorrect, chosenAnswer, problems, missedProblems, feedbackMsg,
      showStreakMsg, scorePopup, getGrade]);

  // Cleanup timer on unmount
  useEffect(() => () => stopTimer(), [stopTimer]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        cursor: 'pointer',
      }}
    />
  );
}
