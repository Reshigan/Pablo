/**
 * Feature 16: Secrets Vault (Environment Variables UI)
 * Manage .env / .dev.vars values injected into preview and deploy.
 * v7 Part 5: Hydrates from D1 on session load, persists changes back to D1.
 */

import { create } from 'zustand';

export interface SecretEntry {
  id: string;
  key: string;
  value: string;
  createdAt: number;
}

interface SecretsState {
  secrets: SecretEntry[];
  sessionId: string | null;
  hydrated: boolean;

  setSessionId: (sessionId: string) => void;
  hydrateFromD1: (sessionId: string) => Promise<void>;
  addSecret: (key: string, value: string) => void;
  updateSecret: (id: string, key: string, value: string) => void;
  removeSecret: (id: string) => void;
  getSecretValue: (key: string) => string | undefined;
  toEnvString: () => string;
}

let secretCounter = 0;

export const useSecretsStore = create<SecretsState>((set, get) => ({
  secrets: [],
  sessionId: null,
  hydrated: false,

  setSessionId: (sessionId) => set({ sessionId }),

  hydrateFromD1: async (sessionId: string) => {
    set({ sessionId });
    try {
      const res = await fetch(`/api/secrets?sessionId=${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        const data = (await res.json()) as {
          secrets: Array<{ id: string; key: string; value: string; createdAt: string }>;
        };
        const entries: SecretEntry[] = data.secrets.map((s) => ({
          id: s.id,
          key: s.key,
          value: s.value,
          createdAt: new Date(s.createdAt).getTime(),
        }));
        set({ secrets: entries, hydrated: true });
      }
    } catch {
      // D1 unavailable — keep local state
      set({ hydrated: true });
    }
  },

  addSecret: (key, value) => {
    secretCounter += 1;
    const entry: SecretEntry = {
      id: `secret-${Date.now()}-${secretCounter}`,
      key,
      value,
      createdAt: Date.now(),
    };
    set((state) => ({
      secrets: [...state.secrets, entry],
    }));

    // Persist to D1 in background
    const { sessionId } = get();
    if (sessionId) {
      fetch('/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, key, value }),
      }).catch(() => { /* non-blocking */ });
    }
  },

  updateSecret: (id, key, value) => {
    set((state) => ({
      secrets: state.secrets.map((s) =>
        s.id === id ? { ...s, key, value } : s
      ),
    }));

    // Persist to D1 in background
    const { sessionId } = get();
    if (sessionId) {
      fetch('/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, key, value }),
      }).catch(() => { /* non-blocking */ });
    }
  },

  removeSecret: (id) => {
    set((state) => ({
      secrets: state.secrets.filter((s) => s.id !== id),
    }));

    // Delete from D1 in background
    fetch(`/api/secrets?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch(() => { /* non-blocking */ });
  },

  getSecretValue: (key) => {
    return get().secrets.find((s) => s.key === key)?.value;
  },

  toEnvString: () => {
    return get()
      .secrets.map((s) => `${s.key}=${s.value}`)
      .join('\n');
  },
}));
