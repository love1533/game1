'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Character {
  name: string;
  emoji: string;
  color: string;
  heart: string;
}

interface Item {
  emoji: string;
  name: string;
  id: string;
}

interface Category {
  name: string;
  icon: string;
  items: Item[];
}

interface FloatingParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  emoji: string;
  size: number;
  life: number;
  maxLife: number;
  rotation: number;
  rotSpeed: number;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const CHARACTERS: Character[] = [
  { name: '수현', emoji: '😎', color: '#9B59B6', heart: '💜' },
  { name: '이현', emoji: '🤓', color: '#3498DB', heart: '💙' },
  { name: '은영', emoji: '🥰', color: '#E91E8C', heart: '💗' },
  { name: '민구', emoji: '😜', color: '#2ECC71', heart: '💚' },
];

const CATEGORIES: Category[] = [
  {
    name: '모자',
    icon: '👒',
    items: [
      { emoji: '👑', name: '왕관', id: 'hat-crown' },
      { emoji: '🎩', name: '모자', id: 'hat-tophat' },
      { emoji: '🧢', name: '캡', id: 'hat-cap' },
      { emoji: '🎀', name: '리본', id: 'hat-ribbon' },
      { emoji: '🌸', name: '꽃', id: 'hat-flower' },
    ],
  },
  {
    name: '안경',
    icon: '👓',
    items: [
      { emoji: '🕶️', name: '선글라스', id: 'glasses-sun' },
      { emoji: '👓', name: '안경', id: 'glasses-regular' },
      { emoji: '🥽', name: '고글', id: 'glasses-goggles' },
    ],
  },
  {
    name: '배경',
    icon: '🎨',
    items: [
      { emoji: '🌈', name: '무지개', id: 'bg-rainbow' },
      { emoji: '🏖️', name: '해변', id: 'bg-beach' },
      { emoji: '🌙', name: '밤하늘', id: 'bg-night' },
      { emoji: '🌸', name: '벚꽃', id: 'bg-cherry' },
      { emoji: '❄️', name: '눈', id: 'bg-snow' },
    ],
  },
  {
    name: '효과',
    icon: '✨',
    items: [
      { emoji: '✨', name: '반짝이', id: 'fx-sparkle' },
      { emoji: '💕', name: '하트', id: 'fx-heart' },
      { emoji: '⭐', name: '별', id: 'fx-star' },
      { emoji: '🎵', name: '음표', id: 'fx-music' },
    ],
  },
];

const EXCITED_EMOJIS: Record<string, string> = {
  '😎': '🤩',
  '🤓': '😆',
  '🥰': '😍',
  '😜': '🥳',
};

// ─── Audio ───────────────────────────────────────────────────────────────────

function playEquipSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
    setTimeout(() => ctx.close(), 300);
  } catch {}
}

function playUnequipSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
    setTimeout(() => ctx.close(), 300);
  } catch {}
}

function playScreenshotSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, t + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.15);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.15);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {}
}

