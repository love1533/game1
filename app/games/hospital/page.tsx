'use client';

import { useRef, useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Text } from '@react-three/drei';
import { create } from 'zustand';
import * as THREE from 'three';
import { saveScore } from '@/lib/ranking';

// ─── Types ────────────────────────────────────────────────────────────────────
type Vec3 = [number, number, number];
type ToolId = 'stethoscope' | 'syringe' | 'pill' | 'bandage';
type SymptomId = 'fever' | 'wound' | 'cough' | 'fracture';
type RoomId = 'reception' | 'clinic' | 'injection' | 'surgery' | 'pharmacy' | 'ward';
type PatientState = 'waiting' | 'treated' | 'discharged';
type GamePhase = 'menu' | 'playing' | 'dayComplete' | 'boss' | 'gameOver' | 'victory';

interface ToolDef {
  id: ToolId;
  name: string;
  emoji: string;
  color: string;
  cures: SymptomId;
}

interface SymptomDef {
  id: SymptomId;
  emoji: string;
  name: string;
  hint: string;
  requiredTool: ToolId;
  needsEscort?: boolean;
}

interface RoomDef {
  id: RoomId;
  name: string;
  color: string;
  wallColor: string;
  position: Vec3;      // world position center
  size: Vec3;          // width, height(y), depth
  connections: { dir: 'north' | 'south' | 'east' | 'west'; to: RoomId }[];
  furniture: { type: string; pos: Vec3; size: Vec3; color: string }[];
  spawnPoints: Vec3[];
}

interface PatientData {
  id: string;
  name: string;
  color: string;
  symptom: SymptomId;
  roomId: RoomId;
  position: Vec3;
  state: PatientState;
  isEmergency: boolean;
  emergencyTimer: number;
  wrongToolTimer: number;
  healAnim: number;
  escorting: boolean;
}

interface DayConfig {
  day: number;
  title: string;
  patientCount: number;
  availableSymptoms: SymptomId[];
  unlockedTools: ToolId[];
  timeLimit?: number;
  bossEvent?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PLAYER_SPEED = 4;
const DASH_SPEED = 7;
const DASH_DURATION = 0.3;
const DASH_COOLDOWN = 1.5;
const INTERACT_RANGE = 1.8;
const BATTERY_MAX = 100;
const BATTERY_DRAIN = 0.15;
const BATTERY_HEAL_BONUS = 15;

const CAMERA_OFFSET: Vec3 = [0, 8, 6];
const CAMERA_LERP = 0.08;

const COLORS = {
  primary: '#FF6B6B',
  secondary: '#4ECDC4',
  accent: '#FFE66D',
  success: '#95E1D3',
  warning: '#F38181',
  floor: '#E8E8E8',
  wall: '#F7F7F7',
};

const TOOLS: ToolDef[] = [
  { id: 'stethoscope', name: '청진기', emoji: '🩺', color: '#4ECDC4', cures: 'fever' },
  { id: 'pill',        name: '약',     emoji: '💊', color: '#FFE66D', cures: 'fever' },
  { id: 'bandage',     name: '붕대',   emoji: '🩹', color: '#FF9FF3', cures: 'wound' },
  { id: 'syringe',     name: '주사기', emoji: '💉', color: '#74B9FF', cures: 'cough' },
];

const SYMPTOMS: Record<SymptomId, SymptomDef> = {
  fever:    { id: 'fever',    emoji: '🤒', name: '열',   hint: '청진기로 진찰하세요', requiredTool: 'stethoscope' },
  wound:    { id: 'wound',    emoji: '🩹', name: '상처', hint: '붕대를 감아주세요',   requiredTool: 'bandage' },
  cough:    { id: 'cough',    emoji: '😷', name: '기침', hint: '주사를 놓아주세요',   requiredTool: 'syringe' },
  fracture: { id: 'fracture', emoji: '🦴', name: '골절', hint: '수술실로 이송하세요', requiredTool: 'bandage', needsEscort: true },
};

const PATIENT_COLORS = ['#FF6B6B', '#74B9FF', '#A29BFE', '#FFEAA7', '#55EFC4', '#FD79A8', '#81ECEC', '#DFE6E9'];
const PATIENT_NAMES = ['민수', '서연', '준호', '지은', '하늘', '곰돌이', '토끼', '냥이'];

const ROOM_SIZE = 8;
const WALL_H = 3;
const DOOR_W = 1.8;

// Room layout (world positions):
//        [reception (0,0,0)]
//               |
//        [clinic (0,0,-10)] ---- [injection (10,0,-10)]
//               |                       |
//        [surgery (0,0,-20)] ---- [pharmacy (10,0,-20)]
//               |
//        [ward (0,0,-30)]

const ROOMS: RoomDef[] = [
  {
    id: 'reception', name: '접수/대기실',
    color: '#E8F5E9', wallColor: '#81C784',
    position: [0, 0, 0], size: [ROOM_SIZE, WALL_H, ROOM_SIZE],
    connections: [{ dir: 'north', to: 'clinic' }],
    furniture: [
      { type: 'desk', pos: [2.5, 0.4, -2], size: [1.5, 0.8, 0.8], color: '#8D6E63' },
      { type: 'chair', pos: [-2, 0.3, -1], size: [0.6, 0.6, 0.6], color: '#42A5F5' },
      { type: 'chair', pos: [-2, 0.3, 1], size: [0.6, 0.6, 0.6], color: '#42A5F5' },
      { type: 'chair', pos: [0, 0.3, 2], size: [0.6, 0.6, 0.6], color: '#66BB6A' },
      { type: 'plant', pos: [3, 0.6, 3], size: [0.5, 1.2, 0.5], color: '#4CAF50' },
    ],
    spawnPoints: [[-1, 0, -1], [1, 0, 1], [-2, 0, 2]],
  },
  {
    id: 'clinic', name: '진료실',
    color: '#E3F2FD', wallColor: '#64B5F6',
    position: [0, 0, -10], size: [ROOM_SIZE, WALL_H, ROOM_SIZE],
    connections: [
      { dir: 'south', to: 'reception' },
      { dir: 'east', to: 'injection' },
      { dir: 'north', to: 'surgery' },
    ],
    furniture: [
      { type: 'bed', pos: [1.5, 0.35, -1], size: [1.8, 0.7, 0.9], color: '#E3F2FD' },
      { type: 'desk', pos: [-2.5, 0.4, -2.5], size: [1.2, 0.8, 0.8], color: '#795548' },
      { type: 'cabinet', pos: [-3, 0.8, 0], size: [0.6, 1.6, 0.6], color: '#ECEFF1' },
    ],
    spawnPoints: [[0, 0, 0], [2, 0, 1], [-1, 0, 2]],
  },
  {
    id: 'injection', name: '주사실',
    color: '#FFF3E0', wallColor: '#FFB74D',
    position: [10, 0, -10], size: [ROOM_SIZE, WALL_H, ROOM_SIZE],
    connections: [
      { dir: 'west', to: 'clinic' },
      { dir: 'north', to: 'pharmacy' },
    ],
    furniture: [
      { type: 'bed', pos: [0, 0.35, -1], size: [1.8, 0.7, 0.9], color: '#FFF3E0' },
      { type: 'cabinet', pos: [3, 0.8, -3], size: [0.6, 1.6, 0.6], color: '#ECEFF1' },
      { type: 'table', pos: [-2, 0.35, -2], size: [0.8, 0.7, 0.6], color: '#BDBDBD' },
    ],
    spawnPoints: [[1, 0, 0], [-1, 0, 1], [2, 0, 2]],
  },
  {
    id: 'surgery', name: '수술실',
    color: '#FCE4EC', wallColor: '#F06292',
    position: [0, 0, -20], size: [ROOM_SIZE, WALL_H, ROOM_SIZE],
    connections: [
      { dir: 'south', to: 'clinic' },
      { dir: 'east', to: 'pharmacy' },
      { dir: 'north', to: 'ward' },
    ],
    furniture: [
      { type: 'bed', pos: [0, 0.35, 0], size: [2, 0.7, 1], color: '#F8BBD0' },
      { type: 'light', pos: [0, 2.5, 0], size: [0.8, 0.1, 0.8], color: '#FFF9C4' },
      { type: 'cabinet', pos: [-3, 0.8, -3], size: [0.6, 1.6, 0.6], color: '#ECEFF1' },
    ],
    spawnPoints: [[-2, 0, 1], [2, 0, -2], [2, 0, 2]],
  },
  {
    id: 'pharmacy', name: '약국',
    color: '#F3E5F5', wallColor: '#BA68C8',
    position: [10, 0, -20], size: [ROOM_SIZE, WALL_H, ROOM_SIZE],
    connections: [
      { dir: 'south', to: 'injection' },
      { dir: 'west', to: 'surgery' },
    ],
    furniture: [
      { type: 'shelf', pos: [-3, 1, -2], size: [0.5, 2, 2], color: '#CE93D8' },
      { type: 'shelf', pos: [3, 1, -2], size: [0.5, 2, 2], color: '#CE93D8' },
      { type: 'counter', pos: [0, 0.5, 2], size: [3, 1, 0.8], color: '#8E24AA' },
    ],
    spawnPoints: [[0, 0, 0], [-1, 0, -1], [1, 0, 1]],
  },
  {
    id: 'ward', name: '입원실',
    color: '#FFFDE7', wallColor: '#FFF176',
    position: [0, 0, -30], size: [ROOM_SIZE, WALL_H, ROOM_SIZE],
    connections: [{ dir: 'south', to: 'surgery' }],
    furniture: [
      { type: 'bed', pos: [-2.5, 0.35, -2], size: [1.6, 0.7, 0.9], color: '#FFF9C4' },
      { type: 'bed', pos: [2.5, 0.35, -2], size: [1.6, 0.7, 0.9], color: '#FFF9C4' },
      { type: 'bed', pos: [-2.5, 0.35, 2], size: [1.6, 0.7, 0.9], color: '#FFF9C4' },
      { type: 'bed', pos: [2.5, 0.35, 2], size: [1.6, 0.7, 0.9], color: '#FFF9C4' },
      { type: 'flower', pos: [0, 0.5, 0], size: [0.4, 1, 0.4], color: '#FF8A80' },
    ],
    spawnPoints: [[-1, 0, -1], [1, 0, -1], [-1, 0, 2], [1, 0, 2]],
  },
];

const ROOM_MAP: Record<RoomId, RoomDef> = {} as Record<RoomId, RoomDef>;
ROOMS.forEach(r => { ROOM_MAP[r.id] = r; });

const DAYS: DayConfig[] = [
  { day: 1, title: '첫 출근!',           patientCount: 2, availableSymptoms: ['fever'],                              unlockedTools: ['stethoscope', 'pill'] },
  { day: 2, title: '바빠지는 병원',       patientCount: 3, availableSymptoms: ['fever', 'wound'],                     unlockedTools: ['stethoscope', 'pill', 'bandage'] },
  { day: 3, title: '응급 환자!',          patientCount: 4, availableSymptoms: ['fever', 'wound', 'cough'],            unlockedTools: ['stethoscope', 'pill', 'bandage', 'syringe'] },
  { day: 4, title: '병원이 가득',          patientCount: 5, availableSymptoms: ['fever', 'wound', 'cough', 'fracture'], unlockedTools: ['stethoscope', 'pill', 'bandage', 'syringe'] },
  { day: 5, title: '로봇 바이러스!',       patientCount: 3, availableSymptoms: ['fever', 'wound', 'cough'],            unlockedTools: ['stethoscope', 'pill', 'bandage', 'syringe'], bossEvent: true },
];

// ─── Audio ────────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;
function getAudio(): AudioContext | null {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch { return null; }
  }
  return audioCtx;
}

