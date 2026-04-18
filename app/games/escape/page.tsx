'use client';

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { saveScore } from '@/lib/ranking';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Character {
  name: string;
  color: string;
  emoji: string;
  heart: string;
  role: string;
  ability: string;
}

interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  interact: boolean;
  run: boolean;
  joystickX: number;
  joystickY: number;
  lookDX: number;
  lookDY: number;
  mouseDragging: boolean;
}

interface GameState {
  screen: 'select' | 'intro' | 'playing' | 'victory';
  stage: number; // 1-4
  character: Character | null;
  inventory: string[];
  hasFlashlight: boolean;
  // Stage 1
  noteFound: boolean;
  keypadCode: string;
  stage1Done: boolean;
  // Stage 2
  partsCollected: string[];
  suhyunRescued: boolean;
  stage2Done: boolean;
  // Stage 3
  colorClueFound: boolean;
  booksPlaced: string[];
  iehyunRescued: boolean;
  stage3Done: boolean;
  // Stage 4
  leversHit: boolean[];
  lightPos: number; // 0-4
  lightTimer: number;
  leverTimer: number; // countdown
  stage4Done: boolean;
  // Meta
  startTime: number;
  caughtCount: number;
  score: number;
  playerPos: THREE.Vector3;
  playerYaw: number;
  // Neighbor
  neighborPos: THREE.Vector3;
  neighborDir: number; // 1 or -1
  neighborAlert: boolean;
  alertTimer: number;
  // Stage 3 neighbor
  neighbor3Pos: THREE.Vector3;
  neighbor3Dir: number;
  // UI
  interactionTarget: string | null;
  keypadInput: string;
  showKeypad: boolean;
  showNote: boolean;
  showColorClue: boolean;
  lastCaughtAt: number;
  dialogText: string;
  dialogVisible: boolean;
  dialogTimer: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHARACTERS: Character[] = [
  { name: '승민', color: '#3B82F6', emoji: '🤖', heart: '💙', role: '리더', ability: '지도 보기' },
  { name: '건우', color: '#10B981', emoji: '🩺', heart: '💚', role: '선봉', ability: '이웃 감지' },
  { name: '강우', color: '#F59E0B', emoji: '👨‍🍳', heart: '🧡', role: '해결사', ability: '힌트 보기' },
];

const STAGE_NAMES = [
  '',
  '1층 거실&주방',
  '2층 실험실',
  '3층 도서관',
  '지하실',
];

const STAGE_MISSIONS = [
  '',
  '손전등을 찾고, 메모를 읽어 도어 코드를 입력하세요!',
  '부품 3개를 수집해 기계를 작동시켜 수현을 구하세요!',
  '색깔 단서를 찾아 책을 올바른 순서로 당기세요!',
  '레버 5개를 타이밍에 맞춰 누르고 탈출하세요!',
];

// Stage spawn positions
const STAGE_SPAWNS: [number, number, number][] = [
  [0, 1.6, 4],
  [0, 1.6, 4],
  [0, 1.6, 4],
  [0, 1.6, 4],
];

// ─── Audio ────────────────────────────────────────────────────────────────────

function createAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    return new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch { return null; }
}

function playFootstep(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08);
  } catch { /* */ }
}

function playPickup(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
  } catch { /* */ }
}

function playAlarm(ctx: AudioContext) {
  try {
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.15);
      osc.start(ctx.currentTime + i * 0.2);
      osc.stop(ctx.currentTime + i * 0.2 + 0.15);
    }
  } catch { /* */ }
}

function playVictory(ctx: AudioContext) {
  try {
    const freqs = [523, 659, 784, 1047];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.3);
    });
  } catch { /* */ }
}

function playDoorCreak(ctx: AudioContext) {
  try {
    const bufLen = ctx.sampleRate * 0.5;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen) * 0.3;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 300;
    src.buffer = buf; src.connect(filter); filter.connect(ctx.destination);
    src.start(ctx.currentTime);
  } catch { /* */ }
}

function playLeverClick(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
  } catch { /* */ }
}

// ─── Box mesh helper ──────────────────────────────────────────────────────────

interface BoxDef {
  pos: [number, number, number];
  size: [number, number, number];
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  type?: string;
}

