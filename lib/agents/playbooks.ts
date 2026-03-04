/**
 * Pablo Playbooks — Reusable task templates
 *
 * A playbook is a sequence of steps with:
 *   - File patterns to create/modify
 *   - Verification commands to run
 *   - Template prompts for each step
 *
 * Example: "Add API Endpoint" playbook
 *   1. Create route file from template
 *   2. Add validation schema
 *   3. Write unit tests
 *   4. Update API docs
 *   5. Run tests to verify
 */

export interface PlaybookStep {
  title: string;
  type: 'generate' | 'modify' | 'verify' | 'command';
  template: string;
  filePatterns: string[];
  verifyCommand?: string;
}

export interface Playbook {
  id: string;
  title: string;
  description: string;
  triggerPattern: string;
  steps: PlaybookStep[];
  variables: string[];
}

// Built-in playbooks
export const BUILTIN_PLAYBOOKS: Playbook[] = [
  {
    id: 'add-api-endpoint',
    title: 'Add API Endpoint',
    description: 'Creates a new API route with validation, tests, and documentation',
    triggerPattern: 'add.*(?:api|endpoint|route)',
    variables: ['endpointName', 'method', 'description'],
    steps: [
      {
        title: 'Create route handler',
        type: 'generate',
        template: 'Create a {method} endpoint at /api/{endpointName} that {description}. Include input validation, error handling, and proper HTTP status codes.',
        filePatterns: ['src/app/api/{endpointName}/route.ts'],
      },
      {
        title: 'Add validation schema',
        type: 'generate',
        template: 'Create a Zod validation schema for the {endpointName} endpoint request/response.',
        filePatterns: ['src/lib/validations/{endpointName}.ts'],
      },
      {
        title: 'Write tests',
        type: 'generate',
        template: 'Write comprehensive unit tests for the {endpointName} API endpoint covering success, validation errors, auth errors, and edge cases.',
        filePatterns: ['src/__tests__/api/{endpointName}.test.ts'],
      },
      {
        title: 'Run tests',
        type: 'verify',
        template: '',
        filePatterns: [],
        verifyCommand: 'npm test -- --grep {endpointName}',
      },
    ],
  },
  {
    id: 'add-component',
    title: 'Add React Component',
    description: 'Creates a new React component with types, stories, and tests',
    triggerPattern: 'add.*(?:component|page|form|modal|dialog)',
    variables: ['componentName', 'description'],
    steps: [
      {
        title: 'Create component',
        type: 'generate',
        template: 'Create a React component called {componentName} that {description}. Use TypeScript, Tailwind CSS, proper accessibility attributes.',
        filePatterns: ['src/components/{componentName}/{componentName}.tsx'],
      },
      {
        title: 'Add types',
        type: 'generate',
        template: 'Create TypeScript types/interfaces for the {componentName} component props and state.',
        filePatterns: ['src/components/{componentName}/types.ts'],
      },
      {
        title: 'Write tests',
        type: 'generate',
        template: 'Write React Testing Library tests for {componentName} covering rendering, user interactions, and edge cases.',
        filePatterns: ['src/components/{componentName}/{componentName}.test.tsx'],
      },
    ],
  },
  {
    id: 'fix-bug',
    title: 'Fix Bug',
    description: 'Diagnose and fix a bug with regression test',
    triggerPattern: 'fix.*(?:bug|error|crash|broken|issue)',
    variables: ['bugDescription'],
    steps: [
      {
        title: 'Diagnose',
        type: 'modify',
        template: 'Analyze the codebase to find the root cause of: {bugDescription}. Explain the cause and which files need changes.',
        filePatterns: [],
      },
      {
        title: 'Fix',
        type: 'modify',
        template: 'Fix the bug: {bugDescription}. Make minimal, targeted changes.',
        filePatterns: [],
      },
      {
        title: 'Regression test',
        type: 'generate',
        template: 'Write a test that would have caught this bug: {bugDescription}. Ensure it fails without the fix and passes with it.',
        filePatterns: [],
      },
      {
        title: 'Verify',
        type: 'verify',
        template: '',
        filePatterns: [],
        verifyCommand: 'npm test',
      },
    ],
  },
];

/**
 * Match a user message to a playbook
 */
export function matchPlaybook(message: string, customPlaybooks: Playbook[] = []): Playbook | null {
  const allPlaybooks = [...customPlaybooks, ...BUILTIN_PLAYBOOKS];

  for (const pb of allPlaybooks) {
    if (new RegExp(pb.triggerPattern, 'i').test(message)) {
      return pb;
    }
  }

  return null;
}
