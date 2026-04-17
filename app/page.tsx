import Link from "next/link";

const games = [
  {
    name: "점프점프",
    description: "폴짝폴짝! 하늘까지 올라가자~ 🌙",
    href: "/games/jump",
    emoji: "🐰",
    color: "from-purple-200 to-pink-200",
    shadow: "shadow-purple-100",
  },
  {
    name: "캐릭터 달리기",
    description: "냥냥~ 장애물을 훌쩍 넘어라! 🍀",
    href: "/games/runner",
    emoji: "🐱",
    color: "from-blue-200 to-cyan-200",
    shadow: "shadow-blue-100",
  },
  {
    name: "짝맞추기",
    description: "어디 있을까? 짝꿍을 찾아줘! 🌸",
    href: "/games/match",
    emoji: "🐻",
    color: "from-pink-200 to-rose-200",
    shadow: "shadow-pink-100",
  },
  {
    name: "퀴즈 대결",
    description: "오! 정답은 뭘까? 같이 맞혀봐~ 💡",
    href: "/games/quiz",
    emoji: "🦊",
    color: "from-amber-200 to-orange-200",
    shadow: "shadow-amber-100",
  },
  {
    name: "꾸미기",
    description: "반짝반짝~ 나만의 스타일로 꾸며봐! 🎀",
    href: "/games/dress",
    emoji: "🐼",
    color: "from-green-200 to-emerald-200",
    shadow: "shadow-green-100",
  },
  {
    name: "낚시왕",
    description: "찰랑찰랑~ 물고기를 낚아올려라! 🌊",
    href: "/games/fishing",
    emoji: "🎣",
    color: "from-sky-200 to-blue-200",
    shadow: "shadow-sky-100",
  },
  {
    name: "버블팝",
    description: "팡팡팡! 방울을 터뜨려봐! ✨",
    href: "/games/bubble",
    emoji: "🫧",
    color: "from-violet-200 to-purple-200",
    shadow: "shadow-violet-100",
  },
  {
    name: "요리사",
    description: "냠냠~ 맛있는 요리를 만들어봐! 🍽️",
    href: "/games/cooking",
    emoji: "🍳",
    color: "from-yellow-200 to-amber-200",
    shadow: "shadow-yellow-100",
  },
  {
    name: "리듬게임",
    description: "두둠칫~ 리듬에 맞춰 신나게 춰봐! 🎶",
    href: "/games/rhythm",
    emoji: "🎵",
    color: "from-fuchsia-200 to-pink-200",
    shadow: "shadow-fuchsia-100",
  },
  {
    name: "탕후루",
    description: "달콤달콤~ 예쁜 탕후루를 만들어봐! 🍬",
    href: "/games/tanghulu",
    emoji: "🍡",
    color: "from-red-200 to-rose-200",
    shadow: "shadow-red-100",
  },
  {
    name: "슈팅",
    description: "펑펑! 적을 물리쳐라! 💥",
    href: "/games/shooting",
    emoji: "🔫",
    color: "from-slate-200 to-blue-200",
    shadow: "shadow-slate-100",
  },
  {
    name: "블록쌓기",
    description: "높이높이 쌓아올려봐! 🏗️",
    href: "/games/tower",
    emoji: "🧱",
    color: "from-orange-200 to-red-200",
    shadow: "shadow-orange-100",
  },
  {
    name: "구슬굴리기",
    description: "데굴데굴 굴려서 골인! 🎯",
    href: "/games/marble",
    emoji: "🔮",
    color: "from-teal-200 to-cyan-200",
    shadow: "shadow-teal-100",
  },
];

const characters = [
  { name: "승민", emoji: "🤖", color: "bg-blue-300", desc: "AI과학자 꿈나무!" },
  { name: "건우", emoji: "🩺", color: "bg-emerald-300", desc: "미래의 의사!" },
  { name: "강우", emoji: "👨‍🍳", color: "bg-amber-300", desc: "요리왕 꿈나무!" },
  { name: "수현", emoji: "💃", color: "bg-pink-300", desc: "13살 멋쟁이!" },
  { name: "이현", emoji: "👸", color: "bg-rose-300", desc: "7살 공주님!" },
];

const decorations = [
  { symbol: "⭐", top: "4%", left: "4%", delay: "0s", size: "text-lg" },
  { symbol: "💛", top: "9%", left: "84%", delay: "0.4s", size: "text-base" },
  { symbol: "🌸", top: "20%", left: "91%", delay: "0.8s", size: "text-sm" },
  { symbol: "✨", top: "34%", left: "2%", delay: "1.2s", size: "text-base" },
  { symbol: "💜", top: "50%", left: "89%", delay: "0.6s", size: "text-sm" },
  { symbol: "🌟", top: "65%", left: "5%", delay: "1.0s", size: "text-lg" },
  { symbol: "💕", top: "78%", left: "87%", delay: "0.2s", size: "text-base" },
  { symbol: "🍭", top: "88%", left: "10%", delay: "1.4s", size: "text-sm" },
  { symbol: "🎀", top: "15%", left: "50%", delay: "0.9s", size: "text-xs" },
  { symbol: "🌈", top: "72%", left: "45%", delay: "1.6s", size: "text-xs" },
];

