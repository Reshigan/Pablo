/**
 * Feature 22: Bug Scanner
 * Scans entire project for issues without waiting for runtime errors.
 */

export interface BugReport {
  file: string;
  line?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestedFix?: string;
}

export async function scanProject(
  files: Array<{ path: string; content: string; language: string }>,
): Promise<BugReport[]> {
  const reports: BugReport[] = [];

  // Static analysis patterns
  for (const file of files) {
    const lines = file.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // console.log in production code
      if (/\bconsole\.(log|debug|info)\b/.test(line) && !file.path.includes('test')) {
        reports.push({
          file: file.path,
          line: lineNum,
          severity: 'warning',
          message: 'console.log statement found — remove before production',
          suggestedFix: 'Remove or replace with a proper logger',
        });
      }

      // TODO/FIXME/HACK comments
      if (/\b(TODO|FIXME|HACK|XXX)\b/.test(line)) {
        reports.push({
          file: file.path,
          line: lineNum,
          severity: 'info',
          message: `${line.match(/\b(TODO|FIXME|HACK|XXX)\b/)?.[0]} comment found`,
        });
      }

      // Hardcoded secrets patterns
      if (/(?:password|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(line)) {
        reports.push({
          file: file.path,
          line: lineNum,
          severity: 'error',
          message: 'Potential hardcoded secret detected',
          suggestedFix: 'Move to environment variables',
        });
      }

      // Empty catch blocks
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
        reports.push({
          file: file.path,
          line: lineNum,
          severity: 'warning',
          message: 'Empty catch block — errors are silently swallowed',
          suggestedFix: 'Log the error or handle it appropriately',
        });
      }

      // any type in TypeScript
      if ((file.language === 'typescript' || file.language === 'typescriptreact') &&
          /:\s*any\b/.test(line) && !line.trim().startsWith('//')) {
        reports.push({
          file: file.path,
          line: lineNum,
          severity: 'warning',
          message: 'Using `any` type — loses type safety',
          suggestedFix: 'Replace with a proper type or `unknown`',
        });
      }
    }

    // Cross-file checks: missing imports
    if (file.language === 'typescript' || file.language === 'typescriptreact' ||
        file.language === 'javascript' || file.language === 'javascriptreact') {
      const importedModules = [...file.content.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
      for (const mod of importedModules) {
        if (mod.startsWith('./') || mod.startsWith('../')) {
          const resolved = mod.replace(/\.(ts|tsx|js|jsx)$/, '');
          const targetPath = resolved.split('/').pop();
          if (targetPath && !files.some(f =>
            f.path.includes(targetPath) ||
            f.path.replace(/\.(ts|tsx|js|jsx)$/, '').endsWith(resolved.replace(/^\.\//, '').replace(/^\.\.\//, ''))
          )) {
            reports.push({
              file: file.path,
              severity: 'error',
              message: `Import "${mod}" — target file may not exist in project`,
              suggestedFix: `Create the file or fix the import path`,
            });
          }
        }
      }
    }
  }

  // AI-powered deep scan (uses LLM for cross-file analysis)
  if (files.length > 0 && files.length <= 20) {
    try {
      const fileList = files.map(f => `--- ${f.path} ---\n${f.content.slice(0, 2000)}`).join('\n\n');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Review this project for bugs, missing imports, broken references, security issues, and type errors. Return a JSON array of objects with {file, line, severity, message, suggestedFix}. Only return the JSON array, no markdown.\n\n${fileList}`,
          }],
          mode: 'pipeline-stage',
          model: 'devstral-2:123b',
          max_tokens: 2048,
        }),
      });

      if (res.ok) {
        const reader = res.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          let text = '';
          let buf = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const d = line.slice(6).trim();
                if (d === '[DONE]') break;
                try {
                  const p = JSON.parse(d) as { content?: string; done?: boolean };
                  if (p.content) text += p.content;
                } catch { /* skip */ }
              }
            }
          }
          // Try to parse AI response as JSON
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            try {
              const aiReports = JSON.parse(jsonMatch[0]) as BugReport[];
              for (const r of aiReports) {
                if (r.file && r.message && r.severity) {
                  reports.push(r);
                }
              }
            } catch { /* AI response wasn't valid JSON */ }
          }
        }
      }
    } catch { /* Non-blocking */ }
  }

  return reports;
}