function tone(ctx: AudioContext, freq: number, start: number, dur: number, vol = 0.12, type: OscillatorType = 'sine') {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g).connect(ctx.destination);
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function sfxHeal() {
  const ctx = getAudio(); if (!ctx) return;
  const now = ctx.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => tone(ctx, f, now + i * 0.08, 0.2, 0.1, 'triangle'));
}

function sfxWrong() {
  const ctx = getAudio(); if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 220, now, 0.12, 0.1, 'square');
  tone(ctx, 180, now + 0.12, 0.15, 0.08, 'square');
}

function sfxDoor() {
  const ctx = getAudio(); if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 600, now, 0.08, 0.06);
  tone(ctx, 800, now + 0.08, 0.1, 0.06);
}

function sfxDash() {
  const ctx = getAudio(); if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g).connect(ctx.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);
  g.gain.setValueAtTime(0.06, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.start(now); osc.stop(now + 0.17);
}

function sfxDayComplete() {
  const ctx = getAudio(); if (!ctx) return;
  const now = ctx.currentTime;
  [523, 587, 659, 698, 784, 880, 988, 1047].forEach((f, i) =>
    tone(ctx, f, now + i * 0.07, 0.2, 0.1, 'triangle'));
  [523, 659, 784].forEach(f => tone(ctx, f, now + 0.65, 0.5, 0.08, 'sine'));
}

function sfxBossHit() {
  const ctx = getAudio(); if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 150, now, 0.1, 0.12, 'square');
  tone(ctx, 100, now + 0.05, 0.15, 0.1, 'sawtooth');
}

function sfxVictory() {
  const ctx = getAudio(); if (!ctx) return;
  const now = ctx.currentTime;
  [523, 659, 784, 880, 1047, 1319].forEach((f, i) =>
    tone(ctx, f, now + i * 0.12, 0.3, 0.12, 'triangle'));
}

function sfxClick() {
  const ctx = getAudio(); if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 880, now, 0.05, 0.06, 'sine');
  tone(ctx, 1100, now + 0.03, 0.06, 0.04, 'sine');
}

function sfxFootstep() {
  const ctx = getAudio(); if (!ctx) return;
  const now = ctx.currentTime;
  const freq = 100 + Math.random() * 60;
  const noise = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.15;
  noise.buffer = buf;
  const bpf = ctx.createBiquadFilter();
  bpf.type = 'bandpass'; bpf.frequency.value = freq; bpf.Q.value = 1.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.04, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  noise.connect(bpf).connect(g).connect(ctx.destination);
  noise.start(now); noise.stop(now + 0.07);
}

function sfxEmergency() {
  const ctx = getAudio(); if (!ctx) return;
  const now = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    tone(ctx, 880, now + i * 0.18, 0.08, 0.08, 'square');
    tone(ctx, 660, now + i * 0.18 + 0.08, 0.08, 0.06, 'square');
  }
}

function sfxGameOver() {
  const ctx = getAudio(); if (!ctx) return;
  const now = ctx.currentTime;
  [440, 370, 311, 261].forEach((f, i) =>
    tone(ctx, f, now + i * 0.15, 0.3, 0.1, 'triangle'));
}

function sfxToolSelect() {
  const ctx = getAudio(); if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 660, now, 0.06, 0.05, 'sine');
  tone(ctx, 990, now + 0.04, 0.08, 0.04, 'sine');
}

// ─── BGM System ──────────────────────────────────────────────────────────────
let bgmNodes: { oscs: OscillatorNode[]; gains: GainNode[]; master: GainNode; interval: ReturnType<typeof setInterval> } | null = null;

function bgmStart() {
  if (bgmNodes) return;
  const ctx = getAudio(); if (!ctx) return;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 1);
  master.connect(ctx.destination);

  // Melody notes (C major pentatonic, cheerful hospital feel)
  const melodyNotes = [
    523, 587, 659, 784, 880, 784, 659, 587,
    523, 659, 784, 880, 1047, 880, 784, 659,
    523, 587, 659, 523, 784, 659, 587, 523,
    392, 440, 523, 587, 659, 587, 523, 440,
  ];
  const bassNotes = [
    262, 262, 330, 330, 349, 349, 262, 262,
    262, 262, 330, 330, 392, 392, 330, 330,
    262, 262, 349, 349, 392, 392, 262, 262,
    196, 196, 262, 262, 330, 330, 262, 262,
  ];

  let noteIdx = 0;
  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];

  // Pad chord (sustained background)
  const padFreqs = [262, 330, 392]; // C major chord
  padFreqs.forEach(f => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    g.gain.value = 0.012;
    osc.connect(g).connect(master);
    osc.start();
    oscs.push(osc);
    gains.push(g);
  });

  // Melody voice
  const melodyOsc = ctx.createOscillator();
  const melodyGain = ctx.createGain();
  melodyOsc.type = 'triangle';
  melodyOsc.frequency.value = melodyNotes[0];
  melodyGain.gain.value = 0.025;
  melodyOsc.connect(melodyGain).connect(master);
  melodyOsc.start();
  oscs.push(melodyOsc);
  gains.push(melodyGain);

  // Bass voice
  const bassOsc = ctx.createOscillator();
  const bassGain = ctx.createGain();
  bassOsc.type = 'sine';
  bassOsc.frequency.value = bassNotes[0];
  bassGain.gain.value = 0.02;
  bassOsc.connect(bassGain).connect(master);
  bassOsc.start();
  oscs.push(bassOsc);
  gains.push(bassGain);

  // Step through notes
  const interval = setInterval(() => {
    noteIdx = (noteIdx + 1) % melodyNotes.length;
    const t = ctx.currentTime;
    melodyOsc.frequency.setValueAtTime(melodyNotes[noteIdx], t);
    melodyOsc.frequency.linearRampToValueAtTime(melodyNotes[noteIdx], t + 0.02);
    melodyGain.gain.setValueAtTime(0.03, t);
    melodyGain.gain.linearRampToValueAtTime(0.015, t + 0.2);

    bassOsc.frequency.setValueAtTime(bassNotes[noteIdx], t);
    bassGain.gain.setValueAtTime(0.025, t);
    bassGain.gain.linearRampToValueAtTime(0.012, t + 0.25);
  }, 280);

  bgmNodes = { oscs, gains, master, interval };
}

