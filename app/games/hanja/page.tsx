'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { saveScore } from '@/lib/ranking';
import { hanjaData, wordData, LEVELS, type HanjaChar, type HanjaWord } from './data';

// ─── Types ──────────────────────────────────────────────────────────
interface Character {
  name: string;
  emoji: string;
  color: string;
}

type GamePhase = 'select' | 'mode' | 'level' | 'playing' | 'result';
type GameMode = 'challenge' | 'diagnosis' | 'timeattack';
type QuestionType = 'huneum' | 'hanja' | 'dokeum' | 'hanjaeo';

interface Question {
  display: string;
  typeLabel: string;
  options: string[];
  correctIndex: number;
  type: QuestionType;
  level: string;
  correctId: string;
}

interface WrongNote {
  display: string;
  correctAnswer: string;
  yourAnswer: string;
  typeLabel: string;
}

// ─── Constants ──────────────────────────────────────────────────────
const characters: Character[] = [
  { name: '승민', emoji: '🤖', color: '#3B82F6' },
  { name: '건우', emoji: '🩺', color: '#10B981' },
  { name: '강우', emoji: '👨‍🍳', color: '#F59E0B' },
  { name: '수현', emoji: '💃', color: '#EC4899' },
  { name: '이현', emoji: '👸', color: '#FF69B4' },
  { name: '준영', emoji: '📚', color: '#6366F1' },
  { name: '준우', emoji: '✈️', color: '#0EA5E9' },
];

const LEVEL_ORDER = ['8', '준7', '7', '준6', '6', '준5', '5', '준4', '4', '준3', '3', '2', '1'];
const BASE_POINTS: Record<string, number> = { '8': 20, '준7': 25, '7': 30, '준6': 40, '6': 50, '준5': 60, '5': 80, '준4': 100, '4': 120, '준3': 150, '3': 200, '2': 250, '1': 500 };
const TIMER_BY_LEVEL: Record<string, number> = { '8': 15, '준7': 13, '7': 12, '준6': 10, '6': 10, '준5': 10, '5': 9, '준4': 8, '4': 8, '준3': 7, '3': 7, '2': 6, '1': 6 };

// ─── Audio ──────────────────────────────────────────────────────────
function playSound(type: 'correct' | 'wrong' | 'combo' | 'levelup' | 'gameover') {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
      case 'correct':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, ctx.currentTime);
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.07);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        break;
      case 'wrong':
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.setValueAtTime(150, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        break;
      case 'combo': {
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
          g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.1);
          g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.2);
          o.start(ctx.currentTime + i * 0.1);
          o.stop(ctx.currentTime + i * 0.1 + 0.2);
        });
        break;
      }
      case 'levelup': {
        const notes = [523, 659, 784, 880, 1047];
        notes.forEach((freq, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
          g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.12);
          g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.3);
          o.start(ctx.currentTime + i * 0.12);
          o.stop(ctx.currentTime + i * 0.12 + 0.3);
        });
        break;
      }
      case 'gameover':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.setValueAtTime(300, ctx.currentTime + 0.15);
        osc.frequency.setValueAtTime(200, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
        break;
    }
  } catch {
    // Audio not available
  }
}

// ─── Helpers ────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getLevelsUpTo(level: string): string[] {
  const idx = LEVEL_ORDER.indexOf(level);
  return LEVEL_ORDER.slice(0, idx + 1);
}

function getCharsForLevel(level: string): HanjaChar[] {
  const levels = getLevelsUpTo(level);
  return hanjaData.filter(c => levels.includes(c.level));
}

function getWordsForLevel(level: string): HanjaWord[] {
  const levels = getLevelsUpTo(level);
  return wordData.filter(w => levels.includes(w.level));
}

