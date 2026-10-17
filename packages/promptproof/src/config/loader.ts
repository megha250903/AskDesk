import fs from 'node:fs';
import path from 'node:path';
import { PromptProofConfigSchema, type PromptProofConfig } from './schema.js';

export function loadConfig(configPath?: string): PromptProofConfig {
  const resolvedPath = configPath
    ? path.resolve(process.cwd(), configPath)
    : path.resolve(process.cwd(), 'promptproof.config.json');

  if (fs.existsSync(resolvedPath)) {
    try {
      const raw = fs.readFileSync(resolvedPath, 'utf-8');
      const json = JSON.parse(raw);
      return PromptProofConfigSchema.parse(json);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[promptproof] Failed to parse config file at ${resolvedPath}: ${msg}`);
    }
  }

  // Fallback defaults
  return PromptProofConfigSchema.parse({});
}