function bgmStop() {
  if (!bgmNodes) return;
  const ctx = getAudio();
  if (ctx) {
    const t = ctx.currentTime;
    bgmNodes.master.gain.linearRampToValueAtTime(0, t + 0.5);
  }
  clearInterval(bgmNodes.interval);
  const nodes = bgmNodes;
  bgmNodes = null;
  setTimeout(() => {
    nodes.oscs.forEach(o => { try { o.stop(); } catch {} });
  }, 600);
}

// ─── Zustand Store ────────────────────────────────────────────────────────────
interface GameStore {
  phase: GamePhase;
  currentDay: number;
  playerName: string;
  playerPos: Vec3;
  playerRotation: number;
  playerRoom: RoomId;
  battery: number;
  score: number;
  stars: number;
  activeTool: number; // index into unlocked tools
  patients: PatientData[];
  escortingId: string | null;
  dashCooldown: number;
  message: string;
  bossHp: number;
  bossMaxHp: number;
  bossBullets: { x: number; z: number; vx: number; vz: number }[];

  setPhase: (p: GamePhase) => void;
  setPlayerPos: (p: Vec3) => void;
  setPlayerRotation: (r: number) => void;
  setPlayerRoom: (r: RoomId) => void;
  setBattery: (b: number) => void;
  setScore: (s: number) => void;
  setActiveTool: (t: number) => void;
  setMessage: (m: string) => void;
  setDashCooldown: (d: number) => void;

  startGame: (name: string) => void;
  startDay: (dayIdx: number) => void;
  interact: () => void;
  nextDay: () => void;
}

function randomFrom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function generatePatients(dayConfig: DayConfig): PatientData[] {
  const patients: PatientData[] = [];
  const roomIds: RoomId[] = ['reception', 'clinic', 'injection', 'surgery', 'pharmacy', 'ward'];
  let emergencyPlaced = false;

  for (let i = 0; i < dayConfig.patientCount; i++) {
    const symptom = randomFrom(dayConfig.availableSymptoms);
    const room = roomIds[i % roomIds.length];
    const roomDef = ROOM_MAP[room];
    const sp = roomDef.spawnPoints[i % roomDef.spawnPoints.length];
    const isEmergency = dayConfig.day >= 3 && !emergencyPlaced && i === dayConfig.patientCount - 1;
    if (isEmergency) emergencyPlaced = true;

    patients.push({
      id: `p${i}`,
      name: PATIENT_NAMES[i % PATIENT_NAMES.length],
      color: PATIENT_COLORS[i % PATIENT_COLORS.length],
      symptom,
      roomId: room,
      position: [roomDef.position[0] + sp[0], sp[1], roomDef.position[2] + sp[2]],
      state: 'waiting',
      isEmergency,
      emergencyTimer: isEmergency ? 30 : 0,
      wrongToolTimer: 0,
      healAnim: 0,
      escorting: false,
    });
  }
  return patients;
}

const useGameStore = create<GameStore>((set, get) => ({
  phase: 'menu',
  currentDay: 0,
  playerName: '',
  playerPos: [0, 0, 2],
  playerRotation: 0,
  playerRoom: 'reception',
  battery: BATTERY_MAX,
  score: 0,
  stars: 0,
  activeTool: 0,
  patients: [],
  escortingId: null,
  dashCooldown: 0,
  message: '',
  bossHp: 5,
  bossMaxHp: 5,
  bossBullets: [],

  setPhase: (p) => set({ phase: p }),
  setPlayerPos: (p) => set({ playerPos: p }),
  setPlayerRotation: (r) => set({ playerRotation: r }),
  setPlayerRoom: (r) => set({ playerRoom: r }),
  setBattery: (b) => set({ battery: Math.max(0, Math.min(BATTERY_MAX, b)) }),
  setScore: (s) => set({ score: s }),
  setActiveTool: (t) => set({ activeTool: t }),
  setMessage: (m) => set({ message: m }),
  setDashCooldown: (d) => set({ dashCooldown: d }),

  startGame: (name: string) => {
    set({ playerName: name, score: 0, stars: 0 });
    get().startDay(0);
  },

  startDay: (dayIdx: number) => {
    const config = DAYS[dayIdx];
    const patients = generatePatients(config);
    set({
      currentDay: dayIdx,
      phase: 'playing',
      playerPos: [0, 0, 2],
      playerRoom: 'reception',
      playerRotation: 0,
      battery: BATTERY_MAX,
      activeTool: 0,
      patients,
      escortingId: null,
      dashCooldown: 0,
      message: `Day ${dayIdx + 1}: ${config.title}`,
      bossHp: 5,
      bossMaxHp: 5,
      bossBullets: [],
    });
  },

  interact: () => {
    const state = get();
    if (state.phase !== 'playing' && state.phase !== 'boss') return;

    const [px, , pz] = state.playerPos;
    const dayConfig = DAYS[state.currentDay];
    const unlockedTools = dayConfig.unlockedTools;

    // Boss interaction
    if (state.phase === 'boss') {
      const bossRoom = ROOM_MAP['surgery'];
      const bx = bossRoom.position[0];
      const bz = bossRoom.position[2];
      const dist = Math.sqrt((px - bx) ** 2 + (pz - bz) ** 2);
      if (dist < 2.5) {
        const newHp = state.bossHp - 1;
        sfxBossHit();
        if (newHp <= 0) {
          sfxVictory();
          set({
            bossHp: 0,
            score: state.score + 500,
            message: '보스 처치! +500점!',
          });
          setTimeout(() => {
            set({ phase: 'victory' });
          }, 2000);
        } else {
          set({ bossHp: newHp, message: `보스 HP: ${newHp}/${state.bossMaxHp}` });
        }
      }
      return;
    }

    // Find closest patient
    const nearby = state.patients
      .filter(p => p.state === 'waiting')
      .map(p => ({
        ...p,
        dist: Math.sqrt((px - p.position[0]) ** 2 + (pz - p.position[2]) ** 2),
      }))
      .filter(p => p.dist < INTERACT_RANGE)
      .sort((a, b) => a.dist - b.dist);

    if (nearby.length === 0) return;
    const target = nearby[0];

    // Fracture: escort logic
    if (target.symptom === 'fracture' && !target.escorting && state.playerRoom !== 'surgery') {
      const newPatients = state.patients.map(p =>
        p.id === target.id ? { ...p, escorting: true } : p
      );
      set({ patients: newPatients, escortingId: target.id, message: '수술실로 이송하세요!' });
      return;
    }

    if (target.symptom === 'fracture' && target.escorting && state.playerRoom === 'surgery') {
      const newPatients = state.patients.map(p =>
        p.id === target.id ? { ...p, state: 'treated' as PatientState, healAnim: 1 } : p
      );
      sfxHeal();
      const points = target.isEmergency ? 200 : 150;
      set({
        patients: newPatients,
        escortingId: null,
        score: state.score + points,
        battery: Math.min(BATTERY_MAX, state.battery + BATTERY_HEAL_BONUS),
        message: `골절 치료 완료! +${points}`,
      });
      checkDayComplete(set, get);
      return;
    }

    // Normal treatment
    const activeTool = unlockedTools[state.activeTool % unlockedTools.length];
    const symptom = SYMPTOMS[target.symptom];

    if (activeTool === symptom.requiredTool) {
      const newPatients = state.patients.map(p =>
        p.id === target.id ? { ...p, state: 'treated' as PatientState, healAnim: 1 } : p
      );
      sfxHeal();
      const points = target.isEmergency ? 200 : 100;
      set({
        patients: newPatients,
        score: state.score + points,
        battery: Math.min(BATTERY_MAX, state.battery + BATTERY_HEAL_BONUS),
        message: `${target.name} 치료 완료! +${points}`,
      });
      checkDayComplete(set, get);
    } else {
      const newPatients = state.patients.map(p =>
        p.id === target.id ? { ...p, wrongToolTimer: 1 } : p
      );
      sfxWrong();
      set({ patients: newPatients, message: `틀린 도구! ${symptom.hint}` });
    }
  },

  nextDay: () => {
    const state = get();
    const nextIdx = state.currentDay + 1;
    if (nextIdx < DAYS.length) {
      get().startDay(nextIdx);
    }
  },
}));