function RoomBox({ pos, size, color, emissive, emissiveIntensity = 0, opacity = 1 }: BoxDef) {
  return (
    <mesh position={pos} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        emissive={emissive || '#000000'}
        emissiveIntensity={emissiveIntensity}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

// ─── Collision helpers ────────────────────────────────────────────────────────

interface AABB {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

function playerAABB(pos: THREE.Vector3): AABB {
  return { minX: pos.x - 0.3, maxX: pos.x + 0.3, minZ: pos.z - 0.3, maxZ: pos.z + 0.3 };
}

function boxAABB(cx: number, cz: number, hw: number, hd: number): AABB {
  return { minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd };
}

function overlaps(a: AABB, b: AABB): boolean {
  return a.maxX > b.minX && a.minX < b.maxX && a.maxZ > b.minZ && a.minZ < b.maxZ;
}

// ─── Stage room walls ─────────────────────────────────────────────────────────

// Returns solid wall boxes for collision [cx, cz, hw, hd]
function getStageWalls(stage: number): [number, number, number, number][] {
  if (stage === 1) {
    // 10x10 room
    return [
      [-5, 0, 0.3, 5],   // left wall
      [5, 0, 0.3, 5],    // right wall
      [0, -5, 5, 0.3],   // back wall
      [0, 5, 5, 0.3],    // front wall (has door gap at x=-1..1)
      // table area
      [-2, -1, 1.2, 0.8],
      // shelf
      [3, -2, 0.6, 1.2],
      // kitchen counter
      [-3, -3, 1.5, 0.5],
    ];
  }
  if (stage === 2) {
    return [
      [-6, 0, 0.3, 5],
      [6, 0, 0.3, 5],
      [0, -5, 6, 0.3],
      [0, 5, 6, 0.3],
      // lab tables
      [-2, -2, 1.5, 0.5],
      [2, -2, 1.5, 0.5],
      // machine
      [0, 0, 0.8, 0.8],
    ];
  }
  if (stage === 3) {
    return [
      [-7, 0, 0.3, 5],
      [7, 0, 0.3, 5],
      [0, -5, 7, 0.3],
      [0, 5, 7, 0.3],
      // bookshelves corridors
      [-5, -2, 0.4, 2],
      [-5, 2, 0.4, 2],
      [-3, -2, 0.4, 2],
      [-3, 2, 0.4, 2],
      [3, -2, 0.4, 2],
      [3, 2, 0.4, 2],
      [5, -2, 0.4, 2],
      [5, 2, 0.4, 2],
    ];
  }
  if (stage === 4) {
    return [
      [-6, 0, 0.3, 5],
      [6, 0, 0.3, 5],
      [0, -5, 6, 0.3],
      [0, 5, 6, 0.3],
    ];
  }
  return [];
}

// ─── Stage 1 Scene ────────────────────────────────────────────────────────────

function Stage1Scene({ gs }: { gs: React.MutableRefObject<GameState> }) {
  const doorOpen = gs.current.stage1Done;
  const hasFlashlight = gs.current.hasFlashlight;
  return (
    <group>
      {/* Floor */}
      <RoomBox pos={[0, 0, 0]} size={[10, 0.2, 10]} color="#3d2b1a" />
      {/* Ceiling */}
      <RoomBox pos={[0, 3, 0]} size={[10, 0.2, 10]} color="#2a1f14" />
      {/* Walls */}
      <RoomBox pos={[-5, 1.5, 0]} size={[0.2, 3, 10]} color="#4a3520" />
      <RoomBox pos={[5, 1.5, 0]} size={[0.2, 3, 10]} color="#4a3520" />
      <RoomBox pos={[0, 1.5, -5]} size={[10, 3, 0.2]} color="#4a3520" />
      {/* Front wall with door gap */}
      <RoomBox pos={[-3.5, 1.5, 5]} size={[3, 3, 0.2]} color="#4a3520" />
      <RoomBox pos={[3.5, 1.5, 5]} size={[3, 3, 0.2]} color="#4a3520" />
      <RoomBox pos={[0, 2.5, 5]} size={[4, 0.5, 0.2]} color="#4a3520" />

      {/* Door */}
      {!doorOpen && <RoomBox pos={[0, 1.1, 5]} size={[2, 2.2, 0.15]} color="#6b4226" />}
      {/* Keypad on wall */}
      <RoomBox pos={[1.5, 1.3, 4.9]} size={[0.3, 0.4, 0.1]} color="#222" />
      <mesh position={[1.5, 1.3, 4.82]}>
        <boxGeometry args={[0.3, 0.4, 0.05]} />
        <meshStandardMaterial color="#00ff44" emissive="#00ff44" emissiveIntensity={0.5} />
      </mesh>

      {/* Table */}
      <RoomBox pos={[-2, 0.5, -1]} size={[2.4, 0.1, 1.6]} color="#7c5c38" />
      <RoomBox pos={[-3, 0.25, -1.6]} size={[0.1, 0.5, 0.1]} color="#5a3e20" />
      <RoomBox pos={[-1, 0.25, -1.6]} size={[0.1, 0.5, 0.1]} color="#5a3e20" />
      <RoomBox pos={[-3, 0.25, -0.4]} size={[0.1, 0.5, 0.1]} color="#5a3e20" />
      <RoomBox pos={[-1, 0.25, -0.4]} size={[0.1, 0.5, 0.1]} color="#5a3e20" />

      {/* Note on table (glowing if not found) */}
      {!gs.current.noteFound && (
        <RoomBox pos={[-2, 0.56, -1]} size={[0.4, 0.01, 0.5]} color="#f5e6c8"
          emissive="#ffe580" emissiveIntensity={0.6} />
      )}

      {/* Shelf */}
      <RoomBox pos={[3, 1, -2]} size={[1, 0.1, 1.2]} color="#5a3e20" />
      <RoomBox pos={[3, 1.8, -2]} size={[1, 0.1, 1.2]} color="#5a3e20" />
      <RoomBox pos={[3.45, 0.9, -2]} size={[0.1, 2, 1.2]} color="#5a3e20" />

      {/* Flashlight on shelf (glowing) */}
      {!gs.current.hasFlashlight && (
        <RoomBox pos={[2.9, 1.12, -2]} size={[0.15, 0.1, 0.45]} color="#e6c840"
          emissive="#ffe040" emissiveIntensity={1.2} />
      )}
      {gs.current.hasFlashlight && (
        <RoomBox pos={[2.9, 1.12, -2]} size={[0.15, 0.1, 0.45]} color="#554400" />
      )}

      {/* Chair */}
      <RoomBox pos={[-2, 0.5, 0.2]} size={[0.5, 0.05, 0.5]} color="#8b6040" />
      <RoomBox pos={[-2, 0.8, 0.2]} size={[0.5, 0.6, 0.05]} color="#8b6040" />

      {/* Kitchen counter */}
      <RoomBox pos={[-3, 0.5, -3]} size={[2.8, 1, 0.6]} color="#c8a878" />
      <RoomBox pos={[-3, 1, -3]} size={[2.8, 0.05, 0.7]} color="#e0c090" />
      {/* Sink */}
      <RoomBox pos={[-3.5, 0.95, -3]} size={[0.6, 0.05, 0.4]} color="#888" />

      {/* Overhead lamp */}
      <RoomBox pos={[0, 2.9, 0]} size={[0.3, 0.05, 0.3]} color="#ccc" />
      {hasFlashlight && (
        <pointLight position={[0, 2.8, 0]} intensity={0.3} color="#ffddaa" distance={8} />
      )}
    </group>
  );
}

// ─── Stage 2 Scene ────────────────────────────────────────────────────────────

function Stage2Scene({ gs }: { gs: React.MutableRefObject<GameState> }) {
  const parts = ['gear', 'battery', 'bulb'];
  const partsEmoji = ['⚙️', '🔋', '💡'];
  const partsPos: [number, number, number][] = [
    [-4, 1.0, -3],
    [4, 0.8, -1],
    [-1, 1.5, -4],
  ];
  return (
    <group>
      {/* Floor */}
      <RoomBox pos={[0, 0, 0]} size={[12, 0.2, 10]} color="#1e2a1e" />
      <RoomBox pos={[0, 3, 0]} size={[12, 0.2, 10]} color="#1a241a" />
      {/* Walls */}
      <RoomBox pos={[-6, 1.5, 0]} size={[0.2, 3, 10]} color="#2a3a2a" />
      <RoomBox pos={[6, 1.5, 0]} size={[0.2, 3, 10]} color="#2a3a2a" />
      <RoomBox pos={[0, 1.5, -5]} size={[12, 3, 0.2]} color="#2a3a2a" />
      <RoomBox pos={[-4, 1.5, 5]} size={[4, 3, 0.2]} color="#2a3a2a" />
      <RoomBox pos={[4, 1.5, 5]} size={[4, 3, 0.2]} color="#2a3a2a" />
      <RoomBox pos={[0, 2.5, 5]} size={[4, 0.5, 0.2]} color="#2a3a2a" />

      {/* Lab tables */}
      <RoomBox pos={[-3, 0.5, -2]} size={[3, 0.1, 1]} color="#3a4a3a" />
      <RoomBox pos={[3, 0.5, -2]} size={[3, 0.1, 1]} color="#3a4a3a" />
      <RoomBox pos={[-3, 0.5, 2]} size={[3, 0.1, 1]} color="#3a4a3a" />

      {/* Shelves on walls */}
      <RoomBox pos={[-5.8, 1.5, -2]} size={[0.2, 0.1, 2]} color="#4a3a2a" />
      <RoomBox pos={[5.8, 1.5, -2]} size={[0.2, 0.1, 2]} color="#4a3a2a" />

      {/* Central machine */}
      <RoomBox pos={[0, 0.6, 0]} size={[1.6, 1.2, 1.6]} color="#2a4a6a" />
      <RoomBox pos={[0, 1.2, 0]} size={[1.4, 0.1, 1.4]} color="#3a5a7a" />
      {/* Machine glow when all parts placed */}
      {gs.current.partsCollected.length === 3 && (
        <>
          <RoomBox pos={[0, 1.25, 0]} size={[1.4, 0.05, 1.4]} color="#44ff88"
            emissive="#44ff88" emissiveIntensity={2} />
          <pointLight position={[0, 1.5, 0]} intensity={2} color="#44ff88" distance={6} />
        </>
      )}

      {/* Glowing parts */}
      {parts.map((part, i) => {
        if (gs.current.partsCollected.includes(part)) return null;
        return (
          <group key={part} position={partsPos[i]}>
            <mesh>
              <boxGeometry args={[0.25, 0.25, 0.25]} />
              <meshStandardMaterial
                color="#88ffaa"
                emissive="#44ff88"
                emissiveIntensity={1.5}
              />
            </mesh>
            <Html center distanceFactor={4}>
              <div style={{ fontSize: 18, userSelect: 'none', pointerEvents: 'none' }}>{partsEmoji[i]}</div>
            </Html>
          </group>
        );
      })}

      {/* Suhyun (rescued NPC) */}
      {gs.current.suhyunRescued && (
        <group position={[0, 0.1, -3.5]}>
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[0.4, 1.4, 0.3]} />
            <meshStandardMaterial color="#EC4899" />
          </mesh>
          <Html center position={[0, 1.8, 0]} distanceFactor={4}>
            <div style={{ fontSize: 22, userSelect: 'none', pointerEvents: 'none' }}>💃</div>
          </Html>
        </group>
      )}

      {/* Eerie lights */}
      <pointLight position={[0, 2.5, 0]} intensity={0.4} color="#88ffaa" distance={10} />
      <pointLight position={[-5, 1.5, -3]} intensity={0.2} color="#aaffaa" distance={5} />
      <pointLight position={[5, 1.5, -3]} intensity={0.2} color="#aaffaa" distance={5} />
    </group>
  );
}

// ─── Stage 3 Scene ────────────────────────────────────────────────────────────

function Stage3Scene({ gs }: { gs: React.MutableRefObject<GameState> }) {
  const colorOrder = ['red', 'blue', 'green'];
  const bookColors = ['#cc2222', '#2244cc', '#22aa44'];
  const bookPositions: [number, number, number][] = [
    [-5, 1.3, -3],
    [-3, 1.3, -3],
    [3, 1.3, -3],
  ];

  return (
    <group>
      {/* Floor */}
      <RoomBox pos={[0, 0, 0]} size={[14, 0.2, 10]} color="#1a1520" />
      <RoomBox pos={[0, 3, 0]} size={[14, 0.2, 10]} color="#160f1a" />
      {/* Walls */}
      <RoomBox pos={[-7, 1.5, 0]} size={[0.2, 3, 10]} color="#2a2030" />
      <RoomBox pos={[7, 1.5, 0]} size={[0.2, 3, 10]} color="#2a2030" />
      <RoomBox pos={[0, 1.5, -5]} size={[14, 3, 0.2]} color="#2a2030" />
      <RoomBox pos={[-4.5, 1.5, 5]} size={[5, 3, 0.2]} color="#2a2030" />
      <RoomBox pos={[4.5, 1.5, 5]} size={[5, 3, 0.2]} color="#2a2030" />
      <RoomBox pos={[0, 2.5, 5]} size={[4, 0.5, 0.2]} color="#2a2030" />

      {/* Bookshelf columns */}
      {[-5, -3, 3, 5].map((x) => (
        <group key={x}>
          <RoomBox pos={[x, 1.5, -2]} size={[0.4, 3, 2]} color="#3d2b1a" />
          {/* Books on each shelf */}
          {[0.6, 1.2, 1.8, 2.4].map((y) =>
            [-3, -2.5, -2, -1.5, -1].map((z) => (
              <RoomBox key={`${y}${z}`} pos={[x, y, z + -0.5]}
                size={[0.08, 0.35, 0.22]}
                color={`hsl(${(x * 30 + z * 20 + y * 50) % 360}, 60%, 40%)`} />
            ))
          )}
        </group>
      ))}

      {/* Color clue painting */}
      {!gs.current.colorClueFound ? (
        <group position={[6.9, 1.8, -2]}>
          <RoomBox pos={[0, 0, 0]} size={[0.05, 0.8, 1.2]} color="#8b6040" />
          <RoomBox pos={[0.03, 0.15, -0.35]} size={[0.02, 0.35, 0.25]} color="#cc2222"
            emissive="#cc2222" emissiveIntensity={0.8} />
          <RoomBox pos={[0.03, 0.15, 0]} size={[0.02, 0.35, 0.25]} color="#2244cc"
            emissive="#2244cc" emissiveIntensity={0.8} />
          <RoomBox pos={[0.03, 0.15, 0.35]} size={[0.02, 0.35, 0.25]} color="#22aa44"
            emissive="#22aa44" emissiveIntensity={0.8} />
        </group>
      ) : (
        <group position={[6.9, 1.8, -2]}>
          <RoomBox pos={[0, 0, 0]} size={[0.05, 0.8, 1.2]} color="#8b6040" />
          <RoomBox pos={[0.03, 0.15, -0.35]} size={[0.02, 0.35, 0.25]} color="#cc2222" />
          <RoomBox pos={[0.03, 0.15, 0]} size={[0.02, 0.35, 0.25]} color="#2244cc" />
          <RoomBox pos={[0.03, 0.15, 0.35]} size={[0.02, 0.35, 0.25]} color="#22aa44" />
        </group>
      )}

      {/* Colored books (only if clue found) */}
      {gs.current.colorClueFound && colorOrder.map((color, i) => {
        const placed = gs.current.booksPlaced.includes(color);
        return (
          <group key={color} position={bookPositions[i]}>
            <mesh>
              <boxGeometry args={[0.12, 0.4, 0.25]} />
              <meshStandardMaterial
                color={bookColors[i]}
                emissive={placed ? '#000000' : bookColors[i]}
                emissiveIntensity={placed ? 0 : 0.6}
              />
            </mesh>
            {!placed && (
              <Html center distanceFactor={4}>
                <div style={{ fontSize: 14, color: '#fff', fontWeight: 'bold', userSelect: 'none', pointerEvents: 'none' }}>
                  {color === 'red' ? '🔴' : color === 'blue' ? '🔵' : '🟢'}
                </div>
              </Html>
            )}
          </group>
        );
      })}

      {/* Iehyun (rescued NPC) */}
      {gs.current.iehyunRescued && (
        <group position={[0, 0.1, -3.5]}>
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[0.4, 1.4, 0.3]} />
            <meshStandardMaterial color="#FF69B4" />
          </mesh>
          <Html center position={[0, 1.8, 0]} distanceFactor={4}>
            <div style={{ fontSize: 22, userSelect: 'none', pointerEvents: 'none' }}>👸</div>
          </Html>
        </group>
      )}

      <pointLight position={[0, 2.5, 0]} intensity={0.3} color="#cc99ff" distance={12} />
    </group>
  );
}

// ─── Stage 4 Scene ────────────────────────────────────────────────────────────

function Stage4Scene({ gs }: { gs: React.MutableRefObject<GameState> }) {
  const leverX = [-4, -2, 0, 2, 4];
  return (
    <group>
      {/* Floor */}
      <RoomBox pos={[0, 0, 0]} size={[12, 0.2, 10]} color="#0a0808" />
      <RoomBox pos={[0, 3, 0]} size={[12, 0.2, 10]} color="#0a0808" />
      {/* Walls */}
      <RoomBox pos={[-6, 1.5, 0]} size={[0.2, 3, 10]} color="#1a0f0f" />
      <RoomBox pos={[6, 1.5, 0]} size={[0.2, 3, 10]} color="#1a0f0f" />
      <RoomBox pos={[0, 1.5, -5]} size={[12, 3, 0.2]} color="#1a0f0f" />
      {/* Front - escape door */}
      <RoomBox pos={[-4, 1.5, 5]} size={[4, 3, 0.2]} color="#1a0f0f" />
      <RoomBox pos={[4, 1.5, 5]} size={[4, 3, 0.2]} color="#1a0f0f" />
      <RoomBox pos={[0, 2.5, 5]} size={[4, 0.5, 0.2]} color="#1a0f0f" />
      {!gs.current.stage4Done && <RoomBox pos={[0, 1.1, 5]} size={[2, 2.2, 0.15]} color="#550000" />}

      {/* Lever platform */}
      <RoomBox pos={[0, 0.6, -2]} size={[10, 0.2, 1.2]} color="#2a1a1a" />

      {/* Levers */}
      {leverX.map((x, i) => {
        const isHit = gs.current.leversHit[i];
        const isLit = Math.round(gs.current.lightPos) === i;
        return (
          <group key={i} position={[x, 0.75, -2]}>
            {/* Base */}
            <mesh>
              <boxGeometry args={[0.3, 0.1, 0.3]} />
              <meshStandardMaterial color="#333" />
            </mesh>
            {/* Lever arm */}
            <mesh position={[0, 0.3, isHit ? 0.15 : -0.15]} rotation={[isHit ? -0.6 : 0.6, 0, 0]}>
              <boxGeometry args={[0.08, 0.5, 0.08]} />
              <meshStandardMaterial color={isHit ? '#44ff44' : '#cc4444'} />
            </mesh>
            {/* Light indicator */}
            {isLit && (
              <>
                <mesh position={[0, 0.75, 0]}>
                  <boxGeometry args={[0.25, 0.1, 0.25]} />
                  <meshStandardMaterial color="#ffff00" emissive="#ffff00" emissiveIntensity={2} />
                </mesh>
                <pointLight position={[0, 1, 0]} intensity={1.5} color="#ffff00" distance={2} />
              </>
            )}
            {isHit && (
              <pointLight position={[0, 0.8, 0]} intensity={0.8} color="#44ff44" distance={1.5} />
            )}
          </group>
        );
      })}

      {/* Sweep light bar (decorative) */}
      <RoomBox
        pos={[leverX[Math.round(Math.max(0, Math.min(4, gs.current.lightPos)))], 1.6, -2]}
        size={[0.1, 0.05, 1.4]}
        color="#ffff00"
        emissive="#ffff00"
        emissiveIntensity={1}
      />

      {/* Eerie red lighting */}
      <pointLight position={[0, 2.8, 0]} intensity={0.5} color="#ff2200" distance={10} />
      <pointLight position={[-4, 1.5, -3]} intensity={0.3} color="#aa1100" distance={4} />
      <pointLight position={[4, 1.5, -3]} intensity={0.3} color="#aa1100" distance={4} />
    </group>
  );
}

// ─── Neighbor (AI) ────────────────────────────────────────────────────────────

function NeighborMesh({ pos, emoji, stage }: { pos: THREE.Vector3; emoji: string; stage: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.position.y = 0.9 + Math.sin(clock.elapsedTime * 4) * 0.05;
    }
  });
  return (
    <group position={[pos.x, 0, pos.z]}>
      {/* Body */}
      <mesh ref={meshRef} position={[0, 0.9, 0]}>
        <boxGeometry args={[0.5, 1.6, 0.4]} />
        <meshStandardMaterial color={stage === 2 ? '#7a3a1a' : '#4a2a6a'} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.8, 0]}>
        <boxGeometry args={[0.55, 0.55, 0.45]} />
        <meshStandardMaterial color={stage === 2 ? '#9a5a2a' : '#6a3a8a'} />
      </mesh>
      <Html center position={[0, 1.8, 0.25]} distanceFactor={5}>
        <div style={{ fontSize: 24, userSelect: 'none', pointerEvents: 'none', lineHeight: 1 }}>
          {emoji}
        </div>
      </Html>
    </group>
  );
}

