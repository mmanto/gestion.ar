/** Store de la demo UrbanVoice: singleton con persistencia en localStorage. */

import { useSyncExternalStore } from 'react';
import { seedDb } from './seed';
import type { DemoDb } from './types';

export const STORAGE_KEY = 'uv-admin-db';
export const STORAGE_VERSION = 1;
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

let db: DemoDb | null = null;
const listeners = new Set<() => void>();

function shapeOk(value: unknown): value is DemoDb {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<DemoDb>;
  return v.v === STORAGE_VERSION && Array.isArray(v.clubs) && v.clubs.length > 0 && Array.isArray(v.plans) && !!v.cfg && Array.isArray(v.pays);
}

export function loadDb(storage?: StorageLike): DemoDb {
  if (!storage) return seedDb();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return seedDb();
    const parsed: unknown = JSON.parse(raw);
    return shapeOk(parsed) ? parsed : seedDb();
  } catch {
    return seedDb();
  }
}

const browserStorage = (): StorageLike | undefined =>
  typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage;

export function getDb(): DemoDb {
  if (!db) db = loadDb(browserStorage());
  return db;
}

export function mutate(fn: (draft: DemoDb) => void): void {
  const next = structuredClone(getDb());
  fn(next);
  db = next;
  try {
    browserStorage()?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* sin storage: la sesión sigue en memoria */
  }
  listeners.forEach((listener) => listener());
}

export function useDemoDb(): DemoDb {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getDb,
    getDb,
  );
}