function checkDayComplete(
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore,
) {
  const state = get();
  const allTreated = state.patients.every(p => p.state === 'treated');
  if (!allTreated) return;

  const dayConfig = DAYS[state.currentDay];

  if (dayConfig.bossEvent) {
    set({
      phase: 'boss',
      playerRoom: 'surgery',
      playerPos: [0, 0, -18],
      message: '로봇 바이러스 등장!',
      bossHp: 5,
      bossBullets: [],
    });
    return;
  }

  const bonus = Math.round(state.battery * 2);
  sfxDayComplete();
  set({
    phase: 'dayComplete',
    score: state.score + bonus,
    stars: state.stars + 1,
    message: `Day ${state.currentDay + 1} 클리어! 배터리 보너스 +${bonus}`,
  });
}

// ─── Input System ─────────────────────────────────────────────────────────────
const keysPressed = new Set<string>();
let joystickDx = 0;
let joystickDy = 0;
let joystickActive = false;

// ─── 3D Components ────────────────────────────────────────────────────────────

// Floor/wall material cache
const floorMat = new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.8 });

function Room3D({ room }: { room: RoomDef }) {
  const [rx, , rz] = room.position;
  const halfW = room.size[0] / 2;
  const halfD = room.size[2] / 2;
  const wallH = room.size[1];
  const wallThick = 0.2;

  const hasDoor = (dir: string) => room.connections.some(c => c.dir === dir);

  return (
    <group position={[rx, 0, rz]}>
      {/* Floor */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[room.size[0], 0.1, room.size[2]]} />
        <meshStandardMaterial color={room.color} roughness={0.7} />
      </mesh>

      {/* Walls */}
      {/* North wall (z = -halfD) */}
      {hasDoor('north') ? (
        <>
          <mesh position={[-(halfW + DOOR_W / 2) / 2 - DOOR_W / 4, wallH / 2, -halfD]}>
            <boxGeometry args={[(halfW - DOOR_W / 2), wallH, wallThick]} />
            <meshStandardMaterial color={room.wallColor} />
          </mesh>
          <mesh position={[(halfW + DOOR_W / 2) / 2 + DOOR_W / 4, wallH / 2, -halfD]}>
            <boxGeometry args={[(halfW - DOOR_W / 2), wallH, wallThick]} />
            <meshStandardMaterial color={room.wallColor} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, wallH / 2, -halfD]}>
          <boxGeometry args={[room.size[0], wallH, wallThick]} />
          <meshStandardMaterial color={room.wallColor} />
        </mesh>
      )}

      {/* South wall */}
      {hasDoor('south') ? (
        <>
          <mesh position={[-(halfW + DOOR_W / 2) / 2 - DOOR_W / 4, wallH / 2, halfD]}>
            <boxGeometry args={[(halfW - DOOR_W / 2), wallH, wallThick]} />
            <meshStandardMaterial color={room.wallColor} />
          </mesh>
          <mesh position={[(halfW + DOOR_W / 2) / 2 + DOOR_W / 4, wallH / 2, halfD]}>
            <boxGeometry args={[(halfW - DOOR_W / 2), wallH, wallThick]} />
            <meshStandardMaterial color={room.wallColor} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, wallH / 2, halfD]}>
          <boxGeometry args={[room.size[0], wallH, wallThick]} />
          <meshStandardMaterial color={room.wallColor} />
        </mesh>
      )}

      {/* East wall */}
      {hasDoor('east') ? (
        <>
          <mesh position={[halfW, wallH / 2, -(halfD + DOOR_W / 2) / 2 - DOOR_W / 4]}>
            <boxGeometry args={[wallThick, wallH, (halfW - DOOR_W / 2)]} />
            <meshStandardMaterial color={room.wallColor} />
          </mesh>
          <mesh position={[halfW, wallH / 2, (halfD + DOOR_W / 2) / 2 + DOOR_W / 4]}>
            <boxGeometry args={[wallThick, wallH, (halfW - DOOR_W / 2)]} />
            <meshStandardMaterial color={room.wallColor} />
          </mesh>
        </>
      ) : (
        <mesh position={[halfW, wallH / 2, 0]}>
          <boxGeometry args={[wallThick, wallH, room.size[2]]} />
          <meshStandardMaterial color={room.wallColor} />
        </mesh>
      )}

      {/* West wall */}
      {hasDoor('west') ? (
        <>
          <mesh position={[-halfW, wallH / 2, -(halfD + DOOR_W / 2) / 2 - DOOR_W / 4]}>
            <boxGeometry args={[wallThick, wallH, (halfW - DOOR_W / 2)]} />
            <meshStandardMaterial color={room.wallColor} />
          </mesh>
          <mesh position={[-halfW, wallH / 2, (halfD + DOOR_W / 2) / 2 + DOOR_W / 4]}>
            <boxGeometry args={[wallThick, wallH, (halfW - DOOR_W / 2)]} />
            <meshStandardMaterial color={room.wallColor} />
          </mesh>
        </>
      ) : (
        <mesh position={[-halfW, wallH / 2, 0]}>
          <boxGeometry args={[wallThick, wallH, room.size[2]]} />
          <meshStandardMaterial color={room.wallColor} />
        </mesh>
      )}

      {/* Furniture */}
      {room.furniture.map((f, i) => (
        <mesh key={i} position={f.pos} castShadow receiveShadow>
          <boxGeometry args={f.size} />
          <meshStandardMaterial color={f.color} roughness={0.6} />
        </mesh>
      ))}

      {/* Room name floating */}
      <Html position={[0, wallH + 0.5, 0]} center>
        <div style={{
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          padding: '2px 10px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {room.name}
        </div>
      </Html>
    </group>
  );
}

function Hospital3D() {
  return (
    <group>
      {ROOMS.map(r => <Room3D key={r.id} room={r} />)}

      {/* Corridor floors between rooms */}
      {/* reception → clinic */}
      <mesh position={[0, -0.05, -5]} receiveShadow>
        <boxGeometry args={[DOOR_W + 0.5, 0.1, 2]} />
        <meshStandardMaterial color="#D5D5D5" />
      </mesh>
      {/* clinic → injection */}
      <mesh position={[5, -0.05, -10]} receiveShadow>
        <boxGeometry args={[2, 0.1, DOOR_W + 0.5]} />
        <meshStandardMaterial color="#D5D5D5" />
      </mesh>
      {/* clinic → surgery */}
      <mesh position={[0, -0.05, -15]} receiveShadow>
        <boxGeometry args={[DOOR_W + 0.5, 0.1, 2]} />
        <meshStandardMaterial color="#D5D5D5" />
      </mesh>
      {/* injection → pharmacy */}
      <mesh position={[10, -0.05, -15]} receiveShadow>
        <boxGeometry args={[DOOR_W + 0.5, 0.1, 2]} />
        <meshStandardMaterial color="#D5D5D5" />
      </mesh>
      {/* surgery → pharmacy */}
      <mesh position={[5, -0.05, -20]} receiveShadow>
        <boxGeometry args={[2, 0.1, DOOR_W + 0.5]} />
        <meshStandardMaterial color="#D5D5D5" />
      </mesh>
      {/* surgery → ward */}
      <mesh position={[0, -0.05, -25]} receiveShadow>
        <boxGeometry args={[DOOR_W + 0.5, 0.1, 2]} />
        <meshStandardMaterial color="#D5D5D5" />
      </mesh>
    </group>
  );
}

