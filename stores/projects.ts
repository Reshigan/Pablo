/**
 * Phase 5: Projects Store — client-side state for project context system
 */
import { create } from 'zustand';

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  repoFullName: string | null;
  createdAt: string;
  updatedAt: string;
  sessionCount: number;
}

interface ProjectsState {
  projects: Project[];
  activeProjectId: string | null;
  isLoading: boolean;
  error: string | null;

  loadProjects: () => Promise<void>;
  createProject: (name: string, description?: string, repoFullName?: string) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<void>;
  setActiveProject: (id: string | null) => void;
  linkSession: (projectId: string, sessionId: string) => Promise<void>;
  unlinkSession: (projectId: string, sessionId: string) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  activeProjectId: null,
  isLoading: false,
  error: null,

  loadProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as { projects: Project[] };
      set({ projects: data.projects || [], isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to load projects' });
    }
  },

  createProject: async (name, description = '', repoFullName) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, repoFullName }),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as { project: Project };
      if (data.project) {
        set((state) => ({ projects: [{ ...data.project, sessionCount: 0 }, ...state.projects] }));
        return data.project;
      }
      return null;
    } catch {
      return null;
    }
  },

  deleteProject: async (id) => {
    try {
      await fetch(`/api/projects?id=${id}`, { method: 'DELETE' });
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
      }));
    } catch {
      // Non-blocking
    }
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  linkSession: async (projectId, sessionId) => {
    try {
      await fetch('/api/projects?action=link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sessionId }),
      });
      // Increment session count locally
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, sessionCount: p.sessionCount + 1 } : p,
        ),
      }));
    } catch {
      // Non-blocking
    }
  },

  unlinkSession: async (projectId, sessionId) => {
    try {
      await fetch('/api/projects?action=unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sessionId }),
      });
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, sessionCount: Math.max(0, p.sessionCount - 1) } : p,
        ),
      }));
    } catch {
      // Non-blocking
    }
  },
}));
