// lib/agents/toolSystem.ts
// Tool execution system: file ops, search, grep, shell commands
// Devin pattern: use tools to interact with the codebase and environment

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Array<{ name: string; type: string; required: boolean; description: string }>;
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

// ─── File Operations ─────────────────────────────────────────────────

/**
 * Read a file from the GitHub repo via API
 */
export async function readFile(repo: string, path: string, branch: string): Promise<ToolResult> {
  try {
    const response = await fetch(`/api/github/contents?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}&branch=${encodeURIComponent(branch)}`);
    if (!response.ok) {
      return { success: false, output: '', error: `Failed to read ${path}: ${response.status}` };
    }
    const data = (await response.json()) as { content?: string; encoding?: string };
    if (data.content && data.encoding === 'base64') {
      const decoded = atob(data.content);
      return { success: true, output: decoded, metadata: { path, size: decoded.length } };
    }
    return { success: false, output: '', error: 'File content not available' };
  } catch (error) {
    return { success: false, output: '', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Write/create a file in the GitHub repo via API
 */
export async function writeFile(
  repo: string,
  path: string,
  content: string,
  branch: string,
  message?: string,
): Promise<ToolResult> {
  try {
    const response = await fetch('/api/github/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo,
        path,
        content,
        message: message || `Create/update ${path}`,
        branch,
      }),
    });
    if (!response.ok) {
      const err = (await response.json()) as { error?: string };
      return { success: false, output: '', error: err.error || `Failed to write ${path}` };
    }
    return { success: true, output: `Successfully wrote ${path}`, metadata: { path, size: content.length } };
  } catch (error) {
    return { success: false, output: '', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Delete a file from the GitHub repo via API
 */
export async function deleteFile(
  repo: string,
  path: string,
  branch: string,
  message?: string,
): Promise<ToolResult> {
  try {
    const response = await fetch('/api/github/file', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo,
        path,
        message: message || `Delete ${path}`,
        branch,
      }),
    });
    if (!response.ok) {
      const err = (await response.json()) as { error?: string };
      return { success: false, output: '', error: err.error || `Failed to delete ${path}` };
    }
    return { success: true, output: `Deleted ${path}` };
  } catch (error) {
    return { success: false, output: '', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ─── Search ──────────────────────────────────────────────────────────

/**
 * Search code in a GitHub repo
 */
export async function searchCode(repo: string, query: string): Promise<ToolResult> {
  try {
    const response = await fetch(`/api/github/search?repo=${encodeURIComponent(repo)}&q=${encodeURIComponent(query)}&type=code`);
    if (!response.ok) {
      return { success: false, output: '', error: `Search failed: ${response.status}` };
    }
    const data = (await response.json()) as {
      items?: Array<{ path: string; text_matches?: Array<{ fragment: string }> }>;
      total_count?: number;
    };
    const items = data.items || [];
    const output = items
      .map((item) => {
        const fragments = item.text_matches?.map((m) => m.fragment).join('\n') || '';
        return `${item.path}:\n${fragments}`;
      })
      .join('\n\n');
    return {
      success: true,
      output: output || 'No results found',
      metadata: { totalCount: data.total_count, resultCount: items.length },
    };
  } catch (error) {
    return { success: false, output: '', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ─── Grep (local content search) ─────────────────────────────────────

/**
 * Search for a pattern across multiple files (in-memory grep)
 */
export function grepFiles(
  files: Array<{ path: string; content: string }>,
  pattern: string,
  options?: { caseSensitive?: boolean; maxResults?: number },
): ToolResult {
  const flags = options?.caseSensitive ? 'g' : 'gi';
  const maxResults = options?.maxResults || 50;
  let regex: RegExp;

  try {
    regex = new RegExp(pattern, flags);
  } catch {
    return { success: false, output: '', error: `Invalid regex: ${pattern}` };
  }

  const results: string[] = [];
  let totalMatches = 0;

  for (const file of files) {
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        totalMatches++;
        if (results.length < maxResults) {
          results.push(`${file.path}:${i + 1}: ${lines[i].trim()}`);
        }
        regex.lastIndex = 0; // Reset for global regex
      }
    }
  }

  const output = results.join('\n');
  return {
    success: true,
    output: output || `No matches for "${pattern}"`,
    metadata: { totalMatches, resultsShown: results.length },
  };
}

// ─── Glob (file pattern matching) ────────────────────────────────────

/**
 * Match file paths against glob patterns
 */
export function globFiles(
  filePaths: string[],
  pattern: string,
): ToolResult {
  // Convert glob to regex
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\{\{DOUBLESTAR\}\}/g, '.*');

  const regex = new RegExp(`^${regexStr}$`);
  const matches = filePaths.filter((p) => regex.test(p));

  return {
    success: true,
    output: matches.join('\n') || `No files matching "${pattern}"`,
    metadata: { matchCount: matches.length, totalFiles: filePaths.length },
  };
}

// ─── Git Operations ──────────────────────────────────────────────────

/**
 * Create a new branch
 */
export async function createBranch(repo: string, branchName: string, fromBranch: string): Promise<ToolResult> {
  try {
    const response = await fetch('/api/github/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, branch: branchName, from_branch: fromBranch }),
    });
    if (!response.ok) {
      const err = (await response.json()) as { error?: string };
      return { success: false, output: '', error: err.error || 'Failed to create branch' };
    }
    return { success: true, output: `Branch "${branchName}" created from "${fromBranch}"` };
  } catch (error) {
    return { success: false, output: '', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Create a pull request
 */
export async function createPullRequest(
  repo: string,
  title: string,
  head: string,
  base: string,
  body?: string,
): Promise<ToolResult> {
  try {
    const response = await fetch('/api/github/pull-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, title, head, base, body: body || '' }),
    });
    if (!response.ok) {
      const err = (await response.json()) as { error?: string };
      return { success: false, output: '', error: err.error || 'Failed to create PR' };
    }
    const data = (await response.json()) as { html_url?: string; number?: number };
    return {
      success: true,
      output: `PR #${data.number} created: ${data.html_url}`,
      metadata: { prNumber: data.number, url: data.html_url },
    };
  } catch (error) {
    return { success: false, output: '', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Commit and push files
 */
export async function commitAndPush(
  repo: string,
  branch: string,
  files: Array<{ path: string; content: string }>,
  message: string,
): Promise<ToolResult> {
  try {
    const response = await fetch('/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, branch, files, project_name: message }),
    });
    if (!response.ok) {
      const err = (await response.json()) as { error?: string };
      return { success: false, output: '', error: err.error || 'Failed to commit' };
    }
    const data = (await response.json()) as { message?: string; url?: string };
    return {
      success: true,
      output: data.message || `Committed ${files.length} files to ${repo}/${branch}`,
      metadata: { repo, branch, fileCount: files.length, url: data.url },
    };
  } catch (error) {
    return { success: false, output: '', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ─── MCP Tool Proxy ─────────────────────────────────────────────────

/**
 * Call an MCP tool on a connected server (client-side only)
 */
export async function callMCPTool(
  serverUrl: string,
  toolName: string,
  args: Record<string, unknown>,
  apiKey?: string,
): Promise<ToolResult> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Pablo-IDE/5.0',
    };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(`${serverUrl.replace(/\/$/, '')}/tools/call`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: toolName, arguments: args }),
    });

    if (!response.ok) {
      return { success: false, output: '', error: `MCP tool call failed: ${response.status}` };
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    const textContent = (data.content || [])
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n');

    return {
      success: !data.isError,
      output: textContent || 'MCP tool returned no text content',
      metadata: { serverUrl, toolName },
    };
  } catch (error) {
    return { success: false, output: '', error: error instanceof Error ? error.message : 'MCP call failed' };
  }
}

/**
 * List tools from an MCP server
 */
export async function listMCPTools(
  serverUrl: string,
  apiKey?: string,
): Promise<ToolResult> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Pablo-IDE/5.0',
    };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(`${serverUrl.replace(/\/$/, '')}/tools/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      return { success: false, output: '', error: `MCP list tools failed: ${response.status}` };
    }

    const data = (await response.json()) as {
      tools?: Array<{ name: string; description: string }>;
    };

    const tools = data.tools || [];
    const output = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
    return {
      success: true,
      output: output || 'No tools available',
      metadata: { toolCount: tools.length },
    };
  } catch (error) {
    return { success: false, output: '', error: error instanceof Error ? error.message : 'MCP list failed' };
  }
}

// ─── Tool Registry ───────────────────────────────────────────────────

/**
 * Get all available tools and their descriptions (for LLM function calling)
 */
export function getToolDescriptions(): Array<{ name: string; description: string; parameters: string }> {
  return [
    { name: 'read_file', description: 'Read a file from the GitHub repository', parameters: 'repo: string, path: string, branch: string' },
    { name: 'write_file', description: 'Create or update a file in the GitHub repository', parameters: 'repo: string, path: string, content: string, branch: string, message?: string' },
    { name: 'delete_file', description: 'Delete a file from the GitHub repository', parameters: 'repo: string, path: string, branch: string, message?: string' },
    { name: 'search_code', description: 'Search for code in the repository', parameters: 'repo: string, query: string' },
    { name: 'grep', description: 'Search for a regex pattern across files', parameters: 'pattern: string, caseSensitive?: boolean' },
    { name: 'glob', description: 'Find files matching a glob pattern', parameters: 'pattern: string' },
    { name: 'create_branch', description: 'Create a new git branch', parameters: 'repo: string, branchName: string, fromBranch: string' },
    { name: 'create_pr', description: 'Create a pull request', parameters: 'repo: string, title: string, head: string, base: string, body?: string' },
    { name: 'commit_push', description: 'Commit files and push to the repo', parameters: 'repo: string, branch: string, files: {path, content}[], message: string' },
    { name: 'mcp_call_tool', description: 'Call a tool on a connected MCP server', parameters: 'serverUrl: string, toolName: string, args: object, apiKey?: string' },
    { name: 'mcp_list_tools', description: 'List available tools from an MCP server', parameters: 'serverUrl: string, apiKey?: string' },
  ];
}