function generateQuestion(level: string, forceType?: QuestionType): Question {
  const allChars = getCharsForLevel(level);
  const levelChars = hanjaData.filter(c => c.level === level);
  const allWords = getWordsForLevel(level);
  const hasWords = allWords.length >= 4;

  // Choose question type
  let type: QuestionType;
  if (forceType) {
    type = forceType;
  } else {
    const types: QuestionType[] = ['huneum', 'hanja'];
    if (hasWords) types.push('dokeum', 'hanjaeo');
    type = types[Math.floor(Math.random() * types.length)];
  }

  // Fallback if not enough words
  if ((type === 'dokeum' || type === 'hanjaeo') && !hasWords) {
    type = Math.random() < 0.5 ? 'huneum' : 'hanja';
  }

  if (type === 'huneum' || type === 'hanja') {
    // Pick correct char: 70% from selected level, 30% from pool
    const pool = (Math.random() < 0.7 && levelChars.length > 0) ? levelChars : allChars;
    const correct = pool[Math.floor(Math.random() * pool.length)];

    // Pick 3 distractors
    const others = allChars.filter(c => c.id !== correct.id);
    const distractors = shuffle(others).slice(0, 3);

    if (type === 'huneum') {
      // Show char, pick meaning+sound
      const correctOption = `${correct.meaning} ${correct.sound}`;
      const options = distractors.map(d => `${d.meaning} ${d.sound}`);
      // Ensure no duplicates
      const uniqueOptions = [correctOption, ...options.filter(o => o !== correctOption)].slice(0, 4);
      while (uniqueOptions.length < 4) {
        const extra = allChars[Math.floor(Math.random() * allChars.length)];
        const opt = `${extra.meaning} ${extra.sound}`;
        if (!uniqueOptions.includes(opt)) uniqueOptions.push(opt);
      }
      const shuffled = shuffle(uniqueOptions);
      return {
        display: correct.char,
        typeLabel: `[${LEVELS.find(l => l.id === correct.level)?.name || level} · 훈음]`,
        options: shuffled,
        correctIndex: shuffled.indexOf(correctOption),
        type: 'huneum',
        level: correct.level,
        correctId: correct.id,
      };
    } else {
      // Show meaning+sound, pick char
      const correctOption = correct.char;
      const options = distractors.map(d => d.char);
      const uniqueOptions = [correctOption, ...options.filter(o => o !== correctOption)].slice(0, 4);
      while (uniqueOptions.length < 4) {
        const extra = allChars[Math.floor(Math.random() * allChars.length)];
        if (!uniqueOptions.includes(extra.char)) uniqueOptions.push(extra.char);
      }
      const shuffled = shuffle(uniqueOptions);
      return {
        display: `${correct.meaning} ${correct.sound}`,
        typeLabel: `[${LEVELS.find(l => l.id === correct.level)?.name || level} · 한자]`,
        options: shuffled,
        correctIndex: shuffled.indexOf(correctOption),
        type: 'hanja',
        level: correct.level,
        correctId: correct.id,
      };
    }
  } else {
    // Word-based questions
    const levelWords = wordData.filter(w => w.level === level);
    const pool = (Math.random() < 0.7 && levelWords.length > 0) ? levelWords : allWords;
    const correct = pool[Math.floor(Math.random() * pool.length)];
    const others = allWords.filter(w => w.id !== correct.id);
    const distractors = shuffle(others).slice(0, 3);

    if (type === 'dokeum') {
      const correctOption = correct.reading;
      const options = distractors.map(d => d.reading);
      const uniqueOptions = [correctOption, ...options.filter(o => o !== correctOption)].slice(0, 4);
      while (uniqueOptions.length < 4) {
        const extra = allWords[Math.floor(Math.random() * allWords.length)];
        if (!uniqueOptions.includes(extra.reading)) uniqueOptions.push(extra.reading);
      }
      const shuffled = shuffle(uniqueOptions);
      return {
        display: correct.hanja,
        typeLabel: `[${LEVELS.find(l => l.id === correct.level)?.name || level} · 독음]`,
        options: shuffled,
        correctIndex: shuffled.indexOf(correctOption),
        type: 'dokeum',
        level: correct.level,
        correctId: correct.id,
      };
    } else {
      const correctOption = correct.hanja;
      const options = distractors.map(d => d.hanja);
      const uniqueOptions = [correctOption, ...options.filter(o => o !== correctOption)].slice(0, 4);
      while (uniqueOptions.length < 4) {
        const extra = allWords[Math.floor(Math.random() * allWords.length)];
        if (!uniqueOptions.includes(extra.hanja)) uniqueOptions.push(extra.hanja);
      }
      const shuffled = shuffle(uniqueOptions);
      return {
        display: correct.reading,
        typeLabel: `[${LEVELS.find(l => l.id === correct.level)?.name || level} · 한자어]`,
        options: shuffled,
        correctIndex: shuffled.indexOf(correctOption),
        type: 'hanjaeo',
        level: correct.level,
        correctId: correct.id,
      };
    }
  }
}

