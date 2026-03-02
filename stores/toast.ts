import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

let toastCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (toast) => {
    toastCounter += 1;
    const id = `toast-${Date.now()}-${toastCounter}`;
    const newToast: Toast = {
      ...toast,
      id,
      createdAt: Date.now(),
    };

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));

    // Auto-remove after duration
    if (toast.duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, toast.duration);
    }

    return id;
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  clearAll: () => set({ toasts: [] }),
}));

// Convenience functions
export function toast(title: string, message?: string): string {
  return useToastStore.getState().addToast({ type: 'info', title, message, duration: 4000 });
}

export function toastSuccess(title: string, message?: string): string {
  return useToastStore.getState().addToast({ type: 'success', title, message, duration: 4000 });
}

export function toastError(title: string, message?: string): string {
  return useToastStore.getState().addToast({ type: 'error', title, message, duration: 6000 });
}

export function toastWarning(title: string, message?: string): string {
  return useToastStore.getState().addToast({ type: 'warning', title, message, duration: 5000 });
}
