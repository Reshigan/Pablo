'use client';

/**
 * Feature 16: Secrets Vault (Environment Variables UI)
 * Key-value editor for managing environment secrets.
 */

import { Key, Eye, EyeOff, Trash2, Plus } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useSecretsStore } from '@/stores/secrets';
import { toast } from '@/stores/toast';

export function SecretsPanel() {
  const { secrets, addSecret, updateSecret, removeSecret } = useSecretsStore();
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());

  const toggleVisibility = useCallback((id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAdd = useCallback(() => {
    if (!newKey.trim()) return;
    addSecret(newKey.trim(), newValue);
    toast('Secret added', newKey.trim());
    setNewKey('');
    setNewValue('');
  }, [newKey, newValue, addSecret]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-pablo-border px-3 py-2 shrink-0">
        <Key size={14} className="text-pablo-gold" />
        <span className="font-ui text-xs font-medium text-pablo-text">Secrets Vault</span>
      </div>

      {/* Secret list */}
      <div className="flex-1 overflow-y-auto">
        {secrets.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Key size={24} className="text-pablo-text-muted" />
            <p className="font-ui text-xs text-pablo-text-muted">No secrets configured</p>
            <p className="font-ui text-[10px] text-pablo-text-muted">
              Add environment variables for your preview and deploy
            </p>
          </div>
        ) : (
          <div className="py-1">
            {secrets.map((secret) => (
              <div
                key={secret.id}
                className="flex items-center gap-1.5 border-b border-pablo-border/50 px-3 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={secret.key}
                    onChange={(e) => updateSecret(secret.id, e.target.value, secret.value)}
                    className="w-full bg-transparent font-code text-[11px] font-medium text-pablo-gold outline-none"
                    placeholder="KEY"
                  />
                  <input
                    type={visibleIds.has(secret.id) ? 'text' : 'password'}
                    value={secret.value}
                    onChange={(e) => updateSecret(secret.id, secret.key, e.target.value)}
                    className="w-full bg-transparent font-code text-[11px] text-pablo-text-dim outline-none"
                    placeholder="value"
                  />
                </div>
                <button
                  onClick={() => toggleVisibility(secret.id)}
                  className="flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover"
                >
                  {visibleIds.has(secret.id) ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
                <button
                  onClick={() => removeSecret(secret.id)}
                  className="flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-red"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add new secret */}
      <div className="border-t border-pablo-border px-3 py-2 shrink-0">
        <div className="flex flex-col gap-1">
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.toUpperCase())}
            placeholder="KEY_NAME"
            className="w-full rounded border border-pablo-border bg-pablo-input px-2 py-1 font-code text-[11px] text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
          />
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            className="w-full rounded border border-pablo-border bg-pablo-input px-2 py-1 font-code text-[11px] text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
          />
          <button
            onClick={handleAdd}
            disabled={!newKey.trim()}
            className="flex w-full items-center justify-center gap-1.5 rounded bg-pablo-gold/10 px-2 py-1 font-ui text-[10px] text-pablo-gold transition-colors hover:bg-pablo-gold/20 disabled:opacity-30"
          >
            <Plus size={10} />
            Add Secret
          </button>
        </div>
      </div>
    </div>
  );
}