// ─── Background Renderers ────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, bgId: string | null, t: number) {
  if (!bgId) {
    // Default gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#FFF5EE');
    grad.addColorStop(1, '#FFE4E1');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  switch (bgId) {
    case 'bg-rainbow': {
      const colors = ['#FF6B6B', '#FFA07A', '#FFD700', '#98FB98', '#87CEEB', '#9370DB', '#DDA0DD'];
      const bandH = h / colors.length;
      colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(0, i * bandH, w, bandH + 1);
      });
      // Soft overlay
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'bg-beach': {
      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
      sky.addColorStop(0, '#87CEEB');
      sky.addColorStop(1, '#E0F7FF');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h * 0.6);
      // Sun
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(w * 0.8, h * 0.15, 30, 0, Math.PI * 2);
      ctx.fill();
      // Water
      const water = ctx.createLinearGradient(0, h * 0.55, 0, h * 0.7);
      water.addColorStop(0, '#4FC3F7');
      water.addColorStop(1, '#29B6F6');
      ctx.fillStyle = water;
      ctx.fillRect(0, h * 0.55, w, h * 0.15);
      // Waves
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        for (let x = 0; x < w; x += 5) {
          const y = h * 0.58 + i * 15 + Math.sin((x + t * 50) / 30 + i) * 4;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Sand
      ctx.fillStyle = '#F5DEB3';
      ctx.fillRect(0, h * 0.7, w, h * 0.3);
      break;
    }
    case 'bg-night': {
      const night = ctx.createLinearGradient(0, 0, 0, h);
      night.addColorStop(0, '#0C1445');
      night.addColorStop(1, '#1A237E');
      ctx.fillStyle = night;
      ctx.fillRect(0, 0, w, h);
      // Stars
      for (let i = 0; i < 40; i++) {
        const sx = (Math.sin(i * 127.1 + 311.7) * 0.5 + 0.5) * w;
        const sy = (Math.sin(i * 269.5 + 183.3) * 0.5 + 0.5) * h * 0.7;
        const brightness = 0.3 + 0.7 * Math.abs(Math.sin(t * 2 + i * 1.7));
        ctx.fillStyle = `rgba(255,255,200,${brightness})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Moon
      ctx.fillStyle = '#FFF9C4';
      ctx.beginPath();
      ctx.arc(w * 0.8, h * 0.12, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0C1445';
      ctx.beginPath();
      ctx.arc(w * 0.8 + 8, h * 0.12 - 5, 20, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'bg-cherry': {
      const cherry = ctx.createLinearGradient(0, 0, 0, h);
      cherry.addColorStop(0, '#FCE4EC');
      cherry.addColorStop(1, '#F8BBD0');
      ctx.fillStyle = cherry;
      ctx.fillRect(0, 0, w, h);
      // Falling petals
      for (let i = 0; i < 20; i++) {
        const px = ((i * 53 + t * 30) % (w + 40)) - 20;
        const py = ((i * 71 + t * 20 + i * i * 3) % (h + 40)) - 20;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(t * 2 + i);
        ctx.fillStyle = `rgba(255,${150 + (i % 50)},${180 + (i % 30)},0.6)`;
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'bg-snow': {
      const snow = ctx.createLinearGradient(0, 0, 0, h);
      snow.addColorStop(0, '#E3F2FD');
      snow.addColorStop(1, '#BBDEFB');
      ctx.fillStyle = snow;
      ctx.fillRect(0, 0, w, h);
      // Ground snow
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.8);
      for (let x = 0; x <= w; x += 20) {
        ctx.lineTo(x, h * 0.8 + Math.sin(x / 30) * 8);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();
      // Snowflakes
      for (let i = 0; i < 30; i++) {
        const sx = ((i * 47 + t * 15) % (w + 20)) - 10;
        const sy = ((i * 83 + t * 25 + i * i) % (h + 20)) - 10;
        ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(t + i) * 0.3})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DressUpGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const particlesRef = useRef<FloatingParticle[]>([]);
  const equipAnimRef = useRef<{ scale: number; time: number }>({ scale: 1, time: 0 });

  const [selectedChar, setSelectedChar] = useState(0);
  const [equippedItems, setEquippedItems] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ w: 400, h: 500 });
  const [reactionEmoji, setReactionEmoji] = useState<string | null>(null);
  const reactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute active background and effect
  const activeBackground = Array.from(equippedItems).find((id) => id.startsWith('bg-')) || null;
  const activeEffects = Array.from(equippedItems).filter((id) => id.startsWith('fx-'));
  const activeHat = Array.from(equippedItems).find((id) => id.startsWith('hat-')) || null;
  const activeGlasses = Array.from(equippedItems).find((id) => id.startsWith('glasses-')) || null;

  // Find item data by id
  const findItem = useCallback((id: string): Item | undefined => {
    for (const cat of CATEGORIES) {
      const found = cat.items.find((it) => it.id === id);
      if (found) return found;
    }
    return undefined;
  }, []);

  const toggleItem = useCallback(
    (itemId: string) => {
      setEquippedItems((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) {
          next.delete(itemId);
          playUnequipSound();
          return next;
        }
        // For backgrounds, only allow one
        if (itemId.startsWith('bg-')) {
          for (const id of Array.from(next)) {
            if (id.startsWith('bg-')) next.delete(id);
          }
        }
        // For hats, only allow one
        if (itemId.startsWith('hat-')) {
          for (const id of Array.from(next)) {
            if (id.startsWith('hat-')) next.delete(id);
          }
        }
        // For glasses, only allow one
        if (itemId.startsWith('glasses-')) {
          for (const id of Array.from(next)) {
            if (id.startsWith('glasses-')) next.delete(id);
          }
        }
        next.add(itemId);
        playEquipSound();

        // Trigger equip animation
        equipAnimRef.current = { scale: 1.15, time: performance.now() };

        // Show reaction
        const char = CHARACTERS[selectedChar];
        setReactionEmoji(EXCITED_EMOJIS[char.emoji] || '🤩');
        if (reactionTimeoutRef.current) clearTimeout(reactionTimeoutRef.current);
        reactionTimeoutRef.current = setTimeout(() => setReactionEmoji(null), 800);

        // Spawn particles
        const cx = canvasSize.w / 2;
        const cy = canvasSize.h * 0.38;
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 * i) / 8;
          particlesRef.current.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * (2 + Math.random() * 2),
            vy: Math.sin(angle) * (2 + Math.random() * 2) - 1,
            emoji: ['✨', '💫', '⭐', '🌟'][Math.floor(Math.random() * 4)],
            size: 14 + Math.random() * 10,
            life: 1,
            maxLife: 1,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.2,
          });
        }

        return next;
      });
    },
    [selectedChar, canvasSize]
  );

  const clearAll = useCallback(() => {
    setEquippedItems(new Set());
    playUnequipSound();
  }, []);

  const saveImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    playScreenshotSound();
    try {
      const link = document.createElement('a');
      link.download = `꾸미기_${CHARACTERS[selectedChar].name}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {}
  }, [selectedChar]);

  // Resize canvas
  useEffect(() => {
    const resize = () => {
      const w = Math.min(window.innerWidth, 500);
      const h = Math.max(window.innerHeight - 260, 300);
      setCanvasSize({ w, h });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;
    canvas.style.width = `${canvasSize.w}px`;
    canvas.style.height = `${canvasSize.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const char = CHARACTERS[selectedChar];
    const startTime = performance.now();

    const render = () => {
      const now = performance.now();
      const t = (now - startTime) / 1000;
      const w = canvasSize.w;
      const h = canvasSize.h;

      ctx.clearRect(0, 0, w, h);

      // Background
      drawBackground(ctx, w, h, activeBackground, t);

      // Character position
      const cx = w / 2;
      const cy = h * 0.38;
      const radius = Math.min(w, h) * 0.2;

      // Equip animation scale
      let scale = 1;
      if (equipAnimRef.current.scale > 1) {
        const elapsed = (now - equipAnimRef.current.time) / 1000;
        if (elapsed < 0.3) {
          scale = 1 + (equipAnimRef.current.scale - 1) * Math.cos((elapsed / 0.3) * Math.PI * 2) * (1 - elapsed / 0.3);
        } else {
          equipAnimRef.current.scale = 1;
        }
      }

      // Idle bobbing
      const bobY = Math.sin(t * 2) * 3;

      ctx.save();
      ctx.translate(cx, cy + bobY);
      ctx.scale(scale, scale);

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath();
      ctx.ellipse(0, radius + 15, radius * 0.7, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body (circle)
      const bodyGrad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, radius * 0.1, 0, 0, radius);
      bodyGrad.addColorStop(0, lightenColor(char.color, 40));
      bodyGrad.addColorStop(1, char.color);
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      // Outline
      ctx.strokeStyle = darkenColor(char.color, 30);
      ctx.lineWidth = 3;
      ctx.stroke();

      // Face emoji (or reaction)
      const faceEmoji = reactionEmoji || char.emoji;
      ctx.font = `${radius * 0.9}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(faceEmoji, 0, 2);

      // Name tag
      ctx.font = `bold ${Math.max(14, radius * 0.28)}px sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = darkenColor(char.color, 40);
      ctx.lineWidth = 3;
      ctx.strokeText(`${char.heart} ${char.name}`, 0, radius + 30);
      ctx.fillText(`${char.heart} ${char.name}`, 0, radius + 30);

      // Hat
      if (activeHat) {
        const hatItem = findItem(activeHat);
        if (hatItem) {
          const hatSize = radius * 0.75;
          ctx.font = `${hatSize}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(hatItem.emoji, 0, -radius * 0.7);
        }
      }

      // Glasses
      if (activeGlasses) {
        const glassItem = findItem(activeGlasses);
        if (glassItem) {
          const glassSize = radius * 0.5;
          ctx.font = `${glassSize}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(glassItem.emoji, 0, -radius * 0.05);
        }
      }

      ctx.restore();

      // Effects
      activeEffects.forEach((fxId) => {
        const fxItem = findItem(fxId);
        if (!fxItem) return;
        const count = 6;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 * i) / count + t * 0.8;
          const dist = radius * 1.5 + Math.sin(t * 3 + i * 2) * 15;
          const fx = cx + Math.cos(angle) * dist;
          const fy = cy + bobY + Math.sin(angle) * dist * 0.6;
          const fxScale = 0.7 + Math.sin(t * 4 + i) * 0.3;
          ctx.font = `${18 * fxScale}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.globalAlpha = 0.6 + Math.sin(t * 3 + i * 1.5) * 0.4;
          ctx.fillText(fxItem.emoji, fx, fy);
        }
        ctx.globalAlpha = 1;
      });

      // Floating particles
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life -= 0.02;
        p.rotation += p.rotSpeed;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.life;
        ctx.font = `${p.size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.emoji, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [canvasSize, selectedChar, activeBackground, activeEffects, activeHat, activeGlasses, reactionEmoji, findItem]);

  const currentItems = CATEGORIES[activeTab].items;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        width: '100%',
        background: '#FFF0F5',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'linear-gradient(135deg, #FF69B4, #FF1493)',
          color: '#fff',
          flexShrink: 0,
        }}
      >
        <a
          href="/"
          style={{
            color: '#fff',
            textDecoration: 'none',
            fontSize: '20px',
            padding: '4px 8px',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.2)',
          }}
        >
          ← 홈
        </a>
        <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
          ✨ 꾸미기 놀이 ✨
        </span>
        <div style={{ width: '60px' }} />
      </div>

      {/* Character Selection */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
          padding: '8px',
          background: 'rgba(255,255,255,0.8)',
          flexShrink: 0,
        }}
      >
        {CHARACTERS.map((c, i) => (
          <button
            key={c.name}
            onClick={() => {
              setSelectedChar(i);
              setReactionEmoji(null);
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '6px 12px',
              borderRadius: '12px',
              border: i === selectedChar ? `3px solid ${c.color}` : '3px solid transparent',
              background: i === selectedChar ? `${c.color}22` : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontSize: '14px',
              fontWeight: i === selectedChar ? 'bold' : 'normal',
              color: c.color,
            }}
          >
            <span style={{ fontSize: '24px' }}>{c.emoji}</span>
            <span>
              {c.heart}
              {c.name}
            </span>
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '4px',
          minHeight: 0,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            borderRadius: '16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        />
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '10px',
          padding: '6px 12px',
          flexShrink: 0,
        }}
      >
        <button
          onClick={saveImage}
          style={{
            padding: '8px 20px',
            borderRadius: '20px',
            border: 'none',
            background: 'linear-gradient(135deg, #FF69B4, #FF1493)',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(255,20,147,0.3)',
          }}
        >
          📸 저장하기
        </button>
        <button
          onClick={clearAll}
          style={{
            padding: '8px 20px',
            borderRadius: '20px',
            border: '2px solid #FF69B4',
            background: '#fff',
            color: '#FF1493',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          🔄 다시하기
        </button>
      </div>

      {/* Category Tabs */}
      <div
        style={{
          display: 'flex',
          overflowX: 'auto',
          gap: '4px',
          padding: '4px 8px',
          flexShrink: 0,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {CATEGORIES.map((cat, i) => (
          <button
            key={cat.name}
            onClick={() => setActiveTab(i)}
            style={{
              padding: '6px 16px',
              borderRadius: '16px 16px 0 0',
              border: 'none',
              background: i === activeTab ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: '14px',
              fontWeight: i === activeTab ? 'bold' : 'normal',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              color: i === activeTab ? '#FF1493' : '#888',
              borderBottom: i === activeTab ? '3px solid #FF1493' : '3px solid transparent',
              transition: 'all 0.2s',
            }}
          >
            {cat.icon} {cat.name}
          </button>
        ))}
      </div>

      {/* Item Panel */}
      <div
        style={{
          display: 'flex',
          overflowX: 'auto',
          gap: '8px',
          padding: '10px 12px 16px',
          background: '#fff',
          borderTop: '1px solid #f0f0f0',
          flexShrink: 0,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {currentItems.map((item) => {
          const isEquipped = equippedItems.has(item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggleItem(item.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '72px',
                height: '72px',
                borderRadius: '16px',
                border: isEquipped ? '3px solid #FF1493' : '3px solid #eee',
                background: isEquipped
                  ? 'linear-gradient(135deg, #FFE4EC, #FFF0F5)'
                  : '#FAFAFA',
                cursor: 'pointer',
                padding: '4px',
                transition: 'all 0.2s',
                transform: isEquipped ? 'scale(1.05)' : 'scale(1)',
                boxShadow: isEquipped ? '0 2px 12px rgba(255,20,147,0.2)' : 'none',
              }}
            >
              <span style={{ fontSize: '28px' }}>{item.emoji}</span>
              <span
                style={{
                  fontSize: '11px',
                  color: isEquipped ? '#FF1493' : '#666',
                  fontWeight: isEquipped ? 'bold' : 'normal',
                  marginTop: '2px',
                }}
              >
                {item.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Color Helpers ───────────────────────────────────────────────────────────

function lightenColor(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `rgb(${r},${g},${b})`;
}

function darkenColor(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `rgb(${r},${g},${b})`;
}
