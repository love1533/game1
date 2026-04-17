'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { saveScore } from '@/lib/ranking';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Character {
  name: string;
  color: string;
  emoji: string;
  heart: string;
}

interface Song {
  id: number;
  title: string;
  artist: string;
  bpm: number;
  difficulty: number; // 1-5 stars
  color: string;
  accentColor: string;
  lyrics: LyricLine[];
  notePattern: NoteSection[];
  scaleFreqs: number[];
}

interface LyricLine {
  time: number;   // ms from start when this line appears
  text: string;
  subText?: string;
}

interface NoteSection {
  start: number;
  intervalMs: number;
  count: number;
  pattern: 'single' | 'pair' | 'triple';
}

interface Note {
  id: number;
  lane: number;
  y: number;
  hitTime: number;
  hit: boolean;
  missed: boolean;
  symbol: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: 'sparkle' | 'burst' | 'heart';
  char?: string;
}

interface JudgeEffect {
  text: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
}

interface LaneGlow {
  lane: number;
  life: number;
  maxLife: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CHARACTERS: Character[] = [
  { name: '승민', color: '#3B82F6', emoji: '🤖', heart: '💙' },
  { name: '건우', color: '#10B981', emoji: '🩺', heart: '💚' },
  { name: '강우', color: '#F59E0B', emoji: '👨‍🍳', heart: '🧡' },
  { name: '수현', color: '#EC4899', emoji: '💃', heart: '💗' },
  { name: '이현', color: '#FF69B4', emoji: '👸', heart: '💖' },
];

const LANE_COLORS = ['#FFB3C6', '#B3F0DC', '#C9B3F5'];
const LANE_GLOW_COLORS = ['#FF6B9D', '#4ECDC4', '#9B59B6'];
const NOTE_COLORS = ['#FF8FAB', '#5CE1C0', '#B48EF7'];

const TIMING = { PERFECT: 80, GREAT: 150, GOOD: 250 };
const TIMING_SCORES = { PERFECT: 300, GREAT: 200, GOOD: 100 };
const TIMING_HEALTH = { PERFECT: 2, GREAT: 0, GOOD: 0, MISS: -15 };

const NOTE_SYMBOLS = ['♪', '♫', '♩', '♬', '♪'];

const SONG_DURATION = 50000;
const HIT_ZONE_Y_RATIO = 0.82;
const NOTE_TRAVEL_TIME = 2400; // easy: slow fall
const HEALTH_MAX = 100;

// Pentatonic scale sets per song vibe
const C_MAJOR_PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.7];
const G_MAJOR_PENTA = [392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0];
const D_MAJOR_PENTA = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25];
const A_MAJOR_PENTA = [440.0, 493.88, 554.37, 659.25, 739.99, 880.0, 987.77];
const F_MAJOR_PENTA = [349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 783.99];