// Ihyunbot 3D character (procedural low-poly robot)
function Ihyunbot3D() {
  const meshRef = useRef<THREE.Group>(null!);
  const bobRef = useRef(0);

  useFrame((_, delta) => {
    const store = useGameStore.getState();
    if (!meshRef.current) return;
    if (store.phase !== 'playing' && store.phase !== 'boss') return;

    const [px, py, pz] = store.playerPos;
    meshRef.current.position.set(px, py, pz);
    meshRef.current.rotation.y = store.playerRotation;

    // Bobbing animation when moving
    const isMoving = keysPressed.size > 0 || joystickActive;
    if (isMoving) {
      bobRef.current += delta * 8;
      meshRef.current.position.y = py + Math.sin(bobRef.current) * 0.06;
    }
  });

  return (
    <group ref={meshRef}>
      {/* Body */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.6, 0.8, 0.4]} />
        <meshStandardMaterial color={COLORS.secondary} roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.45]} />
        <meshStandardMaterial color="#E0E0E0" roughness={0.3} metalness={0.5} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.12, 1.25, 0.23]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#2196F3" emissive="#2196F3" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0.12, 1.25, 0.23]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#2196F3" emissive="#2196F3" emissiveIntensity={0.5} />
      </mesh>
      {/* Antenna */}
      <mesh position={[0, 1.55, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.2, 6]} />
        <meshStandardMaterial color="#FF6B6B" />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#FF6B6B" emissive="#FF6B6B" emissiveIntensity={0.3} />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.45, 0.6, 0]} castShadow>
        <boxGeometry args={[0.15, 0.5, 0.15]} />
        <meshStandardMaterial color={COLORS.secondary} roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0.45, 0.6, 0]} castShadow>
        <boxGeometry args={[0.15, 0.5, 0.15]} />
        <meshStandardMaterial color={COLORS.secondary} roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Legs/wheels */}
      <mesh position={[-0.15, 0.1, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.15, 8]} />
        <meshStandardMaterial color="#333" roughness={0.6} />
      </mesh>
      <mesh position={[0.15, 0.1, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.15, 8]} />
        <meshStandardMaterial color="#333" roughness={0.6} />
      </mesh>
      {/* Medical cross on body */}
      <mesh position={[0, 0.7, 0.21]}>
        <boxGeometry args={[0.25, 0.06, 0.01]} />
        <meshStandardMaterial color="#FF6B6B" />
      </mesh>
      <mesh position={[0, 0.7, 0.21]}>
        <boxGeometry args={[0.06, 0.25, 0.01]} />
        <meshStandardMaterial color="#FF6B6B" />
      </mesh>
    </group>
  );
}

// Patient 3D component
function Patient3D({ patient }: { patient: PatientData }) {
  const meshRef = useRef<THREE.Group>(null!);
  const bobRef = useRef(Math.random() * 10);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    bobRef.current += delta * 2;

    // Bobbing
    meshRef.current.position.y = Math.sin(bobRef.current) * 0.05;

    // Wrong tool shake
    if (patient.wrongToolTimer > 0) {
      meshRef.current.position.x = Math.sin(bobRef.current * 20) * 0.05;
    } else {
      meshRef.current.position.x = 0;
    }
  });

  if (patient.state !== 'waiting') return null;

  const symptom = SYMPTOMS[patient.symptom];

  return (
    <group position={patient.position}>
      <group ref={meshRef}>
        {/* Body */}
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.5, 0.7, 0.35]} />
          <meshStandardMaterial color={patient.color} roughness={0.5} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 1, 0]} castShadow>
          <sphereGeometry args={[0.25, 8, 8]} />
          <meshStandardMaterial color="#FFEAA7" roughness={0.5} />
        </mesh>

        {/* Emergency indicator */}
        {patient.isEmergency && (
          <mesh position={[0.35, 1.3, 0]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color="#FF0000" emissive="#FF0000" emissiveIntensity={1} />
          </mesh>
        )}

        {/* Speech bubble (HTML overlay) */}
        <Html position={[0, 1.8, 0]} center>
          <div style={{
            background: 'white',
            border: '2px solid #DDD',
            borderRadius: 12,
            padding: '4px 10px',
            fontSize: 13,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            minWidth: 60,
            textAlign: 'center',
          }}>
            <span style={{ fontSize: 18 }}>{symptom.emoji}</span>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{symptom.name}</div>
            {patient.isEmergency && patient.emergencyTimer > 0 && (
              <div style={{ fontSize: 10, color: '#FF0000', fontWeight: 'bold' }}>
                {Math.ceil(patient.emergencyTimer)}초!
              </div>
            )}
          </div>
        </Html>
      </group>
    </group>
  );
}

