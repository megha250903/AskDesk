import fs from 'node:fs';
import path from 'node:path';
import { TestCaseSchema, type TestCase } from '../config/schema.js';

export function loadJsonlDataset(filePath: string): TestCase[] {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`[promptproof] Dataset file not found: ${resolved}`);
  }

  const lines = fs
    .readFileSync(resolved, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const testCases: TestCase[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      testCases.push(TestCaseSchema.parse(parsed));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[promptproof] Invalid test case format in ${resolved} at line ${i + 1}: ${msg}`
      );
    }
  }

  return testCases;
}
