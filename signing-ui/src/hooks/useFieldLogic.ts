import { useState, useCallback, useMemo } from 'react';
import type { FieldData, ConditionalRule } from '../types/index';

export interface FieldState {
  values: Record<string, string>;
  visibility: Record<string, boolean>;
  required: Record<string, boolean>;
  errors: Record<string, string[]>;
  completed: Record<string, boolean>;
}

function evaluateCondition(
  rule: ConditionalRule,
  values: Record<string, string>,
): boolean {
  const sourceValue = values[rule.sourceFieldId] ?? '';

  switch (rule.operator) {
    case 'eq': return sourceValue === (rule.value ?? '');
    case 'neq': return sourceValue !== (rule.value ?? '');
    case 'gt': return Number(sourceValue) > Number(rule.value ?? 0);
    case 'lt': return Number(sourceValue) < Number(rule.value ?? 0);
    case 'contains': return sourceValue.includes(rule.value ?? '');
    case 'empty': return sourceValue === '';
    default: return false;
  }
}

function evaluateFormula(formula: string, values: Record<string, string>): string {
  let expr = formula.replace(/\{([^}]+)\}/g, (_, fieldId: string) => {
    const val = values[fieldId];
    if (!val || isNaN(Number(val))) return '0';
    return val;
  });
  expr = expr.replace(/\s+/g, '');
  try {
    return String(parseExpression(expr, { pos: 0 }));
  } catch {
    return '0';
  }
}

interface ParseState { pos: number; }

function parseExpression(expr: string, state: ParseState): number {
  let result = parseTerm(expr, state);
  while (state.pos < expr.length) {
    if (expr[state.pos] === '+') { state.pos++; result += parseTerm(expr, state); }
    else if (expr[state.pos] === '-') { state.pos++; result -= parseTerm(expr, state); }
    else break;
  }
  return result;
}

function parseTerm(expr: string, state: ParseState): number {
  let result = parseFactor(expr, state);
  while (state.pos < expr.length) {
    if (expr[state.pos] === '*') { state.pos++; result *= parseFactor(expr, state); }
    else if (expr[state.pos] === '/') {
      state.pos++;
      const d = parseFactor(expr, state);
      result = d === 0 ? 0 : result / d;
    } else break;
  }
  return result;
}

function parseFactor(expr: string, state: ParseState): number {
  if (expr[state.pos] === '(') {
    state.pos++;
    const r = parseExpression(expr, state);
    if (expr[state.pos] === ')') state.pos++;
    return r;
  }
  let neg = false;
  if (expr[state.pos] === '-') { neg = true; state.pos++; }
  const start = state.pos;
  while (state.pos < expr.length && ((expr[state.pos] >= '0' && expr[state.pos] <= '9') || expr[state.pos] === '.')) state.pos++;
  if (start === state.pos) return 0;
  const num = parseFloat(expr.substring(start, state.pos));
  return neg ? -num : num;
}

export function useFieldState(fields: FieldData[]) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) {
      if (f.value) v[f.id] = f.value;
      if (f.type === 'date' && !f.value) v[f.id] = new Date().toISOString().split('T')[0];
    }
    return v;
  });

  const resolvedState = useMemo(() => {
    const visibility: Record<string, boolean> = {};
    const required: Record<string, boolean> = {};
    const errors: Record<string, string[]> = {};
    const completed: Record<string, boolean> = {};

    // Handle linked fields
    const linkedGroups = new Map<string, string>();
    for (const f of fields) {
      if (f.linkedGroupId && values[f.id]) {
        linkedGroups.set(f.linkedGroupId, values[f.id]);
      }
    }

    for (const f of fields) {
      visibility[f.id] = true;
      required[f.id] = f.required;

      // Conditional rules
      if (f.conditionalRules) {
        for (const rule of f.conditionalRules) {
          if (evaluateCondition(rule, values)) {
            if (rule.action === 'show') visibility[f.id] = true;
            if (rule.action === 'hide') visibility[f.id] = false;
            if (rule.action === 'require') required[f.id] = true;
          }
        }
      }

      // Calculated fields
      if (f.type === 'calculated' && f.formula) {
        values[f.id] = evaluateFormula(f.formula, values);
      }

      // Check completion
      const val = values[f.id] ?? '';
      completed[f.id] = val !== '' && val !== 'false';
      errors[f.id] = [];
    }

    return { visibility, required, errors, completed };
  }, [fields, values]);

  const setValue = useCallback((fieldId: string, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [fieldId]: value };

      // Propagate linked fields
      const field = fields.find((f) => f.id === fieldId);
      if (field?.linkedGroupId) {
        for (const f of fields) {
          if (f.linkedGroupId === field.linkedGroupId && f.id !== fieldId) {
            next[f.id] = value;
          }
        }
      }

      return next;
    });
  }, [fields]);

  const completedCount = useMemo(() =>
    fields.filter((f) => resolvedState.visibility[f.id] && resolvedState.completed[f.id]).length,
    [fields, resolvedState],
  );

  const requiredCount = useMemo(() =>
    fields.filter((f) => resolvedState.visibility[f.id] && resolvedState.required[f.id]).length,
    [fields, resolvedState],
  );

  const requiredCompleted = useMemo(() =>
    fields.filter((f) =>
      resolvedState.visibility[f.id] && resolvedState.required[f.id] && resolvedState.completed[f.id],
    ).length,
    [fields, resolvedState],
  );

  const allRequiredComplete = requiredCompleted === requiredCount;

  return {
    values,
    setValue,
    visibility: resolvedState.visibility,
    required: resolvedState.required,
    errors: resolvedState.errors,
    completed: resolvedState.completed,
    completedCount,
    requiredCount,
    requiredCompleted,
    allRequiredComplete,
  };
}
