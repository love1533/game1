'use client';

import Link from "next/link";
import { useState, useEffect } from "react";
import { getGameRankings, type ScoreEntry } from "@/lib/ranking";

const GAMES_PER_PAGE = 4;

const games = [
  {
    id: "hospital",
    name: "병원놀이",
    desc: "귀여운 동물 환자를 치료해요!",
    href: "/games/hospital",
    emoji: "🏥",
    tag: "NEW",
    tagColor: "#EF4444",
    bg: "#FFF0F0",
    border: "#FFD4D4",
  },
  {
    id: "english",
    name: "영어 단어",
    desc: "영어 단어를 재미있게 배워요!",
    href: "/games/english",
    emoji: "🔤",
    tag: "학습",
    tagColor: "#3B82F6",
    bg: "#F0F4FF",
    border: "#D4DFFF",
  },
  {
    id: "math",
    name: "수학 천재",
    desc: "수학 문제를 풀고 천재가 되자!",
    href: "/games/math",
    emoji: "🧮",
    tag: "학습",
    tagColor: "#10B981",
    bg: "#F0FFF4",
    border: "#D1FAE5",
  },
  {
    id: "quiz",
    name: "퀴즈 대결",
    desc: "OX 퀴즈로 상식을 넓혀봐!",
    href: "/games/quiz",
    emoji: "🦊",
    tag: "인기",
    tagColor: "#F59E0B",
    bg: "#FFFBF0",
    border: "#FDE68A",
  },
  {
    id: "match",
    name: "짝맞추기",
    desc: "같은 그림을 찾아 기억력 UP!",
    href: "/games/match",
    emoji: "🧠",
    bg: "#F0F9FF",
    border: "#BAE6FD",
  },
  {
    id: "jump",
    name: "점프점프",
    desc: "끝없이 올라가는 점프 게임!",
    href: "/games/jump",
    emoji: "🐰",
    bg: "#FDF4FF",
    border: "#F0ABFC",
  },
  {
    id: "shooting",
    name: "슈팅",
    desc: "우주에서 적을 물리쳐라!",
    href: "/games/shooting",
    emoji: "🚀",
    bg: "#EFF6FF",
    border: "#BFDBFE",
  },
  {
    id: "bubble",
    name: "버블팝",
    desc: "같은 색 버블을 터뜨려봐!",
    href: "/games/bubble",
    emoji: "🫧",
    bg: "#F0FDFA",
    border: "#A7F3D0",
  },
  {
    id: "tower",
    name: "블록쌓기",
    desc: "3D 블록을 높이 쌓아봐!",
    href: "/games/tower",
    emoji: "🧱",
    bg: "#FFFBEB",
    border: "#FDE68A",
  },
  {
    id: "cooking",
    name: "요리사",
    desc: "레시피대로 요리를 만들어봐!",
    href: "/games/cooking",
    emoji: "🍳",
    bg: "#FFF7ED",
    border: "#FED7AA",
  },
  {
    id: "rhythm",
    name: "리듬게임",
    desc: "K-POP에 맞춰 리듬을 타봐!",
    href: "/games/rhythm",
    emoji: "🎵",
    bg: "#FDF4FF",
    border: "#E9D5FF",
  },
  {
    id: "tanghulu",
    name: "탕후루",
    desc: "달콤한 탕후루를 직접 만들어봐!",
    href: "/games/tanghulu",
    emoji: "🍡",
    bg: "#FFF0F6",
    border: "#FBCFE8",
  },
];

const characters = [
  { name: "승민", emoji: "🤖" },
  { name: "건우", emoji: "🩺" },
  { name: "강우", emoji: "👨‍🍳" },
  { name: "수현", emoji: "💃" },
  { name: "이현", emoji: "👸" },
  { name: "준영", emoji: "📚" },
  { name: "준우", emoji: "✈️" },
];

const PLAYER_EMOJI: Record<string, string> = {
  승민: "🤖", 건우: "🩺", "강우": "👨‍🍳",
  수현: "💃", 이현: "👸", 준영: "📚", 준우: "✈️",
  의사선생님: "👩‍⚕️",
};