// Boss 3D
function Boss3D() {
  const meshRef = useRef<THREE.Group>(null!);
  const timeRef = useRef(0);
  const store = useGameStore.getState();

  useFrame((_, delta) => {
    const state = useGameStore.getState();
    if (state.phase !== 'boss' || !meshRef.current) return;
    timeRef.current += delta;

    const surgeryPos = ROOM_MAP['surgery'].position;
    const bx = surgeryPos[0];
    const bz = surgeryPos[2];

    // Hover and pulse
    meshRef.current.position.set(bx, 1 + Math.sin(timeRef.current * 2) * 0.3, bz);
    const scale = 1 + Math.sin(timeRef.current * 3) * 0.05;
    meshRef.current.scale.setScalar(scale);

    // Rotate slowly
    meshRef.current.rotation.y += delta * 0.5;
  });

  if (store.phase !== 'boss') return null;

  return (
    <group ref={meshRef}>
      {/* Virus body */}
      <mesh castShadow>
        <dodecahedronGeometry args={[0.8, 0]} />
        <meshStandardMaterial color="#8E24AA" roughness={0.3} emissive="#AA00FF" emissiveIntensity={0.3} />
      </mesh>
      {/* Spikes */}
      {[0, 1, 2, 3, 4, 5].map(i => {
        const angle = (Math.PI * 2 * i) / 6;
        return (
          <mesh key={i} position={[Math.cos(angle) * 0.9, 0, Math.sin(angle) * 0.9]}
            rotation={[0, 0, angle]}>
            <coneGeometry args={[0.15, 0.4, 4]} />
            <meshStandardMaterial color="#CE93D8" />
          </mesh>
        );
      })}
      {/* Eyes */}
      <mesh position={[-0.2, 0.15, 0.7]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color="#FF0000" emissive="#FF0000" emissiveIntensity={1} />
      </mesh>
      <mesh position={[0.2, 0.15, 0.7]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color="#FF0000" emissive="#FF0000" emissiveIntensity={1} />
      </mesh>

      <Html position={[0, 1.5, 0]} center>
        <div style={{
          background: 'rgba(128,0,128,0.8)',
          color: '#fff',
          padding: '4px 12px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          🦠 로봇 바이러스
        </div>
      </Html>
    </group>
  );
}

// Heal particles
function HealParticles() {
  const particlesRef = useRef<THREE.Points>(null!);
  const positionsRef = useRef(new Float32Array(100 * 3));
  const velocitiesRef = useRef<{ vx: number; vy: number; vz: number; life: number }[]>([]);

  useFrame((_, delta) => {
    if (!particlesRef.current) return;
    const positions = positionsRef.current;
    const vels = velocitiesRef.current;

    for (let i = vels.length - 1; i >= 0; i--) {
      const v = vels[i];
      v.life -= delta;
      if (v.life <= 0) {
        vels.splice(i, 1);
        positions[i * 3] = 0;
        positions[i * 3 + 1] = -100;
        positions[i * 3 + 2] = 0;
        continue;
      }
      positions[i * 3] += v.vx * delta;
      positions[i * 3 + 1] += v.vy * delta;
      positions[i * 3 + 2] += v.vz * delta;
      v.vy += delta * 2; // gravity up for sparkle effect
    }

    if (particlesRef.current.geometry) {
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positionsRef.current, 3]}
        />
      </bufferGeometry>
      <pointsMaterial size={0.15} color="#55EFC4" transparent opacity={0.8} />
    </points>
  );
}

// Camera controller
function CameraController() {
  const { camera } = useThree();

  useFrame(() => {
    const state = useGameStore.getState();
    if (state.phase !== 'playing' && state.phase !== 'boss') return;

    const [px, py, pz] = state.playerPos;
    const targetX = px + CAMERA_OFFSET[0];
    const targetY = py + CAMERA_OFFSET[1];
    const targetZ = pz + CAMERA_OFFSET[2];

    camera.position.x += (targetX - camera.position.x) * CAMERA_LERP;
    camera.position.y += (targetY - camera.position.y) * CAMERA_LERP;
    camera.position.z += (targetZ - camera.position.z) * CAMERA_LERP;

    camera.lookAt(px, py + 0.5, pz);
  });

  return null;
}

// Player movement system
function PlayerController() {
  const dashingRef = useRef(false);
  const dashTimerRef = useRef(0);
  const dashDirRef = useRef<[number, number]>([0, 1]);
  const footstepTimerRef = useRef(0);

  useFrame((_, delta) => {
    const state = useGameStore.getState();
    if (state.phase !== 'playing' && state.phase !== 'boss') return;

    let moveX = 0;
    let moveZ = 0;

    // Keyboard
    if (keysPressed.has('w') || keysPressed.has('arrowup'))    moveZ = -1;
    if (keysPressed.has('s') || keysPressed.has('arrowdown'))  moveZ = 1;
    if (keysPressed.has('a') || keysPressed.has('arrowleft'))  moveX = -1;
    if (keysPressed.has('d') || keysPressed.has('arrowright')) moveX = 1;

    // Joystick
    if (joystickActive) {
      if (Math.abs(joystickDx) > 0.2) moveX = joystickDx;
      if (Math.abs(joystickDy) > 0.2) moveZ = joystickDy;
    }

    // Normalize
    const mag = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (mag > 0) { moveX /= mag; moveZ /= mag; }

    // Dash
    let speed = PLAYER_SPEED;
    if (dashingRef.current) {
      dashTimerRef.current -= delta;
      if (dashTimerRef.current <= 0) {
        dashingRef.current = false;
      } else {
        speed = DASH_SPEED;
        moveX = dashDirRef.current[0];
        moveZ = dashDirRef.current[1];
      }
    }

    // Dash cooldown
    if (state.dashCooldown > 0) {
      state.setDashCooldown(Math.max(0, state.dashCooldown - delta));
    }

    if (mag > 0 || dashingRef.current) {
      const [px, py, pz] = state.playerPos;
      let nx = px + moveX * speed * delta;
      let nz = pz + moveZ * speed * delta;

      // Room collision: find current room and clamp
      const currentRoom = ROOM_MAP[state.playerRoom];
      const [rx, , rz] = currentRoom.position;
      const halfW = currentRoom.size[0] / 2 - 0.3;
      const halfD = currentRoom.size[2] / 2 - 0.3;

      // Check door transitions
      let transitioned = false;
      for (const conn of currentRoom.connections) {
        let doorX = rx, doorZ = rz;
        let checkDir = false;
        const margin = 0.5;

        switch (conn.dir) {
          case 'north':
            doorZ = rz - currentRoom.size[2] / 2;
            checkDir = nz < doorZ - margin && Math.abs(nx - rx) < DOOR_W / 2;
            break;
          case 'south':
            doorZ = rz + currentRoom.size[2] / 2;
            checkDir = nz > doorZ + margin && Math.abs(nx - rx) < DOOR_W / 2;
            break;
          case 'east':
            doorX = rx + currentRoom.size[0] / 2;
            checkDir = nx > doorX + margin && Math.abs(nz - rz) < DOOR_W / 2;
            break;
          case 'west':
            doorX = rx - currentRoom.size[0] / 2;
            checkDir = nx < doorX - margin && Math.abs(nz - rz) < DOOR_W / 2;
            break;
        }

        if (checkDir) {
          const targetRoom = ROOM_MAP[conn.to];
          const [trx, , trz] = targetRoom.position;
          // Spawn at opposite door
          switch (conn.dir) {
            case 'north': nx = trx; nz = trz + targetRoom.size[2] / 2 - 1; break;
            case 'south': nx = trx; nz = trz - targetRoom.size[2] / 2 + 1; break;
            case 'east':  nx = trx - targetRoom.size[0] / 2 + 1; nz = trz; break;
            case 'west':  nx = trx + targetRoom.size[0] / 2 - 1; nz = trz; break;
          }
          state.setPlayerRoom(conn.to);
          sfxDoor();
          transitioned = true;

          // Move escorted patient
          if (state.escortingId) {
            const newPatients = state.patients.map(p =>
              p.id === state.escortingId ? {
                ...p,
                roomId: conn.to,
                position: [nx + 0.8, 0, nz + 0.8] as Vec3,
              } : p
            );
            useGameStore.setState({ patients: newPatients });
          }
          break;
        }
      }

      if (!transitioned) {
        // Clamp to room bounds
        nx = Math.max(rx - halfW, Math.min(rx + halfW, nx));
        nz = Math.max(rz - halfD, Math.min(rz + halfD, nz));

        // Simple furniture collision
        for (const f of currentRoom.furniture) {
          const fPos = f.pos;
          const fSize = f.size;
          const fWorldX = rx + fPos[0];
          const fWorldZ = rz + fPos[2];
          const fhw = fSize[0] / 2 + 0.3;
          const fhd = fSize[2] / 2 + 0.3;

          if (nx > fWorldX - fhw && nx < fWorldX + fhw &&
              nz > fWorldZ - fhd && nz < fWorldZ + fhd) {
            // Push out
            const dx = nx - fWorldX;
            const dz = nz - fWorldZ;
            if (Math.abs(dx) / fhw > Math.abs(dz) / fhd) {
              nx = dx > 0 ? fWorldX + fhw : fWorldX - fhw;
            } else {
              nz = dz > 0 ? fWorldZ + fhd : fWorldZ - fhd;
            }
          }
        }
      }

      // Footstep sounds
      footstepTimerRef.current -= delta;
      if (footstepTimerRef.current <= 0) {
        sfxFootstep();
        footstepTimerRef.current = dashingRef.current ? 0.15 : 0.3;
      }

      // Update rotation to face movement direction
      const targetRot = Math.atan2(moveX, moveZ);
      let currentRot = state.playerRotation;
      let diff = targetRot - currentRot;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      currentRot += diff * 0.15;

      state.setPlayerPos([nx, py, nz]);
      state.setPlayerRotation(currentRot);

      // Battery drain
      state.setBattery(state.battery - BATTERY_DRAIN * delta * 60);
    }

    // Emergency timers
    const patients = state.patients;
    let updated = false;
    const newPatients = patients.map(p => {
      if (p.isEmergency && p.state === 'waiting' && p.emergencyTimer > 0) {
        const nt = p.emergencyTimer - delta;
        if (nt <= 0) {
          updated = true;
          sfxEmergency();
          return { ...p, state: 'treated' as PatientState, emergencyTimer: 0 };
        }
        // Beep when timer hits 10, 5
        if (Math.floor(nt) !== Math.floor(nt + delta) && (Math.floor(nt + delta) === 10 || Math.floor(nt + delta) === 5)) {
          sfxEmergency();
        }
        return { ...p, emergencyTimer: nt };
      }
      if (p.wrongToolTimer > 0) {
        return { ...p, wrongToolTimer: Math.max(0, p.wrongToolTimer - delta) };
      }
      return p;
    });
    if (updated) {
      state.setScore(Math.max(0, state.score - 100));
      state.setMessage('시간 초과! -100점');
    }
    useGameStore.setState({ patients: newPatients });

    // Boss bullets
    if (state.phase === 'boss' && state.bossHp > 0) {
      const surgeryPos = ROOM_MAP['surgery'].position;
      const bx = surgeryPos[0];
      const bz = surgeryPos[2];

      // Shoot periodically
      const time = performance.now() / 1000;
      if (Math.sin(time * 1.5) > 0.95) {
        const newBullets = [...state.bossBullets];
        for (let a = 0; a < 6; a++) {
          const angle = (Math.PI * 2 * a) / 6 + time * 0.3;
          newBullets.push({
            x: bx, z: bz,
            vx: Math.cos(angle) * 3,
            vz: Math.sin(angle) * 3,
          });
        }
        useGameStore.setState({ bossBullets: newBullets });
      }

      // Update bullets
      const bullets = state.bossBullets.filter(b => {
        b.x += b.vx * delta;
        b.z += b.vz * delta;
        // Bounds check
        if (Math.abs(b.x - bx) > 5 || Math.abs(b.z - bz) > 5) return false;
        // Player hit check
        const [ppx, , ppz] = state.playerPos;
        if (Math.sqrt((b.x - ppx) ** 2 + (b.z - ppz) ** 2) < 0.4) {
          state.setBattery(state.battery - 5);
          return false;
        }
        return true;
      });
      useGameStore.setState({ bossBullets: bullets });
    }
  });

  // Keyboard events
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      keysPressed.add(key);

      if (key >= '1' && key <= '4') {
        useGameStore.getState().setActiveTool(parseInt(key) - 1);
      }

      if (key === 'shift') {
        const state = useGameStore.getState();
        if (state.dashCooldown <= 0 && !dashingRef.current) {
          dashingRef.current = true;
          dashTimerRef.current = DASH_DURATION;
          state.setDashCooldown(DASH_COOLDOWN);
          const rot = state.playerRotation;
          dashDirRef.current = [Math.sin(rot), Math.cos(rot)];
          sfxDash();
        }
      }

      if (key === ' ' || key === 'enter') {
        e.preventDefault();
        useGameStore.getState().interact();
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      keysPressed.delete(e.key.toLowerCase());
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return null;
}

// Boss bullets visualization
function BossBullets3D() {
  const bulletsRef = useRef<THREE.InstancedMesh>(null!);
  const tempObj = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const state = useGameStore.getState();
    if (!bulletsRef.current) return;

    const bullets = state.bossBullets;
    for (let i = 0; i < 50; i++) {
      if (i < bullets.length) {
        tempObj.position.set(bullets[i].x, 0.5, bullets[i].z);
        tempObj.scale.setScalar(1);
      } else {
        tempObj.position.set(0, -100, 0);
        tempObj.scale.setScalar(0);
      }
      tempObj.updateMatrix();
      bulletsRef.current.setMatrixAt(i, tempObj.matrix);
    }
    bulletsRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={bulletsRef} args={[undefined, undefined, 50]}>
      <sphereGeometry args={[0.15, 6, 6]} />
      <meshStandardMaterial color="#AA00FF" emissive="#AA00FF" emissiveIntensity={0.8} />
    </instancedMesh>
  );
}

// Lighting setup
function Lighting() {
  return (
    <>
      <ambientLight intensity={0.6} color="#FFF5EE" />
      <directionalLight
        position={[5, 10, 5]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <pointLight position={[0, 4, 0]} intensity={0.3} color="#FFE0B2" />
    </>
  );
}

// Main 3D Scene
function GameScene() {
  const phase = useGameStore(s => s.phase);
  const patients = useGameStore(s => s.patients);

  if (phase === 'menu' || phase === 'dayComplete' || phase === 'gameOver' || phase === 'victory') return null;

  return (
    <>
      <Lighting />
      <CameraController />
      <PlayerController />
      <Hospital3D />
      <Ihyunbot3D />
      {patients.map(p => <Patient3D key={p.id} patient={p} />)}
      <Boss3D />
      <BossBullets3D />
      <HealParticles />
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, -15]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#C8E6C9" roughness={0.9} />
      </mesh>
    </>
  );
}

// ─── UI Components ────────────────────────────────────────────────────────────

function MainMenu() {
  const phase = useGameStore(s => s.phase);
  const startGame = useGameStore(s => s.startGame);
  const [selectedChar, setSelectedChar] = useState(4);

  const chars = ['승민', '건우', '강우', '수현', '이현', '준영', '준우'];
  const charColors = ['#FF6B6B', '#74B9FF', '#55EFC4', '#FFEAA7', '#4ECDC4', '#A29BFE', '#FD79A8'];

  if (phase !== 'menu') return null;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      color: '#fff', fontFamily: 'sans-serif',
      zIndex: 10,
    }}>
      <div style={{ fontSize: 60, marginBottom: 10 }}>🤖</div>
      <h1 style={{ fontSize: 26, margin: '0 0 8px', fontWeight: 'bold' }}>이현봇 병원 대모험</h1>
      <p style={{ fontSize: 14, color: '#74B9FF', margin: '0 0 30px' }}>
        꼬마 로봇 의사가 되어 환자를 치료하세요!
      </p>

      <p style={{ fontSize: 13, margin: '0 0 10px', color: '#AAA' }}>조종사를 선택하세요</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 340 }}>
        {chars.map((name, i) => (
          <button
            key={name}
            onClick={() => { setSelectedChar(i); getAudio(); sfxClick(); }}
            style={{
              width: 44, height: 52,
              border: selectedChar === i ? '2px solid #55EFC4' : '2px solid transparent',
              borderRadius: 10,
              background: selectedChar === i ? 'rgba(85,239,196,0.2)' : 'rgba(255,255,255,0.08)',
              color: '#fff', fontSize: 10,
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 2,
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: charColors[i],
            }} />
            <span>{name}</span>
          </button>
        ))}
      </div>

      <button
        onClick={() => { getAudio(); sfxClick(); bgmStart(); startGame(chars[selectedChar]); }}
        style={{
          padding: '12px 40px',
          fontSize: 16, fontWeight: 'bold',
          background: '#55EFC4', color: '#1a1a2e',
          border: 'none', borderRadius: 12,
          cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(85,239,196,0.3)',
        }}
      >
        게임 시작!
      </button>

      <div style={{
        marginTop: 24, padding: '12px 20px',
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 10, fontSize: 11, color: '#888',
        lineHeight: 1.8, textAlign: 'center',
      }}>
        🎮 WASD/조이스틱: 이동 &nbsp; 🩺 1~4: 도구 선택<br />
        ⚡ Shift/대쉬: 대쉬 &nbsp; 💚 Space/치료: 상호작용
      </div>
    </div>
  );
}

