/**
 * Feature 16: Secrets Vault (Environment Variables UI)
 * Manage .env / .dev.vars values injected into preview and deploy.
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

  addSecret: (key: string, value: string) => void;
  updateSecret: (id: string, key: string, value: string) => void;
  removeSecret: (id: string) => void;
  getSecretValue: (key: string) => string | undefined;
  toEnvString: () => string;
}

let secretCounter = 0;

export const useSecretsStore = create<SecretsState>((set, get) => ({
  secrets: [],

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
  },

  updateSecret: (id, key, value) => {
    set((state) => ({
      secrets: state.secrets.map((s) =>
        s.id === id ? { ...s, key, value } : s
      ),
    }));
  },

  removeSecret: (id) => {
    set((state) => ({
      secrets: state.secrets.filter((s) => s.id !== id),
    }));
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
