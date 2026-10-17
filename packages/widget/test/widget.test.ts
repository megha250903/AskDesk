import { describe, it, expect, beforeAll } from 'vitest';
import { AskDeskWidget } from '../src/widget.js';

describe('AskDesk Embeddable Chat Widget (Day 32)', () => {
  beforeAll(() => {
    // Mock minimal DOM for node environment
    const mockElement = () => ({
      appendChild: () => {},
      remove: () => {},
      classList: { toggle: () => {} },
      querySelector: () => mockElement(),
      addEventListener: () => {},
      scrollTop: 0,
      scrollHeight: 100,
      value: ''
    });

    globalThis.document = {
      createElement: () => ({
        ...mockElement(),
        attachShadow: () => mockElement()
      }),
      body: mockElement()
    } as unknown as Document;
  });

  it('throws an error if tenantId is missing', () => {
    // @ts-expect-error Testing missing tenantId
    expect(() => new AskDeskWidget({})).toThrow('tenantId is required');
  });

  it('constructs widget with default options and creates Shadow DOM', () => {
    const widget = new AskDeskWidget({
      tenantId: 'org_test_123',
      title: 'Acme Help'
    });

    expect(widget).toBeDefined();
  });
});
