import { describe, it, expect } from 'vitest';
import { validateGeneratedCode, generateReviewPrompt, generateFixPrompt } from './codeValidator';

describe('validateGeneratedCode', () => {
  it('detects plaintext passwords (SEC001)', () => {
    const code = `
      password = "admin123"
      db.add(user)
    `;
    const result = validateGeneratedCode(code);
    expect(result.issues.some(i => i.id === 'SEC001')).toBe(true);
    expect(result.issues.find(i => i.id === 'SEC001')?.severity).toBe('critical');
  });

  it('passes when password is hashed (SEC001 negative)', () => {
    const code = `
      password = request.body.password
      hashed = bcrypt.hash(password)
    `;
    const result = validateGeneratedCode(code);
    expect(result.issues.some(i => i.id === 'SEC001')).toBe(false);
  });

  it('detects hardcoded secrets (SEC004)', () => {
    const code = `SECRET_KEY = "mysupersecretkey12345678"`;
    const result = validateGeneratedCode(code);
    expect(result.issues.some(i => i.id === 'SEC004')).toBe(true);
  });

  it('passes when secrets use env vars (SEC004 negative)', () => {
    const code = `SECRET_KEY = os.getenv("JWT_SECRET_KEY")`;
    const result = validateGeneratedCode(code);
    expect(result.issues.some(i => i.id === 'SEC004')).toBe(false);
  });

  it('detects missing CORS on FastAPI (SEC002)', () => {
    const code = `
      from fastapi import FastAPI
      app = FastAPI()

      @app.get("/items")
      def list_items():
          return []
    `;
    const result = validateGeneratedCode(code);
    expect(result.issues.some(i => i.id === 'SEC002')).toBe(true);
  });

  it('passes when CORS middleware is present (SEC002 negative)', () => {
    const code = `
      from fastapi import FastAPI
      from fastapi.middleware.cors import CORSMiddleware
      app = FastAPI()
      app.add_middleware(CORSMiddleware, allow_origins=["*"])
    `;
    const result = validateGeneratedCode(code);
    expect(result.issues.some(i => i.id === 'SEC002')).toBe(false);
  });

  it('returns score of 100 for clean code', () => {
    const code = `const x = 1 + 2;`;
    const result = validateGeneratedCode(code);
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('penalizes score for critical issues', () => {
    const code = `password = "hardcoded123"`;
    const result = validateGeneratedCode(code);
    expect(result.score).toBeLessThan(100);
    expect(result.passed).toBe(false); // Critical issues cause failure
  });

  it('detects missing timestamps on SQLAlchemy models (QAL001)', () => {
    const code = `
      class User(Base):
          __tablename__ = "users"
          id = Column(Integer, primary_key=True)
          name = Column(String)
    `;
    const result = validateGeneratedCode(code);
    expect(result.issues.some(i => i.id === 'QAL001')).toBe(true);
  });

  it('passes when timestamps present (QAL001 negative)', () => {
    const code = `
      class User(Base):
          __tablename__ = "users"
          id = Column(Integer, primary_key=True)
          created_at = Column(DateTime, default=datetime.utcnow)
    `;
    const result = validateGeneratedCode(code);
    expect(result.issues.some(i => i.id === 'QAL001')).toBe(false);
  });
});

describe('generateReviewPrompt', () => {
  it('includes the original spec and code', () => {
    const prompt = generateReviewPrompt('const x = 1;', 'Add a variable', []);
    expect(prompt).toContain('const x = 1;');
    expect(prompt).toContain('Add a variable');
  });

  it('includes validation issues when provided', () => {
    const issues = [{
      id: 'SEC001',
      severity: 'critical' as const,
      category: 'security' as const,
      description: 'Plaintext passwords',
      fix_suggestion: 'Use bcrypt',
      auto_fixable: true,
    }];
    const prompt = generateReviewPrompt('code', 'spec', issues);
    expect(prompt).toContain('CRITICAL');
    expect(prompt).toContain('Plaintext passwords');
  });
});

describe('generateFixPrompt', () => {
  it('includes only auto-fixable issues', () => {
    const issues = [
      {
        id: 'SEC001',
        severity: 'critical' as const,
        category: 'security' as const,
        description: 'Plaintext passwords',
        fix_suggestion: 'Use bcrypt',
        auto_fixable: true,
      },
      {
        id: 'COM001',
        severity: 'medium' as const,
        category: 'completeness' as const,
        description: 'Missing registration',
        fix_suggestion: 'Add register endpoint',
        auto_fixable: false,
      },
    ];
    const prompt = generateFixPrompt('code', issues);
    expect(prompt).toContain('Plaintext passwords');
    expect(prompt).not.toContain('Missing registration');
  });
});