// ─── Songs ────────────────────────────────────────────────────────────────────
const SONGS: Song[] = [
  {
    id: 0,
    title: 'APT.',
    artist: '로제 & 브루노마스',
    bpm: 148,
    difficulty: 3,
    color: '#FF6B9D',
    accentColor: '#FFB3C6',
    scaleFreqs: C_MAJOR_PENTA,
    lyrics: [
      { time: 0,     text: '🎵 APT. 🎵', subText: '로제 & 브루노마스' },
      { time: 3000,  text: '아파트 아파트', subText: '아파트 아파트' },
      { time: 7000,  text: '에이피티 에이피티', subText: 'APT. APT.' },
      { time: 11000, text: '아파트 아파트', subText: '아파트 아파트' },
      { time: 15000, text: '에이피티!', subText: 'Come on!' },
      { time: 19000, text: '아파트 아파트', subText: '아파트 아파트' },
      { time: 23000, text: '에이피티 에이피티', subText: 'APT. APT.' },
      { time: 27000, text: '아파트 아파트', subText: '우리만의 공간' },
      { time: 31000, text: '에이피티!', subText: 'Let\'s go!' },
      { time: 35000, text: '아파트 아파트', subText: '아파트 아파트' },
      { time: 39000, text: '에이피티 에이피티', subText: 'APT. APT.' },
      { time: 43000, text: '아파트 아파트', subText: '아파트 아파트' },
      { time: 47000, text: '에이피티! ✨', subText: 'Finale!' },
    ],
    notePattern: [
      { start: 2000,  intervalMs: Math.round(60000/148*2), count: 8,  pattern: 'single' },
      { start: 8500,  intervalMs: Math.round(60000/148),   count: 12, pattern: 'pair' },
      { start: 17000, intervalMs: Math.round(60000/148*1.5), count: 10, pattern: 'single' },
      { start: 24000, intervalMs: Math.round(60000/148),   count: 16, pattern: 'pair' },
      { start: 34000, intervalMs: Math.round(60000/148*2), count: 8,  pattern: 'single' },
      { start: 41000, intervalMs: Math.round(60000/148),   count: 12, pattern: 'pair' },
      { start: 48000, intervalMs: Math.round(60000/148*1.5), count: 6,  pattern: 'triple' },
    ],
  },
  {
    id: 1,
    title: 'Super Shy',
    artist: '뉴진스',
    bpm: 130,
    difficulty: 2,
    color: '#5CE1C0',
    accentColor: '#B3F0DC',
    scaleFreqs: G_MAJOR_PENTA,
    lyrics: [
      { time: 0,     text: '🎵 Super Shy 🎵', subText: '뉴진스' },
      { time: 3000,  text: '슈퍼 샤이', subText: 'Super Shy' },
      { time: 7000,  text: 'I\'m super shy', subText: '슈퍼 샤이' },
      { time: 11000, text: '슈퍼 샤이 슈퍼 샤이', subText: 'Super shy super shy' },
      { time: 15000, text: 'I want to but I\'m shy', subText: '말하고 싶어' },
      { time: 19000, text: '슈퍼 샤이', subText: 'Super Shy' },
      { time: 23000, text: 'I\'m super super shy', subText: '너무 떨려' },
      { time: 27000, text: '슈퍼 샤이 슈퍼 샤이', subText: 'Super shy super shy' },
      { time: 31000, text: 'Can you see me?', subText: '날 봐줘' },
      { time: 35000, text: '슈퍼 샤이', subText: 'Super Shy' },
      { time: 39000, text: 'I\'m super super shy', subText: '슈퍼 샤이' },
      { time: 43000, text: '슈퍼 샤이 슈퍼 샤이 ✨', subText: 'Finale!' },
    ],
    notePattern: [
      { start: 2000,  intervalMs: Math.round(60000/130*2), count: 8,  pattern: 'single' },
      { start: 9000,  intervalMs: Math.round(60000/130*1.5), count: 10, pattern: 'pair' },
      { start: 17000, intervalMs: Math.round(60000/130),   count: 12, pattern: 'single' },
      { start: 25000, intervalMs: Math.round(60000/130),   count: 14, pattern: 'pair' },
      { start: 34000, intervalMs: Math.round(60000/130*2), count: 7,  pattern: 'single' },
      { start: 41000, intervalMs: Math.round(60000/130*1.5), count: 10, pattern: 'pair' },
    ],
  },
  {
    id: 2,
    title: 'Ditto',
    artist: '뉴진스',
    bpm: 100,
    difficulty: 1,
    color: '#C9B3F5',
    accentColor: '#E8D5FF',
    scaleFreqs: F_MAJOR_PENTA,
    lyrics: [
      { time: 0,     text: '🎵 Ditto 🎵', subText: '뉴진스' },
      { time: 3500,  text: '디토 디토 디토', subText: 'Ditto ditto' },
      { time: 8000,  text: 'I want you', subText: '나는 너를 원해' },
      { time: 12000, text: '디토 디토', subText: 'Ditto ditto' },
      { time: 16000, text: 'Only you', subText: '오직 너뿐이야' },
      { time: 20000, text: '디토 디토 디토', subText: 'Ditto ditto' },
      { time: 24000, text: 'I want you, need you', subText: '너가 필요해' },
      { time: 28000, text: '디토 디토', subText: 'Ditto ditto' },
      { time: 32000, text: 'I want you', subText: '나는 너를 원해' },
      { time: 36000, text: '디토 디토 디토', subText: 'Ditto ditto' },
      { time: 40000, text: 'Only you forever', subText: '영원히 너뿐' },
      { time: 44000, text: '디토 💜', subText: 'Ditto~' },
    ],
    notePattern: [
      { start: 2500,  intervalMs: Math.round(60000/100*2.5), count: 7,  pattern: 'single' },
      { start: 10000, intervalMs: Math.round(60000/100*2),   count: 9,  pattern: 'single' },
      { start: 18000, intervalMs: Math.round(60000/100*1.5), count: 11, pattern: 'pair' },
      { start: 27000, intervalMs: Math.round(60000/100*2),   count: 8,  pattern: 'single' },
      { start: 35000, intervalMs: Math.round(60000/100*1.5), count: 10, pattern: 'pair' },
      { start: 43000, intervalMs: Math.round(60000/100*2),   count: 5,  pattern: 'single' },
    ],
  },
  {
    id: 3,
    title: 'LOVE DIVE',
    artist: '아이브',
    bpm: 130,
    difficulty: 3,
    color: '#FFD700',
    accentColor: '#FFF0A0',
    scaleFreqs: D_MAJOR_PENTA,
    lyrics: [
      { time: 0,     text: '🎵 LOVE DIVE 🎵', subText: '아이브' },
      { time: 3000,  text: '러브 다이브', subText: 'Love Dive' },
      { time: 7000,  text: '난 궁금해 지고 있어', subText: 'I\'m getting curious' },
      { time: 11000, text: '러브 다이브', subText: 'Love Dive' },
      { time: 15000, text: '네 맘속으로 다이브', subText: 'Diving into your heart' },
      { time: 19000, text: '러브 다이브 러브 다이브', subText: 'Love Dive Love Dive' },
      { time: 23000, text: '난 궁금해 지고 있어', subText: 'I wonder about you' },
      { time: 27000, text: '러브 다이브', subText: 'Love Dive' },
      { time: 31000, text: '네가 좋아 너무 좋아', subText: 'I like you so much' },
      { time: 35000, text: '러브 다이브 러브 다이브', subText: 'Love Dive Love Dive' },
      { time: 39000, text: '난 궁금해 지고 있어', subText: 'Getting curious about you' },
      { time: 43000, text: '러브 다이브 ✨', subText: 'Love Dive~' },
    ],
    notePattern: [
      { start: 2000,  intervalMs: Math.round(60000/130*2), count: 8,  pattern: 'single' },
      { start: 9000,  intervalMs: Math.round(60000/130),   count: 12, pattern: 'pair' },
      { start: 17000, intervalMs: Math.round(60000/130*1.5), count: 10, pattern: 'single' },
      { start: 25000, intervalMs: Math.round(60000/130*0.75), count: 14, pattern: 'pair' },
      { start: 33000, intervalMs: Math.round(60000/130*2), count: 8,  pattern: 'single' },
      { start: 40000, intervalMs: Math.round(60000/130),   count: 12, pattern: 'pair' },
      { start: 47000, intervalMs: Math.round(60000/130*1.5), count: 5,  pattern: 'triple' },
    ],
  },
  {
    id: 4,
    title: '하입보이',
    artist: '뉴진스',
    bpm: 128,
    difficulty: 4,
    color: '#FF8C42',
    accentColor: '#FFD0A0',
    scaleFreqs: A_MAJOR_PENTA,
    lyrics: [
      { time: 0,     text: '🎵 하입보이 🎵', subText: '뉴진스' },
      { time: 2500,  text: '하입보이 하입보이', subText: 'Hype boy hype boy' },
      { time: 6500,  text: 'Cookie cookie cookie', subText: '쿠키 쿠키 쿠키' },
      { time: 10500, text: '하입보이 하입보이', subText: 'Hype boy hype boy' },
      { time: 14500, text: 'Gimme that hype', subText: '그 하입을 줘' },
      { time: 18500, text: '하입보이 하입보이', subText: 'Hype boy hype boy' },
      { time: 22500, text: 'Cookie cookie cookie', subText: '쿠키 쿠키 쿠키' },
      { time: 26500, text: '하입보이!', subText: 'Hype boy!' },
      { time: 30500, text: 'Get it get it get it', subText: '가져 가져 가져' },
      { time: 34500, text: '하입보이 하입보이', subText: 'Hype boy hype boy' },
      { time: 38500, text: 'Cookie cookie cookie', subText: '쿠키 쿠키 쿠키' },
      { time: 42500, text: '하입보이 하입보이', subText: 'Hype boy hype boy' },
      { time: 46500, text: '하입보이! 🔥', subText: 'Finale!' },
    ],
    notePattern: [
      { start: 1500,  intervalMs: Math.round(60000/128*1.5), count: 9,  pattern: 'single' },
      { start: 8000,  intervalMs: Math.round(60000/128),     count: 12, pattern: 'pair' },
      { start: 15000, intervalMs: Math.round(60000/128*0.75), count: 10, pattern: 'pair' },
      { start: 22000, intervalMs: Math.round(60000/128),     count: 14, pattern: 'pair' },
      { start: 30000, intervalMs: Math.round(60000/128*1.5), count: 8,  pattern: 'single' },
      { start: 37000, intervalMs: Math.round(60000/128),     count: 14, pattern: 'pair' },
      { start: 45500, intervalMs: Math.round(60000/128*0.75), count: 8,  pattern: 'triple' },
    ],
  },
];

