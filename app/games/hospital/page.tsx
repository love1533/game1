'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { saveScore } from '@/lib/ranking';

// ─── Types ────────────────────────────────────────────────────────────────────
type GamePhase = 'intro' | 'playing' | 'ending';

// Sub-states within 'playing'
type TreatPhase =
  | 'entering'      // patient slides in
  | 'talking'       // speech bubble shown, waiting for user to start
  | 'stethoscope'   // must tap stethoscope tool then tap patient
  | 'treatment'     // drag correct tool to highlighted area
  | 'medicine'      // drag pill to patient
  | 'celebrating';  // brief celebration before next patient

interface Tool {
  id: ToolId;
  emoji: string;
  name: string;
}

type ToolId = 'stethoscope' | 'bandage' | 'cast' | 'disinfect' | 'plaster' | 'pill';

interface DragState {
  toolId: ToolId;
  x: number;
  y: number;
  startX: number;
  startY: number;
}

interface Sparkle {
  x: number; y: number;
  vx: number; vy: number;
  color: string; size: number;
  alpha: number; life: number;
}

interface FloatingText {
  text: string; x: number; y: number;
  vy: number; alpha: number; color: string; size: number;
}

interface PatientState {
  // which treat zones are done
  zonesDone: Set<string>;
  // set of sub-steps completed for stethoscope-first approach
  stethoscopeDone: boolean;
  // for stage 2: both ears; track individually
  leftEarDone: boolean;
  rightEarDone: boolean;
  // for stage 5: disinfect before plaster
  disinfectDone: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  { id: 'stethoscope', emoji: '🩺', name: '청진기' },
  { id: 'bandage',     emoji: '🩹', name: '붕대' },
  { id: 'cast',        emoji: '🦴', name: '깁스' },
  { id: 'disinfect',   emoji: '🧴', name: '소독약' },
  { id: 'plaster',     emoji: '🤕', name: '반창고' },
  { id: 'pill',        emoji: '💊', name: '약' },
];

const TOOL_COUNT = TOOLS.length;

// Pastel colors
const COLOR_BG        = '#E8FFF5';
const COLOR_PINK_BG   = '#FFF0F5';
const COLOR_TRAY      = '#FFF8E8';
const COLOR_GLOW_HURT = '#FF6B6B';
const COLOR_GLOW_OK   = '#55EFC4';
const COLOR_STICKER   = '#FFD700';
const COLOR_SPEECH_BG = '#FFFFFF';

// Stage definitions
interface Stage {
  patientEmoji: string;
  patientName: string;
  entryLine: string;
  completeLine: string;
  symptom: string;
  // Which zones exist and what tool heals each
  zones: ZoneDef[];
  // After zones: what extra steps are needed?
  // 'bandage_both_ears' means left + right ear each need bandage
  specialMode?: 'bandage_both_ears' | 'order_disinfect_plaster' | 'wrong_tool_cast';
}

interface ZoneDef {
  key: string;         // e.g. 'shoulder', 'left_ear', 'right_ear', 'tail', 'trunk', 'knee'
  label: string;
  requiredTool: ToolId;
  // relative position on patient body (0–1 of patientR radius, angle in radians)
  angle: number;       // angle from center
  dist: number;        // fraction of radius
  zoneR: number;       // fraction of patientR for hit radius
}

const STAGES: Stage[] = [
  // Stage 1: 곰돌이
  {
    patientEmoji: '🐻',
    patientName: '곰돌이',
    entryLine: '선생님~ 어깨가 너무 아파요. 꿀단지 들다가 삐끗했어요.',
    completeLine: '와! 이제 꿀단지도 번쩍 들 수 있어요!',
    symptom: '왼쪽 어깨가 아파요',
    zones: [
      { key: 'shoulder', label: '어깨', requiredTool: 'pill', angle: -Math.PI * 0.7, dist: 0.6, zoneR: 0.32 },
    ],
    // stage 1 only needs stethoscope + pill (no extra drag zone, pill is the "zone")
  },
  // Stage 2: 토끼
  {
    patientEmoji: '🐰',
    patientName: '토끼',
    entryLine: '선생님... 친구랑 놀다가 양쪽 귀를 다쳤어요.',
    completeLine: '귀가 다시 쫑긋~ 고마워요!',
    symptom: '양쪽 귀가 아파요',
    zones: [
      { key: 'left_ear',  label: '왼쪽 귀', requiredTool: 'bandage', angle: -Math.PI * 0.85, dist: 0.85, zoneR: 0.28 },
      { key: 'right_ear', label: '오른쪽 귀', requiredTool: 'bandage', angle: -Math.PI * 0.15, dist: 0.85, zoneR: 0.28 },
    ],
    specialMode: 'bandage_both_ears',
  },
  // Stage 3: 고양이
  {
    patientEmoji: '🐱',
    patientName: '고양이',
    entryLine: '야옹~ 꼬리가 문에 끼었어요...',
    completeLine: '꼬리를 살랑살랑~ 이제 안 아파요!',
    symptom: '꼬리가 아파요',
    zones: [
      { key: 'tail', label: '꼬리', requiredTool: 'bandage', angle: Math.PI * 0.6, dist: 0.8, zoneR: 0.28 },
    ],
  },
  // Stage 4: 코끼리
  {
    patientEmoji: '🐘',
    patientName: '코끼리',
    entryLine: '뿌우~ 코로 무거운 거 들다가 삐었어요!',
    completeLine: '뿌우우~! 코가 튼튼해졌어요!',
    symptom: '코(코끝)가 아파요',
    zones: [
      { key: 'trunk', label: '코', requiredTool: 'cast', angle: Math.PI * 0.25, dist: 0.65, zoneR: 0.3 },
    ],
    specialMode: 'wrong_tool_cast',
  },
  // Stage 5: 어린이
  {
    patientEmoji: '🧒',
    patientName: '어린이',
    entryLine: '으앙~ 뛰다가 넘어졌어요! 무릎에서 피가 나요!',
    completeLine: '하나도 안 아파요! 선생님 최고!',
    symptom: '무릎에서 피가 나요',
    zones: [
      // disinfect first, then plaster
      { key: 'knee_disinfect', label: '무릎 소독', requiredTool: 'disinfect', angle: Math.PI * 0.15, dist: 0.7, zoneR: 0.3 },
      { key: 'knee_plaster',   label: '무릎 반창고', requiredTool: 'plaster',   angle: Math.PI * 0.15, dist: 0.7, zoneR: 0.3 },
    ],
    specialMode: 'order_disinfect_plaster',
  },
];

const TOTAL_STAGES = STAGES.length;

const HEART_COLORS = ['#FF6B9D', '#FF9F43', '#FFEAA7', '#55EFC4', '#74B9FF', '#A29BFE'];

