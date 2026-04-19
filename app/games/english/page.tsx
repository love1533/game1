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

interface WordEntry {
  korean: string;
  english: string;
  emoji: string;
  category: string;
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

interface MissedWord {
  korean: string;
  english: string;
  emoji: string;
  playerAnswer: string;
}

type GamePhase = 'select' | 'mode' | 'playing' | 'result';
type GameMode = 'word' | 'picture' | 'listening';

// ─── Constants ───────────────────────────────────────────────────────
const TOTAL_QUESTIONS = 20;
const TIMER_SECONDS = 15;
const POINTS_CORRECT = 100;

// ─── Data ────────────────────────────────────────────────────────────
const CHARACTERS: Character[] = [
  { name: '승민', color: '#3B82F6', emoji: '🤖', heart: '💙' },
  { name: '건우', color: '#10B981', emoji: '🩺', heart: '💚' },
  { name: '강우', color: '#F59E0B', emoji: '👨‍🍳', heart: '🧡' },
  { name: '수현', color: '#EC4899', emoji: '💃', heart: '💗' },
  { name: '이현', color: '#FF69B4', emoji: '👸', heart: '💖' },
  { name: '준영', color: '#6366F1', emoji: '📚', heart: '💜' },
  { name: '준우', color: '#0EA5E9', emoji: '✈️', heart: '💎' },
];

const WORDS: WordEntry[] = [
  // Animals
  { korean: '강아지', english: 'Dog', emoji: '🐶', category: '동물' },
  { korean: '고양이', english: 'Cat', emoji: '🐱', category: '동물' },
  { korean: '새', english: 'Bird', emoji: '🐦', category: '동물' },
  { korean: '물고기', english: 'Fish', emoji: '🐟', category: '동물' },
  { korean: '토끼', english: 'Rabbit', emoji: '🐰', category: '동물' },
  { korean: '곰', english: 'Bear', emoji: '🐻', category: '동물' },
  { korean: '사자', english: 'Lion', emoji: '🦁', category: '동물' },
  { korean: '코끼리', english: 'Elephant', emoji: '🐘', category: '동물' },
  { korean: '원숭이', english: 'Monkey', emoji: '🐵', category: '동물' },
  { korean: '호랑이', english: 'Tiger', emoji: '🐯', category: '동물' },
  // Fruits
  { korean: '사과', english: 'Apple', emoji: '🍎', category: '과일' },
  { korean: '바나나', english: 'Banana', emoji: '🍌', category: '과일' },
  { korean: '오렌지', english: 'Orange', emoji: '🍊', category: '과일' },
  { korean: '포도', english: 'Grape', emoji: '🍇', category: '과일' },
  { korean: '딸기', english: 'Strawberry', emoji: '🍓', category: '과일' },
  { korean: '수박', english: 'Watermelon', emoji: '🍉', category: '과일' },
  { korean: '복숭아', english: 'Peach', emoji: '🍑', category: '과일' },
  { korean: '체리', english: 'Cherry', emoji: '🍒', category: '과일' },
  // Food
  { korean: '밥', english: 'Rice', emoji: '🍚', category: '음식' },
  { korean: '빵', english: 'Bread', emoji: '🍞', category: '음식' },
  { korean: '달걀', english: 'Egg', emoji: '🥚', category: '음식' },
  { korean: '우유', english: 'Milk', emoji: '🥛', category: '음식' },
  { korean: '피자', english: 'Pizza', emoji: '🍕', category: '음식' },
  { korean: '케이크', english: 'Cake', emoji: '🎂', category: '음식' },
  { korean: '쿠키', english: 'Cookie', emoji: '🍪', category: '음식' },
  { korean: '아이스크림', english: 'Ice Cream', emoji: '🍦', category: '음식' },
  // Colors
  { korean: '빨강', english: 'Red', emoji: '❤️', category: '색깔' },
  { korean: '파랑', english: 'Blue', emoji: '💙', category: '색깔' },
  { korean: '초록', english: 'Green', emoji: '💚', category: '색깔' },
  { korean: '노랑', english: 'Yellow', emoji: '💛', category: '색깔' },
  { korean: '분홍', english: 'Pink', emoji: '💗', category: '색깔' },
  { korean: '보라', english: 'Purple', emoji: '💜', category: '색깔' },
  { korean: '하양', english: 'White', emoji: '⬜', category: '색깔' },
  { korean: '검정', english: 'Black', emoji: '⬛', category: '색깔' },
  // Body
  { korean: '눈', english: 'Eye', emoji: '👁️', category: '신체' },
  { korean: '코', english: 'Nose', emoji: '👃', category: '신체' },
  { korean: '입', english: 'Mouth', emoji: '👄', category: '신체' },
  { korean: '귀', english: 'Ear', emoji: '👂', category: '신체' },
  { korean: '손', english: 'Hand', emoji: '✋', category: '신체' },
  { korean: '발', english: 'Foot', emoji: '🦶', category: '신체' },
  // Family
  { korean: '엄마', english: 'Mom', emoji: '👩', category: '가족' },
  { korean: '아빠', english: 'Dad', emoji: '👨', category: '가족' },
  { korean: '언니/누나', english: 'Sister', emoji: '👧', category: '가족' },
  { korean: '오빠/형', english: 'Brother', emoji: '👦', category: '가족' },
  { korean: '아기', english: 'Baby', emoji: '👶', category: '가족' },
  { korean: '할머니', english: 'Grandma', emoji: '👵', category: '가족' },
  { korean: '할아버지', english: 'Grandpa', emoji: '👴', category: '가족' },
  // Numbers
  { korean: '하나', english: 'One', emoji: '1️⃣', category: '숫자' },
  { korean: '둘', english: 'Two', emoji: '2️⃣', category: '숫자' },
  { korean: '셋', english: 'Three', emoji: '3️⃣', category: '숫자' },
  { korean: '넷', english: 'Four', emoji: '4️⃣', category: '숫자' },
  { korean: '다섯', english: 'Five', emoji: '5️⃣', category: '숫자' },
  // School
  { korean: '책', english: 'Book', emoji: '📚', category: '학교' },
  { korean: '연필', english: 'Pencil', emoji: '✏️', category: '학교' },
  { korean: '책상', english: 'Desk', emoji: '🪑', category: '학교' },
  { korean: '선생님', english: 'Teacher', emoji: '👩‍🏫', category: '학교' },
  { korean: '학생', english: 'Student', emoji: '🧑‍🎓', category: '학교' },
];

const BUTTON_COLORS = ['#FCA5A5', '#86EFAC', '#93C5FD', '#FDE68A'];
const CORRECT_MESSAGES = ['정답! 🎉', '맞아요! 👏', '천재! 🌟', '완벽해! ✨', '대박! 💯'];
const WRONG_MESSAGES = ['아쉽다~ 😢', '다음엔! 💪', '괜찮아! 😊', '힘내! 🍀'];

// ─── Audio ───────────────────────────────────────────────────────────
function createAudioContext(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch {
    return null;
  }
}

function playCorrectSound(ctx: AudioContext) {
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
    gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.2);
    osc.start(ctx.currentTime + i * 0.1);
    osc.stop(ctx.currentTime + i * 0.1 + 0.2);
  });
}