// ─── Note generator per song ──────────────────────────────────────────────────
function generateNotesForSong(song: Song): Note[] {
  const notes: Note[] = [];
  let id = 0;
  const laneSeq = [0, 1, 2, 1, 0, 2, 0, 1, 2, 2, 0, 1, 1, 2, 0];
  let seqIdx = 0;

  for (const section of song.notePattern) {
    for (let i = 0; i < section.count; i++) {
      const hitTime = section.start + i * section.intervalMs;
      if (hitTime > SONG_DURATION - 1000) break;

      const lane = laneSeq[seqIdx % laneSeq.length];
      seqIdx++;

      notes.push({
        id: id++,
        lane,
        y: -60,
        hitTime,
        hit: false,
        missed: false,
        symbol: NOTE_SYMBOLS[id % NOTE_SYMBOLS.length],
      });

      if (section.pattern === 'pair' && i % 2 === 1) {
        const lane2 = (lane + 1 + Math.floor(i / 2)) % 3;
        const t2 = hitTime + Math.round(section.intervalMs * 0.35);
        if (t2 < SONG_DURATION - 500) {
          notes.push({
            id: id++,
            lane: lane2,
            y: -60,
            hitTime: t2,
            hit: false,
            missed: false,
            symbol: NOTE_SYMBOLS[(id + 2) % NOTE_SYMBOLS.length],
          });
        }
      }

      if (section.pattern === 'triple' && i % 3 === 2) {
        const lane3 = (lane + 2) % 3;
        const t3 = hitTime + Math.round(section.intervalMs * 0.5);
        if (t3 < SONG_DURATION - 500) {
          notes.push({
            id: id++,
            lane: lane3,
            y: -60,
            hitTime: t3,
            hit: false,
            missed: false,
            symbol: NOTE_SYMBOLS[(id + 1) % NOTE_SYMBOLS.length],
          });
        }
      }
    }
  }

  return notes.sort((a, b) => a.hitTime - b.hitTime);
}

// ─── Audio ────────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playHitSound(lane: number, grade: 'PERFECT' | 'GREAT' | 'GOOD', scaleFreqs: number[]) {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const baseIdx = lane * 2;
    const freqs = [
      scaleFreqs[baseIdx % scaleFreqs.length],
      scaleFreqs[(baseIdx + 2) % scaleFreqs.length],
      scaleFreqs[(baseIdx + 4) % scaleFreqs.length],
    ];

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.18, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    gainNode.connect(ctx.destination);

    const count = grade === 'PERFECT' ? 3 : grade === 'GREAT' ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i], now);
      osc.connect(gainNode);
      osc.start(now + i * 0.02);
      osc.stop(now + 0.38);
    }

    if (grade === 'PERFECT') {
      // Extra shimmer
      const shimmer = ctx.createOscillator();
      shimmer.type = 'triangle';
      shimmer.frequency.setValueAtTime(freqs[2] * 2, now);
      const sGain = ctx.createGain();
      sGain.gain.setValueAtTime(0.05, now);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      shimmer.connect(sGain);
      sGain.connect(ctx.destination);
      shimmer.start(now);
      shimmer.stop(now + 0.25);
    }
  } catch (_) { /* ignore */ }
}

function playMissSound() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.07, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    g.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
    osc.connect(g);
    osc.start(now);
    osc.stop(now + 0.18);
  } catch (_) { /* ignore */ }
}

function playSelectSound(freq: number) {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    g.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(g);
    osc.start(now);
    osc.stop(now + 0.22);
  } catch (_) { /* ignore */ }
}

// ─── Main Component ───────────────────────────────────────────────────────────
type Phase = 'charSelect' | 'songSelect' | 'playing' | 'result';

