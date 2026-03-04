// lib/agents/specialists/index.ts
// Re-export all specialist agents for clean imports

export { BaseAgent } from './baseAgent';
export type { AgentInput, AgentOutput, AgentConfig, AgentEventCallback, CodebaseGraph } from './baseAgent';
export { getUpstream, getUpstreamFiles } from './baseAgent';

// Phase 1: Foundation
export { ArchitectAgent } from './architectAgent';

// Phase 2: Core Team
export { FrontendAgent } from './frontendAgent';
export { BackendAgent } from './backendAgent';
export { TestAgent } from './testAgent';

// Phase 3: Quality Team
export { DatabaseAgent } from './databaseAgent';
export { SecurityAgent } from './securityAgent';
export { ReviewAgent } from './reviewAgent';

// Phase 4: Delivery Team
export { InfraAgent } from './infraAgent';
export { DocsAgent } from './docsAgent';
export { DesignAgent } from './designAgent';

// Phase 5: Operations
export { PMAgent } from './pmAgent';
export { OpsAgent } from './opsAgent';
