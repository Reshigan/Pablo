/**
 * D1-backed secrets CRUD operations.
 * SEC-02: secrets are encrypted at rest using AES-256-GCM.
 * Falls back gracefully if D1 is unavailable (local dev).
 */

import { getD1 } from './drizzle';
import { secrets } from './schema';
import { eq, and } from 'drizzle-orm';
import { generateId } from './queries';

// ─── SEC-02: AES-256-GCM encryption helpers ──────────────────────────────────

function getEncryptionKey(): string {
  const key = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!key) {
    throw new Error(
      '[SEC-02] AUTH_SECRET or NEXTAUTH_SECRET is required for secret encryption. ' +
      'Set it via: echo "your-secret" | npx wrangler secret put AUTH_SECRET'
    );
  }
  if (key.length < 32) {
    throw new Error('[SEC-02] AUTH_SECRET must be at least 32 characters');
  }
  return key;
}

async function deriveKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  // SEC-02: derive salt from AUTH_SECRET so each deployment uses a unique salt
  const saltSource = await crypto.subtle.digest('SHA-256', enc.encode(password));
  const salt = new Uint8Array(saltSource).slice(0, 16);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptValue(plaintext: string): Promise<string> {
  const key = await deriveKey(getEncryptionKey());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  // Store as base64: iv:ciphertext
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  return `enc:${ivB64}:${ctB64}`;
}

async function decryptValue(stored: string): Promise<string> {
  // If not encrypted (legacy), return as-is
  if (!stored.startsWith('enc:')) return stored;
  const [, ivB64, ctB64] = stored.split(':');
  const key = await deriveKey(getEncryptionKey());
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

export interface D1Secret {
  id: string;
  sessionId: string | null;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get a single secret by ID (for ownership verification).
 */
export async function d1GetSecretById(id: string): Promise<D1Secret | null> {
  const d1 = await getD1();
  if (d1) {
    const rows = await d1
      .select()
      .from(secrets)
      .where(eq(secrets.id, id));
    if (rows.length === 0) return null;
    const row = rows[0] as unknown as D1Secret;
    // Skip decryption — this function is only used for ownership verification
    return { ...row, value: '[redacted]' };
  }
  return null;
}

/**
 * List all secrets for a session from D1.
 */
export async function d1ListSecrets(sessionId: string): Promise<D1Secret[]> {
  const d1 = await getD1();
  if (d1) {
    const rows = await d1
      .select()
      .from(secrets)
      .where(eq(secrets.sessionId, sessionId));
    // SEC-02: decrypt values before returning
    const decrypted = await Promise.all(
      (rows as unknown as D1Secret[]).map(async (r) => ({ ...r, value: await decryptValue(r.value) })),
    );
    return decrypted;
  }
  return [];
}

/**
 * Create or upsert a secret in D1.
 * If a secret with the same key+session exists, update it.
 */
export async function d1UpsertSecret(
  sessionId: string,
  key: string,
  value: string,
): Promise<D1Secret> {
  const d1 = await getD1();
  const now = new Date().toISOString();

  if (d1) {
    // Check if secret already exists for this session+key
    const existing = await d1
      .select()
      .from(secrets)
      .where(and(eq(secrets.sessionId, sessionId), eq(secrets.key, key)));

    if (existing.length > 0) {
      // Update existing — SEC-02: encrypt before storing
      const encValue = await encryptValue(value);
      await d1
        .update(secrets)
        .set({ value: encValue, updatedAt: now })
        .where(eq(secrets.id, existing[0].id));

      // Return plaintext value (not the encrypted DB row)
      return { ...(existing[0] as unknown as D1Secret), value, updatedAt: now };
    }

    // Create new — SEC-02: encrypt before storing
    const id = generateId('sec');
    const encValue = await encryptValue(value);
    await d1.insert(secrets).values({
      id,
      sessionId,
      key,
      value: encValue,
      createdAt: now,
      updatedAt: now,
    });

    return { id, sessionId, key, value, createdAt: now, updatedAt: now };
  }

  // Fallback for local dev
  return {
    id: generateId('sec'),
    sessionId,
    key,
    value,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Delete a secret from D1 by ID.
 */
export async function d1DeleteSecret(id: string): Promise<boolean> {
  const d1 = await getD1();
  if (d1) {
    const existing = await d1
      .select({ id: secrets.id })
      .from(secrets)
      .where(eq(secrets.id, id));
    if (existing.length === 0) return false;
    await d1.delete(secrets).where(eq(secrets.id, id));
    return true;
  }
  return false;
}

/**
 * Delete all secrets for a session.
 */
export async function d1DeleteSessionSecrets(sessionId: string): Promise<number> {
  const d1 = await getD1();
  if (d1) {
    const existing = await d1
      .select({ id: secrets.id })
      .from(secrets)
      .where(eq(secrets.sessionId, sessionId));
    if (existing.length > 0) {
      await d1.delete(secrets).where(eq(secrets.sessionId, sessionId));
    }
    return existing.length;
  }
  return 0;
}