// ─── First-Person Controller ──────────────────────────────────────────────────

function FirstPersonController({
  gs,
  inputRef,
  audioRef,
  onCaught,
  onInteract,
}: {
  gs: React.MutableRefObject<GameState>;
  inputRef: React.MutableRefObject<InputState>;
  audioRef: React.MutableRefObject<AudioContext | null>;
  onCaught: () => void;
  onInteract: (target: string) => void;
}) {
  const { camera } = useThree();
  const footstepTimer = useRef(0);
  const prevInteract = useRef(false);
  const raycaster = useRef(new THREE.Raycaster());
  const tempVec = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const g = gs.current;
    if (g.screen !== 'playing') return;
    if (g.showKeypad || g.showNote || g.showColorClue) return;

    const inp = inputRef.current;
    const dt = Math.min(delta, 0.05);

    // Yaw rotation
    const lookSens = 0.003;
    g.playerYaw -= inp.lookDX * lookSens;
    inp.lookDX = 0;
    inp.lookDY = 0;

    camera.rotation.order = 'YXZ';
    camera.rotation.y = g.playerYaw;
    camera.rotation.x = 0;

    // Movement
    const speed = inp.run ? 6 : 3.5;
    let moveX = 0;
    let moveZ = 0;

    if (inp.forward || inp.joystickY < -0.3) { moveX -= Math.sin(g.playerYaw); moveZ -= Math.cos(g.playerYaw); }
    if (inp.backward || inp.joystickY > 0.3) { moveX += Math.sin(g.playerYaw); moveZ += Math.cos(g.playerYaw); }
    if (inp.left || inp.joystickX < -0.3) { moveX -= Math.cos(g.playerYaw); moveZ += Math.sin(g.playerYaw); }
    if (inp.right || inp.joystickX > 0.3) { moveX += Math.cos(g.playerYaw); moveZ -= Math.sin(g.playerYaw); }

    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX = (moveX / len) * speed * dt;
      moveZ = (moveZ / len) * speed * dt;

      // Footstep audio
      footstepTimer.current += dt;
      if (footstepTimer.current > 0.3 && audioRef.current) {
        playFootstep(audioRef.current);
        footstepTimer.current = 0;
      }
    } else {
      footstepTimer.current = 0;
    }

    // Collision-slide movement
    const walls = getStageWalls(g.stage);
    const newPos = g.playerPos.clone();

    // Try X
    const tryX = newPos.clone();
    tryX.x += moveX;
    const pX = playerAABB(tryX);
    let blockedX = false;
    for (const [cx, cz, hw, hd] of walls) {
      if (overlaps(pX, boxAABB(cx, cz, hw, hd))) { blockedX = true; break; }
    }
    if (!blockedX) newPos.x = tryX.x;

    // Try Z
    const tryZ = newPos.clone();
    tryZ.z += moveZ;
    const pZ = playerAABB(tryZ);
    let blockedZ = false;
    for (const [cx, cz, hw, hd] of walls) {
      if (overlaps(pZ, boxAABB(cx, cz, hw, hd))) { blockedZ = true; break; }
    }
    if (!blockedZ) newPos.z = tryZ.z;

    g.playerPos.copy(newPos);
    camera.position.set(newPos.x, 1.6, newPos.z);

    // Alert flash timer
    if (g.alertTimer > 0) {
      g.alertTimer -= dt;
    }

    // Neighbor AI (stages 2 and 3)
    if ((g.stage === 2 && !g.stage2Done) || (g.stage === 3 && !g.stage3Done)) {
      const nPos = g.stage === 2 ? g.neighborPos : g.neighbor3Pos;
      const nDir = g.stage === 2 ? g.neighborDir : g.neighbor3Dir;
      const nSpeed = g.stage === 2 ? 2.5 : 3.5;
      const waypoints = g.stage === 2
        ? [[-4, 0, 0], [4, 0, 0]] as [number, number, number][]
        : [[-5, 0, -3], [5, 0, -3]] as [number, number, number][];

      const target = nDir === 1 ? waypoints[1] : waypoints[0];
      const dx = target[0] - nPos.x;
      const dz = target[2] - nPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 0.3) {
        if (g.stage === 2) g.neighborDir = -g.neighborDir;
        else g.neighbor3Dir = -g.neighbor3Dir;
      } else {
        const nx = (dx / dist) * nSpeed * dt;
        const nz = (dz / dist) * nSpeed * dt;
        nPos.x += nx;
        nPos.z += nz;
      }

      // Detection
      const playerDist = nPos.distanceTo(g.playerPos);
      const baseRadius = inp.run ? 10 : (len === 0 ? 2.5 : 5);

      if (playerDist < baseRadius) {
        // Cone check
        const nFwd = new THREE.Vector3(dx / Math.max(dist, 0.01), 0, dz / Math.max(dist, 0.01));
        const toPlayer = new THREE.Vector3(
          g.playerPos.x - nPos.x, 0, g.playerPos.z - nPos.z
        ).normalize();
        const dot = nFwd.dot(toPlayer);

        if (dot > Math.cos(Math.PI * 0.67) && // 120 degree cone
          Date.now() - g.lastCaughtAt > 2000) {
          onCaught();
        }
      }
    }

    // Stage 4 lever sweep
    if (g.stage === 4 && !g.stage4Done) {
      g.leverTimer -= dt;
      if (g.leverTimer <= 0) {
        // Fail
        g.leversHit = [false, false, false, false, false];
        g.leverTimer = 60;
      }

      const sweepSpeed = 1.2; // cycles per second
      const t = Date.now() * 0.001 * sweepSpeed;
      g.lightPos = (t % 5);
    }

    // Interaction raycast
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    raycaster.current.set(camera.position, dir);
    raycaster.current.far = 2.2;

    const interactables = getInteractables(g);
    let closestTarget: string | null = null;
    let closestDist = 999;

    for (const { id, pos } of interactables) {
      tempVec.current.set(pos[0], pos[1], pos[2]);
      const d = camera.position.distanceTo(tempVec.current);
      if (d < 2.2 && d < closestDist) {
        closestTarget = id;
        closestDist = d;
      }
    }
    g.interactionTarget = closestTarget;

    // Handle E key
    if (inp.interact && !prevInteract.current) {
      if (closestTarget) {
        onInteract(closestTarget);
      }
    }
    prevInteract.current = inp.interact;

    // Dialog timer
    if (g.dialogTimer > 0) {
      g.dialogTimer -= dt;
      if (g.dialogTimer <= 0) {
        g.dialogVisible = false;
        g.dialogTimer = 0;
      }
    }
  });

  return null;
}

