import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export interface ScoreEntry {
  playerName: string;
  score: number;
  date: string; // ISO date string
  gameId: string;
}

const COLLECTION = "rankings";

// ── Save: write to Firestore (fire-and-forget) + localStorage backup ──────────

export function saveScore(
  gameId: string,
  playerName: string,
  score: number
): void {
  const entry: ScoreEntry = {
    playerName,
    score,
    date: new Date().toISOString(),
    gameId,
  };

  // 1) Firestore (async, fire-and-forget – never blocks the game)
  addDoc(collection(db, COLLECTION), {
    ...entry,
    createdAt: serverTimestamp(),
  }).catch((err) => console.warn("Firestore save failed:", err));

  // 2) localStorage fallback (keeps working offline)
  _localSave(entry);
}

// ── Read: always from Firestore (async) ───────────────────────────────────────

export async function getGameRankings(gameId: string): Promise<ScoreEntry[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where("gameId", "==", gameId),
      orderBy("score", "desc"),
      limit(10)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        playerName: data.playerName,
        score: data.score,
        date: data.date,
        gameId: data.gameId,
      } as ScoreEntry;
    });
  } catch (err) {
    console.warn("Firestore read failed, falling back to localStorage:", err);
    return _localGetGame(gameId);
  }
}

export async function getAllRankings(): Promise<ScoreEntry[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      orderBy("score", "desc"),
      limit(50)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        playerName: data.playerName,
        score: data.score,
        date: data.date,
        gameId: data.gameId,
      } as ScoreEntry;
    });
  } catch (err) {
    console.warn("Firestore read failed, falling back to localStorage:", err);
    return _localGetAll();
  }
}

export async function getPlayerBest(
  playerName: string
): Promise<Record<string, number>> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where("playerName", "==", playerName),
      orderBy("score", "desc"),
      limit(200)
    );
    const snap = await getDocs(q);
    const best: Record<string, number> = {};
    for (const doc of snap.docs) {
      const d = doc.data();
      if (!(d.gameId in best) || d.score > best[d.gameId]) {
        best[d.gameId] = d.score;
      }
    }
    return best;
  } catch (err) {
    console.warn("Firestore read failed, falling back to localStorage:", err);
    return _localGetPlayerBest(playerName);
  }
}

export function clearRankings(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("game-rankings");
  // NOTE: Firestore clear requires admin SDK – skip for now
}

// ── localStorage helpers (offline fallback) ───────────────────────────────────

const STORAGE_KEY = "game-rankings";
const MAX_PER_GAME = 100;

function _localLoadAll(): ScoreEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ScoreEntry[];
  } catch {
    return [];
  }
}

function _localSaveAll(entries: ScoreEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

function _localSave(entry: ScoreEntry): void {
  const all = _localLoadAll();
  all.push(entry);
  const game = all
    .filter((e) => e.gameId === entry.gameId)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PER_GAME);
  const others = all.filter((e) => e.gameId !== entry.gameId);
  _localSaveAll([...others, ...game]);
}

function _localGetGame(gameId: string): ScoreEntry[] {
  return _localLoadAll()
    .filter((e) => e.gameId === gameId)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function _localGetAll(): ScoreEntry[] {
  return _localLoadAll()
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
}

function _localGetPlayerBest(playerName: string): Record<string, number> {
  const all = _localLoadAll().filter((e) => e.playerName === playerName);
  const best: Record<string, number> = {};
  for (const entry of all) {
    if (!(entry.gameId in best) || entry.score > best[entry.gameId]) {
      best[entry.gameId] = entry.score;
    }
  }
  return best;
}