export default function Home() {
  return (
    <>
      <style>{`
        @keyframes bounce-title {
          0%, 100% { transform: translateY(0px) rotate(-1deg); }
          50% { transform: translateY(-8px) rotate(1deg); }
        }
        @keyframes float-char {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-6px) scale(1.05); }
        }
        @keyframes float-deco {
          0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0.7; }
          50% { transform: translateY(-10px) rotate(15deg); opacity: 1; }
        }
        @keyframes pulse-ranking {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 15px rgba(251,191,36,0.4); }
          50% { transform: scale(1.04); box-shadow: 0 6px 20px rgba(251,191,36,0.7); }
        }
        .title-bounce {
          animation: bounce-title 2.4s ease-in-out infinite;
          display: inline-block;
        }
        .char-float {
          animation: float-char 2s ease-in-out infinite;
        }
        .char-float:nth-child(2) { animation-delay: 0.3s; }
        .char-float:nth-child(3) { animation-delay: 0.6s; }
        .char-float:nth-child(4) { animation-delay: 0.9s; }
        .char-float:nth-child(5) { animation-delay: 1.2s; }
        .deco-float {
          animation: float-deco 3s ease-in-out infinite;
          position: fixed;
          pointer-events: none;
          user-select: none;
          z-index: 0;
        }
        .ranking-pulse {
          animation: pulse-ranking 2s ease-in-out infinite;
        }
      `}</style>

      {/* Decorative floating elements */}
      {decorations.map((d, i) => (
        <span
          key={i}
          className={`deco-float ${d.size}`}
          style={{ top: d.top, left: d.left, animationDelay: d.delay }}
        >
          {d.symbol}
        </span>
      ))}

      <div className="min-h-screen flex flex-col items-center px-4 py-6 relative z-10">
        {/* Title */}
        <div className="text-center mb-4">
          <h1 className="text-3xl font-extrabold text-purple-600 mb-1 tracking-tight">
            <span className="title-bounce inline-block">🎮 미니게임 월드</span>
          </h1>
          <p className="text-sm font-semibold text-pink-400 mt-1">
            함께 놀자! 🌈
          </p>
          <p className="text-xs text-purple-400 mt-0.5">
            우리들의 신나는 게임 모음~! 🎵
          </p>
        </div>

        {/* Ranking Button */}
        <Link
          href="/ranking"
          className="ranking-pulse mb-5 inline-flex items-center gap-2 px-6 py-2.5 rounded-full
            bg-gradient-to-r from-yellow-300 to-amber-400
            text-white font-extrabold text-sm shadow-lg
            border-2 border-yellow-200
            active:scale-95 transition-transform duration-150"
        >
          🏆 랭킹 보기
        </Link>

        {/* Characters */}
        <div className="flex gap-3 mb-7 flex-wrap justify-center">
          {characters.map((char, i) => (
            <div
              key={char.name}
              className="flex flex-col items-center char-float"
              style={{ animationDelay: `${i * 0.3}s` }}
            >
              <div
                className={`w-14 h-14 ${char.color} rounded-full flex items-center justify-center text-2xl shadow-md border-2 border-white`}
              >
                {char.emoji}
              </div>
              <span className="text-xs font-bold text-gray-600 mt-1">
                {char.name}
              </span>
              <span className="text-[9px] text-gray-400 text-center leading-tight max-w-[56px]">
                {char.desc}
              </span>
            </div>
          ))}
        </div>

        {/* Game Cards — 2-column grid */}
        <div className="w-full max-w-sm grid grid-cols-2 gap-3">
          {games.map((game) => (
            <Link
              key={game.name}
              href={game.href}
              className={`block rounded-2xl bg-gradient-to-br ${game.color} p-3 shadow-lg ${game.shadow}
                border border-white/60
                transform transition-all duration-200 active:scale-95 hover:scale-[1.03] hover:shadow-xl`}
            >
              <div className="flex flex-col items-center text-center gap-1">
                <span className="text-3xl drop-shadow-sm leading-none">
                  {game.emoji}
                </span>
                <h2 className="text-xs font-extrabold text-gray-700 leading-tight mt-0.5">
                  {game.name}
                </h2>
                <p className="text-[9px] text-gray-500 leading-tight line-clamp-2">
                  {game.description}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-purple-300">
          <p className="font-semibold text-purple-400">
            승민 · 건우 · 강우 · 수현 · 이현
          </p>
          <p className="mt-0.5">💙💚🧡💗💖</p>
          <p className="mt-1 text-[10px] text-pink-300">
            오늘도 신나게 놀아요~! 🌟
          </p>
        </div>
      </div>
    </>
  );
}
