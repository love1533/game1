"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getGameRankings,
  getAllRankings,
  type ScoreEntry,
} from "@/lib/ranking";

// ── Game metadata ──────────────────────────────────────────────────────────────
const GAMES = [
  { id: "jump", label: "점프점프", emoji: "🐰" },
  { id: "runner", label: "달리기", emoji: "🐱" },
  { id: "match", label: "짝맞추기", emoji: "🐻" },
  { id: "quiz", label: "퀴즈", emoji: "🦊" },
  { id: "dress", label: "꾸미기", emoji: "🐼" },
  { id: "fishing", label: "낚시왕", emoji: "🎣" },
  { id: "bubble", label: "버블팝", emoji: "🫧" },
  { id: "cooking", label: "요리사", emoji: "🍳" },
  { id: "rhythm", label: "리듬게임", emoji: "🎵" },
  { id: "tanghulu", label: "탕후루", emoji: "🍡" },
  { id: "tower", label: "블록쌓기", emoji: "🧱" },
  { id: "marble", label: "구슬굴리기", emoji: "🔮" },
  { id: "shooting", label: "슈팅", emoji: "🚀" },
] as const;

type GameId = (typeof GAMES)[number]["id"] | "all";

// ── Player metadata ────────────────────────────────────────────────────────────
const PLAYER_INFO: Record<string, { emoji: string; color: string }> = {
  승민: { emoji: "🤖", color: "bg-blue-200 text-blue-700" },
  건우: { emoji: "🩺", color: "bg-green-200 text-green-700" },
  강우: { emoji: "👨‍🍳", color: "bg-yellow-200 text-yellow-700" },
  수현: { emoji: "💃", color: "bg-pink-200 text-pink-700" },
  이현: { emoji: "👸", color: "bg-purple-200 text-purple-700" },
};

function getPlayerEmoji(name: string): string {
  return PLAYER_INFO[name]?.emoji ?? "🎮";
}

function getPlayerBadge(name: string): string {
  return PLAYER_INFO[name]?.color ?? "bg-gray-200 text-gray-700";
}

// ── Rank medal ─────────────────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl leading-none">🥇</span>;
  if (rank === 2) return <span className="text-2xl leading-none">🥈</span>;
  if (rank === 3) return <span className="text-2xl leading-none">🥉</span>;
  return (
    <span className="w-7 h-7 rounded-full bg-purple-100 text-purple-500 text-xs font-extrabold flex items-center justify-center">
      {rank}
    </span>
  );
}

// ── Format date ────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}/${dd}`;
  } catch {
    return "";
  }
}