function DayCompleteScreen() {
  const phase = useGameStore(s => s.phase);
  const currentDay = useGameStore(s => s.currentDay);
  const score = useGameStore(s => s.score);
  const message = useGameStore(s => s.message);
  const nextDay = useGameStore(s => s.nextDay);

  if (phase !== 'dayComplete') return null;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.8)',
      color: '#fff', fontFamily: 'sans-serif',
      zIndex: 10,
    }}>
      <div style={{ fontSize: 50, marginBottom: 10 }}>🎉</div>
      <h2 style={{ fontSize: 24, margin: '0 0 10px' }}>Day {currentDay + 1} 클리어!</h2>
      <p style={{ fontSize: 14, color: '#55EFC4', margin: '0 0 8px' }}>{message}</p>
      <p style={{ fontSize: 18, margin: '0 0 20px' }}>총 점수: {score}</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {DAYS.map((_, i) => (
          <div key={i} style={{
            width: 20, height: 20, borderRadius: '50%',
            background: i <= currentDay ? '#55EFC4' : '#555',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 'bold',
          }}>
            {i <= currentDay ? '✓' : ''}
          </div>
        ))}
      </div>

      {currentDay < DAYS.length - 1 && (
        <button
          onClick={() => { sfxClick(); nextDay(); }}
          style={{
            padding: '12px 30px', fontSize: 14, fontWeight: 'bold',
            background: '#55EFC4', color: '#1a1a2e',
            border: 'none', borderRadius: 10, cursor: 'pointer',
          }}
        >
          다음 Day →
        </button>
      )}
    </div>
  );
}

function VictoryScreen() {
  const phase = useGameStore(s => s.phase);
  const score = useGameStore(s => s.score);
  const playerName = useGameStore(s => s.playerName);
  const setPhase = useGameStore(s => s.setPhase);
  const [saved, setSaved] = useState(false);

  if (phase !== 'victory') return null;

  const handleRestart = () => {
    if (!saved) {
      saveScore('hospital', playerName || '이현', score);
      setSaved(true);
    }
    bgmStop();
    sfxClick();
    setPhase('menu');
  };

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f3460 0%, #533483 100%)',
      color: '#fff', fontFamily: 'sans-serif',
      zIndex: 10,
    }}>
      <div style={{ fontSize: 60, marginBottom: 10 }}>🏆</div>
      <h2 style={{ fontSize: 26, margin: '0 0 10px' }}>게임 클리어!</h2>
      <p style={{ fontSize: 20, color: '#FFD700', margin: '0 0 8px', fontWeight: 'bold' }}>
        최종 점수: {score}
      </p>
      <p style={{ fontSize: 14, color: '#74B9FF', margin: '0 0 8px' }}>
        이현봇이 모든 환자를 치료했어요!
      </p>
      <p style={{ fontSize: 14, color: '#A29BFE', margin: '0 0 24px' }}>
        로봇 바이러스도 물리쳤어요! 🦠💥
      </p>
      <button
        onClick={handleRestart}
        style={{
          padding: '12px 30px', fontSize: 14, fontWeight: 'bold',
          background: '#55EFC4', color: '#1a1a2e',
          border: 'none', borderRadius: 10, cursor: 'pointer',
        }}
      >
        다시 시작
      </button>
    </div>
  );
}