export default function RhythmPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>('charSelect');
  const [phase, setPhase] = useState<Phase>('charSelect');
  const charRef = useRef<Character>(CHARACTERS[0]);
  const songRef = useRef<Song>(SONGS[0]);
  const [selectedChar, setSelectedChar] = useState<Character>(CHARACTERS[0]);
  const [selectedSong, setSelectedSong] = useState<Song>(SONGS[0]);

  // Game refs
  const notesRef = useRef<Note[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const judgeEffectsRef = useRef<JudgeEffect[]>([]);
  const laneGlowsRef = useRef<LaneGlow[]>([]);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const healthRef = useRef(HEALTH_MAX);
  const startTimeRef = useRef(0);
  const gameOverRef = useRef(false);
  const hitZoneGlowRef = useRef(0);
  const countPerfectRef = useRef(0);
  const countGreatRef = useRef(0);
  const countGoodRef = useRef(0);
  const countMissRef = useRef(0);
  const rafRef = useRef<number>(0);
  const canvasSizeRef = useRef({ w: 390, h: 844 });
  const currentLyricIdxRef = useRef(0);
  const lyricFlashRef = useRef(0); // frames of flash when lyric changes

  const [resultData, setResultData] = useState({
    score: 0, maxCombo: 0, perfect: 0, great: 0, good: 0, miss: 0, grade: 'C', songTitle: '',
  });

  const getLayout = useCallback((w: number, h: number) => {
    const laneWidth = w / 3;
    const hitZoneY = h * HIT_ZONE_Y_RATIO;
    const noteRadius = Math.min(laneWidth * 0.30, 30);
    return { laneWidth, hitZoneY, noteRadius };
  }, []);

  const spawnSparkles = useCallback((x: number, y: number, color: string, count = 10) => {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const spd = 2 + Math.random() * 4;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 1.5,
        life: 45 + Math.random() * 20,
        maxLife: 65,
        color,
        size: 3 + Math.random() * 5,
        type: 'sparkle',
      });
    }
  }, []);

  const spawnBurst = useCallback((x: number, y: number, color: string) => {
    for (let i = 0; i < 7; i++) {
      const angle = (Math.PI * 2 * i) / 7;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * 5,
        vy: Math.sin(angle) * 5,
        life: 28,
        maxLife: 28,
        color,
        size: 9,
        type: 'burst',
      });
    }
  }, []);

  const spawnHeart = useCallback((x: number, y: number, char: string) => {
    particlesRef.current.push({
      x, y,
      vx: (Math.random() - 0.5) * 2,
      vy: -3 - Math.random() * 2,
      life: 60,
      maxLife: 60,
      color: '#FF6B9D',
      size: 18,
      type: 'heart',
      char,
    });
  }, []);

  // ── Judge tap ─────────────────────────────────────────────────────
  const judgeTap = useCallback((lane: number) => {
    const { w, h } = canvasSizeRef.current;
    const { hitZoneY } = getLayout(w, h);
    const { laneWidth } = getLayout(w, h);
    const elapsed = performance.now() - startTimeRef.current;

    let bestNote: Note | null = null;
    let bestDelta = Infinity;
    for (const note of notesRef.current) {
      if (note.lane !== lane || note.hit || note.missed) continue;
      const delta = Math.abs(elapsed - note.hitTime);
      if (delta < bestDelta && delta <= TIMING.GOOD + 60) {
        bestDelta = delta;
        bestNote = note;
      }
    }

    const laneX = lane * laneWidth + laneWidth / 2;
    const laneColor = LANE_GLOW_COLORS[lane];
    laneGlowsRef.current.push({ lane, life: 20, maxLife: 20 });

    if (!bestNote) return;

    bestNote.hit = true;
    const song = songRef.current;
    let grade: 'PERFECT' | 'GREAT' | 'GOOD';

    if (bestDelta <= TIMING.PERFECT) {
      grade = 'PERFECT';
      countPerfectRef.current++;
      const mult = Math.max(1, Math.floor(comboRef.current / 10) + 1);
      scoreRef.current += TIMING_SCORES.PERFECT * mult;
      healthRef.current = Math.min(HEALTH_MAX, healthRef.current + TIMING_HEALTH.PERFECT);
      spawnSparkles(laneX, hitZoneY, laneColor, 16);
      spawnBurst(laneX, hitZoneY, '#FFD700');
      spawnHeart(laneX, hitZoneY - 30, charRef.current.heart);
      judgeEffectsRef.current.push({
        text: 'PERFECT ✨', x: laneX, y: hitZoneY - 40,
        life: 55, maxLife: 55, color: '#FFD700', scale: 1.3,
      });
    } else if (bestDelta <= TIMING.GREAT) {
      grade = 'GREAT';
      countGreatRef.current++;
      const mult = Math.max(1, Math.floor(comboRef.current / 10) + 1);
      scoreRef.current += TIMING_SCORES.GREAT * mult;
      spawnSparkles(laneX, hitZoneY, laneColor, 8);
      judgeEffectsRef.current.push({
        text: 'GREAT 💫', x: laneX, y: hitZoneY - 40,
        life: 50, maxLife: 50, color: '#A8E6CF', scale: 1.15,
      });
    } else {
      grade = 'GOOD';
      countGoodRef.current++;
      scoreRef.current += TIMING_SCORES.GOOD;
      judgeEffectsRef.current.push({
        text: 'GOOD 🎶', x: laneX, y: hitZoneY - 40,
        life: 45, maxLife: 45, color: '#DDA0DD', scale: 1.0,
      });
    }

    comboRef.current++;
    if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current;
    hitZoneGlowRef.current = 22;

    playHitSound(lane, grade, song.scaleFreqs);
  }, [getLayout, spawnSparkles, spawnBurst, spawnHeart]);

  // ── Draw lyrics bar ────────────────────────────────────────────────
  const drawLyrics = useCallback((
    ctx: CanvasRenderingContext2D, w: number, elapsed: number, song: Song
  ) => {
    const lyrics = song.lyrics;
    // Find current lyric
    let lyricIdx = 0;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (elapsed >= lyrics[i].time) { lyricIdx = i; break; }
    }

    if (lyricIdx !== currentLyricIdxRef.current) {
      currentLyricIdxRef.current = lyricIdx;
      lyricFlashRef.current = 30;
    }

    const lyric = lyrics[lyricIdx];
    const flashAlpha = lyricFlashRef.current > 0
      ? 0.7 + (lyricFlashRef.current / 30) * 0.3
      : 1.0;
    if (lyricFlashRef.current > 0) lyricFlashRef.current--;

    // Next lyric (upcoming)
    const nextLyric = lyrics[lyricIdx + 1];

    // Lyric panel background
    const panelH = 78;
    const panelY = 52;
    const panelGrad = ctx.createLinearGradient(0, panelY, 0, panelY + panelH);
    panelGrad.addColorStop(0, song.color + '33');
    panelGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = panelGrad;
    ctx.fillRect(0, panelY, w, panelH);

    // Main lyric
    const mainFontSize = Math.min(w * 0.068, 28);
    ctx.font = `bold ${mainFontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = song.color;
    ctx.shadowBlur = 18 + (lyricFlashRef.current > 0 ? 12 : 0);
    ctx.fillText(lyric.text, w / 2, panelY + 22);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Sub text
    if (lyric.subText) {
      ctx.font = `${Math.min(w * 0.042, 17)}px sans-serif`;
      ctx.fillStyle = song.accentColor;
      ctx.globalAlpha = 0.85 * flashAlpha;
      ctx.fillText(lyric.subText, w / 2, panelY + 50);
      ctx.globalAlpha = 1;
    }

    // Next lyrics preview (dimmed)
    if (nextLyric && elapsed >= nextLyric.time - 2000) {
      const timeUntilNext = nextLyric.time - elapsed;
      const previewAlpha = Math.max(0, 1 - timeUntilNext / 2000) * 0.4;
      ctx.font = `${Math.min(w * 0.038, 15)}px sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = previewAlpha;
      ctx.fillText(`▶ ${nextLyric.text}`, w / 2, panelY + 68);
      ctx.globalAlpha = 1;
    }
  }, []);

  // ── Draw frame ────────────────────────────────────────────────────
  const drawFrame = useCallback((ctx: CanvasRenderingContext2D, timestamp: number) => {
    const w = canvasSizeRef.current.w;
    const h = canvasSizeRef.current.h;
    const { laneWidth, hitZoneY, noteRadius } = getLayout(w, h);
    const elapsed = timestamp - startTimeRef.current;
    const song = songRef.current;

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#12082A');
    bg.addColorStop(0.4, '#1A1040');
    bg.addColorStop(1, '#0D0822');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Animated stars
    for (let i = 0; i < 40; i++) {
      const blink = Math.sin(elapsed * 0.001 + i * 1.7) * 0.5 + 0.5;
      const sx = ((i * 137.5 + elapsed * 0.004) % (w + 10)) - 5;
      const sy = ((i * 83.1) % h);
      ctx.fillStyle = `rgba(255,255,255,${0.15 + blink * 0.35})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.5 + (i % 3) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Song color pulse at bottom
    const pulse = Math.sin(elapsed * 0.003) * 0.5 + 0.5;
    const bottomGlow = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, w * 0.8);
    bottomGlow.addColorStop(0, song.color + Math.round(30 + pulse * 20).toString(16).padStart(2, '0'));
    bottomGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = bottomGlow;
    ctx.fillRect(0, h * 0.6, w, h * 0.4);

    // Lane backgrounds
    const laneGlows = laneGlowsRef.current;
    for (let i = 0; i < 3; i++) {
      const lx = i * laneWidth;
      const activeGlow = laneGlows.find(g => g.lane === i);
      const ga = activeGlow ? activeGlow.life / activeGlow.maxLife : 0;

      // Lane tint
      ctx.fillStyle = `rgba(255,255,255,${0.02 + ga * 0.12})`;
      ctx.fillRect(lx, 0, laneWidth, h);

      // Hit area glow
      if (ga > 0) {
        const gg = ctx.createRadialGradient(
          lx + laneWidth / 2, hitZoneY, 0,
          lx + laneWidth / 2, hitZoneY, laneWidth
        );
        gg.addColorStop(0, LANE_GLOW_COLORS[i] + Math.round(ga * 100).toString(16).padStart(2, '0'));
        gg.addColorStop(1, 'transparent');
        ctx.fillStyle = gg;
        ctx.fillRect(lx, hitZoneY - laneWidth, laneWidth, laneWidth * 2);
      }
    }

    // Lane dividers
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * laneWidth, 0);
      ctx.lineTo(i * laneWidth, h);
      ctx.stroke();
    }

    // Hit zone line
    const hzG = hitZoneGlowRef.current;
    ctx.strokeStyle = `rgba(255,255,255,${0.55 + (hzG / 22) * 0.45})`;
    ctx.lineWidth = 2 + (hzG / 22) * 2;
    ctx.shadowColor = 'white';
    ctx.shadowBlur = 6 + hzG * 0.6;
    ctx.beginPath();
    ctx.moveTo(0, hitZoneY);
    ctx.lineTo(w, hitZoneY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Hit zone circles
    for (let i = 0; i < 3; i++) {
      const cx = i * laneWidth + laneWidth / 2;
      const ag = laneGlows.find(g => g.lane === i);
      const ga = ag ? ag.life / ag.maxLife : 0;
      const r = noteRadius * 1.2 + ga * 8;

      ctx.beginPath();
      ctx.arc(cx, hitZoneY, r, 0, Math.PI * 2);
      ctx.strokeStyle = LANE_COLORS[i] + 'CC';
      ctx.lineWidth = 2.5 + ga * 2.5;
      ctx.shadowColor = LANE_GLOW_COLORS[i];
      ctx.shadowBlur = 10 + ga * 18;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(cx, hitZoneY, r * 0.55, 0, Math.PI * 2);
      const fillAlpha = Math.round(25 + ga * 55).toString(16).padStart(2, '0');
      ctx.fillStyle = LANE_COLORS[i] + fillAlpha;
      ctx.fill();
    }

    // Notes
    const notes = notesRef.current;
    for (const note of notes) {
      if (note.hit || note.missed) continue;

      const timeUntilHit = note.hitTime - elapsed;
      const noteY = hitZoneY - (timeUntilHit / NOTE_TRAVEL_TIME) * hitZoneY;

      if (noteY < -noteRadius * 3 || noteY > h + noteRadius) continue;
      note.y = noteY;

      const cx = note.lane * laneWidth + laneWidth / 2;
      const color = NOTE_COLORS[note.lane];

      // Note shadow trail
      const trailAlpha = Math.min(1, (noteY + noteRadius * 3) / (noteRadius * 6));
      ctx.globalAlpha = trailAlpha * 0.25;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(cx, noteY + noteRadius * 1.2, noteRadius * 0.7, noteRadius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Note glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;

      const grad = ctx.createRadialGradient(
        cx - noteRadius * 0.3, noteY - noteRadius * 0.3, 1,
        cx, noteY, noteRadius
      );
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.35, color + 'EE');
      grad.addColorStop(1, color + '88');
      ctx.beginPath();
      ctx.arc(cx, noteY, noteRadius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Note symbol
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${noteRadius * 0.82}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(note.symbol, cx, noteY);

      // Auto miss
      if (elapsed - note.hitTime > TIMING.GOOD + 80) {
        note.missed = true;
        comboRef.current = 0;
        countMissRef.current++;
        healthRef.current = Math.max(0, healthRef.current + TIMING_HEALTH.MISS);
        const mx = note.lane * laneWidth + laneWidth / 2;
        judgeEffectsRef.current.push({
          text: 'MISS 💔', x: mx, y: hitZoneY - 40,
          life: 38, maxLife: 38, color: '#FF6B6B', scale: 1.0,
        });
        playMissSound();
      }
    }

    // Particles
    const particles = particlesRef.current;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.life--;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      const alpha = p.life / p.maxLife;

      ctx.globalAlpha = alpha;
      if (p.type === 'heart' && p.char) {
        ctx.font = `${p.size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.char, p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.type === 'sparkle' ? 8 : 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    }

    // Judge effects
    const effects = judgeEffectsRef.current;
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.life--;
      e.y -= 0.75;
      if (e.life <= 0) { effects.splice(i, 1); continue; }
      const alpha = Math.min(1, (e.life / e.maxLife) * 2.2);
      const scaleVal = e.scale + (1 - e.life / e.maxLife) * 0.15;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = e.color;
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 12;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(scaleVal, scaleVal);
      ctx.font = `bold ${Math.min(w * 0.05, 19)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.text, 0, 0);
      ctx.restore();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Tick lane glows
    for (let i = laneGlows.length - 1; i >= 0; i--) {
      laneGlows[i].life--;
      if (laneGlows[i].life <= 0) laneGlows.splice(i, 1);
    }
    if (hitZoneGlowRef.current > 0) hitZoneGlowRef.current--;

    // ── HUD ───────────────────────────────────────────────────────
    const score = scoreRef.current;
    const combo = comboRef.current;
    const health = healthRef.current;

    // Top bar bg
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, w, 52);

    // Character + emoji
    ctx.font = `bold ${Math.min(w * 0.048, 18)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = charRef.current.color;
    ctx.shadowColor = charRef.current.color;
    ctx.shadowBlur = 8;
    ctx.fillText(`${charRef.current.emoji} ${charRef.current.name}`, 12, 26);
    ctx.shadowBlur = 0;

    // Score
    ctx.font = `bold ${Math.min(w * 0.055, 21)}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(score.toLocaleString(), w - 12, 26);
    ctx.textAlign = 'left';

    // ── LYRICS ────────────────────────────────────────────────────
    drawLyrics(ctx, w, elapsed, song);

    // Combo
    if (combo >= 2) {
      const comboFontSize = Math.min(22 + combo * 0.15, 30);
      ctx.font = `bold ${comboFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 12;
      ctx.fillText(`${combo}x COMBO`, w / 2, 142);
      ctx.shadowBlur = 0;
    }

    // Health bar
    const hbW = w * 0.44;
    const hbH = 6;
    const hbX = (w - hbW) / 2;
    const hbY = 38;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.roundRect(hbX, hbY, hbW, hbH, 3);
    ctx.fill();
    const hpRatio = health / HEALTH_MAX;
    const hpColor = hpRatio > 0.6 ? '#5CE1C0' : hpRatio > 0.3 ? '#FFD700' : '#FF6B6B';
    ctx.fillStyle = hpColor;
    ctx.shadowColor = hpColor;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.roundRect(hbX, hbY, hbW * hpRatio, hbH, 3);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Song progress bar
    const progress = Math.min(1, elapsed / SONG_DURATION);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(0, 0, w, 3);
    const pGrad = ctx.createLinearGradient(0, 0, w, 0);
    pGrad.addColorStop(0, song.color);
    pGrad.addColorStop(1, song.accentColor);
    ctx.fillStyle = pGrad;
    ctx.fillRect(0, 0, w * progress, 3);

    // Character dancer at bottom center
    const danceOffset = Math.sin(elapsed * 0.004 * (song.bpm / 120)) * 4;
    const charX = w / 2;
    const charY = h * 0.92 + danceOffset;
    ctx.font = `${Math.min(w * 0.08, 32)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(charRef.current.emoji, charX, charY);

    // Lane tap hints
    const laneLabels = ['L', 'C', 'R'];
    for (let i = 0; i < 3; i++) {
      const cx2 = i * laneWidth + laneWidth / 2;
      ctx.font = `${Math.min(w * 0.032, 12)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = LANE_COLORS[i] + '88';
      ctx.fillText(laneLabels[i], cx2, hitZoneY + noteRadius * 2.2);
    }

    // Game over / end check
    if (health <= 0 && !gameOverRef.current) gameOverRef.current = true;
    if ((elapsed >= SONG_DURATION || gameOverRef.current) && phaseRef.current === 'playing') {
      for (const note of notes) {
        if (!note.hit && !note.missed) {
          note.missed = true;
          countMissRef.current++;
        }
      }
      endGame();
    }
  }, [getLayout, drawLyrics]);

  const endGame = useCallback(() => {
    phaseRef.current = 'result';
    const total = countPerfectRef.current + countGreatRef.current + countGoodRef.current + countMissRef.current;
    const acc = total > 0
      ? (countPerfectRef.current * 300 + countGreatRef.current * 200 + countGoodRef.current * 100) / (total * 300)
      : 0;
    let grade = 'C';
    if (acc >= 0.95) grade = 'S';
    else if (acc >= 0.82) grade = 'A';
    else if (acc >= 0.65) grade = 'B';
    setResultData({
      score: scoreRef.current,
      maxCombo: maxComboRef.current,
      perfect: countPerfectRef.current,
      great: countGreatRef.current,
      good: countGoodRef.current,
      miss: countMissRef.current,
      grade,
      songTitle: songRef.current.title,
    });
    saveScore('rhythm', charRef.current.name, scoreRef.current);
    setPhase('result');
  }, []);

  // ── Game loop ─────────────────────────────────────────────────────
  const gameLoop = useCallback((ts: number) => {
    if (phaseRef.current !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawFrame(ctx, ts);
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [drawFrame]);

  // ── Start game ────────────────────────────────────────────────────
  const startGame = useCallback((char: Character, song: Song) => {
    charRef.current = char;
    songRef.current = song;
    notesRef.current = generateNotesForSong(song);
    particlesRef.current = [];
    judgeEffectsRef.current = [];
    laneGlowsRef.current = [];
    scoreRef.current = 0;
    comboRef.current = 0;
    maxComboRef.current = 0;
    healthRef.current = HEALTH_MAX;
    gameOverRef.current = false;
    countPerfectRef.current = 0;
    countGreatRef.current = 0;
    countGoodRef.current = 0;
    countMissRef.current = 0;
    hitZoneGlowRef.current = 0;
    currentLyricIdxRef.current = 0;
    lyricFlashRef.current = 0;
    phaseRef.current = 'playing';
    setPhase('playing');
    startTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop]);

  // ── Canvas resize ──────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvasSizeRef.current = { w: window.innerWidth, h: window.innerHeight };
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // ── Touch/click during gameplay ────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w } = canvasSizeRef.current;
    const laneW = w / 3;

    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      for (let t = 0; t < e.changedTouches.length; t++) {
        const touch = e.changedTouches[t];
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const lane = Math.floor(x / laneW);
        if (lane >= 0 && lane <= 2) judgeTap(lane);
      }
    };
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const lane = Math.floor(x / laneW);
      if (lane >= 0 && lane <= 2) judgeTap(lane);
    };

    canvas.addEventListener('touchstart', onTouch, { passive: false });
    canvas.addEventListener('click', onClick);
    return () => {
      canvas.removeEventListener('touchstart', onTouch);
      canvas.removeEventListener('click', onClick);
    };
  }, [phase, judgeTap]);

  // ── RAF cleanup ────────────────────────────────────────────────────
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // ── Character Select screen ────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'charSelect') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animFrame: number;
    let tick = 0;

    const draw = () => {
      tick++;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // BG
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#140A28');
      bg.addColorStop(1, '#0E0820');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Stars
      for (let i = 0; i < 35; i++) {
        const blink = Math.sin(tick * 0.05 + i * 1.3) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,255,255,${0.1 + blink * 0.3})`;
        ctx.beginPath();
        ctx.arc((i * 137.5 + tick * 0.04) % w, (i * 83.1) % h, 0.6 + (i % 3) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Title
      ctx.font = `bold ${Math.min(w * 0.09, 36)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = '#FF6B9D';
      ctx.shadowBlur = 20;
      ctx.fillText('🎵 K-POP 리듬게임', w / 2, h * 0.09);
      ctx.shadowBlur = 0;

      ctx.font = `${Math.min(w * 0.042, 16)}px sans-serif`;
      ctx.fillStyle = '#C9B3F5';
      ctx.fillText('캐릭터를 선택하세요!', w / 2, h * 0.15);

      // Cards
      const cardW = Math.min(w * 0.38, 148);
      const cardH = cardW * 1.3;
      const gridW = cardW * 2 + 16;
      const gridX = (w - gridW) / 2;
      const gridY = h * 0.2;

      CHARACTERS.forEach((char, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const cx = gridX + col * (cardW + 16);
        const cy = gridY + row * (cardH + 14);
        const isSel = char.name === selectedChar.name;
        const p = Math.sin(tick * 0.06 + idx * 1.1) * 0.5 + 0.5;

        // Card fill
        const cg = ctx.createLinearGradient(cx, cy, cx + cardW, cy + cardH);
        cg.addColorStop(0, char.color + (isSel ? '55' : '22'));
        cg.addColorStop(1, char.color + '10');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, 14);
        ctx.fill();

        // Border
        ctx.strokeStyle = isSel ? char.color : char.color + '60';
        ctx.lineWidth = isSel ? 3 : 1.5;
        ctx.shadowColor = char.color;
        ctx.shadowBlur = isSel ? 18 + p * 8 : 4;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, 14);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Emoji
        ctx.font = `${Math.min(cardW * 0.38, 50)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char.emoji, cx + cardW / 2, cy + cardH * 0.36);

        // Name
        ctx.font = `bold ${Math.min(cardW * 0.2, 22)}px sans-serif`;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = char.color;
        ctx.shadowBlur = 6;
        ctx.fillText(char.name, cx + cardW / 2, cy + cardH * 0.64);
        ctx.shadowBlur = 0;

        // Heart
        ctx.font = `${Math.min(cardW * 0.16, 20)}px serif`;
        ctx.fillText(char.heart, cx + cardW / 2, cy + cardH * 0.8);

        if (isSel) {
          ctx.font = `${Math.min(cardW * 0.16, 16)}px sans-serif`;
          ctx.fillStyle = '#FFD700';
          ctx.fillText('✓ 선택', cx + cardW / 2, cy + cardH * 0.93);
        }
      });

      // Next button
      const btnW = Math.min(w * 0.6, 220);
      const btnH = 54;
      const btnX = (w - btnW) / 2;
      const btnY = gridY + 2 * (cardH + 14) + 18;
      const bp = Math.sin(tick * 0.08) * 3;
      const bGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
      bGrad.addColorStop(0, '#FF6B9D');
      bGrad.addColorStop(1, '#C9B3F5');
      ctx.fillStyle = bGrad;
      ctx.shadowColor = '#FF6B9D';
      ctx.shadowBlur = 14 + bp;
      ctx.beginPath();
      ctx.roundRect(btnX, btnY, btnW, btnH, btnH / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = `bold ${Math.min(w * 0.055, 20)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFF';
      ctx.fillText('곡 선택 →', w / 2, btnY + btnH / 2);

      animFrame = requestAnimationFrame(draw);
    };

    animFrame = requestAnimationFrame(draw);

    const handleInput = (tx: number, ty: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const cardW = Math.min(w * 0.38, 148);
      const cardH = cardW * 1.3;
      const gridW = cardW * 2 + 16;
      const gridX = (w - gridW) / 2;
      const gridY = h * 0.2;

      for (let idx = 0; idx < CHARACTERS.length; idx++) {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const cx = gridX + col * (cardW + 16);
        const cy = gridY + row * (cardH + 14);
        if (tx >= cx && tx <= cx + cardW && ty >= cy && ty <= cy + cardH) {
          setSelectedChar(CHARACTERS[idx]);
          playSelectSound(440 + idx * 110);
          return;
        }
      }

      const btnW = Math.min(w * 0.6, 220);
      const btnH = 54;
      const btnX = (w - btnW) / 2;
      const btnY = gridY + 2 * (cardH + 14) + 18;
      if (tx >= btnX && tx <= btnX + btnW && ty >= btnY && ty <= btnY + btnH) {
        cancelAnimationFrame(animFrame);
        phaseRef.current = 'songSelect';
        setPhase('songSelect');
      }
    };

    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      handleInput(e.changedTouches[0].clientX - rect.left, e.changedTouches[0].clientY - rect.top);
    };
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      handleInput(e.clientX - rect.left, e.clientY - rect.top);
    };

    canvas.addEventListener('touchstart', onTouch, { passive: false });
    canvas.addEventListener('click', onClick);
    return () => {
      cancelAnimationFrame(animFrame);
      canvas.removeEventListener('touchstart', onTouch);
      canvas.removeEventListener('click', onClick);
    };
  }, [phase, selectedChar]);

  // ── Song Select screen ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'songSelect') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animFrame: number;
    let tick = 0;

    const draw = () => {
      tick++;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // BG
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#140A28');
      bg.addColorStop(1, '#0E0820');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Stars
      for (let i = 0; i < 30; i++) {
        const blink = Math.sin(tick * 0.04 + i * 1.5) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,255,255,${0.08 + blink * 0.25})`;
        ctx.beginPath();
        ctx.arc((i * 137.5 + tick * 0.03) % w, (i * 83.1) % h, 0.5 + (i % 3) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Title
      ctx.font = `bold ${Math.min(w * 0.075, 28)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = '#C9B3F5';
      ctx.shadowBlur = 14;
      ctx.fillText('🎵 곡 선택', w / 2, h * 0.06);
      ctx.shadowBlur = 0;

      // Selected char display
      ctx.font = `${Math.min(w * 0.038, 14)}px sans-serif`;
      ctx.fillStyle = selectedChar.color;
      ctx.fillText(`${selectedChar.emoji} ${selectedChar.name}`, w / 2, h * 0.11);

      // Song cards
      const cardW = w - 32;
      const cardH = Math.min(h * 0.13, 76);
      const cardGap = 10;
      const startY = h * 0.155;

      SONGS.forEach((song, idx) => {
        const cy = startY + idx * (cardH + cardGap);
        const isSel = song.id === selectedSong.id;
        const p = Math.sin(tick * 0.05 + idx * 0.8) * 0.5 + 0.5;

        // Card bg
        const sg = ctx.createLinearGradient(16, cy, 16 + cardW, cy + cardH);
        sg.addColorStop(0, song.color + (isSel ? '44' : '1A'));
        sg.addColorStop(1, song.accentColor + '0A');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.roundRect(16, cy, cardW, cardH, 12);
        ctx.fill();

        ctx.strokeStyle = isSel ? song.color : song.color + '50';
        ctx.lineWidth = isSel ? 2.5 : 1;
        ctx.shadowColor = song.color;
        ctx.shadowBlur = isSel ? 14 + p * 6 : 3;
        ctx.beginPath();
        ctx.roundRect(16, cy, cardW, cardH, 12);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Song info
        const textX = 28;
        const midY = cy + cardH / 2;

        // BPM badge
        const bpmBadgeW = 56;
        ctx.fillStyle = song.color + '33';
        ctx.beginPath();
        ctx.roundRect(cardW - 30, cy + 8, bpmBadgeW, 18, 9);
        ctx.fill();
        ctx.font = `bold ${Math.min(w * 0.028, 11)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = song.accentColor;
        ctx.fillText(`BPM ${song.bpm}`, cardW - 30 + bpmBadgeW / 2, cy + 8 + 9 + 1);
        ctx.textAlign = 'left';

        // Title
        ctx.font = `bold ${Math.min(w * 0.055, 21)}px sans-serif`;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = isSel ? song.color : 'transparent';
        ctx.shadowBlur = isSel ? 8 : 0;
        ctx.fillText(song.title, textX, midY - 10);
        ctx.shadowBlur = 0;

        // Artist
        ctx.font = `${Math.min(w * 0.037, 14)}px sans-serif`;
        ctx.fillStyle = song.accentColor;
        ctx.fillText(song.artist, textX, midY + 10);

        // Difficulty stars
        const starSize = Math.min(w * 0.032, 13);
        ctx.font = `${starSize}px serif`;
        let starStr = '';
        for (let s = 0; s < 5; s++) starStr += s < song.difficulty ? '★' : '☆';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(starStr, textX, midY + 26);
      });

      // Back button
      const backY = startY + SONGS.length * (cardH + cardGap) + 12;
      const backW = 100;
      const backH = 40;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.strokeStyle = 'rgba(201,179,245,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(16, backY, backW, backH, backH / 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = `${Math.min(w * 0.04, 15)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#C9B3F5';
      ctx.fillText('← 뒤로', 16 + backW / 2, backY + backH / 2 + 1);

      // Start button
      const startBtnW = Math.min(w * 0.52, 195);
      const startBtnH = 50;
      const startBtnX = w - 16 - startBtnW;
      const startBtnY = backY;
      const bp = Math.sin(tick * 0.09) * 3;
      const sbg = ctx.createLinearGradient(startBtnX, startBtnY, startBtnX + startBtnW, startBtnY);
      sbg.addColorStop(0, selectedSong.color);
      sbg.addColorStop(1, '#C9B3F5');
      ctx.fillStyle = sbg;
      ctx.shadowColor = selectedSong.color;
      ctx.shadowBlur = 14 + bp;
      ctx.beginPath();
      ctx.roundRect(startBtnX, startBtnY, startBtnW, startBtnH, startBtnH / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = `bold ${Math.min(w * 0.05, 19)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFF';
      ctx.fillText('🎮 게임 시작!', startBtnX + startBtnW / 2, startBtnY + startBtnH / 2 + 1);

      animFrame = requestAnimationFrame(draw);
    };

    animFrame = requestAnimationFrame(draw);

    const handleInput = (tx: number, ty: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const cardH = Math.min(h * 0.13, 76);
      const cardGap = 10;
      const startY = h * 0.155;

      // Song cards
      for (let idx = 0; idx < SONGS.length; idx++) {
        const cy = startY + idx * (cardH + cardGap);
        if (tx >= 16 && tx <= w - 16 && ty >= cy && ty <= cy + cardH) {
          setSelectedSong(SONGS[idx]);
          playSelectSound(SONGS[idx].scaleFreqs[0]);
          return;
        }
      }

      const backY = startY + SONGS.length * (cardH + cardGap) + 12;
      // Back
      if (tx >= 16 && tx <= 116 && ty >= backY && ty <= backY + 40) {
        cancelAnimationFrame(animFrame);
        phaseRef.current = 'charSelect';
        setPhase('charSelect');
        return;
      }

      // Start
      const startBtnW = Math.min(w * 0.52, 195);
      const startBtnX = w - 16 - startBtnW;
      if (tx >= startBtnX && tx <= startBtnX + startBtnW && ty >= backY && ty <= backY + 50) {
        cancelAnimationFrame(animFrame);
        startGame(selectedChar, selectedSong);
      }
    };

    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      handleInput(e.changedTouches[0].clientX - rect.left, e.changedTouches[0].clientY - rect.top);
    };
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      handleInput(e.clientX - rect.left, e.clientY - rect.top);
    };

    canvas.addEventListener('touchstart', onTouch, { passive: false });
    canvas.addEventListener('click', onClick);
    return () => {
      cancelAnimationFrame(animFrame);
      canvas.removeEventListener('touchstart', onTouch);
      canvas.removeEventListener('click', onClick);
    };
  }, [phase, selectedChar, selectedSong, startGame]);

  // ── Result overlay ─────────────────────────────────────────────────
  const gradeColors: Record<string, string> = { S: '#FFD700', A: '#5CE1C0', B: '#C9B3F5', C: '#FFB3C6' };
  const gradeLabels: Record<string, string> = {
    S: 'S 랭크 - 완벽해요! ✨',
    A: 'A 랭크 - 훌륭해요! 🌟',
    B: 'B 랭크 - 잘했어요! 💫',
    C: 'C 랭크 - 다시 도전! 💪',
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100dvh', overflow: 'hidden', background: '#12082A' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      />

      {phase === 'result' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(10,5,20,0.93)',
          padding: '24px 20px',
          overflowY: 'auto',
        }}>
          {/* Song title */}
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 'clamp(12px,3vw,14px)', marginBottom: 6 }}>
            🎵 {resultData.songTitle}
          </div>

          {/* Grade */}
          <div style={{
            fontSize: 'clamp(72px, 22vw, 100px)',
            fontWeight: 900,
            color: gradeColors[resultData.grade] ?? '#fff',
            textShadow: `0 0 40px ${gradeColors[resultData.grade] ?? '#fff'}, 0 0 80px ${gradeColors[resultData.grade] ?? '#fff'}55`,
            lineHeight: 1,
            marginBottom: 4,
          }}>
            {resultData.grade}
          </div>
          <div style={{ color: gradeColors[resultData.grade], fontSize: 'clamp(13px,3.8vw,17px)', marginBottom: 20, fontWeight: 700 }}>
            {gradeLabels[resultData.grade]}
          </div>

          {/* Character */}
          <div style={{ fontSize: 'clamp(28px,9vw,44px)', marginBottom: 16 }}>
            {charRef.current.emoji} {charRef.current.name}
          </div>

          {/* Stats */}
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 20,
            padding: '18px 26px',
            width: '100%',
            maxWidth: 320,
            marginBottom: 24,
            border: '1px solid rgba(255,255,255,0.09)',
          }}>
            <StatRow label="SCORE" value={resultData.score.toLocaleString()} color="#FFFFFF" />
            <StatRow label="MAX COMBO" value={`${resultData.maxCombo}x`} color="#FFD700" />
            <StatRow label="PERFECT ✨" value={String(resultData.perfect)} color="#FFD700" />
            <StatRow label="GREAT 💫" value={String(resultData.great)} color="#5CE1C0" />
            <StatRow label="GOOD 🎶" value={String(resultData.good)} color="#C9B3F5" />
            <StatRow label="MISS 💔" value={String(resultData.miss)} color="#FF6B6B" />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 320 }}>
            <button
              onClick={() => {
                cancelAnimationFrame(rafRef.current);
                phaseRef.current = 'songSelect';
                setPhase('songSelect');
              }}
              style={{
                flex: 1, padding: '13px 0', borderRadius: 28,
                background: 'linear-gradient(135deg,#FF6B9D,#C9B3F5)',
                color: '#fff', fontWeight: 800, fontSize: 'clamp(12px,3.3vw,15px)',
                border: 'none', cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(255,107,157,0.35)',
              }}
            >
              🔄 다시 하기
            </button>
            <a
              href="/"
              style={{
                flex: 1, padding: '13px 0', borderRadius: 28,
                background: 'rgba(255,255,255,0.1)',
                color: '#C9B3F5', fontWeight: 700, fontSize: 'clamp(12px,3.3vw,15px)',
                border: '1px solid rgba(201,179,245,0.28)',
                textDecoration: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              🏠 홈으로
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(12px,3vw,14px)', fontWeight: 600 }}>{label}</span>
      <span style={{ color, fontSize: 'clamp(14px,3.6vw,17px)', fontWeight: 800 }}>{value}</span>
    </div>
  );
}
