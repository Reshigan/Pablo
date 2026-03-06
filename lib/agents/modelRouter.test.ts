import { describe, it, expect } from 'vitest';
import { classifyTask, routeTask, shouldDecompose } from './modelRouter';

describe('classifyTask', () => {
  it('classifies feature generation prompts', () => {
    expect(classifyTask('Build a SaaS dashboard system')).toBe('generate');
    expect(classifyTask('Create a REST API backend')).toBe('generate');
    expect(classifyTask('Implement a user authentication flow')).toBe('generate');
    expect(classifyTask('Generate a complete e-commerce app')).toBe('generate');
  });

  it('classifies planning prompts', () => {
    expect(classifyTask('Plan the architecture for a microservices setup')).toBe('plan');
    expect(classifyTask('Design a database schema')).toBe('plan');
    expect(classifyTask('Break down this feature into tasks')).toBe('plan');
  });

  it('classifies review prompts', () => {
    expect(classifyTask('Review this code for bugs')).toBe('review');
    expect(classifyTask('Audit the security of this module')).toBe('review');
    expect(classifyTask('Find issues in the codebase')).toBe('review');
  });

  it('classifies fix prompts', () => {
    expect(classifyTask('Fix the login bug')).toBe('fix');
    expect(classifyTask('Debug the API timeout issue')).toBe('fix');
    expect(classifyTask('Resolve the merge conflict')).toBe('fix');
  });

  it('classifies test prompts', () => {
    expect(classifyTask('Write tests for the auth module')).toBe('test');
    expect(classifyTask('Add pytest coverage')).toBe('test');
    expect(classifyTask('Create jest unit tests')).toBe('test');
  });

  it('classifies explain prompts', () => {
    expect(classifyTask('Explain how the pipeline works')).toBe('explain');
    expect(classifyTask('What does this function do?')).toBe('explain');
    expect(classifyTask('How to use the deploy API')).toBe('explain');
  });

  it('classifies document prompts', () => {
    expect(classifyTask('Document the API endpoints')).toBe('document');
    expect(classifyTask('Add jsdoc comments')).toBe('document');
    expect(classifyTask('Write a readme for this project')).toBe('document');
  });

  it('defaults to chat for ambiguous input', () => {
    expect(classifyTask('hello')).toBe('chat');
    expect(classifyTask('thanks')).toBe('chat');
    expect(classifyTask('ok sounds good')).toBe('chat');
  });
});

describe('routeTask', () => {
  it('routes generate tasks to Devstral-2 coder primary', () => {
    const decision = routeTask('Build a SaaS dashboard system');
    expect(decision.task_type).toBe('generate');
    expect(decision.primary.model).toBe('devstral-2:123b');
  });

  it('routes plan tasks to Devstral-2 reasoning primary', () => {
    const decision = routeTask('Plan the architecture');
    expect(decision.task_type).toBe('plan');
    expect(decision.primary.model).toBe('devstral-2:123b');
  });

  it('routes chat tasks to GPT-OSS fast primary', () => {
    const decision = routeTask('hello there');
    expect(decision.task_type).toBe('chat');
    expect(decision.primary.model).toBe('gpt-oss:20b');
  });

  it('always provides a fallback model', () => {
    const decision = routeTask('Build a REST API');
    expect(decision.fallback).toBeDefined();
    expect(decision.fallback.model).toBeTruthy();
  });
});

describe('shouldDecompose', () => {
  it('returns true for complex multi-requirement prompts', () => {
    expect(shouldDecompose('Build a CRM with auth, crud operations, dashboard, and API endpoints')).toBe(true);
    expect(shouldDecompose('Create a system with login, register, payment, and invoice generation')).toBe(true);
  });

  it('returns false for simple prompts', () => {
    expect(shouldDecompose('Fix the login button')).toBe(false);
    expect(shouldDecompose('Add a dark mode toggle')).toBe(false);
    expect(shouldDecompose('Hello world')).toBe(false);
  });
});