// ─── Interactables registry ───────────────────────────────────────────────────

function getInteractables(g: GameState): { id: string; pos: [number, number, number] }[] {
  const list: { id: string; pos: [number, number, number] }[] = [];
  if (g.stage === 1) {
    if (!g.hasFlashlight) list.push({ id: 'flashlight', pos: [2.9, 1.12, -2] });
    if (!g.noteFound) list.push({ id: 'note', pos: [-2, 0.56, -1] });
    if (g.noteFound) list.push({ id: 'keypad', pos: [1.5, 1.3, 4.9] });
  }
  if (g.stage === 2) {
    const partsPos: [string, [number, number, number]][] = [
      ['gear', [-4, 1.0, -3]],
      ['battery', [4, 0.8, -1]],
      ['bulb', [-1, 1.5, -4]],
    ];
    for (const [id, pos] of partsPos) {
      if (!g.partsCollected.includes(id)) list.push({ id, pos });
    }
    if (g.partsCollected.length === 3 && !g.suhyunRescued) {
      list.push({ id: 'machine', pos: [0, 1.2, 0] });
    }
  }
  if (g.stage === 3) {
    if (!g.colorClueFound) list.push({ id: 'colorclue', pos: [6.9, 1.8, -2] });
    if (g.colorClueFound) {
      const colorOrder = ['red', 'blue', 'green'];
      const bookPositions: [number, number, number][] = [
        [-5, 1.3, -3],
        [-3, 1.3, -3],
        [3, 1.3, -3],
      ];
      colorOrder.forEach((color, i) => {
        if (!g.booksPlaced.includes(color)) {
          list.push({ id: `book_${color}`, pos: bookPositions[i] });
        }
      });
    }
  }
  if (g.stage === 4) {
    const leverX = [-4, -2, 0, 2, 4];
    leverX.forEach((x, i) => {
      if (!g.leversHit[i]) {
        list.push({ id: `lever_${i}`, pos: [x, 0.75, -2] });
      }
    });
  }
  return list;
}

// ─── Main Game Scene ──────────────────────────────────────────────────────────

