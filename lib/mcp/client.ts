// lib/mcp/client.ts
// MCP (Model Context Protocol) SSE transport client
// Connects to web-accessible MCP servers and discovers tools

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  url: string;          // SSE endpoint URL
  apiKey?: string;      // Optional auth
  enabled: boolean;
}

export interface MCPCallResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

/**
 * MCP Client — connects to an MCP server via SSE transport
 * Implements the client side of the Model Context Protocol
 */
export class MCPClient {
  private serverUrl: string;
  private apiKey?: string;
  private tools: MCPTool[] = [];
  private resources: MCPResource[] = [];
  private connected = false;
  private sessionId: string | null = null;

  constructor(config: MCPServerConfig) {
    this.serverUrl = config.url.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  /**
   * Initialize connection — discover capabilities, tools, and resources
   */
  async connect(): Promise<{ tools: MCPTool[]; resources: MCPResource[] }> {
    try {
      // Step 1: Initialize session
      const initResp = await fetch(`${this.serverUrl}/initialize`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          protocolVersion: '2024-11-05',
          capabilities: {
            roots: { listChanged: false },
            sampling: {},
          },
          clientInfo: {
            name: 'Pablo-IDE',
            version: '5.0',
          },
        }),
      });

      if (initResp.ok) {
        const initData = (await initResp.json()) as {
          sessionId?: string;
          capabilities?: Record<string, unknown>;
        };
        this.sessionId = initData.sessionId || null;
      }

      // Step 2: List tools
      this.tools = await this.listTools();

      // Step 3: List resources
      this.resources = await this.listResources();

      this.connected = true;
      return { tools: this.tools, resources: this.resources };
    } catch (error) {
      this.connected = false;
      throw new Error(
        `MCP connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<MCPTool[]> {
    try {
      const resp = await fetch(`${this.serverUrl}/tools/list`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({}),
      });
      if (!resp.ok) return [];
      const data = (await resp.json()) as { tools?: MCPTool[] };
      this.tools = data.tools || [];
      return this.tools;
    } catch {
      return [];
    }
  }

  /**
   * List available resources from the MCP server
   */
  async listResources(): Promise<MCPResource[]> {
    try {
      const resp = await fetch(`${this.serverUrl}/resources/list`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({}),
      });
      if (!resp.ok) return [];
      const data = (await resp.json()) as { resources?: MCPResource[] };
      this.resources = data.resources || [];
      return this.resources;
    } catch {
      return [];
    }
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPCallResult> {
    const resp = await fetch(`${this.serverUrl}/tools/call`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name, arguments: args }),
    });

    if (!resp.ok) {
      throw new Error(`MCP tool call failed: ${resp.status} ${resp.statusText}`);
    }

    return (await resp.json()) as MCPCallResult;
  }

  /**
   * Read a resource from the MCP server
   */
  async readResource(uri: string): Promise<MCPCallResult> {
    const resp = await fetch(`${this.serverUrl}/resources/read`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ uri }),
    });

    if (!resp.ok) {
      throw new Error(`MCP resource read failed: ${resp.status} ${resp.statusText}`);
    }

    return (await resp.json()) as MCPCallResult;
  }

  /**
   * Subscribe to SSE events from the MCP server
   */
  subscribeToEvents(onEvent: (event: { type: string; data: unknown }) => void): () => void {
    const url = `${this.serverUrl}/sse`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as unknown;
        onEvent({ type: 'message', data });
      } catch {
        onEvent({ type: 'raw', data: event.data });
      }
    };

    eventSource.onerror = () => {
      onEvent({ type: 'error', data: 'SSE connection error' });
    };

    // Return cleanup function
    return () => {
      eventSource.close();
    };
  }

  /**
   * Get tool descriptions formatted for LLM function calling
   */
  getToolDescriptions(): Array<{ name: string; description: string; parameters: string }> {
    return this.tools.map((t) => ({
      name: `mcp:${t.name}`,
      description: t.description,
      parameters: JSON.stringify(t.inputSchema),
    }));
  }

  isConnected(): boolean {
    return this.connected;
  }

  getTools(): MCPTool[] {
    return this.tools;
  }

  getResources(): MCPResource[] {
    return this.resources;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Pablo-IDE/5.0',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    if (this.sessionId) {
      headers['X-MCP-Session'] = this.sessionId;
    }
    return headers;
  }
}

/**
 * MCP Server Manager — manages multiple MCP server connections
 */
export class MCPManager {
  private clients: Map<string, MCPClient> = new Map();
  private configs: MCPServerConfig[] = [];

  /**
   * Add a server configuration
   */
  addServer(config: MCPServerConfig): void {
    this.configs.push(config);
    if (config.enabled) {
      this.clients.set(config.id, new MCPClient(config));
    }
  }

  /**
   * Remove a server configuration
   */
  removeServer(serverId: string): void {
    this.configs = this.configs.filter((c) => c.id !== serverId);
    this.clients.delete(serverId);
  }

  /**
   * Connect to all enabled servers
   */
  async connectAll(): Promise<Map<string, { tools: MCPTool[]; resources: MCPResource[] }>> {
    const results = new Map<string, { tools: MCPTool[]; resources: MCPResource[] }>();

    for (const [id, client] of this.clients) {
      try {
        const result = await client.connect();
        results.set(id, result);
      } catch (error) {
        console.error(`Failed to connect to MCP server ${id}:`, error);
      }
    }

    return results;
  }

  /**
   * Get all available tools across all connected servers
   */
  getAllTools(): Array<MCPTool & { serverId: string }> {
    const tools: Array<MCPTool & { serverId: string }> = [];
    for (const [serverId, client] of this.clients) {
      if (client.isConnected()) {
        for (const tool of client.getTools()) {
          tools.push({ ...tool, serverId });
        }
      }
    }
    return tools;
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPCallResult> {
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`MCP server ${serverId} not found`);
    if (!client.isConnected()) throw new Error(`MCP server ${serverId} not connected`);
    return client.callTool(toolName, args);
  }

  /**
   * Get all server configs
   */
  getConfigs(): MCPServerConfig[] {
    return this.configs;
  }
}