// ─── localStorage helpers ───────────────────────────────────────────
function loadBadges(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('hanjawang:badges');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveBadge(level: string) {
  if (typeof window === 'undefined') return;
  const badges = loadBadges();
  if (!badges.includes(level)) {
    badges.push(level);
    localStorage.setItem('hanjawang:badges', JSON.stringify(badges));
  }
}

function loadBestScores(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('hanjawang:bestScore');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveBestScore(mode: string, score: number) {
  if (typeof window === 'undefined') return;
  const best = loadBestScores();
  if (!best[mode] || score > best[mode]) {
    best[mode] = score;
    localStorage.setItem('hanjawang:bestScore', JSON.stringify(best));
  }
}

function saveWrongNote(charId: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('hanjawang:wrongNotes');
    const notes: string[] = raw ? JSON.parse(raw) : [];
    if (!notes.includes(charId)) {
      notes.push(charId);
      localStorage.setItem('hanjawang:wrongNotes', JSON.stringify(notes));
    }
  } catch { /* */ }
}

// ─── Component ──────────────────────────────────────────────────────
export default function HanjaWangPage() {
  // Core state
  const [phase, setPhase] = useState<GamePhase>('select');
  const [selectedChar, setSelectedChar] = useState(-1);
  const [mode, setMode] = useState<GameMode>('challenge');
  const [selectedLevel, setSelectedLevel] = useState('8');

  // Game state
  const [currentQ, setCurrentQ] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [score, setScore] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [totalTimeLeft, setTotalTimeLeft] = useState(60);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answered, setAnswered] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState(-1);
  const [isCorrect, setIsCorrect] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongNotes, setWrongNotes] = useState<WrongNote[]>([]);
  const [showCombo, setShowCombo] = useState(false);
  const [scoreAnim, setScoreAnim] = useState(0);
  const [badges, setBadges] = useState<string[]>([]);

  // Diagnosis mode
  const [diagLevel, setDiagLevel] = useState('8');
  const [diagConsecutive, setDiagConsecutive] = useState(0);
  const [diagWrongConsecutive, setDiagWrongConsecutive] = useState(0);
  const [diagResult, setDiagResult] = useState('8');
  const [diagLevelStats, setDiagLevelStats] = useState<Record<string, { correct: number; total: number }>>({});

  // Time attack
  const [taCorrect, setTaCorrect] = useState(0);
  const [taTotal, setTaTotal] = useState(0);
  const [taTotalTime, setTaTotalTime] = useState(0);

  // Confetti
  const [showConfetti, setShowConfetti] = useState(false);

  // Refs
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionStartRef = useRef(Date.now());

  // Load badges on mount
  useEffect(() => {
    setBadges(loadBadges());
  }, []);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ─── Timer logic ──────────────────────────────────────────────────
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startQuestionTimer = useCallback((seconds: number) => {
    clearTimer();
    setTimeLeft(seconds);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  const startTotalTimer = useCallback(() => {
    clearTimer();
    setTotalTimeLeft(60);
    timerRef.current = setInterval(() => {
      setTotalTimeLeft(prev => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  // ─── Time-up effect ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing' || answered) return;

    if (mode === 'timeattack') {
      if (totalTimeLeft <= 0) {
        clearTimer();
        playSound('gameover');
        const playerName = selectedChar >= 0 ? characters[selectedChar].name : '';
        if (score > 0) {
          saveScore('hanja', playerName, score);
          saveBestScore('timeattack', score);
        }
        setPhase('result');
      }
    } else {
      if (timeLeft <= 0) {
        // Time's up for this question - treat as wrong
        handleTimeUp();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, totalTimeLeft, phase, answered, mode]);

  const handleTimeUp = useCallback(() => {
    if (!question || answered) return;
    setAnswered(true);
    setIsCorrect(false);
    setSelectedAnswer(-1);
    setCombo(0);
    playSound('wrong');
    saveWrongNote(question.correctId);
    setWrongNotes(prev => [...prev, {
      display: question.display,
      correctAnswer: question.options[question.correctIndex],
      yourAnswer: '(시간 초과)',
      typeLabel: question.typeLabel,
    }]);

    if (mode === 'challenge') {
      setHearts(prev => {
        const newHearts = prev - 1;
        if (newHearts <= 0) {
          setTimeout(() => {
            playSound('gameover');
            const playerName = selectedChar >= 0 ? characters[selectedChar].name : '';
            if (score > 0) {
              saveScore('hanja', playerName, score);
              saveBestScore(`challenge:${selectedLevel}`, score);
            }
            setPhase('result');
          }, 1000);
        }
        return newHearts;
      });
    } else if (mode === 'diagnosis') {
      setDiagWrongConsecutive(prev => prev + 1);
      setDiagConsecutive(0);
      setDiagLevelStats(prev => ({
        ...prev,
        [diagLevel]: {
          correct: (prev[diagLevel]?.correct || 0),
          total: (prev[diagLevel]?.total || 0) + 1,
        },
      }));
    }
  }, [question, answered, mode, selectedChar, score, selectedLevel, diagLevel]);

  // ─── Start game ───────────────────────────────────────────────────
  const startGame = useCallback((gameMode: GameMode, level: string) => {
    setMode(gameMode);
    setSelectedLevel(level);
    setCurrentQ(0);
    setScore(0);
    setCombo(0);
    setCorrectCount(0);
    setWrongNotes([]);
    setAnswered(false);
    setSelectedAnswer(-1);
    setShowConfetti(false);

    if (gameMode === 'challenge') {
      setHearts(3);
      setTotalQuestions(10);
      const q = generateQuestion(level);
      setQuestion(q);
      const timer = TIMER_BY_LEVEL[level] || 15;
      startQuestionTimer(timer);
    } else if (gameMode === 'diagnosis') {
      setHearts(99);
      setTotalQuestions(30);
      setDiagLevel('8');
      setDiagConsecutive(0);
      setDiagWrongConsecutive(0);
      setDiagResult('8');
      setDiagLevelStats({});
      const q = generateQuestion('8');
      setQuestion(q);
      startQuestionTimer(15);
    } else if (gameMode === 'timeattack') {
      setHearts(99);
      setTotalQuestions(999);
      setTaCorrect(0);
      setTaTotal(0);
      setTaTotalTime(0);
      const randomLevel = LEVEL_ORDER[Math.floor(Math.random() * LEVEL_ORDER.length)];
      const q = generateQuestion(randomLevel);
      setQuestion(q);
      startTotalTimer();
    }

    questionStartRef.current = Date.now();
    setPhase('playing');
  }, [startQuestionTimer, startTotalTimer]);

  // ─── Handle answer ────────────────────────────────────────────────
  const handleAnswer = useCallback((optionIndex: number) => {
    if (answered || !question || phase !== 'playing') return;
    if (mode !== 'timeattack') clearTimer();

    setAnswered(true);
    setSelectedAnswer(optionIndex);
    const correct = optionIndex === question.correctIndex;
    setIsCorrect(correct);

    const elapsed = (Date.now() - questionStartRef.current) / 1000;

    if (correct) {
      const newCombo = combo + 1;
      setCombo(newCombo);
      setCorrectCount(prev => prev + 1);
      playSound('correct');

      // Calculate score
      const base = BASE_POINTS[question.level] || 20;
      const remaining = mode === 'timeattack' ? Math.max(0, 10 - elapsed) : timeLeft;
      const timeBonus = Math.round(remaining * 5);
      let comboMultiplier = 1;
      if (newCombo >= 10) comboMultiplier = 3;
      else if (newCombo >= 5) comboMultiplier = 2;
      else if (newCombo >= 3) comboMultiplier = 1.5;

      const points = Math.round((base + timeBonus) * comboMultiplier);
      setScore(prev => prev + points);
      setScoreAnim(points);
      setTimeout(() => setScoreAnim(0), 800);

      if (newCombo >= 3) {
        setShowCombo(true);
        playSound('combo');
        setTimeout(() => setShowCombo(false), 1000);
      }

      // Diagnosis mode: track consecutive correct
      if (mode === 'diagnosis') {
        setDiagWrongConsecutive(0);
        const newConsec = diagConsecutive + 1;
        setDiagConsecutive(newConsec);
        setDiagLevelStats(prev => ({
          ...prev,
          [diagLevel]: {
            correct: (prev[diagLevel]?.correct || 0) + 1,
            total: (prev[diagLevel]?.total || 0) + 1,
          },
        }));
        if (newConsec >= 3) {
          // Advance to next level
          const currentIdx = LEVEL_ORDER.indexOf(diagLevel);
          if (currentIdx < LEVEL_ORDER.length - 1) {
            const nextLevel = LEVEL_ORDER[currentIdx + 1];
            setDiagLevel(nextLevel);
            setDiagResult(nextLevel);
            setDiagConsecutive(0);
            playSound('levelup');
          }
        }
      }

      // Time attack tracking
      if (mode === 'timeattack') {
        setTaCorrect(prev => prev + 1);
        setTaTotalTime(prev => prev + elapsed);
      }
    } else {
      setCombo(0);
      playSound('wrong');
      saveWrongNote(question.correctId);
      setWrongNotes(prev => [...prev, {
        display: question.display,
        correctAnswer: question.options[question.correctIndex],
        yourAnswer: question.options[optionIndex],
        typeLabel: question.typeLabel,
      }]);

      if (mode === 'challenge') {
        setHearts(prev => {
          const newHearts = prev - 1;
          if (newHearts <= 0) {
            setTimeout(() => {
              playSound('gameover');
              const playerName = selectedChar >= 0 ? characters[selectedChar].name : '';
              if (score > 0) {
                saveScore('hanja', playerName, score);
                saveBestScore(`challenge:${selectedLevel}`, score);
              }
              setPhase('result');
            }, 1200);
          }
          return newHearts;
        });
      }

      if (mode === 'diagnosis') {
        setDiagConsecutive(0);
        const newWrong = diagWrongConsecutive + 1;
        setDiagWrongConsecutive(newWrong);
        setDiagLevelStats(prev => ({
          ...prev,
          [diagLevel]: {
            correct: (prev[diagLevel]?.correct || 0),
            total: (prev[diagLevel]?.total || 0) + 1,
          },
        }));
        if (newWrong >= 3) {
          // Stop diagnosis
          setTimeout(() => {
            setPhase('result');
          }, 1200);
          return;
        }
      }
    }

    if (mode === 'timeattack') {
      setTaTotal(prev => prev + 1);
    }
  }, [answered, question, phase, mode, combo, timeLeft, clearTimer, diagConsecutive, diagWrongConsecutive, diagLevel, selectedChar, score, selectedLevel]);

  // ─── Next question ────────────────────────────────────────────────
  const nextQuestion = useCallback(() => {
    if (hearts <= 0 && mode === 'challenge') return;

    const next = currentQ + 1;

    // Check end conditions
    if (mode === 'challenge' && next >= 10) {
      const playerName = selectedChar >= 0 ? characters[selectedChar].name : '';
      if (score > 0) {
        saveScore('hanja', playerName, score);
        saveBestScore(`challenge:${selectedLevel}`, score);
      }
      // Check pass condition
      if (correctCount >= 7) {
        saveBadge(selectedLevel);
        setBadges(loadBadges());
        setShowConfetti(true);
      }
      setPhase('result');
      return;
    }

    if (mode === 'diagnosis' && next >= 30) {
      setPhase('result');
      return;
    }

    if (mode === 'timeattack' && totalTimeLeft <= 0) {
      const playerName = selectedChar >= 0 ? characters[selectedChar].name : '';
      if (score > 0) {
        saveScore('hanja', playerName, score);
        saveBestScore('timeattack', score);
      }
      setPhase('result');
      return;
    }

    setCurrentQ(next);
    setAnswered(false);
    setSelectedAnswer(-1);

    // Generate next question
    let level = selectedLevel;
    if (mode === 'diagnosis') level = diagLevel;
    if (mode === 'timeattack') level = LEVEL_ORDER[Math.floor(Math.random() * LEVEL_ORDER.length)];

    const q = generateQuestion(level);
    setQuestion(q);
    questionStartRef.current = Date.now();

    if (mode === 'challenge') {
      const timer = TIMER_BY_LEVEL[selectedLevel] || 15;
      startQuestionTimer(timer);
    } else if (mode === 'diagnosis') {
      startQuestionTimer(15);
    }
    // timeattack uses total timer, not per-question
  }, [currentQ, mode, selectedLevel, diagLevel, hearts, selectedChar, score, correctCount, totalTimeLeft, startQuestionTimer]);

  // ─── Render helpers ───────────────────────────────────────────────
  const renderConfetti = () => {
    if (!showConfetti) return null;
    const confetti = Array.from({ length: 50 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 3,
      color: ['#FFD700', '#FF6B6B', '#4ECDC4', '#A78BFA', '#FB7185', '#34D399'][i % 6],
      size: 6 + Math.random() * 8,
    }));
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 100 }}>
        {confetti.map((c, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${c.left}%`,
              top: -20,
              width: c.size,
              height: c.size,
              backgroundColor: c.color,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              animation: `confettiFall ${c.duration}s ${c.delay}s ease-in forwards`,
            }}
          />
        ))}
        <style>{`
          @keyframes confettiFall {
            0% { transform: translateY(0) rotate(0deg); opacity: 1; }
            100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
          }
        `}</style>
      </div>
    );
  };

  // ─── Character Select ─────────────────────────────────────────────
  if (phase === 'select') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #FFF5F5 0%, #FEF3C7 50%, #ECFDF5 100%)',
        padding: '16px',
        fontFamily: 'sans-serif',
      }}>
        <button
          onClick={() => window.location.href = '/'}
          style={{
            background: '#FDE8F5',
            border: '1.5px solid #F9A8D4',
            borderRadius: 16,
            padding: '6px 16px',
            fontSize: 16,
            fontWeight: 'bold',
            color: '#E91E8C',
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          🏠 홈
        </button>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{
            fontSize: 32,
            fontWeight: 'bold',
            color: '#8B0000',
            fontFamily: "'Noto Serif KR', 'Batang', serif",
            margin: '8px 0',
          }}>
            漢字王
          </h1>
          <p style={{ fontSize: 20, color: '#B45309', fontWeight: 'bold' }}>한자왕</p>
          <p style={{ fontSize: 14, color: '#78716C', marginTop: 4 }}>캐릭터를 선택하세요!</p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
          maxWidth: 400,
          margin: '0 auto',
        }}>
          {characters.map((char, i) => (
            <button
              key={i}
              onClick={() => {
                setSelectedChar(i);
                setPhase('mode');
              }}
              style={{
                background: '#FFFFFF',
                border: `2px solid ${char.color}40`,
                borderRadius: 16,
                padding: '16px 8px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                boxShadow: `0 4px 12px ${char.color}20`,
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.96)')}
              onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
              onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <span style={{ fontSize: 40 }}>{char.emoji}</span>
              <span style={{ fontSize: 16, fontWeight: 'bold', color: char.color }}>{char.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── Mode Select ──────────────────────────────────────────────────
  if (phase === 'mode') {
    const char = characters[selectedChar];
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #FFF5F5 0%, #FEF3C7 50%, #ECFDF5 100%)',
        padding: '16px',
        fontFamily: 'sans-serif',
      }}>
        <button
          onClick={() => setPhase('select')}
          style={{
            background: '#FDE8F5',
            border: '1.5px solid #F9A8D4',
            borderRadius: 16,
            padding: '6px 16px',
            fontSize: 16,
            fontWeight: 'bold',
            color: '#E91E8C',
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          ← 뒤로
        </button>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span style={{ fontSize: 48 }}>{char.emoji}</span>
          <h2 style={{ fontSize: 22, color: char.color, fontWeight: 'bold', margin: '8px 0' }}>
            {char.name}의 한자왕 도전!
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 400, margin: '0 auto' }}>
          {[
            { mode: 'challenge' as GameMode, icon: '🎯', title: '급수 도전', desc: '급수를 선택하고 10문제 도전!', color: '#DC2626' },
            { mode: 'diagnosis' as GameMode, icon: '📊', title: '급수 진단', desc: '내 한자 실력은 몇 급?', color: '#7C3AED' },
            { mode: 'timeattack' as GameMode, icon: '⚡', title: '타임어택', desc: '60초 안에 최대한 많이!', color: '#D97706' },
          ].map(item => (
            <button
              key={item.mode}
              onClick={() => {
                if (item.mode === 'challenge') {
                  setMode('challenge');
                  setPhase('level');
                } else {
                  startGame(item.mode, '8');
                }
              }}
              style={{
                background: '#FFFFFF',
                border: `2px solid ${item.color}30`,
                borderRadius: 20,
                padding: '20px 24px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                boxShadow: `0 4px 16px ${item.color}15`,
                textAlign: 'left',
                transition: 'transform 0.15s',
              }}
              onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
              onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
              onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <span style={{ fontSize: 40 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: item.color }}>{item.title}</div>
                <div style={{ fontSize: 14, color: '#78716C', marginTop: 2 }}>{item.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── Level Select (challenge mode) ────────────────────────────────
  if (phase === 'level') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #FFF5F5 0%, #FEF3C7 50%, #ECFDF5 100%)',
        padding: '16px',
        fontFamily: 'sans-serif',
      }}>
        <button
          onClick={() => setPhase('mode')}
          style={{
            background: '#FDE8F5',
            border: '1.5px solid #F9A8D4',
            borderRadius: 16,
            padding: '6px 16px',
            fontSize: 16,
            fontWeight: 'bold',
            color: '#E91E8C',
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          ← 뒤로
        </button>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 24, color: '#8B0000', fontWeight: 'bold' }}>급수를 선택하세요</h2>
          <p style={{ fontSize: 14, color: '#78716C', marginTop: 4 }}>10문제 중 7문제 이상 맞히면 합격!</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400, margin: '0 auto' }}>
          {LEVELS.map(level => {
            const hasBadge = badges.includes(level.id);
            return (
              <button
                key={level.id}
                onClick={() => startGame('challenge', level.id)}
                style={{
                  background: hasBadge ? '#FFFBEB' : '#FFFFFF',
                  border: `2px solid ${hasBadge ? '#DAA520' : '#E5E7EB'}`,
                  borderRadius: 16,
                  padding: '16px 20px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: hasBadge ? '0 4px 12px #DAA52030' : '0 2px 8px #00000010',
                  transition: 'transform 0.15s',
                }}
                onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {hasBadge && <span style={{ fontSize: 24 }}>🏅</span>}
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 20, fontWeight: 'bold', color: '#1F2937' }}>{level.name}</div>
                    <div style={{ fontSize: 13, color: '#78716C' }}>{level.chars}자</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} style={{ fontSize: 16, opacity: i < level.difficulty ? 1 : 0.2 }}>⭐</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Game Play ────────────────────────────────────────────────────
  if (phase === 'playing' && question) {
    const char = characters[selectedChar];
    const isHanjaDisplay = question.type === 'huneum' || question.type === 'dokeum';
    const isHanjaOptions = question.type === 'hanja' || question.type === 'hanjaeo';
    const timerMax = mode === 'challenge' ? (TIMER_BY_LEVEL[selectedLevel] || 15) : 15;
    const timerPercent = mode === 'timeattack' ? (totalTimeLeft / 60) * 100 : (timeLeft / timerMax) * 100;
    const timerDisplay = mode === 'timeattack' ? totalTimeLeft : timeLeft;
    const timerColor = timerDisplay <= 5 ? '#EF4444' : timerDisplay <= 10 ? '#F59E0B' : '#10B981';

    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAFAFA 0%, #F5F5F4 100%)',
        padding: '12px 16px',
        fontFamily: 'sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Combo overlay */}
        {showCombo && (
          <div style={{
            position: 'fixed',
            top: '30%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 48,
            fontWeight: 'bold',
            color: '#FFD700',
            textShadow: '0 0 20px #FFD700, 0 2px 4px rgba(0,0,0,0.3)',
            zIndex: 50,
            animation: 'comboIn 0.5s ease-out',
            pointerEvents: 'none',
          }}>
            {combo}연속! 🔥
          </div>
        )}

        {/* Score animation */}
        {scoreAnim > 0 && (
          <div style={{
            position: 'fixed',
            top: '20%',
            right: 20,
            fontSize: 24,
            fontWeight: 'bold',
            color: '#10B981',
            animation: 'floatUp 0.8s ease-out forwards',
            zIndex: 50,
            pointerEvents: 'none',
          }}>
            +{scoreAnim}
          </div>
        )}

        <style>{`
          @keyframes comboIn {
            0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
            50% { transform: translate(-50%, -50%) scale(1.2); }
            100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          }
          @keyframes floatUp {
            0% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-60px); }
          }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
          }
        `}</style>

        {/* Top bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          background: '#FFFFFF',
          borderRadius: 12,
          padding: '8px 14px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <button
            onClick={() => {
              clearTimer();
              setPhase('mode');
            }}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ←
          </button>

          {/* Hearts (challenge mode) */}
          {mode === 'challenge' && (
            <div style={{ fontSize: 16 }}>
              {Array.from({ length: 3 }, (_, i) => (
                <span key={i} style={{ opacity: i < hearts ? 1 : 0.2 }}>❤️</span>
              ))}
            </div>
          )}

          {/* Question counter */}
          <div style={{ fontSize: 14, fontWeight: 'bold', color: '#6B7280' }}>
            {mode === 'diagnosis' ? `${currentQ + 1}/30` :
             mode === 'challenge' ? `${currentQ + 1}/10` :
             `${taTotal + 1}문제`}
          </div>

          {/* Score */}
          <div style={{ fontSize: 16, fontWeight: 'bold', color: char.color }}>
            {score}점
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          height: 6,
          background: '#E5E7EB',
          borderRadius: 3,
          marginBottom: 6,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${timerPercent}%`,
            background: timerColor,
            borderRadius: 3,
            transition: 'width 1s linear, background 0.3s',
          }} />
        </div>

        {/* Timer text */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <span style={{
            fontSize: 14,
            fontWeight: 'bold',
            color: timerColor,
          }}>
            {mode === 'timeattack' ? `⏱️ ${timerDisplay}초` : `⏱️ ${timerDisplay}초`}
          </span>
          {combo >= 3 && (
            <span style={{ marginLeft: 12, fontSize: 14, color: '#F59E0B', fontWeight: 'bold' }}>
              🔥 {combo}연속
            </span>
          )}
          {mode === 'diagnosis' && (
            <span style={{ marginLeft: 12, fontSize: 13, color: '#7C3AED', fontWeight: 'bold' }}>
              현재: {LEVELS.find(l => l.id === diagLevel)?.name}
            </span>
          )}
        </div>

        {/* Question type label */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span style={{
            fontSize: 13,
            color: '#8B5CF6',
            background: '#F3E8FF',
            padding: '4px 12px',
            borderRadius: 12,
            fontWeight: 'bold',
          }}>
            {question.typeLabel}
          </span>
        </div>

        {/* Main display */}
        <div style={{
          textAlign: 'center',
          padding: '24px 16px',
          marginBottom: 16,
          background: '#FFFFFF',
          borderRadius: 20,
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          border: '2px solid #F3F4F6',
          animation: answered && !isCorrect ? 'shake 0.3s ease-in-out' : undefined,
        }}>
          <div style={{
            fontSize: isHanjaDisplay ? 96 : 36,
            fontFamily: isHanjaDisplay ? "'Noto Serif KR', 'Batang', serif" : 'sans-serif',
            fontWeight: 'bold',
            color: '#1F2937',
            lineHeight: 1.2,
            marginBottom: 8,
          }}>
            {question.display}
          </div>
          {isHanjaDisplay && (
            <div style={{ fontSize: 14, color: '#9CA3AF' }}>
              {question.type === 'huneum' ? '이 한자의 훈음은?' : '이 한자어의 독음은?'}
            </div>
          )}
          {!isHanjaDisplay && (
            <div style={{ fontSize: 14, color: '#9CA3AF' }}>
              {question.type === 'hanja' ? '이 훈음의 한자는?' : '이 독음의 한자어는?'}
            </div>
          )}
        </div>

        {/* Answer options */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
          marginBottom: 16,
        }}>
          {question.options.map((option, i) => {
            let bg = '#FFFFFF';
            let borderColor = '#E5E7EB';
            let textColor = '#1F2937';

            if (answered) {
              if (i === question.correctIndex) {
                bg = '#DCFCE7';
                borderColor = '#22C55E';
                textColor = '#15803D';
              } else if (i === selectedAnswer && !isCorrect) {
                bg = '#FEE2E2';
                borderColor = '#EF4444';
                textColor = '#DC2626';
              } else {
                bg = '#F9FAFB';
                borderColor = '#E5E7EB';
                textColor = '#9CA3AF';
              }
            }

            return (
              <button
                key={i}
                onClick={() => handleAnswer(i)}
                disabled={answered}
                style={{
                  background: bg,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 14,
                  padding: '14px 10px',
                  cursor: answered ? 'default' : 'pointer',
                  fontSize: isHanjaOptions ? 32 : 17,
                  fontWeight: 'bold',
                  color: textColor,
                  fontFamily: isHanjaOptions ? "'Noto Serif KR', 'Batang', serif" : 'sans-serif',
                  minHeight: 56,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  transition: 'all 0.15s',
                  opacity: answered && i !== question.correctIndex && i !== selectedAnswer ? 0.5 : 1,
                }}
              >
                {option}
              </button>
            );
          })}
        </div>

        {/* Feedback */}
        {answered && (
          <div style={{
            textAlign: 'center',
            padding: '12px',
            background: isCorrect ? '#F0FDF4' : '#FEF2F2',
            borderRadius: 12,
            marginBottom: 8,
          }}>
            <div style={{
              fontSize: 20,
              fontWeight: 'bold',
              color: isCorrect ? '#16A34A' : '#DC2626',
              marginBottom: 4,
            }}>
              {isCorrect ? '정답! 🎉' : selectedAnswer === -1 ? '시간 초과! ⏰' : '오답! 😢'}
            </div>
            {!isCorrect && (
              <div style={{ fontSize: 14, color: '#6B7280' }}>
                정답: <strong>{question.options[question.correctIndex]}</strong>
              </div>
            )}
          </div>
        )}

        {/* Next button */}
        {answered && (hearts > 0 || mode !== 'challenge') && (
          <button
            onClick={nextQuestion}
            style={{
              width: '100%',
              padding: '14px',
              background: char.color,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 14,
              fontSize: 18,
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: `0 4px 12px ${char.color}40`,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          >
            다음 문제 👆
          </button>
        )}
      </div>
    );
  }

  // ─── Results ──────────────────────────────────────────────────────
  if (phase === 'result') {
    const char = characters[selectedChar];

    // Challenge result
    if (mode === 'challenge') {
      const passed = correctCount >= 7;
      return (
        <div style={{
          minHeight: '100vh',
          background: passed
            ? 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 50%, #FFF7ED 100%)'
            : 'linear-gradient(135deg, #FFF5F5 0%, #FEF2F2 50%, #F5F5F4 100%)',
          padding: '16px',
          fontFamily: 'sans-serif',
        }}>
          {renderConfetti()}

          <div style={{ textAlign: 'center', paddingTop: 20 }}>
            {/* Pass/Fail banner */}
            <div style={{
              fontSize: 48,
              marginBottom: 8,
            }}>
              {passed ? '🎊' : '😢'}
            </div>
            <h1 style={{
              fontSize: 32,
              fontWeight: 'bold',
              color: passed ? '#DAA520' : '#8B0000',
              fontFamily: "'Noto Serif KR', 'Batang', serif",
              margin: '0 0 8px',
            }}>
              {passed ? '합격!' : '불합격'}
            </h1>
            <p style={{ fontSize: 16, color: '#6B7280', marginBottom: 24 }}>
              {LEVELS.find(l => l.id === selectedLevel)?.name} {passed ? '급수 획득!' : '다시 도전하세요!'}
            </p>

            {/* Badge */}
            {passed && (
              <div style={{
                display: 'inline-block',
                background: 'linear-gradient(135deg, #FFD700, #DAA520)',
                borderRadius: '50%',
                width: 80,
                height: 80,
                lineHeight: '80px',
                fontSize: 40,
                marginBottom: 16,
                boxShadow: '0 4px 20px #DAA52060',
              }}>
                🏅
              </div>
            )}

            {/* Stats */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: 16,
              padding: '20px',
              marginBottom: 16,
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              textAlign: 'left',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280' }}>💰 점수</span>
                <span style={{ fontWeight: 'bold', color: '#1F2937' }}>{score}점</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280' }}>✅ 정답</span>
                <span style={{ fontWeight: 'bold', color: '#1F2937' }}>{correctCount} / 10</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ color: '#6B7280' }}>🎯 캐릭터</span>
                <span style={{ fontWeight: 'bold', color: char.color }}>{char.emoji} {char.name}</span>
              </div>
            </div>

            {/* Wrong answer review */}
            {wrongNotes.length > 0 && (
              <div style={{
                background: '#FFFFFF',
                borderRadius: 16,
                padding: '16px',
                marginBottom: 16,
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                textAlign: 'left',
              }}>
                <h3 style={{ fontSize: 16, fontWeight: 'bold', color: '#DC2626', marginBottom: 12 }}>
                  오답 노트 📝
                </h3>
                {wrongNotes.map((note, i) => (
                  <div key={i} style={{
                    padding: '8px 0',
                    borderBottom: i < wrongNotes.length - 1 ? '1px solid #F3F4F6' : 'none',
                    fontSize: 14,
                  }}>
                    <div style={{ color: '#6B7280', fontSize: 12 }}>{note.typeLabel}</div>
                    <div>
                      <span style={{ fontFamily: "'Noto Serif KR', 'Batang', serif", fontWeight: 'bold' }}>
                        {note.display}
                      </span>
                      {' → '}
                      <span style={{ color: '#16A34A', fontWeight: 'bold' }}>{note.correctAnswer}</span>
                      {note.yourAnswer !== '(시간 초과)' && (
                        <span style={{ color: '#DC2626', fontSize: 12, marginLeft: 8 }}>
                          (내 답: {note.yourAnswer})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => startGame('challenge', selectedLevel)}
                style={{
                  padding: '14px',
                  background: char.color,
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 14,
                  fontSize: 18,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: `0 4px 12px ${char.color}40`,
                }}
              >
                다시 도전 🔄
              </button>
              <button
                onClick={() => setPhase('level')}
                style={{
                  padding: '14px',
                  background: '#FFFFFF',
                  color: '#6B7280',
                  border: '2px solid #E5E7EB',
                  borderRadius: 14,
                  fontSize: 16,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                다른 급수 📋
              </button>
              <button
                onClick={() => window.location.href = '/'}
                style={{
                  padding: '14px',
                  background: '#FFFFFF',
                  color: '#6B7280',
                  border: '2px solid #E5E7EB',
                  borderRadius: 14,
                  fontSize: 16,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                홈으로 🏠
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Diagnosis result
    if (mode === 'diagnosis') {
      const resultLevel = LEVELS.find(l => l.id === diagResult);
      return (
        <div style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #EDE9FE 0%, #F3E8FF 50%, #FAE8FF 100%)',
          padding: '16px',
          fontFamily: 'sans-serif',
        }}>
          <div style={{ textAlign: 'center', paddingTop: 20 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>📊</div>
            <h1 style={{
              fontSize: 22,
              fontWeight: 'bold',
              color: '#7C3AED',
              margin: '0 0 8px',
            }}>
              당신의 한자 실력은
            </h1>

            {/* Level badge */}
            <div style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
              borderRadius: 24,
              padding: '16px 40px',
              marginBottom: 16,
              boxShadow: '0 8px 24px #7C3AED40',
            }}>
              <div style={{
                fontSize: 40,
                fontWeight: 'bold',
                color: '#FFFFFF',
                fontFamily: "'Noto Serif KR', 'Batang', serif",
              }}>
                {resultLevel?.name || '8급'}
              </div>
              <div style={{ fontSize: 14, color: '#E9D5FF' }}>수준입니다!</div>
            </div>

            {/* Stats */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: 16,
              padding: '20px',
              marginBottom: 16,
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              textAlign: 'left',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280' }}>📝 총 문제</span>
                <span style={{ fontWeight: 'bold' }}>{currentQ + 1}문제</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280' }}>✅ 정답</span>
                <span style={{ fontWeight: 'bold' }}>{correctCount}문제</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ color: '#6B7280' }}>📊 정답률</span>
                <span style={{ fontWeight: 'bold' }}>
                  {currentQ > 0 ? Math.round((correctCount / (currentQ + 1)) * 100) : 0}%
                </span>
              </div>
            </div>

            {/* Level breakdown */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: 16,
              padding: '16px',
              marginBottom: 16,
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              textAlign: 'left',
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 'bold', color: '#7C3AED', marginBottom: 12 }}>
                급수별 결과
              </h3>
              {LEVELS.map(level => {
                const stat = diagLevelStats[level.id];
                if (!stat) return null;
                const pct = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
                return (
                  <div key={level.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: '1px solid #F3F4F6',
                  }}>
                    <span style={{ fontWeight: 'bold', color: '#374151' }}>{level.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 80,
                        height: 8,
                        background: '#E5E7EB',
                        borderRadius: 4,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: pct >= 70 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#EF4444',
                          borderRadius: 4,
                        }} />
                      </div>
                      <span style={{ fontSize: 13, color: '#6B7280', minWidth: 60, textAlign: 'right' }}>
                        {stat.correct}/{stat.total} ({pct}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => startGame('diagnosis', '8')}
                style={{
                  padding: '14px',
                  background: '#7C3AED',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 14,
                  fontSize: 18,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px #7C3AED40',
                }}
              >
                다시 진단 🔄
              </button>
              <button
                onClick={() => {
                  setMode('challenge');
                  setSelectedLevel(diagResult);
                  setPhase('level');
                }}
                style={{
                  padding: '14px',
                  background: '#FFFFFF',
                  color: '#7C3AED',
                  border: '2px solid #7C3AED',
                  borderRadius: 14,
                  fontSize: 16,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                {resultLevel?.name} 도전하기 🎯
              </button>
              <button
                onClick={() => window.location.href = '/'}
                style={{
                  padding: '14px',
                  background: '#FFFFFF',
                  color: '#6B7280',
                  border: '2px solid #E5E7EB',
                  borderRadius: 14,
                  fontSize: 16,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                홈으로 🏠
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Time attack result
    if (mode === 'timeattack') {
      const avgTime = taTotal > 0 ? (taTotalTime / taTotal).toFixed(1) : '0';
      return (
        <div style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 50%, #FFFBEB 100%)',
          padding: '16px',
          fontFamily: 'sans-serif',
        }}>
          <div style={{ textAlign: 'center', paddingTop: 20 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>⚡</div>
            <h1 style={{
              fontSize: 28,
              fontWeight: 'bold',
              color: '#D97706',
              margin: '0 0 8px',
            }}>
              타임어택 결과!
            </h1>

            {/* Score */}
            <div style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              borderRadius: 24,
              padding: '16px 40px',
              marginBottom: 16,
              boxShadow: '0 8px 24px #D9770640',
            }}>
              <div style={{ fontSize: 40, fontWeight: 'bold', color: '#FFFFFF' }}>
                {score}점
              </div>
            </div>

            {/* Stats */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: 16,
              padding: '20px',
              marginBottom: 16,
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              textAlign: 'left',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280' }}>📝 풀은 문제</span>
                <span style={{ fontWeight: 'bold' }}>{taTotal}문제</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280' }}>✅ 정답</span>
                <span style={{ fontWeight: 'bold' }}>{taCorrect}문제</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280' }}>📊 정답률</span>
                <span style={{ fontWeight: 'bold' }}>
                  {taTotal > 0 ? Math.round((taCorrect / taTotal) * 100) : 0}%
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ color: '#6B7280' }}>⏱️ 평균 시간</span>
                <span style={{ fontWeight: 'bold' }}>{avgTime}초</span>
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => startGame('timeattack', '8')}
                style={{
                  padding: '14px',
                  background: '#D97706',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 14,
                  fontSize: 18,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px #D9770640',
                }}
              >
                다시 도전 🔄
              </button>
              <button
                onClick={() => window.location.href = '/'}
                style={{
                  padding: '14px',
                  background: '#FFFFFF',
                  color: '#6B7280',
                  border: '2px solid #E5E7EB',
                  borderRadius: 14,
                  fontSize: 16,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                홈으로 🏠
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  // Fallback
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p>로딩중...</p>
    </div>
  );
}
