/**
 * Friendly model aliases mapped to real provider model names.
 * Day 11 requirement: "Map friendly model aliases to real model names in config, never in code."
 */
export const MODEL_ALIASES: Record<string, string> = {
  // Aliases
  fast: 'llama-3.1-8b-instant',
  smart: 'llama-3.3-70b-versatile',
  mixtral: 'mixtral-8x7b-32768',

  // Direct mappings
  'llama-3.1-8b': 'llama-3.1-8b-instant',
  'llama-3.1-8b-instant': 'llama-3.1-8b-instant',
  'llama-3.3-70b': 'llama-3.3-70b-versatile',
  'llama-3.3-70b-versatile': 'llama-3.3-70b-versatile',
  'mixtral-8x7b-32768': 'mixtral-8x7b-32768'
};

export const DEFAULT_MODEL = 'llama-3.1-8b-instant';

export function resolveModelName(aliasOrName: string): string {
  const normalized = aliasOrName.toLowerCase().trim();
  return MODEL_ALIASES[normalized] ?? normalized;
}