function HUD() {
  const phase = useGameStore(s => s.phase);
  const score = useGameStore(s => s.score);
  const battery = useGameStore(s => s.battery);
  const currentDay = useGameStore(s => s.currentDay);
  const activeTool = useGameStore(s => s.activeTool);
  const patients = useGameStore(s => s.patients);
  const message = useGameStore(s => s.message);
  const dashCooldown = useGameStore(s => s.dashCooldown);
  const playerRoom = useGameStore(s => s.playerRoom);
  const bossHp = useGameStore(s => s.bossHp);
  const bossMaxHp = useGameStore(s => s.bossMaxHp);

  const setActiveTool = useGameStore(s => s.setActiveTool);
  const interact = useGameStore(s => s.interact);

  if (phase !== 'playing' && phase !== 'boss') return null;

  const dayConfig = DAYS[currentDay];
  const unlockedTools = dayConfig.unlockedTools;
  const healed = patients.filter(p => p.state === 'treated').length;
  const total = patients.length;
  const batPct = battery / BATTERY_MAX;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none',
      fontFamily: 'sans-serif',
      zIndex: 5,
    }}>
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 48, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', color: '#fff',
      }}>
        <span style={{ fontSize: 14, fontWeight: 'bold' }}>⭐ {score}</span>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 'bold' }}>Day {currentDay + 1}</div>
          <div style={{ fontSize: 10, color: '#55EFC4' }}>{healed}/{total} 치료</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11 }}>🔋</span>
          <div style={{
            width: 60, height: 14, background: '#333', borderRadius: 4, overflow: 'hidden',
          }}>
            <div style={{
              width: `${batPct * 100}%`, height: '100%',
              background: batPct > 0.5 ? '#55EFC4' : batPct > 0.2 ? '#FFEAA7' : '#FF6B6B',
              borderRadius: 4, transition: 'width 0.3s',
            }} />
          </div>
          <span style={{ fontSize: 9 }}>{Math.round(battery)}%</span>
        </div>
      </div>

      {/* Boss HP */}
      {phase === 'boss' && (
        <div style={{
          position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(128,0,128,0.8)', padding: '4px 16px',
          borderRadius: 8, color: '#fff', fontSize: 12,
        }}>
          🦠 바이러스 HP: {bossHp}/{bossMaxHp}
          <div style={{
            width: 120, height: 8, background: '#333', borderRadius: 4, marginTop: 4,
          }}>
            <div style={{
              width: `${(bossHp / bossMaxHp) * 100}%`, height: '100%',
              background: '#FF4444', borderRadius: 4,
            }} />
          </div>
        </div>
      )}

      {/* Message */}
      {message && (
        <div style={{
          position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)', padding: '4px 14px',
          borderRadius: 8, color: '#FFD700', fontSize: 12,
          whiteSpace: 'nowrap',
          ...(phase === 'boss' ? { top: 84 } : {}),
        }}>
          {message}
        </div>
      )}

      {/* Mini-map */}
      <div style={{
        position: 'absolute', top: 52, right: 8,
        background: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: 4,
      }}>
        {ROOMS.map(r => {
          const isCurrent = r.id === playerRoom;
          const rPatients = patients.filter(p => p.roomId === r.id && p.state === 'waiting');
          return (
            <div key={r.id} style={{
              position: 'absolute',
              left: 4 + r.position[0] * 3,
              top: 4 + (r.position[2] + 30) * 3,
              width: 22, height: 18,
              background: isCurrent ? r.wallColor : 'rgba(255,255,255,0.15)',
              borderRadius: 3,
              border: isCurrent ? '1.5px solid #fff' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, color: rPatients.some(p => p.isEmergency) ? '#FF4444' : '#FFD700',
              fontWeight: 'bold',
            }}>
              {rPatients.length > 0 ? rPatients.length : ''}
            </div>
          );
        })}
        <div style={{ width: 38, height: 100 }} /> {/* spacer */}
      </div>

      {/* Tool bar (bottom) */}
      <div style={{
        position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 6,
        background: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: '6px 10px',
        pointerEvents: 'auto',
      }}>
        {unlockedTools.map((toolId, i) => {
          const tool = TOOLS.find(t => t.id === toolId)!;
          const selected = i === activeTool;
          return (
            <button
              key={toolId}
              onClick={() => { setActiveTool(i); sfxToolSelect(); }}
              style={{
                width: 48, height: 48,
                border: selected ? '2px solid #55EFC4' : '2px solid transparent',
                borderRadius: 10,
                background: selected ? 'rgba(85,239,196,0.3)' : 'rgba(255,255,255,0.1)',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 1, color: '#fff',
              }}
            >
              <span style={{ fontSize: 20 }}>{tool.emoji}</span>
              <span style={{ fontSize: 8 }}>{i + 1}</span>
            </button>
          );
        })}
      </div>

      {/* Mobile controls */}
      <MobileJoystick />

      {/* Action buttons (right side) */}
      <div style={{
        position: 'absolute', bottom: 80, right: 16,
        display: 'flex', flexDirection: 'column', gap: 10,
        pointerEvents: 'auto',
      }}>
        <button
          onClick={() => { sfxClick(); interact(); }}
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(85,239,196,0.6)',
            border: '2px solid #55EFC4',
            color: '#fff', fontSize: 12, fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          치료
        </button>
        <button
          onClick={() => {
            const state = useGameStore.getState();
            if (state.dashCooldown <= 0) {
              state.setDashCooldown(DASH_COOLDOWN);
              sfxDash();
            }
          }}
          style={{
            width: 48, height: 48, borderRadius: '50%',
            background: dashCooldown <= 0 ? 'rgba(116,185,255,0.6)' : 'rgba(100,100,100,0.3)',
            border: dashCooldown <= 0 ? '2px solid #74B9FF' : '2px solid #555',
            color: '#fff', fontSize: 11,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          대쉬
        </button>
      </div>
    </div>
  );
}

function MobileJoystick() {
  const joystickAreaRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    if (!touch) return;
    touchIdRef.current = touch.identifier;
    centerRef.current = { x: touch.clientX, y: touch.clientY };
    joystickActive = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchIdRef.current) {
        let dx = t.clientX - centerRef.current.x;
        let dy = t.clientY - centerRef.current.y;
        const mag = Math.sqrt(dx * dx + dy * dy);
        const maxR = 35;
        if (mag > maxR) { dx = (dx / mag) * maxR; dy = (dy / mag) * maxR; }
        setKnobPos({ x: dx, y: dy });
        joystickDx = dx / maxR;
        joystickDy = dy / maxR;
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        touchIdRef.current = null;
        setKnobPos({ x: 0, y: 0 });
        joystickDx = 0;
        joystickDy = 0;
        joystickActive = false;
      }
    }
  }, []);

  return (
    <div
      ref={joystickAreaRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'absolute',
        bottom: 80, left: 24,
        width: 100, height: 100,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.1)',
        border: '2px solid rgba(255,255,255,0.2)',
        pointerEvents: 'auto',
        touchAction: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: 'rgba(255,255,255,0.3)',
        transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
        transition: knobPos.x === 0 && knobPos.y === 0 ? 'transform 0.15s' : 'none',
      }} />
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────
export default function HospitalPage() {
  return (
    <div style={{
      width: '100vw', height: '100vh',
      position: 'relative', overflow: 'hidden',
      touchAction: 'none', userSelect: 'none',
      background: '#1a1a2e',
    }}>
      <Canvas
        shadows
        camera={{
          position: [0, 8, 8],
          fov: 50,
          near: 0.1,
          far: 100,
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Suspense fallback={null}>
          <GameScene />
        </Suspense>
      </Canvas>

      <MainMenu />
      <DayCompleteScreen />
      <VictoryScreen />
      <HUD />
    </div>
  );
}
