import { describe, it, expect } from 'vitest';
import { App } from '../src/App.js';

describe('AskDesk Operator Dashboard (Day 33)', () => {
  it('exports App component successfully', () => {
    expect(App).toBeDefined();
    expect(typeof App).toBe('function');
  });
});