export default function Home() {
  const [page, setPage] = useState(0);
  const [topScores, setTopScores] = useState<Record<string, ScoreEntry | null>>({});

  const totalPages = Math.ceil(games.length / GAMES_PER_PAGE);
  const pagedGames = games.slice(page * GAMES_PER_PAGE, (page + 1) * GAMES_PER_PAGE);

  // Fetch top scores for all games
  useEffect(() => {
    async function fetchTopScores() {
      const results: Record<string, ScoreEntry | null> = {};
      for (const game of games) {
        try {
          const rankings = await getGameRankings(game.id);
          results[game.id] = rankings.length > 0 ? rankings[0] : null;
        } catch {
          results[game.id] = null;
        }
      }
      setTopScores(results);
    }
    fetchTopScores();
  }, []);

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col">
      {/* Header */}
      <header className="bg-white px-5 pt-12 pb-5 border-b border-[#F2F3F5]">
        <h1 className="text-[24px] font-extrabold text-[#1B1D1F] tracking-tight">
          🎮 미니게임월드
        </h1>
        <p className="text-[14px] text-[#8B95A1] mt-1">
          놀면서 배우는 게임 모음
        </p>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 flex flex-col gap-3">
        {/* Top row: Characters + Ranking */}
        <div className="flex gap-3">
          <div className="flex-1 bg-white rounded-2xl p-3.5 border border-[#F2F3F5]">
            <p className="text-[11px] font-semibold text-[#8B95A1] mb-2">우리 친구들</p>
            <div className="flex gap-1 justify-center flex-wrap">
              {characters.map((c) => (
                <div key={c.name} className="flex flex-col items-center w-9">
                  <div className="w-8 h-8 rounded-full bg-[#F7F8FA] border border-[#EAECEF] flex items-center justify-center text-base">
                    {c.emoji}
                  </div>
                  <span className="text-[8px] text-[#8B95A1] mt-0.5">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
          <Link
            href="/ranking"
            className="flex flex-col items-center justify-center bg-white rounded-2xl px-5 border border-[#F2F3F5] active:scale-95 transition-transform"
          >
            <span className="text-3xl mb-1">🏆</span>
            <span className="text-[12px] font-bold text-[#1B1D1F]">랭킹</span>
          </Link>
        </div>

        {/* Page indicator */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[12px] font-semibold text-[#8B95A1]">
            게임 {page * GAMES_PER_PAGE + 1}~{Math.min((page + 1) * GAMES_PER_PAGE, games.length)} / {games.length}
          </span>
          <div className="flex gap-1.5">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className="transition-all duration-200"
                style={{
                  width: page === i ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: page === i ? "#667eea" : "#D1D5DB",
                }}
              />
            ))}
          </div>
        </div>

        {/* Game Cards - BIG, one per row */}
        {pagedGames.map((game) => {
          const top = topScores[game.id];
          return (
            <Link
              key={game.id}
              href={game.href}
              className="flex items-center gap-4 bg-white rounded-3xl p-5 border-2 active:scale-[0.97] transition-all duration-150"
              style={{
                borderColor: game.border || "#F2F3F5",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                minHeight: 110,
              }}
            >
              {/* Emoji icon - large */}
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-5xl flex-shrink-0"
                style={{ backgroundColor: game.bg }}
              >
                {game.emoji}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[18px] font-extrabold text-[#1B1D1F]">
                    {game.name}
                  </span>
                  {game.tag && (
                    <span
                      className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: game.tagColor }}
                    >
                      {game.tag}
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-[#6B7280] leading-snug">
                  {game.desc}
                </p>

                {/* Top score */}
                {top && (
                  <div className="flex items-center gap-1.5 mt-2 bg-[#F9FAFB] rounded-lg px-2.5 py-1.5 w-fit">
                    <span className="text-sm">👑</span>
                    <span className="text-[11px] font-bold text-[#F59E0B]">
                      {PLAYER_EMOJI[top.playerName] || "🎮"} {top.playerName}
                    </span>
                    <span className="text-[11px] text-[#9CA3AF]">
                      {top.score.toLocaleString()}점
                    </span>
                  </div>
                )}
              </div>

              {/* Arrow */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                <path d="M9 5L16 12L9 19" stroke="#D1D5DB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          );
        })}

        {/* Pagination buttons */}
        <div className="flex gap-3 mt-1">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="flex-1 py-3.5 rounded-2xl text-[15px] font-bold transition-all active:scale-95 disabled:opacity-30 disabled:active:scale-100"
            style={{
              backgroundColor: page === 0 ? "#F3F4F6" : "#fff",
              color: page === 0 ? "#9CA3AF" : "#1B1D1F",
              border: "1px solid #E5E7EB",
            }}
          >
            ← 이전
          </button>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="flex-1 py-3.5 rounded-2xl text-[15px] font-bold text-white transition-all active:scale-95 disabled:opacity-30 disabled:active:scale-100"
            style={{
              backgroundColor: page >= totalPages - 1 ? "#D1D5DB" : "#667eea",
            }}
          >
            다음 →
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-[11px] text-[#C4C8CC]">
        <p>{characters.map((c) => `${c.emoji} ${c.name}`).join("  ")}</p>
        <p className="mt-1">미니게임월드 © 2025</p>
      </footer>
    </div>
  );
}
