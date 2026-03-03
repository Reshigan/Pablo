// lib/validation/codeValidator.ts
// Post-generation validation engine
// Runs BEFORE showing generated code to the user
// Catches: logic errors, security issues, missing patterns

export interface ValidationIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'security' | 'logic' | 'quality' | 'compliance' | 'completeness';
  line?: number;
  description: string;
  fix_suggestion: string;
  auto_fixable: boolean;
}

export interface ValidationResult {
  passed: boolean;
  issues: ValidationIssue[];
  score: number; // 0-100
  auto_fixed: number;
}

interface CheckDefinition {
  id: string;
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  patterns: RegExp[];
  negative_patterns: RegExp[];
  fix: string;
  auto_fixable: boolean;
}

// Security checks
const SECURITY_CHECKS: CheckDefinition[] = [
  {
    id: 'SEC001',
    name: 'Plaintext passwords',
    severity: 'critical',
    patterns: [
      /password\s*=\s*["'][^"']+["']/gi,
      /\.password\s*=\s*(?!.*hash|.*bcrypt|.*pwd_context)/gi,
      /password.*=.*request\.(body|json|form)/gi,
    ],
    negative_patterns: [
      /passlib/i,
      /bcrypt/i,
      /CryptContext/i,
      /hash_password/i,
      /pwd_context\.hash/i,
    ],
    fix: 'Add bcrypt password hashing:\n  from passlib.context import CryptContext\n  pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")\n  hashed = pwd_context.hash(password)',
    auto_fixable: true,
  },
  {
    id: 'SEC002',
    name: 'Missing CORS',
    severity: 'high',
    patterns: [/FastAPI\s*\(/],
    negative_patterns: [/CORSMiddleware/i, /add_middleware.*cors/i],
    fix: 'Add CORS middleware:\n  from fastapi.middleware.cors import CORSMiddleware\n  app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])',
    auto_fixable: true,
  },
  {
    id: 'SEC003',
    name: 'No JWT expiry',
    severity: 'high',
    patterns: [/jwt\.encode/i],
    negative_patterns: [/exp[iry]*.*timedelta/i, /'exp':/i, /"exp":/i],
    fix: 'Add token expiry:\n  from datetime import timedelta\n  expire = datetime.utcnow() + timedelta(minutes=30)\n  jwt.encode({**data, "exp": expire}, SECRET_KEY)',
    auto_fixable: true,
  },
  {
    id: 'SEC004',
    name: 'Hardcoded secrets',
    severity: 'high',
    patterns: [
      /SECRET_KEY\s*=\s*["'][a-zA-Z0-9]{8,}["']/g,
      /API_KEY\s*=\s*["'][^"']{8,}["']/g,
    ],
    negative_patterns: [/os\.getenv/i, /os\.environ/i, /Settings/i],
    fix: 'Use environment variables:\n  import os\n  SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-in-production")',
    auto_fixable: true,
  },
];

// Logic checks (common business logic bugs)
const LOGIC_CHECKS: CheckDefinition[] = [
  {
    id: 'LOG003',
    name: 'Dashboard query uses wrong field',
    severity: 'medium',
    patterns: [/top.*sales.*rep.*customer_id/gi, /sales.*rep.*=.*customer/gi],
    negative_patterns: [/assigned_rep|sales_rep_id|user_id|owner_id/i],
    fix: 'Top sales rep should query by assigned_rep_id or user_id, not customer_id',
    auto_fixable: false,
  },
];

// Quality checks
const QUALITY_CHECKS: CheckDefinition[] = [
  {
    id: 'QAL001',
    name: 'Missing timestamps on models',
    severity: 'medium',
    patterns: [/class\s+\w+\(Base\)/g, /__tablename__/g],
    negative_patterns: [/created_at/i],
    fix: 'Add timestamps to all models:\n  created_at = Column(DateTime, default=datetime.utcnow)\n  updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)',
    auto_fixable: true,
  },
  {
    id: 'QAL002',
    name: 'Missing pagination on list endpoints',
    severity: 'medium',
    patterns: [/\.get\s*\(\s*["']\/\w+[s]?\/?["']/g, /def\s+(?:get|list)_\w+/g],
    negative_patterns: [/skip.*limit/i, /pagination/i],
    fix: 'Add pagination params:\n  @app.get("/items/")\n  def list_items(skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):\n      return db.query(Item).filter(Item.is_active == True).offset(skip).limit(limit).all()',
    auto_fixable: true,
  },
  {
    id: 'QAL003',
    name: 'Missing error handling on DB operations',
    severity: 'high',
    patterns: [/db\.add\(|db\.commit\(\)|db\.delete\(/g],
    negative_patterns: [/try[\s\S]*except/i],
    fix: 'Wrap DB operations in try/except:\n  try:\n      db.add(item)\n      db.commit()\n      db.refresh(item)\n  except Exception as e:\n      db.rollback()\n      raise HTTPException(status_code=500, detail="Database error")',
    auto_fixable: true,
  },
  {
    id: 'QAL004',
    name: 'Missing health check endpoint',
    severity: 'low',
    patterns: [/FastAPI\s*\(/],
    negative_patterns: [/\/health/i],
    fix: 'Add health check:\n  @app.get("/health", tags=["system"])\n  def health():\n      return {"status": "healthy", "version": "1.0.0"}',
    auto_fixable: true,
  },
  {
    id: 'QAL005',
    name: 'No soft delete (using hard delete)',
    severity: 'medium',
    patterns: [/db\.delete\(/g],
    negative_patterns: [/is_active.*=.*False/i, /soft.?delete/i],
    fix: 'Use soft delete instead of hard delete:\n  item.is_active = False\n  db.commit()',
    auto_fixable: true,
  },
];

// Compliance checks
const COMPLIANCE_CHECKS: CheckDefinition[] = [];

// Completeness checks
const COMPLETENESS_CHECKS: CheckDefinition[] = [
  {
    id: 'COM001',
    name: 'Missing user registration endpoint',
    severity: 'medium',
    patterns: [/login|authenticate|token/i],
    negative_patterns: [/register|signup|sign.?up|create.?user/i],
    fix: 'Add registration endpoint:\n  @app.post("/auth/register", tags=["auth"])\n  def register(user: UserCreate, db: Session = Depends(get_db)):\n      ...',
    auto_fixable: false,
  },
  {
    id: 'COM002',
    name: 'Missing stage transition endpoint for deals',
    severity: 'medium',
    patterns: [/DealStage|deal_stage|pipeline/i],
    negative_patterns: [/update.*stage|transition|move.*stage|patch.*deal/i],
    fix: 'Add deal stage transition:\n  @app.patch("/deals/{deal_id}/stage", tags=["deals"])\n  def update_deal_stage(deal_id: int, new_stage: DealStage, db: Session = Depends(get_db)):\n      ...',
    auto_fixable: false,
  },
];

// Main validation function
export function validateGeneratedCode(code: string, _language: string = 'python'): ValidationResult {
  const allChecks = [
    ...SECURITY_CHECKS.map(c => ({ ...c, category: 'security' as const })),
    ...LOGIC_CHECKS.map(c => ({ ...c, category: 'logic' as const })),
    ...QUALITY_CHECKS.map(c => ({ ...c, category: 'quality' as const })),
    ...COMPLIANCE_CHECKS.map(c => ({ ...c, category: 'compliance' as const })),
    ...COMPLETENESS_CHECKS.map(c => ({ ...c, category: 'completeness' as const })),
  ];

  const issues: ValidationIssue[] = [];

  for (const check of allChecks) {
    // Check if any positive pattern matches (problem might exist)
    const hasPattern = check.patterns.some(p => {
      p.lastIndex = 0;
      return p.test(code);
    });
    if (!hasPattern) continue;

    // Reset lastIndex for all patterns
    check.patterns.forEach(p => { p.lastIndex = 0; });
    check.negative_patterns.forEach(p => { p.lastIndex = 0; });

    // Check if negative patterns are present (problem is already fixed)
    const hasNegative = check.negative_patterns.length > 0 && check.negative_patterns.some(p => {
      p.lastIndex = 0;
      return p.test(code);
    });
    if (hasNegative) continue;

    // Reset again
    check.negative_patterns.forEach(p => { p.lastIndex = 0; });

    // Issue found
    issues.push({
      id: check.id,
      severity: check.severity,
      category: check.category,
      description: check.name,
      fix_suggestion: check.fix,
      auto_fixable: check.auto_fixable,
    });
  }

  // Calculate score
  const severityWeights: Record<string, number> = { critical: 20, high: 10, medium: 5, low: 2 };
  const totalPenalty = issues.reduce((sum, i) => sum + (severityWeights[i.severity] || 0), 0);
  const score = Math.max(0, 100 - totalPenalty);

  return {
    passed: issues.filter(i => i.severity === 'critical').length === 0,
    issues,
    score,
    auto_fixed: 0,
  };
}

// R1 review prompt generator
export function generateReviewPrompt(code: string, originalSpec: string, validationIssues: ValidationIssue[]): string {
  const issueList = validationIssues.map(i =>
    `- [${i.severity.toUpperCase()}] ${i.description}: ${i.fix_suggestion.split('\n')[0]}`
  ).join('\n');

  return `You are a senior code reviewer.

Review the following generated code against the original specification.

ORIGINAL SPEC:
${originalSpec}

GENERATED CODE:
\`\`\`
${code}
\`\`\`

AUTOMATED CHECKS ALREADY FOUND THESE ISSUES:
${issueList || 'No automated issues found.'}

YOUR REVIEW TASKS:
1. Verify ALL spec requirements are addressed (list any missing)
2. Check business logic correctness (especially calculations, formulas, stage transitions)
3. Check security (auth, input validation, error handling)
4. Check code quality (proper types, clean structure, no dead code)

Return your review as a JSON array of issues:
[
  {
    "severity": "critical|high|medium|low",
    "category": "security|logic|quality|compliance|completeness",
    "description": "What's wrong",
    "fix": "Exact code change needed",
    "line_hint": "Where in the code (approximate)"
  }
]

If the code is perfect, return an empty array: []
Only report real issues. Do not invent problems.`;
}

// Auto-fix prompt generator
export function generateFixPrompt(code: string, issues: ValidationIssue[]): string {
  const fixList = issues
    .filter(i => i.auto_fixable)
    .map(i => `FIX REQUIRED [${i.severity.toUpperCase()}]: ${i.description}\nSuggested fix:\n${i.fix_suggestion}`)
    .join('\n\n');

  return `Fix the following issues in this code. Apply ALL fixes. Return the COMPLETE fixed code, not just the changes.

ISSUES TO FIX:
${fixList}

ORIGINAL CODE:
\`\`\`
${code}
\`\`\`

RULES:
- Apply ALL fixes listed above
- Do NOT remove any existing functionality
- Do NOT add any features not listed in the fixes
- Return the COMPLETE file with all fixes applied
- Maintain the same code structure and style`;
}
