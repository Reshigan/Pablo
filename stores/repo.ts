import { create } from 'zustand';

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  language: string | null;
  default_branch: string;
  updated_at: string;
  stargazers_count: number;
  fork: boolean;
}

export interface RepoFileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha: string;
  size: number;
  children?: RepoFileNode[];
  isLoading?: boolean;
  isLoaded?: boolean;
}

interface RepoState {
  // Available repos
  repos: GitHubRepo[];
  reposLoading: boolean;
  reposError: string | null;

  // Selected repo
  selectedRepo: GitHubRepo | null;
  selectedBranch: string;

  // File tree
  fileTree: RepoFileNode[];
  fileTreeLoading: boolean;
  fileTreeError: string | null;

  // Actions
  setRepos: (repos: GitHubRepo[]) => void;
  setReposLoading: (loading: boolean) => void;
  setReposError: (error: string | null) => void;
  selectRepo: (repo: GitHubRepo) => void;
  setSelectedBranch: (branch: string) => void;
  setFileTree: (tree: RepoFileNode[]) => void;
  setFileTreeLoading: (loading: boolean) => void;
  setFileTreeError: (error: string | null) => void;
  updateNodeChildren: (path: string, children: RepoFileNode[]) => void;
  setNodeLoading: (path: string, loading: boolean) => void;
  clearRepo: () => void;
}

function updateTreeNode(
  nodes: RepoFileNode[],
  targetPath: string,
  updater: (node: RepoFileNode) => RepoFileNode
): RepoFileNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return updater(node);
    }
    if (node.children) {
      return { ...node, children: updateTreeNode(node.children, targetPath, updater) };
    }
    return node;
  });
}

export const useRepoStore = create<RepoState>((set) => ({
  repos: [],
  reposLoading: false,
  reposError: null,
  selectedRepo: null,
  selectedBranch: 'main',
  fileTree: [],
  fileTreeLoading: false,
  fileTreeError: null,

  setRepos: (repos) => set({ repos }),
  setReposLoading: (loading) => set({ reposLoading: loading }),
  setReposError: (error) => set({ reposError: error }),

  selectRepo: (repo) =>
    set({
      selectedRepo: repo,
      selectedBranch: repo.default_branch,
      fileTree: [],
      fileTreeError: null,
    }),

  setSelectedBranch: (branch) => set({ selectedBranch: branch }),
  setFileTree: (tree) => set({ fileTree: tree }),
  setFileTreeLoading: (loading) => set({ fileTreeLoading: loading }),
  setFileTreeError: (error) => set({ fileTreeError: error }),

  updateNodeChildren: (path, children) =>
    set((state) => ({
      fileTree: updateTreeNode(state.fileTree, path, (node) => ({
        ...node,
        children,
        isLoaded: true,
        isLoading: false,
      })),
    })),

  setNodeLoading: (path, loading) =>
    set((state) => ({
      fileTree: updateTreeNode(state.fileTree, path, (node) => ({
        ...node,
        isLoading: loading,
      })),
    })),

  clearRepo: () =>
    set({
      selectedRepo: null,
      selectedBranch: 'main',
      fileTree: [],
      fileTreeError: null,
    }),
}));