// ── Score row ──────────────────────────────────────────────────────────────────
function ScoreRow({
  entry,
  rank,
  delay,
  showGame,
}: {
  entry: ScoreEntry;
  rank: number;
  delay: number;
  showGame?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const rowBg =
    rank === 1
      ? "bg-gradient-to-r from-yellow-50 to-amber-50 border-amber-200"
      : rank === 2
        ? "bg-gradient-to-r from-slate-50 to-gray-100 border-slate-200"
        : rank === 3
          ? "bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200"
          : "bg-white border-purple-100";

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-sm
        transition-all duration-500
        ${rowBg}
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Rank */}
      <div className="flex-shrink-0 w-8 flex items-center justify-center">
        <RankBadge rank={rank} />
      </div>

      {/* Player */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className="text-lg leading-none">{getPlayerEmoji(entry.playerName)}</span>
        <span
          className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${getPlayerBadge(entry.playerName)}`}
        >
          {entry.playerName}
        </span>
        {showGame && (
          <span className="text-[10px] text-gray-400 truncate">
            {GAMES.find((g) => g.id === entry.gameId)?.label ?? entry.gameId}
          </span>
        )}
      </div>

      {/* Score */}
      <div className="flex-shrink-0 text-right">
        <span className="text-sm font-extrabold text-purple-600 tabular-nums">
          {entry.score.toLocaleString()}
        </span>
        <span className="text-[10px] text-gray-400 ml-0.5">점</span>
      </div>

      {/* Date */}
      <div className="flex-shrink-0 text-[10px] text-gray-400 w-8 text-right tabular-nums">
        {formatDate(entry.date)}
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3">
      <span className="text-5xl animate-bounce">🎮</span>
      <p className="text-sm font-bold text-purple-400 text-center leading-relaxed">
        아직 기록이 없어요!
        <br />
        게임을 플레이해보세요~ 🎮
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RankingPage() {
  const [activeTab, setActiveTab] = useState<GameId>("all");
  const [rankings, setRankings] = useState<ScoreEntry[]>([]);
  const [listKey, setListKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchRankings = async () => {
      const entries =
        activeTab === "all"
          ? await getAllRankings()
          : await getGameRankings(activeTab);
      if (!cancelled) {
        setRankings(entries);
        setListKey((k) => k + 1);
      }
    };
    fetchRankings();
    return () => { cancelled = true; };
  }, [activeTab]);

  const tabs: { id: GameId; label: string; emoji: string }[] = [
    { id: "all", label: "전체", emoji: "🏆" },
    ...GAMES,
  ];

  return (
    <>
      <style>{`
        @keyframes title-pop {
          0% { transform: scale(0.8) rotate(-3deg); opacity: 0; }
          70% { transform: scale(1.08) rotate(1deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        .title-pop {
          animation: title-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .tab-scroll::-webkit-scrollbar { display: none; }
        .tab-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="min-h-screen flex flex-col items-center pb-10">
        {/* ── Header ── */}
        <div className="w-full max-w-md px-4 pt-6 pb-2">
          <div className="flex items-center justify-between mb-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs font-bold text-purple-400
                bg-white/70 rounded-full px-3 py-1.5 shadow-sm
                active:scale-95 transition-transform"
            >
              ← 홈으로
            </Link>
            <div className="w-16" />
          </div>

          <div className="text-center mb-5">
            <h1 className="text-3xl font-extrabold text-purple-600 title-pop tracking-tight">
              🏆 랭킹
            </h1>
            <p className="text-xs text-pink-400 font-semibold mt-1">
              누가 제일 잘하나~ 한번 볼까? ✨
            </p>
          </div>
        </div>

        {/* ── Tab navigation ── */}
        <div className="w-full max-w-md px-4 mb-4">
          <div className="tab-scroll flex gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-extrabold
                  transition-all duration-200 active:scale-95 shadow-sm
                  ${
                    activeTab === tab.id
                      ? "bg-purple-500 text-white shadow-purple-200 shadow-md scale-105"
                      : "bg-white/80 text-purple-400 border border-purple-100"
                  }`}
              >
                <span>{tab.emoji}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Rankings list ── */}
        <div className="w-full max-w-md px-4">
          {/* Game header card */}
          {activeTab !== "all" && (
            <div
              className="flex items-center gap-2 mb-3 px-4 py-2.5
              bg-gradient-to-r from-purple-100 to-pink-100
              rounded-2xl border border-purple-200 shadow-sm"
            >
              <span className="text-2xl">
                {GAMES.find((g) => g.id === activeTab)?.emoji}
              </span>
              <div>
                <p className="text-sm font-extrabold text-purple-700">
                  {GAMES.find((g) => g.id === activeTab)?.label}
                </p>
                <p className="text-[10px] text-purple-400">TOP 10 랭킹</p>
              </div>
            </div>
          )}

          {activeTab === "all" && (
            <div
              className="flex items-center gap-2 mb-3 px-4 py-2.5
              bg-gradient-to-r from-amber-100 to-yellow-100
              rounded-2xl border border-amber-200 shadow-sm"
            >
              <span className="text-2xl">🌟</span>
              <div>
                <p className="text-sm font-extrabold text-amber-700">
                  전체 랭킹
                </p>
                <p className="text-[10px] text-amber-400">
                  모든 게임 TOP 50
                </p>
              </div>
            </div>
          )}

          {/* Score list */}
          {rankings.length === 0 ? (
            <EmptyState />
          ) : (
            <div key={listKey} className="flex flex-col gap-2">
              {rankings.map((entry, i) => (
                <ScoreRow
                  key={`${entry.playerName}-${entry.gameId}-${entry.date}-${i}`}
                  entry={entry}
                  rank={i + 1}
                  delay={i * 60}
                  showGame={activeTab === "all"}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Footer decoration ── */}
        <div className="mt-10 text-center text-xs text-purple-300">
          <p className="font-semibold text-purple-400">
            승민 🤖 · 건우 🩺 · 강우 👨‍🍳 · 수현 💃 · 이현 👸
          </p>
          <p className="mt-1 text-[10px] text-pink-300">
            오늘도 최고 기록에 도전해봐요~! 🎵
          </p>
        </div>
      </div>
    </>
  );
}
