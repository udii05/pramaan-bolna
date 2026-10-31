import { promises as fs } from "node:fs";
import path from "node:path";
import type { DB } from "./types";
import { buildSeedDb } from "./seed-data";

const DB_PATH =
  process.env.PRAMAAN_DB_PATH ?? path.join(process.cwd(), "data", "db.json");

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function writeAtomic(db: DB): Promise<void> {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  try {
    await fs.rename(tmp, DB_PATH);
  } catch {
    await fs.rm(DB_PATH, { force: true });
    await fs.rename(tmp, DB_PATH);
  }
}

async function readUnlocked(): Promise<DB> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    return JSON.parse(raw) as DB;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      const db = await buildSeedDb();
      await writeAtomic(db);
      return db;
    }
    throw error;
  }
}

export async function readDb(): Promise<DB> {
  return enqueue(readUnlocked);
}

export async function mutateDb<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  return enqueue(async () => {
    const db = await readUnlocked();
    const result = await fn(db);
    await writeAtomic(db);
    return result;
  });
}

export async function resetDb(): Promise<DB> {
  return enqueue(async () => {
    const db = await buildSeedDb();
    await writeAtomic(db);
    return db;
  });
}

export function dbPath(): string {
  return DB_PATH;
}