function playWrongSound(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(330, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(220, ctx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.35);
}

function playTickSound(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, ctx.currentTime);
  gain.gain.setValueAtTime(0.07, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.06);
}

function playCelebration(ctx: AudioContext) {
  const melody = [523, 659, 784, 659, 784, 1047];
  melody.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.13);
    gain.gain.setValueAtTime(0.22, ctx.currentTime + i * 0.13);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.13 + 0.2);
    osc.start(ctx.currentTime + i * 0.13);
    osc.stop(ctx.currentTime + i * 0.13 + 0.2);
  });
}

function speakWord(word: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.8;
  utterance.pitch = 1.1;
  window.speechSynthesis.speak(utterance);
}

// ─── Helpers ─────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getGrade(accuracy: number): { grade: string; color: string; message: string } {
  if (accuracy >= 90) return { grade: 'S', color: '#F59E0B', message: '완벽해요! 영어 천재! 🏆' };
  if (accuracy >= 70) return { grade: 'A', color: '#10B981', message: '정말 잘했어요! 👏' };
  if (accuracy >= 50) return { grade: 'B', color: '#3B82F6', message: '잘하고 있어요! 💪' };
  return { grade: 'C', color: '#EC4899', message: '다시 도전해봐요! 🌱' };
}

// ─── Component ───────────────────────────────────────────────────────
export default function EnglishWordMasterPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [phase, setPhase] = useState<GamePhase>('select');
  const [selectedChar, setSelectedChar] = useState<number>(-1);
  const [gameMode, setGameMode] = useState<GameMode>('word');
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [answered, setAnswered] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number>(-1);
  const [questions, setQuestions] = useState<WordEntry[]>([]);
  const [choices, setChoices] = useState<string[]>([]);
  const [missedWords, setMissedWords] = useState<MissedWord[]>([]);
  const [feedbackText, setFeedbackText] = useState('');
  const [scoreSaved, setScoreSaved] = useState(false);

  // Canvas animation refs
  const sparklesRef = useRef<Sparkle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const animFrameRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const charBounceRef = useRef(0);
  const shakeRef = useRef(0);
  const hoverCharRef = useRef(-1);
  const phaseRef = useRef<GamePhase>('select');
  const answeredRef = useRef(false);
  const currentQRef = useRef(0);
  const questionsRef = useRef<WordEntry[]>([]);
  const choicesRef = useRef<string[]>([]);
  const scoreRef = useRef(0);
  const correctCountRef = useRef(0);
  const timeLeftRef = useRef(TIMER_SECONDS);
  const selectedAnswerRef = useRef(-1);
  const missedWordsRef = useRef<MissedWord[]>([]);
  const gameModeRef = useRef<GameMode>('word');
  const selectedCharRef = useRef(-1);

  // Keep refs in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { answeredRef.current = answered; }, [answered]);
  useEffect(() => { currentQRef.current = currentQ; }, [currentQ]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { choicesRef.current = choices; }, [choices]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { correctCountRef.current = correctCount; }, [correctCount]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);
  useEffect(() => { selectedAnswerRef.current = selectedAnswer; }, [selectedAnswer]);
  useEffect(() => { missedWordsRef.current = missedWords; }, [missedWords]);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
  useEffect(() => { selectedCharRef.current = selectedChar; }, [selectedChar]);

  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = createAudioContext();
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  const addSparkles = useCallback((cx: number, cy: number, count: number, color?: string) => {
    const colors = color ? [color] : ['#FFD700', '#FF6B9D', '#4ECDC4', '#A78BFA', '#FB7185', '#34D399'];
    for (let i = 0; i < count; i++) {
      sparklesRef.current.push({
        x: cx + (Math.random() - 0.5) * 60,
        y: cy + (Math.random() - 0.5) * 60,
        size: 3 + Math.random() * 5,
        alpha: 1,
        speed: 1.5 + Math.random() * 3,
        angle: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }, []);

  const addFloatingText = useCallback((text: string, x: number, y: number, color: string, size = 28) => {
    floatingTextsRef.current.push({ text, x, y, alpha: 1, vy: -2.5, color, size });
  }, []);

  // Generate choices for a question
  const generateChoices = useCallback((word: WordEntry, mode: GameMode, pool: WordEntry[]): string[] => {
    const correct = mode === 'listening' ? word.korean : word.english;
    const others = pool
      .filter(w => (mode === 'listening' ? w.korean : w.english) !== correct)
      .map(w => mode === 'listening' ? w.korean : w.english);
    const shuffledOthers = shuffle(others).slice(0, 3);
    return shuffle([correct, ...shuffledOthers]);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const advanceQuestion = useCallback((qIdx: number, qs: WordEntry[], mode: GameMode) => {
    if (qIdx >= TOTAL_QUESTIONS) return;
    const word = qs[qIdx];
    const newChoices = generateChoices(word, mode, qs);
    setChoices(newChoices);
    choicesRef.current = newChoices;
    setAnswered(false);
    answeredRef.current = false;
    setSelectedAnswer(-1);
    selectedAnswerRef.current = -1;
    setTimeLeft(TIMER_SECONDS);
    timeLeftRef.current = TIMER_SECONDS;
    setFeedbackText('');

    stopTimer();
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current <= 5 && timeLeftRef.current > 0) {
        const ctx = audioCtxRef.current;
        if (ctx) playTickSound(ctx);
      }
      if (timeLeftRef.current <= 0) {
        stopTimer();
        if (!answeredRef.current) {
          answeredRef.current = true;
          setAnswered(true);
          setSelectedAnswer(-1);
          selectedAnswerRef.current = -1;
          shakeRef.current = 8;
          const ctx = audioCtxRef.current;
          if (ctx) playWrongSound(ctx);
          setFeedbackText('시간 초과! ⏰');
          const curWord = questionsRef.current[currentQRef.current];
          missedWordsRef.current = [...missedWordsRef.current, {
            korean: curWord.korean,
            english: curWord.english,
            emoji: curWord.emoji,
            playerAnswer: '(시간 초과)',
          }];
          setMissedWords([...missedWordsRef.current]);
        }
      }
    }, 1000);
  }, [generateChoices, stopTimer]);

  const startGame = useCallback((charIdx: number, mode: GameMode) => {
    ensureAudio();
    const qs = shuffle(WORDS).slice(0, TOTAL_QUESTIONS);
    setQuestions(qs);
    questionsRef.current = qs;
    setScore(0);
    scoreRef.current = 0;
    setCorrectCount(0);
    correctCountRef.current = 0;
    setMissedWords([]);
    missedWordsRef.current = [];
    setCurrentQ(0);
    currentQRef.current = 0;
    setScoreSaved(false);
    setGameMode(mode);
    gameModeRef.current = mode;
    setSelectedChar(charIdx);
    selectedCharRef.current = charIdx;
    setPhase('playing');
    phaseRef.current = 'playing';
    charBounceRef.current = 0;
    shakeRef.current = 0;
    sparklesRef.current = [];
    floatingTextsRef.current = [];
    setTimeout(() => advanceQuestion(0, qs, mode), 100);
  }, [ensureAudio, advanceQuestion]);

  const handleAnswer = useCallback((choiceIdx: number) => {
    if (answeredRef.current || phaseRef.current !== 'playing') return;
    stopTimer();

    const word = questionsRef.current[currentQRef.current];
    const mode = gameModeRef.current;
    const correct = mode === 'listening' ? word.korean : word.english;
    const choice = choicesRef.current[choiceIdx];
    const isCorrect = choice === correct;

    answeredRef.current = true;
    setAnswered(true);
    setSelectedAnswer(choiceIdx);
    selectedAnswerRef.current = choiceIdx;

    const ctx = ensureAudio();

    if (isCorrect) {
      correctCountRef.current += 1;
      setCorrectCount(correctCountRef.current);
      scoreRef.current += POINTS_CORRECT;
      setScore(scoreRef.current);
      if (ctx) playCorrectSound(ctx);
      charBounceRef.current = 18;
      const canvas = canvasRef.current;
      if (canvas) {
        addSparkles(canvas.width / 2, canvas.height * 0.45, 35);
        addFloatingText(
          CORRECT_MESSAGES[Math.floor(Math.random() * CORRECT_MESSAGES.length)],
          canvas.width / 2, canvas.height * 0.35, '#F59E0B', 32
        );
      }
      setFeedbackText(CORRECT_MESSAGES[Math.floor(Math.random() * CORRECT_MESSAGES.length)]);
    } else {
      if (ctx) playWrongSound(ctx);
      shakeRef.current = 10;
      missedWordsRef.current = [...missedWordsRef.current, {
        korean: word.korean,
        english: word.english,
        emoji: word.emoji,
        playerAnswer: choice,
      }];
      setMissedWords([...missedWordsRef.current]);
      setFeedbackText(WRONG_MESSAGES[Math.floor(Math.random() * WRONG_MESSAGES.length)]);
    }

    // For listening mode: pre-speak the next word NOW (in user-gesture context)
    // so mobile Safari allows it. We peek at the next question index.
    const nextQPeek = currentQRef.current + 1;
    if (gameModeRef.current === 'listening' && nextQPeek < TOTAL_QUESTIONS) {
      const nextWord = questionsRef.current[nextQPeek];
      if (nextWord) speakWord(nextWord.english);
    }

    // Advance after delay
    setTimeout(() => {
      const nextQ = currentQRef.current + 1;
      if (nextQ >= TOTAL_QUESTIONS) {
        stopTimer();
        setPhase('result');
        phaseRef.current = 'result';
        const ctx2 = audioCtxRef.current;
        if (ctx2) playCelebration(ctx2);
        const charName = CHARACTERS[selectedCharRef.current]?.name || '플레이어';
        saveScore('english', charName, scoreRef.current);
        setScoreSaved(true);
      } else {
        currentQRef.current = nextQ;
        setCurrentQ(nextQ);
        advanceQuestion(nextQ, questionsRef.current, gameModeRef.current);
      }
    }, isCorrect ? 1200 : 1800);
  }, [stopTimer, ensureAudio, addSparkles, addFloatingText, advanceQuestion]);

  // ─── Canvas Rendering ───────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d')!;

    function drawRoundRect(x: number, y: number, w: number, h: number, r: number) {
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
    }

    function drawBackground() {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#FFFDE7');
      grad.addColorStop(0.5, '#E8F5E9');
      grad.addColorStop(1, '#E3F2FD');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Decorative circles
      const circles = [
        { x: canvas.width * 0.1, y: canvas.height * 0.12, r: 40, c: 'rgba(252,165,165,0.2)' },
        { x: canvas.width * 0.9, y: canvas.height * 0.08, r: 55, c: 'rgba(134,239,172,0.2)' },
        { x: canvas.width * 0.05, y: canvas.height * 0.75, r: 45, c: 'rgba(147,197,253,0.2)' },
        { x: canvas.width * 0.92, y: canvas.height * 0.8, r: 35, c: 'rgba(253,230,138,0.25)' },
      ];
      circles.forEach(c => {
        ctx.fillStyle = c.c;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function drawSelectScreen() {
      drawBackground();
      const W = canvas.width, H = canvas.height;

      // Title
      ctx.font = `bold ${Math.min(W * 0.09, 44)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1F2937';
      ctx.fillText('영어 단어 마스터', W / 2, H * 0.1);

      ctx.font = `${Math.min(W * 0.045, 22)}px sans-serif`;
      ctx.fillStyle = '#6B7280';
      ctx.fillText('캐릭터를 선택하세요!', W / 2, H * 0.16);

      // Character grid
      const cols = 4;
      const rows = 2;
      const cardW = Math.min((W - 60) / cols, 120);
      const cardH = cardW * 1.35;
      const gridW = cols * cardW + (cols - 1) * 12;
      const startX = (W - gridW) / 2;
      const startY = H * 0.22;

      CHARACTERS.forEach((char, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = startX + col * (cardW + 12);
        const cy = startY + row * (cardH + 14);
        const hover = hoverCharRef.current === i;
        const selected = selectedCharRef.current === i;

        ctx.save();
        if (hover || selected) {
          ctx.shadowColor = char.color;
          ctx.shadowBlur = 12;
        }

        // Card bg
        drawRoundRect(cx, cy, cardW, cardH, 16);
        ctx.fillStyle = selected ? char.color : hover ? char.color + '33' : '#FFFFFF';
        ctx.fill();
        if (selected) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 3;
          ctx.stroke();
        } else {
          ctx.strokeStyle = char.color + '66';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();

        // Emoji circle
        ctx.fillStyle = selected ? 'rgba(255,255,255,0.3)' : char.color + '22';
        ctx.beginPath();
        ctx.arc(cx + cardW / 2, cy + cardH * 0.36, cardW * 0.28, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = `${cardW * 0.38}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char.emoji, cx + cardW / 2, cy + cardH * 0.36);
        ctx.textBaseline = 'alphabetic';

        ctx.font = `bold ${Math.min(cardW * 0.2, 16)}px sans-serif`;
        ctx.fillStyle = selected ? '#FFFFFF' : '#1F2937';
        ctx.fillText(char.name, cx + cardW / 2, cy + cardH * 0.78);
      });

      // Start button
      if (selectedCharRef.current >= 0) {
        const char = CHARACTERS[selectedCharRef.current];
        const btnW = Math.min(W * 0.55, 240);
        const btnH = 54;
        const bx = (W - btnW) / 2;
        const by = H * 0.78;

        ctx.save();
        ctx.shadowColor = char.color;
        ctx.shadowBlur = 16;
        drawRoundRect(bx, by, btnW, btnH, 27);
        const grad = ctx.createLinearGradient(bx, by, bx + btnW, by);
        grad.addColorStop(0, char.color);
        grad.addColorStop(1, char.color + 'CC');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        ctx.font = `bold ${Math.min(W * 0.055, 24)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('다음 →', W / 2, by + btnH * 0.64);
      } else {
        ctx.font = `${Math.min(W * 0.04, 18)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#9CA3AF';
        ctx.fillText('캐릭터를 탭해서 선택하세요', W / 2, H * 0.8);
      }
    }

    function drawModeScreen() {
      drawBackground();
      const W = canvas.width, H = canvas.height;

      if (selectedCharRef.current >= 0) {
        const char = CHARACTERS[selectedCharRef.current];
        ctx.font = `${Math.min(W * 0.12, 60)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char.emoji, W / 2, H * 0.1);
        ctx.textBaseline = 'alphabetic';
      }

      ctx.font = `bold ${Math.min(W * 0.075, 36)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1F2937';
      ctx.fillText('게임 모드 선택', W / 2, H * 0.22);

      const modes: { id: GameMode; title: string; desc: string; emoji: string; color: string }[] = [
        { id: 'word', title: '단어 맞추기', desc: '한국어 → 영어', emoji: '📝', color: '#3B82F6' },
        { id: 'picture', title: '그림 보고 맞추기', desc: '이모지 → 영어', emoji: '🖼️', color: '#10B981' },
        { id: 'listening', title: '영어 듣고 맞추기', desc: '소리 → 한국어', emoji: '🎧', color: '#F59E0B' },
      ];

      const cardW = Math.min(W * 0.82, 340);
      const cardH = 90;
      const startY = H * 0.3;

      modes.forEach((m, i) => {
        const cx = (W - cardW) / 2;
        const cy = startY + i * (cardH + 16);

        ctx.save();
        ctx.shadowColor = m.color + '55';
        ctx.shadowBlur = 10;
        drawRoundRect(cx, cy, cardW, cardH, 20);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = m.color + '88';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();

        // Color bar on left
        drawRoundRect(cx, cy, 8, cardH, 8);
        ctx.fillStyle = m.color;
        ctx.fill();

        ctx.font = `${cardH * 0.38}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.emoji, cx + 22, cy + cardH / 2);
        ctx.textBaseline = 'alphabetic';

        ctx.font = `bold ${Math.min(W * 0.052, 22)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#1F2937';
        ctx.fillText(m.title, cx + 72, cy + cardH * 0.42);

        ctx.font = `${Math.min(W * 0.037, 16)}px sans-serif`;
        ctx.fillStyle = '#6B7280';
        ctx.fillText(m.desc, cx + 72, cy + cardH * 0.7);
      });

      ctx.font = `${Math.min(W * 0.037, 16)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9CA3AF';
      ctx.fillText('20문제 · 문제당 15초', W / 2, H * 0.88);
    }

    function drawPlayingScreen() {
      const W = canvas.width, H = canvas.height;
      const q = questionsRef.current[currentQRef.current];
      if (!q) return;

      let shakeX = 0;
      if (shakeRef.current > 0) {
        shakeX = Math.sin(shakeRef.current * 1.5) * (shakeRef.current * 0.8);
        shakeRef.current -= 0.8;
        if (shakeRef.current < 0) shakeRef.current = 0;
      }

      ctx.save();
      ctx.translate(shakeX, 0);
      drawBackground();

      // Header bar
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      drawRoundRect(12, 12, W - 24, 44, 12);
      ctx.fill();

      // Progress bar
      const prog = (currentQRef.current) / TOTAL_QUESTIONS;
      ctx.fillStyle = '#E5E7EB';
      drawRoundRect(20, 20, W - 40, 14, 7);
      ctx.fill();
      const char = CHARACTERS[selectedCharRef.current];
      ctx.fillStyle = char?.color || '#3B82F6';
      if (prog > 0) {
        drawRoundRect(20, 20, (W - 40) * prog, 14, 7);
        ctx.fill();
      }

      // Question counter
      ctx.font = `bold ${Math.min(W * 0.038, 16)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#374151';
      ctx.fillText(`${currentQRef.current + 1} / ${TOTAL_QUESTIONS}`, W / 2, 50);

      // Score
      ctx.textAlign = 'right';
      ctx.fillStyle = '#F59E0B';
      ctx.fillText(`${scoreRef.current}점`, W - 20, 50);

      // Timer bar
      const timerY = 62;
      const timerProg = timeLeftRef.current / TIMER_SECONDS;
      ctx.fillStyle = '#F3F4F6';
      drawRoundRect(12, timerY, W - 24, 8, 4);
      ctx.fill();
      const timerColor = timerProg > 0.6 ? '#34D399' : timerProg > 0.35 ? '#FBBF24' : '#F87171';
      ctx.fillStyle = timerColor;
      if (timerProg > 0) {
        drawRoundRect(12, timerY, (W - 24) * timerProg, 8, 4);
        ctx.fill();
      }

      // Timer text
      ctx.font = `bold ${Math.min(W * 0.045, 20)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillStyle = timerColor;
      ctx.fillText(`⏱ ${timeLeftRef.current}s`, 14, timerY + 22);

      const mode = gameModeRef.current;
      const contentY = H * 0.18;

      // Question content
      if (mode === 'word') {
        // Category tag
        ctx.font = `${Math.min(W * 0.035, 15)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#9CA3AF';
        ctx.fillText(`[${q.category}]`, W / 2, contentY);

        // Korean word
        ctx.font = `bold ${Math.min(W * 0.13, 64)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1F2937';
        ctx.fillText(q.korean, W / 2, contentY + 65);

        ctx.font = `${Math.min(W * 0.04, 18)}px sans-serif`;
        ctx.fillStyle = '#6B7280';
        ctx.fillText('영어로 뭐라고 할까요?', W / 2, contentY + 90);

      } else if (mode === 'picture') {
        // Category
        ctx.font = `${Math.min(W * 0.035, 15)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#9CA3AF';
        ctx.fillText(`[${q.category}]`, W / 2, contentY);

        // Big emoji
        const emojiSize = Math.min(W * 0.28, 120);
        ctx.font = `${emojiSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(q.emoji, W / 2, contentY + emojiSize * 0.7);
        ctx.textBaseline = 'alphabetic';

        ctx.font = `${Math.min(W * 0.04, 18)}px sans-serif`;
        ctx.fillStyle = '#6B7280';
        ctx.fillText('영어로 뭐라고 할까요?', W / 2, contentY + emojiSize * 1.5);

      } else {
        // Listening mode
        ctx.font = `${Math.min(W * 0.18, 90)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎧', W / 2, contentY + 55);
        ctx.textBaseline = 'alphabetic';

        ctx.font = `bold ${Math.min(W * 0.065, 28)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1F2937';
        ctx.fillText('영어 단어를 듣고', W / 2, contentY + 115);
        ctx.fillText('한국어 뜻을 고르세요!', W / 2, contentY + 145);

        // Replay button
        const rbW = Math.min(W * 0.5, 180);
        const rbH = 44;
        const rbX = (W - rbW) / 2;
        const rbY = contentY + 162;
        drawRoundRect(rbX, rbY, rbW, rbH, 22);
        ctx.fillStyle = '#E0F2FE';
        ctx.fill();
        ctx.strokeStyle = '#0EA5E9';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = `bold ${Math.min(W * 0.04, 18)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0369A1';
        ctx.fillText('🔊 다시 듣기', W / 2, rbY + rbH * 0.64);
      }

      // Answer buttons
      const btnW = Math.min(W * 0.88, 380);
      const btnH = Math.min(H * 0.1, 68);
      const btnX = (W - btnW) / 2;
      const btnStartY = H * 0.6;
      const btnGap = 12;

      choicesRef.current.forEach((choice, i) => {
        const bx = btnX;
        const by = btnStartY + i * (btnH + btnGap);
        const isSelected = selectedAnswerRef.current === i;
        const correctAns = mode === 'listening' ? q.korean : q.english;
        const isCorrectBtn = choice === correctAns;
        const isAnswered = answeredRef.current;

        let bgColor = BUTTON_COLORS[i % BUTTON_COLORS.length];
        let textColor = '#1F2937';
        let border = 'transparent';
        let shadowBlur = 0;

        if (isAnswered) {
          if (isCorrectBtn) {
            bgColor = '#BBF7D0';
            border = '#16A34A';
            textColor = '#14532D';
            shadowBlur = 8;
          } else if (isSelected && !isCorrectBtn) {
            bgColor = '#FEE2E2';
            border = '#DC2626';
            textColor = '#7F1D1D';
          }
        }

        ctx.save();
        if (shadowBlur > 0) {
          ctx.shadowColor = '#16A34A55';
          ctx.shadowBlur = shadowBlur;
        }
        drawRoundRect(bx, by, btnW, btnH, 18);
        ctx.fillStyle = bgColor;
        ctx.fill();
        ctx.strokeStyle = border !== 'transparent' ? border : '#E5E7EB';
        ctx.lineWidth = border !== 'transparent' ? 2.5 : 1.5;
        ctx.stroke();
        ctx.restore();

        // Button index
        ctx.font = `bold ${Math.min(W * 0.04, 18)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillStyle = textColor + '88';
        ctx.fillText(['A', 'B', 'C', 'D'][i], bx + 18, by + btnH * 0.62);

        // Button text
        ctx.font = `bold ${Math.min(W * 0.052, 22)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = textColor;
        ctx.fillText(choice, bx + btnW / 2, by + btnH * 0.62);

        // Correct check / wrong X
        if (isAnswered && isCorrectBtn) {
          ctx.font = `${btnH * 0.45}px sans-serif`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText('✅', bx + btnW - 12, by + btnH / 2);
          ctx.textBaseline = 'alphabetic';
        } else if (isAnswered && isSelected && !isCorrectBtn) {
          ctx.font = `${btnH * 0.45}px sans-serif`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText('❌', bx + btnW - 12, by + btnH / 2);
          ctx.textBaseline = 'alphabetic';
        }
      });

      // Feedback text
      if (feedbackText) {
        ctx.font = `bold ${Math.min(W * 0.055, 26)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = answeredRef.current && selectedAnswerRef.current >= 0 &&
          choicesRef.current[selectedAnswerRef.current] === (mode === 'listening' ? q.korean : q.english)
          ? '#16A34A' : '#DC2626';
        ctx.fillText(feedbackText, W / 2, H * 0.57);
      }

      // Character cheerleader at bottom
      if (selectedCharRef.current >= 0) {
        const ch = CHARACTERS[selectedCharRef.current];
        const bounce = Math.abs(Math.sin(charBounceRef.current * 0.35)) * 10;
        if (charBounceRef.current > 0) charBounceRef.current -= 0.5;

        const charX = W * 0.85;
        const charY = H * 0.91 - bounce;

        ctx.font = `${Math.min(W * 0.1, 48)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ch.emoji, charX, charY);
        ctx.textBaseline = 'alphabetic';

        ctx.font = `bold ${Math.min(W * 0.032, 14)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = ch.color;
        ctx.fillText(ch.name, charX, charY + Math.min(W * 0.06, 28));

        // Hearts when correct
        if (charBounceRef.current > 10) {
          ctx.font = `${Math.min(W * 0.06, 26)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ch.heart, charX - 30, charY - 20);
          ctx.textBaseline = 'alphabetic';
        }
      }

      ctx.restore();

      // Sparkles
      sparklesRef.current = sparklesRef.current.filter(s => s.alpha > 0.05);
      sparklesRef.current.forEach(s => {
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        s.x += Math.cos(s.angle) * s.speed;
        s.y += Math.sin(s.angle) * s.speed - 0.5;
        s.alpha -= 0.025;
        s.size *= 0.97;
      });

      // Floating texts
      floatingTextsRef.current = floatingTextsRef.current.filter(t => t.alpha > 0.05);
      floatingTextsRef.current.forEach(t => {
        ctx.save();
        ctx.globalAlpha = t.alpha;
        ctx.font = `bold ${t.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = t.color;
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 4;
        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
        t.y += t.vy;
        t.alpha -= 0.018;
      });
    }

    function drawResultScreen() {
      drawBackground();
      const W = canvas.width, H = canvas.height;
      const total = TOTAL_QUESTIONS;
      const correct = correctCountRef.current;
      const accuracy = Math.round((correct / total) * 100);
      const { grade, color: gradeColor, message } = getGrade(accuracy);

      // Result card
      const cardW = Math.min(W * 0.9, 400);
      const cardX = (W - cardW) / 2;
      const cardY = H * 0.06;
      const cardH = H * 0.56;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.12)';
      ctx.shadowBlur = 20;
      drawRoundRect(cardX, cardY, cardW, cardH, 24);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();

      // Grade circle
      ctx.beginPath();
      ctx.arc(W / 2, cardY + 70, 52, 0, Math.PI * 2);
      ctx.fillStyle = gradeColor + '22';
      ctx.fill();
      ctx.strokeStyle = gradeColor;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.font = `bold ${Math.min(W * 0.14, 56)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = gradeColor;
      ctx.fillText(grade, W / 2, cardY + 90);

      ctx.font = `bold ${Math.min(W * 0.055, 24)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1F2937';
      ctx.fillText(message, W / 2, cardY + 140);

      // Stats
      ctx.font = `bold ${Math.min(W * 0.1, 46)}px sans-serif`;
      ctx.fillStyle = '#1F2937';
      ctx.textAlign = 'center';
      ctx.fillText(`${scoreRef.current}점`, W / 2, cardY + 195);

      // Accuracy bar
      const barW = cardW * 0.75;
      const barX = (W - barW) / 2;
      const barY = cardY + 215;
      ctx.fillStyle = '#F3F4F6';
      drawRoundRect(barX, barY, barW, 14, 7);
      ctx.fill();
      ctx.fillStyle = gradeColor;
      drawRoundRect(barX, barY, barW * (accuracy / 100), 14, 7);
      ctx.fill();

      ctx.font = `${Math.min(W * 0.04, 18)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6B7280';
      ctx.fillText(`정답률 ${accuracy}%`, W / 2, barY + 32);

      // Correct / total
      ctx.font = `${Math.min(W * 0.04, 18)}px sans-serif`;
      ctx.fillStyle = '#374151';
      ctx.textAlign = 'center';
      ctx.fillText(`${correct} / ${total} 정답`, W / 2, barY + 58);

      // Character
      if (selectedCharRef.current >= 0) {
        const ch = CHARACTERS[selectedCharRef.current];
        ctx.font = `${Math.min(W * 0.12, 52)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ch.emoji, W / 2, cardY + cardH - 46);
        ctx.textBaseline = 'alphabetic';
        ctx.font = `bold ${Math.min(W * 0.038, 16)}px sans-serif`;
        ctx.fillStyle = ch.color;
        ctx.fillText(ch.name, W / 2, cardY + cardH - 12);
      }

      // Missed words section
      const missedY = cardY + cardH + 16;
      if (missedWordsRef.current.length > 0) {
        ctx.font = `bold ${Math.min(W * 0.045, 20)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#1F2937';
        ctx.fillText('📖 틀린 단어 복습', cardX, missedY + 20);

        const showMax = Math.min(missedWordsRef.current.length, 4);
        const itemH = 44;
        missedWordsRef.current.slice(0, showMax).forEach((w, i) => {
          const iy = missedY + 34 + i * (itemH + 6);
          drawRoundRect(cardX, iy, cardW, itemH, 12);
          ctx.fillStyle = '#FEF2F2';
          ctx.fill();
          ctx.strokeStyle = '#FECACA';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.font = `${Math.min(W * 0.052, 22)}px sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(w.emoji, cardX + 12, iy + itemH / 2);
          ctx.textBaseline = 'alphabetic';

          ctx.font = `bold ${Math.min(W * 0.038, 16)}px sans-serif`;
          ctx.textAlign = 'left';
          ctx.fillStyle = '#1F2937';
          ctx.fillText(`${w.korean} = ${w.english}`, cardX + 46, iy + itemH * 0.42);

          ctx.font = `${Math.min(W * 0.032, 14)}px sans-serif`;
          ctx.fillStyle = '#EF4444';
          ctx.fillText(`내 답: ${w.playerAnswer}`, cardX + 46, iy + itemH * 0.72);
        });

        if (missedWordsRef.current.length > showMax) {
          ctx.font = `${Math.min(W * 0.033, 14)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#9CA3AF';
          ctx.fillText(`... 외 ${missedWordsRef.current.length - showMax}개 더`, W / 2, missedY + 34 + showMax * (itemH + 6) + 16);
        }
      }

      // Buttons
      const btnW = Math.min(W * 0.38, 160);
      const btnH = 52;
      const btnY = H - 72;
      const gap = 16;
      const totalBtnW = btnW * 2 + gap;
      const btnX1 = (W - totalBtnW) / 2;
      const btnX2 = btnX1 + btnW + gap;

      // Restart
      drawRoundRect(btnX1, btnY, btnW, btnH, 26);
      ctx.fillStyle = CHARACTERS[selectedCharRef.current]?.color || '#3B82F6';
      ctx.fill();
      ctx.font = `bold ${Math.min(W * 0.043, 19)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('🔄 다시하기', btnX1 + btnW / 2, btnY + btnH * 0.63);

      // Home
      drawRoundRect(btnX2, btnY, btnW, btnH, 26);
      ctx.fillStyle = '#6B7280';
      ctx.fill();
      ctx.font = `bold ${Math.min(W * 0.043, 19)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('🏠 홈으로', btnX2 + btnW / 2, btnY + btnH * 0.63);
    }

    function loop() {
      const phase = phaseRef.current;
      if (phase === 'select') drawSelectScreen();
      else if (phase === 'mode') drawModeScreen();
      else if (phase === 'playing') drawPlayingScreen();
      else if (phase === 'result') drawResultScreen();
      animFrameRef.current = requestAnimationFrame(loop);
    }

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
      stopTimer();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Input Handling ─────────────────────────────────────────────────
  const getCanvasPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0;
      clientY = e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? 0;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const handleTap = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width, H = canvas.height;
    const phase = phaseRef.current;

    if (phase === 'select') {
      // Check character cards
      const cols = 4;
      const cardW = Math.min((W - 60) / cols, 120);
      const cardH = cardW * 1.35;
      const gridW = cols * cardW + (cols - 1) * 12;
      const startX = (W - gridW) / 2;
      const startY = H * 0.22;

      for (let i = 0; i < CHARACTERS.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = startX + col * (cardW + 12);
        const cy = startY + row * (cardH + 14);
        if (x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) {
          ensureAudio();
          setSelectedChar(i);
          selectedCharRef.current = i;
          return;
        }
      }

      // Start button
      if (selectedCharRef.current >= 0) {
        const btnW = Math.min(W * 0.55, 240);
        const btnH = 54;
        const bx = (W - btnW) / 2;
        const by = H * 0.78;
        if (x >= bx && x <= bx + btnW && y >= by && y <= by + btnH) {
          setPhase('mode');
          phaseRef.current = 'mode';
        }
      }
    } else if (phase === 'mode') {
      const cardW = Math.min(W * 0.82, 340);
      const cardH = 90;
      const startY = H * 0.3;
      const cx = (W - cardW) / 2;
      const modes: GameMode[] = ['word', 'picture', 'listening'];
      for (let i = 0; i < modes.length; i++) {
        const cy = startY + i * (cardH + 16);
        if (x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) {
          const selectedMode = modes[i];
          startGame(selectedCharRef.current, selectedMode);
          // For listening mode: speak Q0 immediately in user-gesture context
          // (startGame shuffles the words into questionsRef, then advanceQuestion
          //  runs via setTimeout — but that loses the gesture context on iOS Safari)
          if (selectedMode === 'listening') {
            const qs = questionsRef.current;
            if (qs.length > 0) speakWord(qs[0].english);
          }
          return;
        }
      }
    } else if (phase === 'playing') {
      const mode = gameModeRef.current;
      const q = questionsRef.current[currentQRef.current];
      if (!q) return;

      // Listening: replay button
      if (mode === 'listening') {
        const contentY = H * 0.18;
        const rbW = Math.min(W * 0.5, 180);
        const rbH = 44;
        const rbX = (W - rbW) / 2;
        const rbY = contentY + 162;
        if (x >= rbX && x <= rbX + rbW && y >= rbY && y <= rbY + rbH) {
          ensureAudio();
          speakWord(q.english);
          return;
        }
      }

      // Answer buttons
      if (!answeredRef.current) {
        const btnW = Math.min(W * 0.88, 380);
        const btnH = Math.min(H * 0.1, 68);
        const btnX = (W - btnW) / 2;
        const btnStartY = H * 0.6;
        const btnGap = 12;
        for (let i = 0; i < 4; i++) {
          const by = btnStartY + i * (btnH + btnGap);
          if (x >= btnX && x <= btnX + btnW && y >= by && y <= by + btnH) {
            handleAnswer(i);
            return;
          }
        }
      }
    } else if (phase === 'result') {
      const btnW = Math.min(W * 0.38, 160);
      const btnH = 52;
      const btnY = H - 72;
      const gap = 16;
      const totalBtnW = btnW * 2 + gap;
      const btnX1 = (W - totalBtnW) / 2;
      const btnX2 = btnX1 + btnW + gap;

      if (x >= btnX1 && x <= btnX1 + btnW && y >= btnY && y <= btnY + btnH) {
        // Restart - go to mode select
        stopTimer();
        setPhase('mode');
        phaseRef.current = 'mode';
      } else if (x >= btnX2 && x <= btnX2 + btnW && y >= btnY && y <= btnY + btnH) {
        // Home
        window.location.href = '/';
      }
    }
  }, [ensureAudio, startGame, handleAnswer, stopTimer]);

  const handleMouseMove = useCallback((x: number, y: number) => {
    if (phaseRef.current !== 'select') {
      hoverCharRef.current = -1;
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width, H = canvas.height;
    const cols = 4;
    const cardW = Math.min((W - 60) / cols, 120);
    const cardH = cardW * 1.35;
    const gridW = cols * cardW + (cols - 1) * 12;
    const startX = (W - gridW) / 2;
    const startY = H * 0.22;
    let found = -1;
    for (let i = 0; i < CHARACTERS.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + 12);
      const cy = startY + row * (cardH + 14);
      if (x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) {
        found = i;
        break;
      }
    }
    hoverCharRef.current = found;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100vw', height: '100dvh', touchAction: 'none', cursor: 'pointer' }}
      onTouchStart={e => {
        e.preventDefault();
        const pos = getCanvasPos(e);
        handleTap(pos.x, pos.y);
      }}
      onClick={e => {
        const pos = getCanvasPos(e);
        handleTap(pos.x, pos.y);
      }}
      onMouseMove={e => {
        const pos = getCanvasPos(e);
        handleMouseMove(pos.x, pos.y);
      }}
    />
  );
}
