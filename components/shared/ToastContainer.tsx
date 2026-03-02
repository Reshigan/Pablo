'use client';

import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useToastStore, type ToastType } from '@/stores/toast';
import { useEffect, useState } from 'react';

const TOAST_ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_COLORS: Record<ToastType, string> = {
  success: 'border-pablo-green/30 bg-pablo-green/5',
  error: 'border-pablo-red/30 bg-pablo-red/5',
  warning: 'border-pablo-orange/30 bg-pablo-orange/5',
  info: 'border-pablo-blue/30 bg-pablo-blue/5',
};

const TOAST_ICON_COLORS: Record<ToastType, string> = {
  success: 'text-pablo-green',
  error: 'text-pablo-red',
  warning: 'text-pablo-orange',
  info: 'text-pablo-blue',
};

function ToastItem({ id, type, title, message }: { id: string; type: ToastType; title: string; message?: string }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const Icon = TOAST_ICONS[type];

  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 shadow-lg transition-all duration-300 ${
        TOAST_COLORS[type]
      } ${visible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}
    >
      <Icon size={16} className={`mt-0.5 shrink-0 ${TOAST_ICON_COLORS[type]}`} />
      <div className="flex-1 min-w-0">
        <p className="font-ui text-xs font-medium text-pablo-text">{title}</p>
        {message && (
          <p className="mt-0.5 font-ui text-[11px] text-pablo-text-dim">{message}</p>
        )}
      </div>
      <button
        onClick={() => removeToast(id)}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors hover:bg-pablo-hover"
      >
        <X size={10} className="text-pablo-text-muted" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-8 right-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          type={toast.type}
          title={toast.title}
          message={toast.message}
        />
      ))}
    </div>
  );
}