function GameScene({
  gs,
  inputRef,
  audioRef,
  onCaught,
  onInteract,
  onStageComplete,
}: {
  gs: React.MutableRefObject<GameState>;
  inputRef: React.MutableRefObject<InputState>;
  audioRef: React.MutableRefObject<AudioContext | null>;
  onCaught: () => void;
  onInteract: (target: string) => void;
  onStageComplete: (stage: number) => void;
}) {
  return (
    <>
      <fog attach="fog" args={['#1a0a2e', 2, 15]} />
      <ambientLight intensity={0.15} color="#441122" />

      {gs.current.hasFlashlight && (
        <spotLight
          position={[gs.current.playerPos.x, 1.6, gs.current.playerPos.z]}
          angle={0.4}
          penumbra={0.3}
          intensity={3}
          color="#ffddaa"
          distance={12}
          target-position={[
            gs.current.playerPos.x - Math.sin(gs.current.playerYaw) * 5,
            1.2,
            gs.current.playerPos.z - Math.cos(gs.current.playerYaw) * 5,
          ]}
        />
      )}

      {gs.current.stage === 1 && <Stage1Scene gs={gs} />}
      {gs.current.stage === 2 && <Stage2Scene gs={gs} />}
      {gs.current.stage === 3 && <Stage3Scene gs={gs} />}
      {gs.current.stage === 4 && <Stage4Scene gs={gs} />}

      {/* Neighbor 2 */}
      {gs.current.stage === 2 && !gs.current.stage2Done && (
        <NeighborMesh pos={gs.current.neighborPos} emoji="👨‍🔬" stage={2} />
      )}
      {/* Neighbor 3 */}
      {gs.current.stage === 3 && !gs.current.stage3Done && (
        <NeighborMesh pos={gs.current.neighbor3Pos} emoji="👁️" stage={3} />
      )}

      <Sparkles count={50} size={2} opacity={0.3} color="#aa88ff" speed={0.2} />

      <FirstPersonController
        gs={gs}
        inputRef={inputRef}
        audioRef={audioRef}
        onCaught={onCaught}
        onInteract={onInteract}
      />
    </>
  );
}

// ─── SpotLight that follows camera ───────────────────────────────────────────

