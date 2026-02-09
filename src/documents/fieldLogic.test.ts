import { describe, it, expect } from 'vitest';
import { evaluateFormula, evaluateCondition, resolveFieldState } from './fieldLogic.js';

describe('evaluateFormula', () => {
  it('evaluates simple addition', () => {
    expect(evaluateFormula('{a} + {b}', { a: 10, b: 20 })).toBe(30);
  });

  it('evaluates mixed operations', () => {
    expect(evaluateFormula('{a} + {b} * 2', { a: 10, b: 5 })).toBe(20);
  });

  it('evaluates with parentheses', () => {
    expect(evaluateFormula('({a} + {b}) * 2', { a: 10, b: 5 })).toBe(30);
  });

  it('handles division', () => {
    expect(evaluateFormula('{total} / {count}', { total: 100, count: 4 })).toBe(25);
  });

  it('handles division by zero', () => {
    expect(evaluateFormula('{a} / {b}', { a: 10, b: 0 })).toBe(0);
  });

  it('handles missing fields as zero', () => {
    expect(evaluateFormula('{a} + {missing}', { a: 10 })).toBe(10);
  });

  it('handles null/empty values as zero', () => {
    expect(evaluateFormula('{a} + {b}', { a: 10, b: null })).toBe(10);
    expect(evaluateFormula('{a} + {b}', { a: 10, b: '' })).toBe(10);
  });

  it('handles complex formulas', () => {
    const result = evaluateFormula('{price} * {qty} + {tax}', { price: 99.99, qty: 2, tax: 15 });
    expect(result).toBeCloseTo(214.98, 2);
  });

  it('handles negative numbers', () => {
    expect(evaluateFormula('{a} + -5', { a: 10 })).toBe(5);
  });

  it('handles subtraction', () => {
    expect(evaluateFormula('{a} - {b}', { a: 100, b: 30 })).toBe(70);
  });
});

describe('evaluateCondition', () => {
  it('eq operator', () => {
    expect(evaluateCondition(
      { sourceFieldId: 'f1', operator: 'eq', value: 'yes', action: 'show' },
      { f1: 'yes' },
    )).toBe(true);
    expect(evaluateCondition(
      { sourceFieldId: 'f1', operator: 'eq', value: 'yes', action: 'show' },
      { f1: 'no' },
    )).toBe(false);
  });

  it('neq operator', () => {
    expect(evaluateCondition(
      { sourceFieldId: 'f1', operator: 'neq', value: 'yes', action: 'show' },
      { f1: 'no' },
    )).toBe(true);
  });

  it('gt operator', () => {
    expect(evaluateCondition(
      { sourceFieldId: 'f1', operator: 'gt', value: '100', action: 'require' },
      { f1: 150 },
    )).toBe(true);
    expect(evaluateCondition(
      { sourceFieldId: 'f1', operator: 'gt', value: '100', action: 'require' },
      { f1: 50 },
    )).toBe(false);
  });

  it('lt operator', () => {
    expect(evaluateCondition(
      { sourceFieldId: 'f1', operator: 'lt', value: '100', action: 'show' },
      { f1: 50 },
    )).toBe(true);
  });

  it('contains operator', () => {
    expect(evaluateCondition(
      { sourceFieldId: 'f1', operator: 'contains', value: 'hello', action: 'show' },
      { f1: 'say hello world' },
    )).toBe(true);
  });

  it('empty operator', () => {
    expect(evaluateCondition(
      { sourceFieldId: 'f1', operator: 'empty', action: 'hide' },
      { f1: null },
    )).toBe(true);
    expect(evaluateCondition(
      { sourceFieldId: 'f1', operator: 'empty', action: 'hide' },
      {},
    )).toBe(true);
    expect(evaluateCondition(
      { sourceFieldId: 'f1', operator: 'empty', action: 'hide' },
      { f1: 'value' },
    )).toBe(false);
  });
});

describe('resolveFieldState', () => {
  it('resolves calculated fields', () => {
    const fields = [
      { id: 'price', type: 'number' as const, required: true, value: null },
      { id: 'qty', type: 'number' as const, required: true, value: null },
      { id: 'total', type: 'calculated' as const, required: false, value: null, formula: '{price} * {qty}' },
    ];

    const resolved = resolveFieldState(fields, { price: 10, qty: 3 });
    const total = resolved.find((f) => f.id === 'total');
    expect(total?.calculatedValue).toBe(30);
    expect(total?.value).toBe('30');
  });

  it('resolves conditional visibility', () => {
    const fields = [
      { id: 'type', type: 'dropdown' as const, required: true, value: null },
      {
        id: 'details',
        type: 'text' as const,
        required: false,
        value: null,
        conditionalRules: [
          { sourceFieldId: 'type', operator: 'eq' as const, value: 'other', action: 'show' as const },
        ],
      },
    ];

    const resolved1 = resolveFieldState(fields, { type: 'other' });
    expect(resolved1.find((f) => f.id === 'details')?.visible).toBe(true);

    const resolved2 = resolveFieldState(fields, { type: 'standard' });
    // Default visible is true, only hidden if a 'hide' rule matches
    expect(resolved2.find((f) => f.id === 'details')?.visible).toBe(true);
  });

  it('hides fields when hide condition matches', () => {
    const fields = [
      { id: 'agree', type: 'checkbox' as const, required: true, value: null },
      {
        id: 'reason',
        type: 'text' as const,
        required: false,
        value: null,
        conditionalRules: [
          { sourceFieldId: 'agree', operator: 'eq' as const, value: 'true', action: 'hide' as const },
        ],
      },
    ];

    const resolved = resolveFieldState(fields, { agree: 'true' });
    expect(resolved.find((f) => f.id === 'reason')?.visible).toBe(false);
  });

  it('handles linked fields', () => {
    const fields = [
      { id: 'name_page1', type: 'text' as const, required: true, value: null, linkedGroupId: 'name_group' },
      { id: 'name_page2', type: 'text' as const, required: true, value: null, linkedGroupId: 'name_group' },
    ];

    const resolved = resolveFieldState(fields, { name_page1: 'John Doe' });
    expect(resolved.find((f) => f.id === 'name_page2')?.value).toBe('John Doe');
  });
});
