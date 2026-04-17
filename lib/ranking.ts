export interface ScoreEntry {
  playerName: string;
  score: number;
  date: string; // ISO date string
  gameId: string;
}

const STORAGE_KEY = "game-rankings";
const MAX_SCORES_PER_GAME = 100;

function loadAll(): ScoreEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ScoreEntry[];
  } catch {
    return [];
  }
}

function saveAll(entries: ScoreEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore storage errors
  }
}

export function saveScore(
  gameId: string,
  playerName: string,
  score: number
): void {
  const all = loadAll();
  const newEntry: ScoreEntry = {
    playerName,
    score,
    date: new Date().toISOString(),
    gameId,
  };

  all.push(newEntry);

  // Keep only top MAX_SCORES_PER_GAME scores per game
  const gameEntries = all
    .filter((e) => e.gameId === gameId)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SCORES_PER_GAME);

  const otherEntries = all.filter((e) => e.gameId !== gameId);

  saveAll([...otherEntries, ...gameEntries]);
}

export function getGameRankings(gameId: string): ScoreEntry[] {
  const all = loadAll();
  return all
    .filter((e) => e.gameId === gameId)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export function getAllRankings(): ScoreEntry[] {
  const all = loadAll();
  return all.sort((a, b) => b.score - a.score).slice(0, 50);
}

export function getPlayerBest(playerName: string): Record<string, number> {
  const all = loadAll();
  const playerEntries = all.filter((e) => e.playerName === playerName);
  const best: Record<string, number> = {};
  for (const entry of playerEntries) {
    if (!(entry.gameId in best) || entry.score > best[entry.gameId]) {
      best[entry.gameId] = entry.score;
    }
  }
  return best;
}

export function clearRankings(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