function CameraSpotlight({ gs }: { gs: React.MutableRefObject<GameState> }) {
  const lightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const { scene, camera } = useThree();

  useEffect(() => {
    scene.add(targetRef.current);
    return () => { scene.remove(targetRef.current); };
  }, [scene]);

  useFrame(() => {
    if (!gs.current.hasFlashlight) return;
    const fwd = new THREE.Vector3(0, -0.1, -1).applyEuler(camera.rotation);
    targetRef.current.position.copy(camera.position).addScaledVector(fwd, 5);
    if (lightRef.current) {
      lightRef.current.position.copy(camera.position);
      lightRef.current.target = targetRef.current;
    }
  });

  if (!gs.current.hasFlashlight) return null;
  return (
    <spotLight
      ref={lightRef}
      angle={0.35}
      penumbra={0.4}
      intensity={4}
      color="#ffddaa"
      distance={14}
    />
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

function makeInitialGameState(): GameState {
  return {
    screen: 'select',
    stage: 1,
    character: null,
    inventory: [],
    hasFlashlight: false,
    noteFound: false,
    keypadCode: '',
    stage1Done: false,
    partsCollected: [],
    suhyunRescued: false,
    stage2Done: false,
    colorClueFound: false,
    booksPlaced: [],
    iehyunRescued: false,
    stage3Done: false,
    leversHit: [false, false, false, false, false],
    lightPos: 0,
    lightTimer: 60,
    leverTimer: 60,
    stage4Done: false,
    startTime: 0,
    caughtCount: 0,
    score: 0,
    playerPos: new THREE.Vector3(0, 1.6, 4),
    playerYaw: Math.PI,
    neighborPos: new THREE.Vector3(-4, 0.1, 0),
    neighborDir: 1,
    neighborAlert: false,
    alertTimer: 0,
    neighbor3Pos: new THREE.Vector3(-5, 0.1, -3),
    neighbor3Dir: 1,
    interactionTarget: null,
    keypadInput: '',
    showKeypad: false,
    showNote: false,
    showColorClue: false,
    lastCaughtAt: 0,
    dialogText: '',
    dialogVisible: false,
    dialogTimer: 0,
  };
}

export default function EscapePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [screen, setScreen] = useState<'select' | 'intro' | 'playing' | 'victory'>('select');
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [dialogText, setDialogText] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [interactionPrompt, setInteractionPrompt] = useState<string | null>(null);
  const [inventory, setInventory] = useState<string[]>([]);
  const [stageName, setStageName] = useState('');
  const [stageMission, setStageMission] = useState('');
  const [timeDisplay, setTimeDisplay] = useState('00:00');
  const [showKeypad, setShowKeypad] = useState(false);
  const [keypadInput, setKeypadInput] = useState('');
  const keypadInputRef = useRef('');
  const [showNote, setShowNote] = useState(false);
  const [showColorClue, setShowColorClue] = useState(false);
  const [victoryData, setVictoryData] = useState({ score: 0, time: 0, caught: 0 });
  const [leverStatus, setLeverStatus] = useState<boolean[]>([false, false, false, false, false]);
  const [leverCountdown, setLeverCountdown] = useState(60);
  const [mobileLookStart, setMobileLookStart] = useState<{ id: number; x: number; y: number } | null>(null);
  const [joystickCenter, setJoystickCenter] = useState({ x: 0, y: 0 });
  const [joystickDelta, setJoystickDelta] = useState({ x: 0, y: 0 });
  const [joystickActive, setJoystickActive] = useState(false);

  const gsRef = useRef<GameState>(makeInitialGameState());
  const inputRef = useRef<InputState>({
    forward: false, backward: false, left: false, right: false,
    interact: false, run: false,
    joystickX: 0, joystickY: 0,
    lookDX: 0, lookDY: 0,
    mouseDragging: false,
  });
  const audioRef = useRef<AudioContext | null>(null);
  const uiTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const joystickRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // ── UI sync loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    uiTimerRef.current = setInterval(() => {
      const g = gsRef.current;
      if (g.screen !== 'playing') return;

      // Time
      const elapsed = (Date.now() - g.startTime) / 1000;
      const mm = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const ss = Math.floor(elapsed % 60).toString().padStart(2, '0');
      setTimeDisplay(`${mm}:${ss}`);

      // Stage info
      setStageName(STAGE_NAMES[g.stage] || '');
      setStageMission(STAGE_MISSIONS[g.stage] || '');

      // Inventory
      setInventory([...g.inventory]);

      // Interaction
      const target = g.interactionTarget;
      if (target) {
        if (target === 'flashlight') setInteractionPrompt('E: 손전등 줍기');
        else if (target === 'note') setInteractionPrompt('E: 메모 읽기');
        else if (target === 'keypad') setInteractionPrompt('E: 코드 입력');
        else if (target.startsWith('gear') || target.startsWith('battery') || target.startsWith('bulb')) setInteractionPrompt('E: 부품 줍기');
        else if (target === 'machine') setInteractionPrompt('E: 기계 작동');
        else if (target === 'colorclue') setInteractionPrompt('E: 단서 조사');
        else if (target.startsWith('book_')) setInteractionPrompt('E: 책 당기기');
        else if (target.startsWith('lever_')) setInteractionPrompt('E: 레버 당기기 (타이밍!)');
        else setInteractionPrompt('E: 상호작용');
      } else {
        setInteractionPrompt(null);
      }

      // Dialog sync
      if (g.dialogVisible && g.dialogText !== dialogText) {
        setDialogText(g.dialogText);
        setShowDialog(true);
      } else if (!g.dialogVisible) {
        setShowDialog(false);
      }

      // Alert
      setShowAlert(g.alertTimer > 0);

      // Stage 4
      if (g.stage === 4) {
        setLeverStatus([...g.leversHit]);
        setLeverCountdown(Math.ceil(g.leverTimer));
      }
    }, 100);
    return () => { if (uiTimerRef.current) clearInterval(uiTimerRef.current); };
  }, [dialogText]);

  // ── Keyboard input ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (gsRef.current.screen !== 'playing') return;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': inputRef.current.forward = true; break;
        case 'KeyS': case 'ArrowDown': inputRef.current.backward = true; break;
        case 'KeyA': case 'ArrowLeft': inputRef.current.left = true; break;
        case 'KeyD': case 'ArrowRight': inputRef.current.right = true; break;
        case 'KeyE': inputRef.current.interact = true; break;
        case 'ShiftLeft': case 'ShiftRight': inputRef.current.run = true; break;
        case 'Escape':
          if (showKeypad) { setShowKeypad(false); gsRef.current.showKeypad = false; }
          if (showNote) { setShowNote(false); gsRef.current.showNote = false; }
          if (showColorClue) { setShowColorClue(false); gsRef.current.showColorClue = false; }
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': inputRef.current.forward = false; break;
        case 'KeyS': case 'ArrowDown': inputRef.current.backward = false; break;
        case 'KeyA': case 'ArrowLeft': inputRef.current.left = false; break;
        case 'KeyD': case 'ArrowRight': inputRef.current.right = false; break;
        case 'KeyE': inputRef.current.interact = false; break;
        case 'ShiftLeft': case 'ShiftRight': inputRef.current.run = false; break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [showKeypad, showNote, showColorClue]);

  // ── Mouse look ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let lastX = 0;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { inputRef.current.mouseDragging = true; lastX = e.clientX; }
    };
    const onMouseUp = () => { inputRef.current.mouseDragging = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (inputRef.current.mouseDragging) {
        inputRef.current.lookDX += e.movementX || (e.clientX - lastX);
        lastX = e.clientX;
      }
    };
    const onPointerLock = () => { };
    const onClick = (e: MouseEvent) => {
      if (gsRef.current.screen === 'playing' && !showKeypad && !showNote && !showColorClue) {
        canvasContainerRef.current?.requestPointerLock?.();
      }
    };
    const onPointerLockChange = () => {
      inputRef.current.mouseDragging = !!document.pointerLockElement;
    };
    const onPointerLockMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement) {
        inputRef.current.lookDX += e.movementX;
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onPointerLockMouseMove);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onPointerLockMouseMove);
    };
  }, [showKeypad, showNote, showColorClue]);

  // ── Callbacks ──────────────────────────────────────────────────────────────

  const handleCaught = useCallback(() => {
    const g = gsRef.current;
    g.caughtCount++;
    g.lastCaughtAt = Date.now();
    g.alertTimer = 2.5;

    if (audioRef.current) playAlarm(audioRef.current);

    // Reset player to stage spawn
    const spawn = STAGE_SPAWNS[g.stage - 1];
    g.playerPos.set(spawn[0], spawn[1], spawn[2]);
    g.playerYaw = Math.PI;

    setShowAlert(true);
    setTimeout(() => setShowAlert(false), 2500);
  }, []);

  const handleInteract = useCallback((target: string) => {
    const g = gsRef.current;
    if (!audioRef.current) {
      audioRef.current = createAudioContext();
    }
    const ctx = audioRef.current!;

    if (target === 'flashlight') {
      g.hasFlashlight = true;
      g.inventory.push('🔦 손전등');
      playPickup(ctx);
      showDialogMsg('손전등을 찾았다! 이제 주변을 볼 수 있어!', 2.5);
    } else if (target === 'note') {
      g.noteFound = true;
      g.inventory.push('📝 메모');
      playPickup(ctx);
      setShowNote(true);
      gsRef.current.showNote = true;
    } else if (target === 'keypad') {
      if (!g.noteFound) {
        showDialogMsg('먼저 메모를 찾아야 해!', 2);
        return;
      }
      setShowKeypad(true);
      gsRef.current.showKeypad = true;
      setKeypadInput('');
      keypadInputRef.current = '';
    } else if (target === 'gear' || target === 'battery' || target === 'bulb') {
      if (!g.partsCollected.includes(target)) {
        g.partsCollected.push(target);
        const emojiMap: Record<string, string> = { gear: '⚙️ 기어', battery: '🔋 배터리', bulb: '💡 전구' };
        g.inventory.push(emojiMap[target]);
        playPickup(ctx);
        showDialogMsg(`${emojiMap[target]}을 주웠다! (${g.partsCollected.length}/3)`, 1.5);
      }
    } else if (target === 'machine') {
      if (g.partsCollected.length === 3 && !g.suhyunRescued) {
        g.suhyunRescued = true;
        playPickup(ctx);
        showDialogMsg('수현: 고마워! 같이 탈출하자!', 3);
        setTimeout(() => advanceStage(), 3500);
      }
    } else if (target === 'colorclue') {
      g.colorClueFound = true;
      setShowColorClue(true);
      gsRef.current.showColorClue = true;
      playPickup(ctx);
    } else if (target.startsWith('book_')) {
      const color = target.replace('book_', '');
      const colorOrder = ['red', 'blue', 'green'];
      const expectedNext = colorOrder[g.booksPlaced.length];
      if (color === expectedNext) {
        g.booksPlaced.push(color);
        playPickup(ctx);
        if (g.booksPlaced.length === 3) {
          g.iehyunRescued = true;
          showDialogMsg('이현: 드디어! 다 같이 지하실로!', 3);
          setTimeout(() => advanceStage(), 3500);
        } else {
          const names: Record<string, string> = { red: '빨간', blue: '파란', green: '초록' };
          showDialogMsg(`${names[color]} 책을 당겼다! (${g.booksPlaced.length}/3)`, 1.5);
        }
      } else {
        showDialogMsg('순서가 틀렸어! 단서를 다시 확인해봐...', 2);
        playAlarm(ctx);
      }
    } else if (target.startsWith('lever_')) {
      const idx = parseInt(target.replace('lever_', ''));
      const lightIdx = Math.round(g.lightPos) % 5;
      const delta = Math.abs(lightIdx - idx);

      if (delta <= 1) { // forgiving timing
        if (!g.leversHit[idx]) {
          g.leversHit = g.leversHit.map((v, i) => i === idx ? true : v);
          playLeverClick(ctx);

          const allHit = g.leversHit.every(Boolean);
          if (allHit) {
            g.stage4Done = true;
            showDialogMsg('박사님: 고마워... 드디어 나갈 수 있어!', 3);
            setTimeout(() => triggerVictory(), 3500);
          } else {
            const count = g.leversHit.filter(Boolean).length;
            showDialogMsg(`레버 작동! (${count}/5)`, 1);
          }
        }
      } else {
        showDialogMsg('타이밍이 맞지 않아! 빛이 올 때 누르자!', 1.5);
        playAlarm(ctx);
      }
    }
  }, []);

  const showDialogMsg = (text: string, duration: number) => {
    gsRef.current.dialogText = text;
    gsRef.current.dialogVisible = true;
    gsRef.current.dialogTimer = duration;
    setDialogText(text);
    setShowDialog(true);
  };

  const advanceStage = useCallback(() => {
    const g = gsRef.current;
    const nextStage = g.stage + 1;
    if (nextStage > 4) {
      triggerVictory();
      return;
    }
    g.stage = nextStage;
    const spawn = STAGE_SPAWNS[nextStage - 1];
    g.playerPos.set(spawn[0], spawn[1], spawn[2]);
    g.playerYaw = Math.PI;

    if (nextStage === 4) {
      g.leverTimer = 60;
      g.lightPos = 0;
      g.leversHit = [false, false, false, false, false];
      showDialogMsg('박사님: 제발 도와줘, 나도 못 나가! 레버 5개를 눌러줘!', 4);
    } else {
      showDialogMsg(`${STAGE_NAMES[nextStage]}에 도착!`, 2);
    }
  }, []);

  const triggerVictory = useCallback(() => {
    const g = gsRef.current;
    const elapsed = (Date.now() - g.startTime) / 1000;
    const score = Math.max(0, 10000 - Math.floor(elapsed) * 10) + (g.caughtCount === 0 ? 2000 : 500 * Math.max(0, 5 - g.caughtCount));
    g.score = score;
    g.screen = 'victory';

    if (audioRef.current) playVictory(audioRef.current);
    if (g.character) saveScore('escape', g.character.name, score);

    setVictoryData({ score, time: elapsed, caught: g.caughtCount });
    setScreen('victory');
  }, []);

  const startGame = useCallback((char: Character) => {
    const g = gsRef.current;
    Object.assign(g, makeInitialGameState());
    g.character = char;
    g.screen = 'playing';
    g.startTime = Date.now();
    g.playerPos.set(0, 1.6, 4);
    g.playerYaw = Math.PI;
    setSelectedCharacter(char);
    setScreen('playing');
    setInventory([]);
    setLeverStatus([false, false, false, false, false]);
    setLeverCountdown(60);

    if (!audioRef.current) {
      audioRef.current = createAudioContext();
    }
  }, []);

  const handleKeypadSubmit = useCallback((code: string) => {
    if (code === '137') {
      gsRef.current.stage1Done = true;
      setShowKeypad(false);
      gsRef.current.showKeypad = false;
      if (audioRef.current) playDoorCreak(audioRef.current);
      showDialogMsg('딸깍! 문이 열렸다! 위층으로!', 2);
      setTimeout(() => advanceStage(), 2500);
    } else {
      showDialogMsg('코드가 틀렸어! 다시 시도해봐...', 2);
      if (audioRef.current) playAlarm(audioRef.current);
      setKeypadInput('');
      keypadInputRef.current = '';
    }
  }, [advanceStage]);

  // ── Mobile joystick handlers ───────────────────────────────────────────────
  const handleJoystickStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setJoystickCenter({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    setJoystickActive(true);
    joystickRef.current = { x: 0, y: 0 };
  }, []);

  const handleJoystickMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!joystickActive) return;
    const touch = e.changedTouches[0];
    const dx = (touch.clientX - joystickCenter.x) / 50;
    const dy = (touch.clientY - joystickCenter.y) / 50;
    const len = Math.sqrt(dx * dx + dy * dy);
    const clampedDx = len > 1 ? dx / len : dx;
    const clampedDy = len > 1 ? dy / len : dy;
    joystickRef.current = { x: clampedDx, y: clampedDy };
    inputRef.current.joystickX = clampedDx;
    inputRef.current.joystickY = clampedDy;
    setJoystickDelta({ x: clampedDx * 40, y: clampedDy * 40 });
  }, [joystickActive, joystickCenter]);

  const handleJoystickEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setJoystickActive(false);
    joystickRef.current = { x: 0, y: 0 };
    inputRef.current.joystickX = 0;
    inputRef.current.joystickY = 0;
    setJoystickDelta({ x: 0, y: 0 });
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  // CHARACTER SELECT
  if (screen === 'select') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0d0515 0%, #1a0a2e 50%, #0d0515 100%)',
        color: '#fff',
        fontFamily: "'Segoe UI', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px',
      }}>
        <Link href="/" style={{ alignSelf: 'flex-start', color: '#aaa', textDecoration: 'none', marginBottom: 16, fontSize: 14 }}>
          ← 홈으로
        </Link>

        <div style={{ fontSize: 48, marginBottom: 8 }}>🏚️</div>
        <h1 style={{ fontSize: 28, fontWeight: 'bold', color: '#cc88ff', textAlign: 'center', marginBottom: 4, textShadow: '0 0 20px #9933ff' }}>
          박사님의 비밀 저택
        </h1>
        <p style={{ color: '#aa88cc', marginBottom: 32, textAlign: 'center', fontSize: 14 }}>
          으스스한 저택에서 친구를 구하라!
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 32 }}>
          {CHARACTERS.map((char) => (
            <button
              key={char.name}
              onClick={() => startGame(char)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: `2px solid ${char.color}`,
                borderRadius: 16,
                padding: '20px 24px',
                cursor: 'pointer',
                color: '#fff',
                transition: 'all 0.2s',
                minWidth: 140,
                textAlign: 'center',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = `${char.color}33`;
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 8 }}>{char.emoji}</div>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: char.color }}>{char.name}</div>
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>{char.role}</div>
              <div style={{
                fontSize: 11,
                color: '#888',
                marginTop: 6,
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 6,
                padding: '3px 8px',
              }}>
                능력: {char.ability}
              </div>
            </button>
          ))}
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid #554477',
          borderRadius: 12,
          padding: 16,
          maxWidth: 480,
          fontSize: 13,
          color: '#ccaaee',
          lineHeight: 1.6,
          textAlign: 'center',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#ee88ff' }}>📖 스토리</div>
          박사님의 저택에서 친구들 수현이와 이현이가 사라졌다!<br />
          으스스한 저택 안으로 들어가 친구들을 구하자...<br />
          그런데 저택 안에는 이웃 주민이 돌아다니고 있어! 💀
        </div>

        <div style={{
          marginTop: 20,
          fontSize: 12,
          color: '#665588',
          textAlign: 'center',
          lineHeight: 1.8,
        }}>
          🖥️ WASD / 화살표: 이동 &nbsp;|&nbsp; 마우스 드래그: 시점 변경<br />
          E: 상호작용 &nbsp;|&nbsp; Shift: 달리기 (들키기 쉬워짐!)
        </div>
      </div>
    );
  }

  // VICTORY SCREEN
  if (screen === 'victory') {
    const char = gsRef.current.character;
    const mm = Math.floor(victoryData.time / 60).toString().padStart(2, '0');
    const ss = Math.floor(victoryData.time % 60).toString().padStart(2, '0');
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a1a0a 0%, #1a3a0a 50%, #0a2a0a 100%)',
        color: '#fff',
        fontFamily: "'Segoe UI', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}>
        <div style={{ fontSize: 80, marginBottom: 8, animation: 'bounce 0.5s infinite alternate' }}>
          {char?.emoji || '🎉'}
        </div>
        <h1 style={{ fontSize: 36, color: '#44ff88', marginBottom: 8, textShadow: '0 0 20px #22aa44' }}>
          🎉 탈출 성공!
        </h1>
        <p style={{ color: '#aaffaa', marginBottom: 24, fontSize: 16 }}>
          {char?.name}이(가) 모두를 구했다!
        </p>

        <div style={{
          background: 'rgba(0,0,0,0.5)',
          border: '2px solid #44ff88',
          borderRadius: 16,
          padding: '24px 40px',
          marginBottom: 24,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, fontWeight: 'bold', color: '#44ff88' }}>
            {victoryData.score.toLocaleString()}
          </div>
          <div style={{ fontSize: 14, color: '#88cc88' }}>점수</div>
          <div style={{ height: 1, background: '#336633', margin: '16px 0' }} />
          <div style={{ display: 'flex', gap: 32, justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, color: '#aaffaa' }}>⏱️ {mm}:{ss}</div>
              <div style={{ fontSize: 12, color: '#668866' }}>클리어 시간</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, color: '#ffaa88' }}>💀 {victoryData.caught}회</div>
              <div style={{ fontSize: 12, color: '#668866' }}>발각 횟수</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, color: '#aaaaff' }}>🏠 4층</div>
              <div style={{ fontSize: 12, color: '#668866' }}>클리어 스테이지</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => { gsRef.current = makeInitialGameState(); setScreen('select'); }}
            style={{
              background: '#2a1a4a',
              border: '2px solid #8844ff',
              borderRadius: 10,
              padding: '12px 24px',
              color: '#cc88ff',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            다시 하기
          </button>
          <Link href="/"
            style={{
              background: '#1a2a1a',
              border: '2px solid #44aa44',
              borderRadius: 10,
              padding: '12px 24px',
              color: '#88ff88',
              textDecoration: 'none',
              fontSize: 16,
            }}
          >
            홈으로
          </Link>
        </div>

        <style>{`@keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-10px); } }`}</style>
      </div>
    );
  }

  // PLAYING
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', position: 'relative', overflow: 'hidden' }}>
      {/* 3D Canvas */}
      <div ref={canvasContainerRef} style={{ width: '100%', height: '100%' }}>
        {mounted && (
          <Canvas
            camera={{ fov: 75, near: 0.1, far: 100, position: [0, 1.6, 4] }}
            gl={{ antialias: true }}
          >
            <GameScene
              gs={gsRef}
              inputRef={inputRef}
              audioRef={audioRef}
              onCaught={handleCaught}
              onInteract={handleInteract}
              onStageComplete={advanceStage}
            />
            <CameraSpotlight gs={gsRef} />
          </Canvas>
        )}
      </div>

      {/* Crosshair */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 10,
      }}>
        <div style={{ width: 20, height: 2, background: 'rgba(255,255,255,0.6)', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
        <div style={{ width: 2, height: 20, background: 'rgba(255,255,255,0.6)', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
      </div>

      {/* Top-left: Stage info */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 20,
        pointerEvents: 'none',
      }}>
        <div style={{
          background: 'rgba(0,0,0,0.7)',
          border: '1px solid #6644aa',
          borderRadius: 8,
          padding: '8px 12px',
          color: '#cc99ff',
          fontSize: 13,
        }}>
          <div style={{ fontWeight: 'bold', color: '#aa66ff' }}>🏚️ {stageName}</div>
          <div style={{ fontSize: 11, color: '#998aaa', marginTop: 4, maxWidth: 200 }}>{stageMission}</div>
        </div>
      </div>

      {/* Top-right: Timer */}
      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 20,
        pointerEvents: 'none',
      }}>
        <div style={{
          background: 'rgba(0,0,0,0.7)',
          border: '1px solid #6644aa',
          borderRadius: 8,
          padding: '8px 14px',
          color: '#ffddaa',
          fontSize: 20,
          fontWeight: 'bold',
          fontVariantNumeric: 'tabular-nums',
        }}>
          ⏱️ {timeDisplay}
        </div>
        {gsRef.current.stage === 4 && (
          <div style={{
            marginTop: 4,
            background: 'rgba(200,0,0,0.7)',
            border: '1px solid #ff4444',
            borderRadius: 8,
            padding: '4px 14px',
            color: '#ffaaaa',
            fontSize: 14,
            fontWeight: 'bold',
            textAlign: 'center',
          }}>
            레버 제한: {leverCountdown}초
          </div>
        )}
      </div>

      {/* Inventory */}
      <div style={{
        position: 'absolute',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        pointerEvents: 'none',
        display: 'flex',
        gap: 6,
      }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{
            width: 50,
            height: 50,
            background: inventory[i] ? 'rgba(80,40,120,0.8)' : 'rgba(0,0,0,0.5)',
            border: `1px solid ${inventory[i] ? '#aa66ff' : '#443355'}`,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            color: '#ccaaff',
            textAlign: 'center',
            padding: 2,
          }}>
            {inventory[i] || ''}
          </div>
        ))}
      </div>

      {/* Interaction prompt */}
      {interactionPrompt && (
        <div style={{
          position: 'absolute',
          bottom: 140,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          pointerEvents: 'none',
          background: 'rgba(0,0,0,0.8)',
          border: '1px solid #aa66ff',
          borderRadius: 8,
          padding: '8px 16px',
          color: '#ffddaa',
          fontSize: 14,
          fontWeight: 'bold',
        }}>
          {interactionPrompt}
        </div>
      )}

      {/* Dialog box */}
      {showDialog && (
        <div style={{
          position: 'absolute',
          bottom: 160,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          background: 'rgba(10,5,20,0.95)',
          border: '2px solid #8844ff',
          borderRadius: 12,
          padding: '12px 20px',
          color: '#eeddff',
          fontSize: 15,
          maxWidth: 360,
          textAlign: 'center',
          boxShadow: '0 0 20px rgba(136,68,255,0.4)',
          pointerEvents: 'none',
        }}>
          {dialogText}
        </div>
      )}

      {/* Alert overlay */}
      {showAlert && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 50,
          pointerEvents: 'none',
          border: '8px solid rgba(255,0,0,0.8)',
          background: 'rgba(200,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            fontSize: 48,
            fontWeight: 'bold',
            color: '#ff4444',
            textShadow: '0 0 20px #ff0000',
            animation: 'pulse 0.3s infinite',
          }}>
            ⚠️ 발각!
          </div>
        </div>
      )}

      {/* Stage 4 lever visualization */}
      {gsRef.current.stage === 4 && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 15,
          display: 'flex',
          gap: 8,
          marginTop: -100,
        }}>
          {leverStatus.map((hit, i) => (
            <div key={i} style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: hit ? '#44ff44' : 'rgba(200,50,50,0.4)',
              border: `2px solid ${hit ? '#00dd00' : '#884444'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
            }}>
              {hit ? '✓' : (i + 1)}
            </div>
          ))}
        </div>
      )}

      {/* Keypad modal */}
      {showKeypad && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 100,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: '#1a1030',
            border: '2px solid #8844ff',
            borderRadius: 16,
            padding: 32,
            textAlign: 'center',
            minWidth: 280,
          }}>
            <div style={{ fontSize: 24, marginBottom: 8, color: '#cc99ff' }}>🔐 도어 코드</div>
            <div style={{ fontSize: 13, color: '#998aaa', marginBottom: 16 }}>
              힌트: 🐱=1, ⭐=3, 🌙=7
            </div>
            <div style={{
              fontSize: 32,
              letterSpacing: 8,
              color: '#ffddaa',
              background: '#0a0518',
              borderRadius: 8,
              padding: '10px 20px',
              marginBottom: 20,
              minHeight: 54,
            }}>
              {keypadInput || '___'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '✓'].map((btn) => (
                <button
                  key={btn}
                  onClick={() => {
                    if (btn === '←') {
                      const next = keypadInputRef.current.slice(0, -1);
                      keypadInputRef.current = next;
                      setKeypadInput(next);
                    } else if (btn === '✓') {
                      handleKeypadSubmit(keypadInputRef.current);
                    } else if (keypadInputRef.current.length < 3) {
                      const next = keypadInputRef.current + btn;
                      keypadInputRef.current = next;
                      setKeypadInput(next);
                    }
                  }}
                  style={{
                    background: btn === '✓' ? '#226622' : '#2a1a4a',
                    border: `1px solid ${btn === '✓' ? '#44aa44' : '#6644aa'}`,
                    borderRadius: 8,
                    padding: '12px 0',
                    color: '#eeddff',
                    fontSize: 18,
                    cursor: 'pointer',
                  }}
                >
                  {btn}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setShowKeypad(false); gsRef.current.showKeypad = false; }}
              style={{
                background: 'transparent',
                border: '1px solid #443355',
                borderRadius: 8,
                padding: '8px 20px',
                color: '#887799',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* Note modal */}
      {showNote && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 100,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: '#f5e6c8',
            border: '3px solid #8b6040',
            borderRadius: 12,
            padding: 32,
            textAlign: 'center',
            maxWidth: 300,
            color: '#3a2010',
          }}>
            <div style={{ fontSize: 22, marginBottom: 12, fontWeight: 'bold' }}>📝 박사님의 메모</div>
            <div style={{ fontSize: 14, lineHeight: 2, marginBottom: 20 }}>
              저택 출입 코드 힌트:<br />
              <span style={{ fontSize: 28 }}>🐱</span> = 1<br />
              <span style={{ fontSize: 28 }}>⭐</span> = 3<br />
              <span style={{ fontSize: 28 }}>🌙</span> = 7<br />
              <br />
              순서: 🐱⭐🌙
            </div>
            <button
              onClick={() => { setShowNote(false); gsRef.current.showNote = false; }}
              style={{
                background: '#8b6040',
                border: 'none',
                borderRadius: 8,
                padding: '10px 24px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* Color clue modal */}
      {showColorClue && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 100,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: '#1a1030',
            border: '2px solid #8844ff',
            borderRadius: 16,
            padding: 32,
            textAlign: 'center',
            maxWidth: 320,
          }}>
            <div style={{ fontSize: 22, marginBottom: 16, color: '#cc99ff' }}>🎨 색깔 단서</div>
            <div style={{ fontSize: 14, color: '#998aaa', marginBottom: 20, lineHeight: 1.8 }}>
              그림에서 발견한 색깔 순서:<br />
              첫 번째 → 두 번째 → 세 번째
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24, fontSize: 36 }}>
              <span>🔴</span>
              <span style={{ color: '#666', fontSize: 24, lineHeight: '36px' }}>→</span>
              <span>🔵</span>
              <span style={{ color: '#666', fontSize: 24, lineHeight: '36px' }}>→</span>
              <span>🟢</span>
            </div>
            <div style={{ fontSize: 12, color: '#665588', marginBottom: 20 }}>
              빨강 → 파랑 → 초록 순서로 책을 당기세요!
            </div>
            <button
              onClick={() => { setShowColorClue(false); gsRef.current.showColorClue = false; }}
              style={{
                background: '#3a1a6a',
                border: '1px solid #8844ff',
                borderRadius: 8,
                padding: '10px 24px',
                color: '#cc99ff',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* Click to play hint */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        color: 'rgba(255,255,255,0.3)',
        fontSize: 11,
        pointerEvents: 'none',
        textAlign: 'center',
      }}>
        클릭하면 마우스 잠금 모드 (ESC로 해제)
      </div>

      {/* Mobile controls */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 200,
        zIndex: 40,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        padding: '0 20px 20px',
        pointerEvents: 'none',
      }}>
        {/* Left: Joystick */}
        <div
          style={{
            width: 120,
            height: 120,
            background: 'rgba(255,255,255,0.07)',
            border: '2px solid rgba(255,255,255,0.15)',
            borderRadius: '50%',
            position: 'relative',
            pointerEvents: 'all',
            touchAction: 'none',
          }}
          onTouchStart={handleJoystickStart}
          onTouchMove={handleJoystickMove}
          onTouchEnd={handleJoystickEnd}
        >
          <div style={{
            position: 'absolute',
            width: 48,
            height: 48,
            background: 'rgba(160,100,255,0.5)',
            border: '2px solid rgba(200,150,255,0.4)',
            borderRadius: '50%',
            top: '50%',
            left: '50%',
            transform: `translate(calc(-50% + ${joystickDelta.x}px), calc(-50% + ${joystickDelta.y}px))`,
            pointerEvents: 'none',
          }} />
        </div>

        {/* Center: Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'all' }}>
          <button
            onTouchStart={(e) => { e.preventDefault(); inputRef.current.interact = true; }}
            onTouchEnd={(e) => { e.preventDefault(); inputRef.current.interact = false; }}
            style={{
              width: 70,
              height: 70,
              background: 'rgba(100,50,200,0.6)',
              border: '2px solid rgba(180,120,255,0.5)',
              borderRadius: 12,
              color: '#fff',
              fontSize: 14,
              fontWeight: 'bold',
              cursor: 'pointer',
              touchAction: 'none',
            }}
          >
            E<br /><span style={{ fontSize: 10 }}>상호작용</span>
          </button>
          <button
            onTouchStart={(e) => { e.preventDefault(); inputRef.current.run = true; }}
            onTouchEnd={(e) => { e.preventDefault(); inputRef.current.run = false; }}
            style={{
              width: 70,
              height: 50,
              background: 'rgba(200,80,30,0.5)',
              border: '2px solid rgba(255,120,60,0.5)',
              borderRadius: 10,
              color: '#fff',
              fontSize: 12,
              cursor: 'pointer',
              touchAction: 'none',
            }}
          >
            🏃 달리기
          </button>
        </div>

        {/* Right: Look area */}
        <div
          style={{
            width: 140,
            height: 140,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            pointerEvents: 'all',
            touchAction: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.2)',
            fontSize: 11,
          }}
          onTouchStart={(e) => {
            e.preventDefault();
            const t = e.changedTouches[0];
            setMobileLookStart({ id: t.identifier, x: t.clientX, y: t.clientY });
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            if (!mobileLookStart) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
              const t = e.changedTouches[i];
              if (t.identifier === mobileLookStart.id) {
                inputRef.current.lookDX += (t.clientX - mobileLookStart.x) * 1.5;
                setMobileLookStart({ id: t.identifier, x: t.clientX, y: t.clientY });
              }
            }
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            setMobileLookStart(null);
          }}
        >
          시점 조작
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