// ─── Audio ────────────────────────────────────────────────────────────────────
function makeAudio(): AudioContext | null {
  try {
    return new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch { return null; }
}

function tone(ctx: AudioContext, freq: number, start: number, dur: number, vol = 0.18, type: OscillatorType = 'sine') {
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

function playDoorbell(ctx: AudioContext) {
  const now = ctx.currentTime;
  tone(ctx, 880, now, 0.25);
  tone(ctx, 1109, now + 0.28, 0.3);
}

function playSuccess(ctx: AudioContext) {
  const now = ctx.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => tone(ctx, f, now + i * 0.08, 0.2, 0.15, 'triangle'));
}

function playWrong(ctx: AudioContext) {
  const now = ctx.currentTime;
  tone(ctx, 220, now, 0.15, 0.15, 'square');
  tone(ctx, 180, now + 0.15, 0.2, 0.12, 'square');
}

function playDisinfect(ctx: AudioContext) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g).connect(ctx.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
  g.gain.setValueAtTime(0.12, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  osc.start(now); osc.stop(now + 0.2);
}

function playGulp(ctx: AudioContext) {
  const now = ctx.currentTime;
  [400, 300, 200, 150].forEach((f, i) => tone(ctx, f, now + i * 0.06, 0.08, 0.14, 'sine'));
}

function playFanfare(ctx: AudioContext) {
  const now = ctx.currentTime;
  [523, 659, 784, 880, 1047].forEach((f, i) => tone(ctx, f, now + i * 0.1, 0.22, 0.16, 'triangle'));
}

function playCelebration(ctx: AudioContext) {
  const now = ctx.currentTime;
  const scale = [523, 587, 659, 698, 784, 880, 988, 1047];
  scale.forEach((f, i) => tone(ctx, f, now + i * 0.07, 0.2, 0.15, 'triangle'));
  // Chord
  [523, 659, 784].forEach(f => tone(ctx, f, now + 0.7, 0.5, 0.12, 'sine'));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

function emoji(ctx: CanvasRenderingContext2D, e: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.font = `${size}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e, x, y);
  ctx.restore();
}

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function HospitalPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef  = useRef<AudioContext | null>(null);

  // ── Phase state ─────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<GamePhase>('intro');
  const phaseRef = useRef<GamePhase>('intro');

  // ── Game state (all in refs to avoid re-render churn inside rAF) ─────────────
  const stageRef      = useRef(0);           // current stage 0-4
  const treatPhaseRef = useRef<TreatPhase>('entering');
  const scoreRef      = useRef(0);
  const stickersRef   = useRef(0);
  const firstTryRef   = useRef(true);        // for current step
  const patStateRef   = useRef<PatientState>({
    zonesDone: new Set(), stethoscopeDone: false,
    leftEarDone: false, rightEarDone: false, disinfectDone: false,
  });

  // React states only for buttons
  const [scoreDisplay, setScoreDisplay] = useState(0);

  // ── Animation state ──────────────────────────────────────────────────────────
  const frameRef      = useRef(0);
  const rafRef        = useRef(0);
  const sparklesRef   = useRef<Sparkle[]>([]);
  const floatsRef     = useRef<FloatingText[]>([]);
  const patEnterRef   = useRef(0);  // 0=offscreen, 1=settled (lerp)
  const celebTimerRef = useRef(0);
  const pulseRef      = useRef(0);  // for hurt zone pulse
  const shakeRef      = useRef(0);  // shake frames remaining
  const shakeDirRef   = useRef(1);
  const treatFlashRef = useRef(0);  // flash frames after successful drop
  const flashZoneRef  = useRef('');

  // ── Drag state ───────────────────────────────────────────────────────────────
  const dragRef = useRef<DragState | null>(null);

  // ── HUD hint text ─────────────────────────────────────────────────────────────
  const hintRef = useRef('');
  const hintTimerRef = useRef(0);

  // ── Ending sequence ──────────────────────────────────────────────────────────
  const endPhaseRef = useRef(0); // 0=parade, 1=stats, 2=buttons
  const endTimerRef = useRef(0);

  // ── Audio helper ─────────────────────────────────────────────────────────────
  const audio = useCallback(() => {
    if (!audioRef.current) audioRef.current = makeAudio();
    if (audioRef.current?.state === 'suspended') audioRef.current.resume();
    return audioRef.current;
  }, []);

  // ── Spawn helpers ────────────────────────────────────────────────────────────
  const spawnSparkles = useCallback((x: number, y: number, count = 14) => {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const sp = 2 + Math.random() * 5;
      sparklesRef.current.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
        color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
        size: 6 + Math.random() * 8, alpha: 1, life: 45 + Math.random() * 20,
      });
    }
  }, []);

  const spawnFloat = useCallback((text: string, x: number, y: number, color: string, size = 26) => {
    floatsRef.current.push({ text, x, y, vy: -1.8, alpha: 1, color, size });
  }, []);

  const showHint = useCallback((text: string) => {
    hintRef.current = text;
    hintTimerRef.current = 120;
  }, []);

  // ── Reset patient state ──────────────────────────────────────────────────────
  const resetPatState = useCallback(() => {
    patStateRef.current = {
      zonesDone: new Set(), stethoscopeDone: false,
      leftEarDone: false, rightEarDone: false, disinfectDone: false,
    };
    firstTryRef.current = true;
    treatFlashRef.current = 0;
    flashZoneRef.current = '';
  }, []);

  // ── Start game ────────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    stageRef.current      = 0;
    scoreRef.current      = 0;
    stickersRef.current   = 0;
    setScoreDisplay(0);
    phaseRef.current      = 'playing';
    setPhase('playing');
    treatPhaseRef.current = 'entering';
    patEnterRef.current   = 0;
    sparklesRef.current   = [];
    floatsRef.current     = [];
    resetPatState();
    celebTimerRef.current = 0;
    hintRef.current       = '새 환자가 옵니다!';
    hintTimerRef.current  = 90;
    const ac = audio();
    if (ac) playDoorbell(ac);
  }, [audio, resetPatState]);

  // ── Advance treat phase ──────────────────────────────────────────────────────
  const advanceTreatPhase = useCallback((to: TreatPhase) => {
    treatPhaseRef.current = to;
    firstTryRef.current = true;
  }, []);

  // ── After all zones+medicine done: celebrate ─────────────────────────────────
  const triggerCelebrate = useCallback(() => {
    const s = stageRef.current;
    const stage = STAGES[s];
    spawnSparkles(
      (canvasRef.current?.width ?? 400) * 0.35,
      (canvasRef.current?.height ?? 700) * 0.4, 22,
    );
    floatsRef.current = [];
    spawnFloat(stage.completeLine, (canvasRef.current?.width ?? 400) / 2, 180, '#0F766E', 20);
    spawnFloat('⭐ 스티커 획득!', (canvasRef.current?.width ?? 400) / 2, 220, COLOR_STICKER, 24);
    stickersRef.current++;
    scoreRef.current += 150; // stage complete bonus
    setScoreDisplay(scoreRef.current);
    advanceTreatPhase('celebrating');
    celebTimerRef.current = 150;
    const ac = audio();
    if (ac) playFanfare(ac);
  }, [advanceTreatPhase, audio, spawnFloat, spawnSparkles]);

  // ── Move to next stage or ending ─────────────────────────────────────────────
  const nextStage = useCallback(() => {
    const next = stageRef.current + 1;
    if (next >= TOTAL_STAGES) {
      // All done!
      phaseRef.current = 'ending';
      setPhase('ending');
      endPhaseRef.current = 0;
      endTimerRef.current = 0;
      saveScore('hospital', '의사선생님', scoreRef.current);
      const ac = audio();
      if (ac) playCelebration(ac);
    } else {
      stageRef.current = next;
      treatPhaseRef.current = 'entering';
      patEnterRef.current = 0;
      sparklesRef.current = [];
      floatsRef.current = [];
      resetPatState();
      celebTimerRef.current = 0;
      hintRef.current = '새 환자가 옵니다!';
      hintTimerRef.current = 90;
      const ac = audio();
      if (ac) playDoorbell(ac);
    }
  }, [audio, resetPatState]);

  // ── Handle a tool drop on the patient ────────────────────────────────────────
  const handleDrop = useCallback((toolId: ToolId, dropX: number, dropY: number) => {
    const W = canvasRef.current?.width  ?? 400;
    const H = canvasRef.current?.height ?? 700;
    const tph = treatPhaseRef.current;
    const s   = stageRef.current;
    const stage = STAGES[s];
    const ps  = patStateRef.current;

    // Patient position
    const trayH  = Math.min(120, H * 0.17);
    const hudH   = Math.min(64, H * 0.09);
    const playH  = H - trayH - hudH;
    const patX   = W * 0.32;
    const patY   = hudH + playH * 0.50;
    const patR   = Math.min(72, W * 0.17);

    const ac = audio();

    // ── Stethoscope phase: tap stethoscope then tap patient body ──────────────
    if (tph === 'stethoscope') {
      if (toolId !== 'stethoscope') {
        if (ac) playWrong(ac);
        showHint('먼저 🩺 청진기를 사용해요!');
        shakeRef.current = 12;
        firstTryRef.current = false;
        return;
      }
      // Check drop on patient
      const d = dist(dropX, dropY, patX, patY);
      if (d > patR * 1.3) {
        if (ac) playWrong(ac);
        showHint('환자한테 청진기를 대봐요!');
        return;
      }
      // Success
      if (ac) playSuccess(ac);
      const pts = firstTryRef.current ? 150 : 75;
      scoreRef.current += pts;
      setScoreDisplay(scoreRef.current);
      spawnFloat(`+${pts}`, patX, patY - patR - 30, '#10B981', 28);
      spawnFloat('진찰 완료! 🩺', patX, patY - patR - 60, '#0F766E', 22);
      spawnSparkles(patX, patY - patR * 0.5, 10);
      ps.stethoscopeDone = true;
      // Move to treatment phase
      // Stage 1 has no "zone" for tool — goes straight to medicine
      if (stage.zones.length === 0 || s === 0) {
        advanceTreatPhase('medicine');
        showHint('💊 약을 환자에게 드려요!');
      } else {
        advanceTreatPhase('treatment');
        showHint('아픈 곳에 올바른 도구를 드래그해요!');
      }
      return;
    }

    // ── Medicine phase: drag pill to patient ──────────────────────────────────
    if (tph === 'medicine') {
      if (toolId !== 'pill') {
        if (ac) playWrong(ac);
        showHint('💊 약을 환자에게 드려요!');
        shakeRef.current = 12;
        firstTryRef.current = false;
        return;
      }
      const d = dist(dropX, dropY, patX, patY);
      if (d > patR * 1.4) {
        showHint('환자 위로 약을 드래그해요!');
        return;
      }
      if (ac) playGulp(ac);
      const pts = firstTryRef.current ? 150 : 75;
      scoreRef.current += pts;
      setScoreDisplay(scoreRef.current);
      spawnFloat(`+${pts}`, patX, patY - patR - 30, '#F59E0B', 28);
      spawnFloat('꿀꺽~ 💊', patX, patY - patR - 60, '#10B981', 22);
      spawnSparkles(patX, patY, 12);
      triggerCelebrate();
      return;
    }

    // ── Treatment phase ────────────────────────────────────────────────────────
    if (tph === 'treatment') {
      // Find which zone was hit
      let hitZone: ZoneDef | null = null;
      for (const zone of stage.zones) {
        if (ps.zonesDone.has(zone.key)) continue; // already done
        const zx = patX + Math.cos(zone.angle) * patR * zone.dist;
        const zy = patY + Math.sin(zone.angle) * patR * zone.dist;
        const zr = patR * zone.zoneR;
        if (dist(dropX, dropY, zx, zy) <= zr * 1.5) {
          hitZone = zone;
          break;
        }
      }

      if (!hitZone) {
        // Check if dropped on general patient area (guide user)
        const d = dist(dropX, dropY, patX, patY);
        if (d <= patR * 1.3) {
          if (ac) playWrong(ac);
          showHint('아픈 부위를 찾아봐요! 반짝이는 곳이에요!');
          firstTryRef.current = false;
        }
        return;
      }

      // Validate tool for zone
      const required = hitZone.requiredTool;

      // Stage 4: wrong tool (bandage instead of cast)
      if (s === 3 && toolId === 'bandage' && required === 'cast') {
        if (ac) playWrong(ac);
        showHint('깁스가 필요해요! 🦴 깁스를 사용하세요!');
        shakeRef.current = 14;
        firstTryRef.current = false;
        spawnFloat('깁스가 필요해요!', patX, patY - patR - 40, '#EF4444', 22);
        return;
      }

      // Stage 5 order check: plaster before disinfect
      if (s === 4 && toolId === 'plaster' && !ps.disinfectDone) {
        if (ac) playWrong(ac);
        showHint('먼저 소독해야 해요! 🧴 소독약을 먼저 사용하세요!');
        shakeRef.current = 14;
        firstTryRef.current = false;
        spawnFloat('먼저 소독해야 해요!', patX, patY - patR - 40, '#EF4444', 22);
        return;
      }

      if (toolId !== required) {
        if (ac) playWrong(ac);
        showHint(`다시 해볼까요? ${TOOLS.find(t => t.id === required)?.emoji ?? ''} 를 써봐요!`);
        shakeRef.current = 12;
        firstTryRef.current = false;
        return;
      }

      // Correct!
      if (ac) {
        if (toolId === 'disinfect') playDisinfect(ac);
        else playSuccess(ac);
      }
      const pts = firstTryRef.current ? 150 : 75;
      scoreRef.current += pts;
      setScoreDisplay(scoreRef.current);
      ps.zonesDone.add(hitZone.key);
      if (s === 4 && toolId === 'disinfect') ps.disinfectDone = true;

      spawnFloat(`+${pts}`, patX, patY - patR - 30, '#10B981', 28);
      if (toolId === 'disinfect') {
        spawnFloat('따끔~', patX + patR * 0.3, patY, '#EF4444', 22);
      } else {
        spawnFloat('잘했어요! ✨', patX, patY - patR - 60, '#F59E0B', 20);
      }
      spawnSparkles(
        patX + Math.cos(hitZone.angle) * patR * hitZone.dist,
        patY + Math.sin(hitZone.angle) * patR * hitZone.dist, 10,
      );
      treatFlashRef.current = 30;
      flashZoneRef.current = hitZone.key;
      firstTryRef.current = false; // reset for next zone
      setTimeout(() => { firstTryRef.current = true; }, 50);

      // Check if all zones done
      const allZonesDone = stage.zones.every(z => ps.zonesDone.has(z.key));
      if (allZonesDone) {
        advanceTreatPhase('medicine');
        showHint('💊 약을 환자에게 드려요!');
      } else {
        // More zones remain
        const remaining = stage.zones.filter(z => !ps.zonesDone.has(z.key));
        const nextZone = remaining[0];
        const tool = TOOLS.find(t => t.id === nextZone.requiredTool);
        showHint(`${tool?.emoji ?? ''} ${nextZone.label}에도 처리해요!`);
      }
    }
  }, [advanceTreatPhase, audio, showHint, spawnFloat, spawnSparkles, triggerCelebrate]);

  // ── Touch / Mouse event helpers ───────────────────────────────────────────────
  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0] ?? (e as React.TouchEvent).changedTouches[0];
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    return { x: (e as React.MouseEvent).clientX - r.left, y: (e as React.MouseEvent).clientY - r.top };
  };

  // Get tool slot position
  const getToolSlot = useCallback((idx: number, W: number, H: number) => {
    const trayH = Math.min(120, H * 0.17);
    const trayY = H - trayH;
    const slotSize = Math.min(66, (W - 20) / TOOL_COUNT - 8);
    const totalW = TOOL_COUNT * slotSize + (TOOL_COUNT - 1) * 8;
    const sx = (W - totalW) / 2 + idx * (slotSize + 8);
    const sy = trayY + (trayH - slotSize) / 2;
    return { x: sx, y: sy, size: slotSize };
  }, []);

  const onPointerDown = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const { x, y } = getPos(e);
    const W = canvasRef.current?.width ?? 400;
    const H = canvasRef.current?.height ?? 700;

    const ph = phaseRef.current;

    // Intro: tap to start
    if (ph === 'intro') {
      startGame();
      return;
    }

    // Ending: buttons
    if (ph === 'ending') {
      const btnW = Math.min(220, W * 0.56);
      const btnH = 54;
      const cx = W / 2;
      const by1 = H * 0.82;
      const by2 = H * 0.82 + btnH + 16;
      if (x >= cx - btnW / 2 && x <= cx + btnW / 2 && y >= by1 && y <= by1 + btnH) {
        startGame(); return;
      }
      if (x >= cx - btnW / 2 && x <= cx + btnW / 2 && y >= by2 && y <= by2 + btnH) {
        window.location.href = '/';
      }
      return;
    }

    if (ph !== 'playing') return;

    const tph = treatPhaseRef.current;

    // Talking phase: tap anywhere to progress to stethoscope
    if (tph === 'talking') {
      advanceTreatPhase('stethoscope');
      showHint('🩺 청진기를 환자에게 드래그해요!');
      return;
    }

    if (tph === 'entering' || tph === 'celebrating') return;

    // Check tool tray hit
    for (let i = 0; i < TOOL_COUNT; i++) {
      const { x: sx, y: sy, size } = getToolSlot(i, W, H);
      if (x >= sx && x <= sx + size && y >= sy && y <= sy + size) {
        dragRef.current = { toolId: TOOLS[i].id, x, y, startX: sx + size / 2, startY: sy + size / 2 };
        return;
      }
    }
  }, [advanceTreatPhase, getToolSlot, showHint, startGame]);

  const onPointerMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    dragRef.current = { ...dragRef.current, x, y };
  }, []);

  const onPointerUp = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!dragRef.current) return;
    const { x, y, toolId } = dragRef.current;
    dragRef.current = null;
    if (phaseRef.current !== 'playing') return;
    const tph = treatPhaseRef.current;
    if (tph === 'stethoscope' || tph === 'treatment' || tph === 'medicine') {
      handleDrop(toolId, x, y);
    }
  }, [handleDrop]);

  // ── Main draw loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      frameRef.current++;
      const f = frameRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);
      pulseRef.current = (Math.sin(f * 0.08) + 1) / 2; // 0–1 pulse

      const ph = phaseRef.current;

      drawBackground(ctx, W, H);

      if (ph === 'intro')   drawIntro(ctx, W, H, f);
      if (ph === 'playing') drawPlaying(ctx, W, H, f);
      if (ph === 'ending')  drawEnding(ctx, W, H, f);

      // Particles
      sparklesRef.current = sparklesRef.current.filter(s => s.alpha > 0.01);
      for (const s of sparklesRef.current) {
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        s.x += s.vx; s.y += s.vy; s.vy += 0.13; s.alpha -= 1 / s.life;
      }

      // Floating texts
      floatsRef.current = floatsRef.current.filter(f => f.alpha > 0.02);
      for (const ft of floatsRef.current) {
        ctx.save();
        ctx.globalAlpha = ft.alpha;
        ctx.font = `bold ${ft.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
        ft.y += ft.vy;
        ft.alpha -= 0.016;
      }

      // Shake decay
      if (shakeRef.current > 0) shakeRef.current--;

      // Hint timer
      if (hintTimerRef.current > 0) hintTimerRef.current--;

      // Dragged tool
      const drag = dragRef.current;
      if (drag) {
        const tool = TOOLS.find(t => t.id === drag.toolId)!;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 12;
        emoji(ctx, tool.emoji, drag.x, drag.y - 10, 52);
        ctx.restore();
      }
    };

    // ── Background ─────────────────────────────────────────────────────────────
    function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number) {
      // Mint gradient
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, COLOR_BG);
      g.addColorStop(1, '#D4F5E9');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // Floor stripe
      ctx.fillStyle = '#C8F0E0';
      ctx.fillRect(0, H * 0.74, W, H * 0.26);

      // Wall line
      ctx.strokeStyle = '#A8E6CE';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.74);
      ctx.lineTo(W, H * 0.74);
      ctx.stroke();

      // Hospital cross decoration top-right
      const cx2 = W * 0.88, cy2 = H * 0.07;
      const cs = Math.min(32, W * 0.08);
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#FF6B9D';
      ctx.fillRect(cx2 - cs * 0.12, cy2 - cs * 0.4, cs * 0.24, cs * 0.8);
      ctx.fillRect(cx2 - cs * 0.4, cy2 - cs * 0.12, cs * 0.8, cs * 0.24);
      ctx.restore();

      // Window top-left
      const wx = W * 0.05, wy = H * 0.1, ww = W * 0.16, wh = H * 0.12;
      ctx.save();
      ctx.globalAlpha = 0.6;
      roundRect(ctx, wx, wy, ww, wh, 8);
      ctx.fillStyle = '#B3EEF8';
      ctx.fill();
      ctx.strokeStyle = '#7CDDE8';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = '#7CDDE8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── Intro screen ───────────────────────────────────────────────────────────
    function drawIntro(ctx: CanvasRenderingContext2D, W: number, H: number, f: number) {
      const cx = W / 2;
      ctx.textAlign = 'center';

      // Title card
      const cardW = Math.min(360, W - 32);
      const cardH = Math.min(480, H * 0.72);
      const cardX = (W - cardW) / 2;
      const cardY = (H - cardH) / 2 - H * 0.03;
      ctx.save();
      ctx.shadowColor = 'rgba(255,107,157,0.25)';
      ctx.shadowBlur = 24;
      roundRect(ctx, cardX, cardY, cardW, cardH, 28);
      ctx.fillStyle = COLOR_SPEECH_BG;
      ctx.fill();
      ctx.restore();
      roundRect(ctx, cardX, cardY, cardW, cardH, 28);
      ctx.strokeStyle = '#FFB3D1';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Doctor emoji bouncing
      const bounce = Math.sin(f * 0.06) * 6;
      emoji(ctx, '👩‍⚕️', cx, cardY + cardH * 0.18 + bounce, Math.min(72, cardW * 0.2));

      ctx.fillStyle = '#D63384';
      ctx.font = `bold ${Math.min(26, cardW * 0.07)}px sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText('병원놀이', cx, cardY + cardH * 0.36);

      ctx.fillStyle = '#0F766E';
      ctx.font = `bold ${Math.min(18, cardW * 0.048)}px sans-serif`;
      ctx.fillText('누가 수술사', cx, cardY + cardH * 0.46);

      ctx.fillStyle = '#555';
      ctx.font = `${Math.min(14, cardW * 0.037)}px sans-serif`;
      ctx.fillText('5명의 귀여운 환자들을 치료해요!', cx, cardY + cardH * 0.56);

      // Patient emoji parade
      const patients = STAGES.map(st => st.patientEmoji);
      patients.forEach((pe, i) => {
        const px2 = cx - (patients.length - 1) * 28 + i * 56;
        const py2 = cardY + cardH * 0.68 + Math.sin(f * 0.07 + i) * 5;
        emoji(ctx, pe, px2, py2, 36);
      });

      // Start button
      const bw = Math.min(200, cardW * 0.6);
      const bh = 54;
      const bx = cx - bw / 2;
      const by = cardY + cardH * 0.82;
      const pulse2 = (Math.sin(f * 0.07) + 1) / 2;
      ctx.save();
      ctx.shadowColor = '#FF6B9D';
      ctx.shadowBlur = 8 + pulse2 * 10;
      roundRect(ctx, bx, by, bw, bh, 16);
      ctx.fillStyle = '#FF6B9D';
      ctx.fill();
      ctx.restore();
      ctx.font = `bold ${Math.min(20, bw * 0.11)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText('시작하기 🏥', cx, by + bh / 2);
    }

    // ── Playing screen ─────────────────────────────────────────────────────────
    function drawPlaying(ctx: CanvasRenderingContext2D, W: number, H: number, f: number) {
      const s     = stageRef.current;
      const stage = STAGES[s];
      const tph   = treatPhaseRef.current;
      const ps    = patStateRef.current;

      const trayH  = Math.min(120, H * 0.17);
      const hudH   = Math.min(64, H * 0.09);
      const playH  = H - trayH - hudH;
      const patX   = W * 0.32;
      const patY   = hudH + playH * 0.50;
      const patR   = Math.min(72, W * 0.17);
      const docX   = W * 0.78;
      const docY   = hudH + playH * 0.45;
      const docR   = Math.min(50, W * 0.12);

      // ── HUD ────────────────────────────────────────────────────────────────
      drawHUD(ctx, W, H, hudH, s, scoreRef.current, stickersRef.current);

      // ── Advancing enter animation ─────────────────────────────────────────
      if (tph === 'entering') {
        patEnterRef.current = Math.min(1, patEnterRef.current + 0.04);
        if (patEnterRef.current >= 1) {
          treatPhaseRef.current = 'talking';
          showHint('환자 말풍선을 탭하세요!');
        }
      }

      // ── Celebrate timer ───────────────────────────────────────────────────
      if (tph === 'celebrating') {
        celebTimerRef.current--;
        if (celebTimerRef.current <= 0) {
          nextStage();
          return;
        }
      }

      const enterT = patEnterRef.current;
      const offX   = (1 - enterT) * (-W * 0.9); // slides from left

      // ── Patient area background ────────────────────────────────────────────
      const areaX = W * 0.04;
      const areaY = hudH + playH * 0.08;
      const areaW = W * 0.58;
      const areaH = playH * 0.78;
      ctx.save();
      ctx.globalAlpha = 0.55;
      roundRect(ctx, areaX, areaY, areaW, areaH, 20);
      ctx.fillStyle = COLOR_PINK_BG;
      ctx.fill();
      ctx.restore();

      // ── Doctor ─────────────────────────────────────────────────────────────
      drawDoctor(ctx, docX, docY + Math.sin(f * 0.05) * 4, docR, tph);

      // ── Patient (with enter slide) ─────────────────────────────────────────
      const shk = shakeRef.current > 0 ? Math.sin(f * 1.5) * (shakeRef.current / 14) * 10 : 0;
      drawPatient(ctx, s, stage, patX + offX + shk, patY, patR, tph, ps, f);

      // ── Speech bubble ──────────────────────────────────────────────────────
      if (tph !== 'entering') {
        const bubText = tph === 'celebrating'
          ? stage.completeLine
          : (tph === 'talking' ? stage.entryLine : stage.symptom);
        const bubColor = tph === 'celebrating' ? '#D1FAE5' : '#FFFBEB';
        const bubBorder = tph === 'celebrating' ? '#10B981' : '#FCD34D';
        const textCol = tph === 'celebrating' ? '#065F46' : '#92400E';
        drawSpeechBubble(ctx, patX + offX, patY - patR - 10, bubText, W, bubColor, bubBorder, textCol);
      }

      // ── Instructions / hint ────────────────────────────────────────────────
      if (tph !== 'celebrating' && tph !== 'entering' && hintTimerRef.current > 0) {
        drawInstructionBox(ctx, W, H, hudH, playH, hintRef.current);
      }

      // ── Tool tray ──────────────────────────────────────────────────────────
      drawToolTray(ctx, W, H, trayH, tph, s, stage, ps, f);

      // ── Treat flash on zone ────────────────────────────────────────────────
      if (treatFlashRef.current > 0) {
        treatFlashRef.current--;
        const fk = flashZoneRef.current;
        const zone = stage.zones.find(z => z.key === fk);
        if (zone) {
          const zx = patX + offX + Math.cos(zone.angle) * patR * zone.dist;
          const zy = patY + Math.sin(zone.angle) * patR * zone.dist;
          ctx.save();
          ctx.globalAlpha = (treatFlashRef.current / 30) * 0.7;
          ctx.beginPath();
          ctx.arc(zx, zy, patR * zone.zoneR, 0, Math.PI * 2);
          ctx.fillStyle = COLOR_GLOW_OK;
          ctx.fill();
          ctx.restore();
          const tool = TOOLS.find(t => t.id === zone.requiredTool);
          if (tool) emoji(ctx, tool.emoji, zx, zy, patR * 0.45);
        }
      }
    }

    function drawHUD(ctx: CanvasRenderingContext2D, W: number, H: number, hudH: number, stage: number, score2: number, stickers: number) {
      // HUD background
      roundRect(ctx, 0, 0, W, hudH, 0);
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = 0.88;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#FFD6E7';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, hudH - 2, W, 2);

      // Stage indicator
      ctx.font = `bold ${Math.min(13, W * 0.032)}px sans-serif`;
      ctx.fillStyle = '#D63384';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Stage ${stage + 1} / ${TOTAL_STAGES}`, 12, hudH / 2);

      // Stickers
      const stickerStr = '⭐'.repeat(stickers) + '○'.repeat(TOTAL_STAGES - stickers);
      ctx.font = `${Math.min(18, W * 0.043)}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText(stickerStr, W / 2, hudH / 2);

      // Score
      ctx.font = `bold ${Math.min(14, W * 0.034)}px sans-serif`;
      ctx.fillStyle = '#F59E0B';
      ctx.textAlign = 'right';
      ctx.fillText(`${score2}점`, W - 12, hudH / 2);

      void H;
    }

    function drawDoctor(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tph: TreatPhase) {
      // White coat circle
      ctx.save();
      ctx.shadowColor = '#FFB3D155';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#FFF0F8';
      ctx.fill();
      ctx.strokeStyle = '#FFB3D1';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      // Bounce when celebrating
      const bobY = tph === 'celebrating' ? Math.sin(frameRef.current * 0.15) * 5 : 0;
      emoji(ctx, '👩‍⚕️', x, y + bobY, r * 1.15);

      // Label
      ctx.font = `bold ${Math.min(11, r * 0.25)}px sans-serif`;
      ctx.fillStyle = '#D63384';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('의사 선생님', x, y + r + 14);
    }

    function drawPatient(
      ctx: CanvasRenderingContext2D,
      si: number, stage: Stage,
      px: number, py: number, pr: number,
      tph: TreatPhase, ps: PatientState, f: number,
    ) {
      const isHappy = tph === 'celebrating';
      const pulse = pulseRef.current;

      // Body glow
      ctx.save();
      ctx.shadowColor = isHappy ? COLOR_GLOW_OK : '#AEE8FF';
      ctx.shadowBlur = isHappy ? 24 : 14;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = isHappy ? '#D1FAE5' : getPatientBodyColor(si);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.strokeStyle = isHappy ? '#10B981' : '#B0D8F5';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw patient body features
      drawPatientFeatures(ctx, si, px, py, pr, tph, ps, f);

      // Patient emoji center
      const faceEmoji = isHappy ? '😊' : getPatientFace(si);
      emoji(ctx, faceEmoji, px, py, pr * 0.85);

      // Hurt zones (glowing, pulsing) — only if not done
      for (const zone of stage.zones) {
        if (ps.zonesDone.has(zone.key)) continue;
        if (tph !== 'treatment' && tph !== 'talking' && tph !== 'stethoscope') continue;

        const zx = px + Math.cos(zone.angle) * pr * zone.dist;
        const zy = py + Math.sin(zone.angle) * pr * zone.dist;
        const zr = pr * zone.zoneR;

        // Pulsing red glow
        ctx.save();
        ctx.globalAlpha = 0.3 + pulse * 0.5;
        ctx.beginPath();
        ctx.arc(zx, zy, zr * (1 + pulse * 0.25), 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(zx, zy, 0, zx, zy, zr * 1.2);
        // Stage 5 (bleeding knee) gets red
        const hurtColor = si === 4 ? '#FF0000' : COLOR_GLOW_HURT;
        grad.addColorStop(0, hurtColor + 'CC');
        grad.addColorStop(1, hurtColor + '00');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        // Hurt emoji
        emoji(ctx, si === 4 ? '🩸' : '💢', zx, zy, zr * 0.9);
      }

      // Healed zones: show tool emoji
      for (const zone of stage.zones) {
        if (!ps.zonesDone.has(zone.key)) continue;
        const zx = px + Math.cos(zone.angle) * pr * zone.dist;
        const zy = py + Math.sin(zone.angle) * pr * zone.dist;
        const tool = TOOLS.find(t => t.id === zone.requiredTool);
        if (tool) emoji(ctx, tool.emoji, zx, zy, pr * 0.35);
      }

      void f;
    }

    function getPatientBodyColor(si: number) {
      const colors = ['#F5DEB3', '#F8F0FF', '#E8E8E8', '#C8C8C8', '#FFDAB9'];
      return colors[si] ?? '#F0F0F0';
    }

    function getPatientFace(si: number) {
      const faces = ['🐻', '🐰', '🐱', '🐘', '🧒'];
      return faces[si] ?? '🐾';
    }

    function drawPatientFeatures(
      ctx: CanvasRenderingContext2D, si: number,
      px: number, py: number, pr: number,
      tph: TreatPhase, ps: PatientState, f: number,
    ) {
      void tph; void ps; void f;
      // Extra decorative features per patient

      if (si === 1) {
        // Rabbit: tall ears
        const earW = pr * 0.22;
        const earH = pr * 0.72;
        // Left ear
        ctx.save();
        ctx.fillStyle = '#F8F0FF';
        roundRect(ctx, px - pr * 0.55 - earW / 2, py - pr - earH * 0.5, earW, earH, earW / 2);
        ctx.fill();
        ctx.strokeStyle = '#DDD0EE';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Inner left ear
        ctx.fillStyle = '#FFB3CC';
        roundRect(ctx, px - pr * 0.55 - earW * 0.3, py - pr - earH * 0.45, earW * 0.6, earH * 0.7, earW * 0.3);
        ctx.fill();
        // Right ear
        ctx.fillStyle = '#F8F0FF';
        roundRect(ctx, px + pr * 0.55 - earW / 2, py - pr - earH * 0.5, earW, earH, earW / 2);
        ctx.fill();
        ctx.strokeStyle = '#DDD0EE';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#FFB3CC';
        roundRect(ctx, px + pr * 0.55 - earW * 0.3, py - pr - earH * 0.45, earW * 0.6, earH * 0.7, earW * 0.3);
        ctx.fill();
        ctx.restore();
      }

      if (si === 2) {
        // Cat: triangle ears, tail
        // Left ear
        ctx.save();
        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.moveTo(px - pr * 0.55, py - pr * 0.7);
        ctx.lineTo(px - pr * 0.25, py - pr * 1.05);
        ctx.lineTo(px - pr * 0.05, py - pr * 0.7);
        ctx.closePath();
        ctx.fill();
        // Right ear
        ctx.beginPath();
        ctx.moveTo(px + pr * 0.05, py - pr * 0.7);
        ctx.lineTo(px + pr * 0.25, py - pr * 1.05);
        ctx.lineTo(px + pr * 0.55, py - pr * 0.7);
        ctx.closePath();
        ctx.fill();
        // Tail (curved, right side)
        ctx.beginPath();
        ctx.strokeStyle = '#999';
        ctx.lineWidth = pr * 0.12;
        ctx.lineCap = 'round';
        ctx.moveTo(px + pr * 0.8, py + pr * 0.2);
        ctx.quadraticCurveTo(px + pr * 1.4, py + pr * 0.6, px + pr * 0.9, py + pr * 0.95);
        ctx.stroke();
        ctx.restore();
      }

      if (si === 3) {
        // Elephant: big ears, trunk
        ctx.save();
        // Left ear (big oval)
        ctx.beginPath();
        ctx.ellipse(px - pr * 0.95, py, pr * 0.38, pr * 0.55, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#BBBBBB';
        ctx.fill();
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Right ear
        ctx.beginPath();
        ctx.ellipse(px + pr * 0.95, py, pr * 0.38, pr * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Trunk (curves down-right)
        ctx.beginPath();
        ctx.strokeStyle = '#AAAAAA';
        ctx.lineWidth = pr * 0.18;
        ctx.lineCap = 'round';
        ctx.moveTo(px + pr * 0.1, py + pr * 0.3);
        ctx.quadraticCurveTo(px + pr * 0.55, py + pr * 0.7, px + pr * 0.4, py + pr * 1.05);
        ctx.stroke();
        ctx.restore();
      }

      if (si === 0) {
        // Bear: small round ears
        ctx.save();
        ctx.fillStyle = '#C8936C';
        ctx.beginPath();
        ctx.arc(px - pr * 0.65, py - pr * 0.78, pr * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px + pr * 0.65, py - pr * 0.78, pr * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (si === 4) {
        // Child: simple body stub + visible knees
        ctx.save();
        // Body stub below
        ctx.fillStyle = '#FFDAB9';
        roundRect(ctx, px - pr * 0.3, py + pr * 0.7, pr * 0.6, pr * 0.4, 8);
        ctx.fill();
        ctx.restore();
      }
    }

    function drawSpeechBubble(
      ctx: CanvasRenderingContext2D,
      cx: number, bottomY: number, text: string,
      W: number, bg: string, border: string, textColor: string,
    ) {
      const pad = 14;
      const fontSize = Math.min(14, W * 0.034);
      ctx.font = `bold ${fontSize}px sans-serif`;

      // Word-wrap simple: truncate if too wide
      const maxW = Math.min(W * 0.65, 300);
      let displayText = text;
      if (ctx.measureText(text).width > maxW - pad * 2) {
        // Show first line up to max
        while (ctx.measureText(displayText + '…').width > maxW - pad * 2 && displayText.length > 10) {
          displayText = displayText.slice(0, -1);
        }
        displayText += '…';
      }

      const tw = Math.min(ctx.measureText(displayText).width, maxW - pad * 2);
      const bw = tw + pad * 2;
      const bh = fontSize + pad * 2;
      const bx = Math.max(8, Math.min(W - bw - 8, cx - bw / 2));
      const by = bottomY - bh;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.12)';
      ctx.shadowBlur = 8;
      roundRect(ctx, bx, by, bw, bh, 14);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Tail
      const tailX = Math.max(bx + 18, Math.min(bx + bw - 18, cx));
      ctx.beginPath();
      ctx.moveTo(tailX - 8, by + bh);
      ctx.lineTo(tailX, by + bh + 10);
      ctx.lineTo(tailX + 8, by + bh);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayText, bx + bw / 2, by + bh / 2);
    }

    function drawInstructionBox(
      ctx: CanvasRenderingContext2D, W: number, H: number, hudH: number, playH: number, text: string,
    ) {
      const bh = Math.min(46, H * 0.065);
      const bw = W - 24;
      const bx = 12;
      const by = hudH + playH * 0.85;
      roundRect(ctx, bx, by, bw, bh, 12);
      ctx.fillStyle = '#FFF7ED';
      ctx.fill();
      ctx.strokeStyle = '#FDBA74';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = `bold ${Math.min(14, W * 0.034)}px sans-serif`;
      ctx.fillStyle = '#92400E';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, W / 2, by + bh / 2);
    }

    function drawToolTray(
      ctx: CanvasRenderingContext2D, W: number, H: number, trayH: number,
      tph: TreatPhase, si: number, stage: Stage, ps: PatientState, f: number,
    ) {
      const trayY = H - trayH;
      roundRect(ctx, 4, trayY + 4, W - 8, trayH - 8, 18);
      ctx.fillStyle = COLOR_TRAY;
      ctx.fill();
      ctx.strokeStyle = '#FFD6A5';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Label
      ctx.font = `bold ${Math.min(11, W * 0.027)}px sans-serif`;
      ctx.fillStyle = '#92400E';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('🧰 도구함', W / 2, trayY + 10);

      const slotSize = Math.min(66, (W - 20) / TOOL_COUNT - 8);
      const totalTW = TOOL_COUNT * slotSize + (TOOL_COUNT - 1) * 8;
      const startTX = (W - totalTW) / 2;
      const slotY = trayY + trayH - slotSize - 10;

      // Determine which tools are "active" (relevant for current phase)
      const activeTool = getActiveTools(tph, si, stage, ps);

      TOOLS.forEach((tool, i) => {
        const { x: sx, y: sy } = { x: startTX + i * (slotSize + 8), y: slotY };
        const isActive = activeTool.has(tool.id);
        const isDragging = dragRef.current?.toolId === tool.id;
        const shk = shakeRef.current > 0 && dragRef.current === null ? Math.sin(f * 1.5) * 3 : 0;

        ctx.save();
        ctx.globalAlpha = isDragging ? 0.4 : (isActive ? 1 : 0.45);
        ctx.shadowColor = isActive ? '#FFB3D1' : 'transparent';
        ctx.shadowBlur = isActive ? 10 + (Math.sin(f * 0.12) + 1) * 5 : 0;
        roundRect(ctx, sx + shk, sy, slotSize, slotSize, 14);
        ctx.fillStyle = isActive ? '#FFF0F8' : '#F5F5F5';
        ctx.fill();
        ctx.strokeStyle = isActive ? '#FF6B9D' : '#E0E0E0';
        ctx.lineWidth = isActive ? 2.5 : 1.5;
        ctx.stroke();
        ctx.restore();

        if (!isDragging) {
          emoji(ctx, tool.emoji, sx + shk + slotSize / 2, sy + slotSize * 0.46, slotSize * 0.48);
        }

        ctx.font = `${Math.min(10, slotSize * 0.16)}px sans-serif`;
        ctx.fillStyle = isActive ? '#D63384' : '#999';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tool.name, sx + shk + slotSize / 2, sy + slotSize * 0.82);
      });
    }

    function getActiveTools(tph: TreatPhase, si: number, stage: Stage, ps: PatientState): Set<ToolId> {
      const active = new Set<ToolId>();
      if (tph === 'stethoscope') { active.add('stethoscope'); return active; }
      if (tph === 'medicine')   { active.add('pill'); return active; }
      if (tph === 'treatment') {
        for (const zone of stage.zones) {
          if (ps.zonesDone.has(zone.key)) continue;
          active.add(zone.requiredTool);
          // Stage 4: only cast allowed (not bandage)
          if (si === 3) { active.delete('bandage'); }
          // Stage 5: if disinfect not done, only disinfect; else only plaster
          if (si === 4) {
            if (!ps.disinfectDone) { active.clear(); active.add('disinfect'); }
            else { active.clear(); active.add('plaster'); }
          }
          break; // only show next needed tool
        }
      }
      return active;
    }

    // ── Ending screen ──────────────────────────────────────────────────────────
    function drawEnding(ctx: CanvasRenderingContext2D, W: number, H: number, f: number) {
      endTimerRef.current++;
      const t = endTimerRef.current;
      const cx = W / 2;

      // Panel
      const panW = Math.min(380, W - 24);
      const panH = Math.min(500, H * 0.78);
      const panX = (W - panW) / 2;
      const panY = (H - panH) / 2 - 20;

      ctx.save();
      ctx.shadowColor = 'rgba(255,107,157,0.3)';
      ctx.shadowBlur = 28;
      roundRect(ctx, panX, panY, panW, panH, 28);
      ctx.fillStyle = '#FFFDF0';
      ctx.fill();
      ctx.restore();
      roundRect(ctx, panX, panY, panW, panH, 28);
      ctx.strokeStyle = '#FFB3D1';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Confetti
      for (let i = 0; i < 8; i++) {
        const a = f * 0.025 + i;
        const rx = panX + 20 + (panW - 40) * (i / 7);
        const ry = panY + 16 + Math.sin(a) * 8;
        emoji(ctx, ['🎉', '⭐', '🎊', '💊', '🩺', '❤️', '🌟', '🏆'][i], rx, ry, 20);
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Title
      ctx.font = `bold ${Math.min(26, panW * 0.07)}px sans-serif`;
      ctx.fillStyle = '#D63384';
      ctx.fillText('오늘도 모두 낫게 해줬어요! 🏥', cx, panY + 60);

      // Patient parade
      const yp = panY + 115;
      STAGES.forEach((st, i) => {
        const px2 = panX + 30 + (panW - 60) * (i / (STAGES.length - 1));
        const bob = Math.sin(f * 0.08 + i * 0.8) * 5;
        emoji(ctx, st.patientEmoji, px2, yp + bob, 32);
        emoji(ctx, '👋', px2, yp + bob + 28, 18);
      });

      // Message
      ctx.font = `${Math.min(15, panW * 0.04)}px sans-serif`;
      ctx.fillStyle = '#555';
      ctx.fillText(`오늘 ${TOTAL_STAGES}명의 친구들을 모두 낫게 해줬어요!`, cx, panY + 170);

      // Stickers
      const stickerStr2 = '⭐'.repeat(stickersRef.current);
      ctx.font = `${Math.min(28, panW * 0.075)}px serif`;
      ctx.fillText(stickerStr2 + ' 🏆', cx, panY + 215);

      // Score
      ctx.font = `bold ${Math.min(38, panW * 0.1)}px sans-serif`;
      ctx.fillStyle = '#F59E0B';
      ctx.fillText(`${scoreRef.current}점`, cx, panY + 270);

      // Doctor level-up
      const lvlScale = 1 + Math.sin(f * 0.08) * 0.06;
      ctx.save();
      ctx.translate(cx, panY + 330);
      ctx.scale(lvlScale, lvlScale);
      emoji(ctx, '👩‍⚕️', 0, 0, 52);
      ctx.restore();

      // Level-up sparkles
      if (t % 20 === 0 && t < 200) {
        spawnSparkles(cx, panY + 320, 8);
      }

      // Buttons
      const btnW2 = Math.min(200, panW * 0.58);
      const bh2 = 52;
      const bx1 = cx - btnW2 / 2;
      const by1 = panY + panH - bh2 * 2 - 28;
      const by2 = by1 + bh2 + 14;

      ctx.save();
      ctx.shadowColor = '#FF6B9D';
      ctx.shadowBlur = 10;
      roundRect(ctx, bx1, by1, btnW2, bh2, 14);
      ctx.fillStyle = '#FF6B9D';
      ctx.fill();
      ctx.restore();
      ctx.font = `bold ${Math.min(17, btnW2 * 0.1)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText('🔄 다시 시작', cx, by1 + bh2 / 2);

      ctx.save();
      ctx.shadowColor = '#A0C4FF';
      ctx.shadowBlur = 10;
      roundRect(ctx, bx1, by2, btnW2, bh2, 14);
      ctx.fillStyle = '#74B9FF';
      ctx.fill();
      ctx.restore();
      ctx.font = `bold ${Math.min(17, btnW2 * 0.1)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText('🏠 홈으로', cx, by2 + bh2 / 2);

      void t;
    }

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [nextStage, showHint, spawnSparkles]);

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => { cancelAnimationFrame(rafRef.current); };
  }, []);

  // ── Sync phase ref ────────────────────────────────────────────────────────────
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        userSelect: 'none',
        cursor: dragRef.current ? 'grabbing' : 'default',
      }}
      onMouseDown={onPointerDown}
      onTouchStart={onPointerDown}
      onMouseMove={onPointerMove}
      onTouchMove={onPointerMove}
      onMouseUp={onPointerUp}
      onTouchEnd={onPointerUp}
    />
  );
}
