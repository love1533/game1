import Link from "next/link";

const games = [
  {
    name: "점프점프",
    description: "끝없이 올라가자! 🚀",
    href: "/games/jump",
    emoji: "🦘",
    color: "from-purple-400 to-pink-400",
    shadow: "shadow-purple-200",
  },
  {
    name: "캐릭터 달리기",
    description: "장애물을 피해 달려! 🏃‍♀️",
    href: "/games/runner",
    emoji: "💨",
    color: "from-blue-400 to-cyan-400",
    shadow: "shadow-blue-200",
  },
  {
    name: "짝맞추기",
    description: "같은 카드를 찾아라! 🃏",
    href: "/games/match",
    emoji: "🎴",
    color: "from-pink-400 to-rose-400",
    shadow: "shadow-pink-200",
  },
  {
    name: "퀴즈 대결",
    description: "OX 퀴즈에 도전! 🧠",
    href: "/games/quiz",
    emoji: "❓",
    color: "from-amber-400 to-orange-400",
    shadow: "shadow-amber-200",
  },
  {
    name: "꾸미기",
    description: "캐릭터를 예쁘게! 👗",
    href: "/games/dress",
    emoji: "✨",
    color: "from-green-400 to-emerald-400",
    shadow: "shadow-green-200",
  },
];

const characters = [
  { name: "수현", emoji: "😎", color: "bg-purple-400", desc: "용감한 리더!" },
  { name: "이현", emoji: "🤓", color: "bg-blue-400", desc: "똑똑한 두뇌파!" },
  { name: "은영", emoji: "🥰", color: "bg-pink-400", desc: "다정한 힐러!" },
  { name: "민구", emoji: "😜", color: "bg-green-400", desc: "장난꾸러기!" },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-6">
      {/* Title */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-purple-700 mb-1">
          🎮 미니게임 월드
        </h1>
        <p className="text-sm text-purple-500">우리들의 신나는 게임 모음!</p>
      </div>

      {/* Characters */}
      <div className="flex gap-3 mb-6">
        {characters.map((char) => (
          <div key={char.name} className="flex flex-col items-center">
            <div
              className={`w-14 h-14 ${char.color} rounded-full flex items-center justify-center text-2xl shadow-lg`}
            >
              {char.emoji}
            </div>
            <span className="text-xs font-bold text-gray-700 mt-1">
              {char.name}
            </span>
          </div>
        ))}
      </div>

      {/* Game Cards */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        {games.map((game) => (
          <Link
            key={game.name}
            href={game.href}
            className={`block rounded-2xl bg-gradient-to-r ${game.color} p-4 shadow-lg ${game.shadow}
              transform transition-all duration-200 active:scale-95 hover:scale-[1.02]`}
          >
            <div className="flex items-center gap-3">
              <span className="text-4xl">{game.emoji}</span>
              <div>
                <h2 className="text-lg font-bold text-white">{game.name}</h2>
                <p className="text-sm text-white/80">{game.description}</p>
              </div>
              <span className="ml-auto text-2xl text-white/60">▶</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-6 text-center text-xs text-purple-400">
        <p>수현 · 이현 · 은영 · 민구</p>
        <p>💜💙💗💚</p>
      </div>
    </div>
  );
}
