import type { ConditionalRule, ResolvedField, FieldType } from './fieldTypes.js';

/**
 * Evaluate conditional rules to determine field visibility and requirements.
 */
export function evaluateCondition(
  rule: ConditionalRule,
  currentValues: Record<string, string | number | boolean | null>,
): boolean {
  const sourceValue = currentValues[rule.sourceFieldId];

  if (sourceValue === undefined || sourceValue === null) {
    return rule.operator === 'empty';
  }

  const sourceStr = String(sourceValue);
  const ruleValue = rule.value ?? '';

  switch (rule.operator) {
    case 'eq':
      return sourceStr === ruleValue;
    case 'neq':
      return sourceStr !== ruleValue;
    case 'gt':
      return Number(sourceStr) > Number(ruleValue);
    case 'lt':
      return Number(sourceStr) < Number(ruleValue);
    case 'contains':
      return sourceStr.includes(ruleValue);
    case 'empty':
      return sourceStr === '' || sourceStr === 'null';
    default:
      return false;
  }
}

/**
 * Safely evaluate arithmetic formulas referencing field values.
 * Supports: +, -, *, /, field references by ID ({field_id}), and numeric literals.
 * NO eval() — uses a recursive descent parser.
 */
export function evaluateFormula(
  formula: string,
  fieldValues: Record<string, string | number | boolean | null>,
): number {
  // Replace field references with their values
  let expression = formula.replace(/\{([^}]+)\}/g, (_, fieldId: string) => {
    const val = fieldValues[fieldId];
    if (val === undefined || val === null || val === '') return '0';
    const num = Number(val);
    return isNaN(num) ? '0' : String(num);
  });

  // Remove whitespace
  expression = expression.replace(/\s+/g, '');

  return parseExpression(expression, { pos: 0 });
}

interface ParseState {
  pos: number;
}

function parseExpression(expr: string, state: ParseState): number {
  let result = parseTerm(expr, state);

  while (state.pos < expr.length) {
    const op = expr[state.pos];
    if (op === '+') {
      state.pos++;
      result += parseTerm(expr, state);
    } else if (op === '-') {
      state.pos++;
      result -= parseTerm(expr, state);
    } else {
      break;
    }
  }

  return result;
}

function parseTerm(expr: string, state: ParseState): number {
  let result = parseFactor(expr, state);

  while (state.pos < expr.length) {
    const op = expr[state.pos];
    if (op === '*') {
      state.pos++;
      result *= parseFactor(expr, state);
    } else if (op === '/') {
      state.pos++;
      const divisor = parseFactor(expr, state);
      if (divisor === 0) return 0; // Prevent division by zero
      result /= divisor;
    } else {
      break;
    }
  }

  return result;
}

function parseFactor(expr: string, state: ParseState): number {
  // Handle parentheses
  if (expr[state.pos] === '(') {
    state.pos++; // skip '('
    const result = parseExpression(expr, state);
    if (expr[state.pos] === ')') state.pos++; // skip ')'
    return result;
  }

  // Handle negative numbers
  let negative = false;
  if (expr[state.pos] === '-') {
    negative = true;
    state.pos++;
  }

  // Parse number
  const start = state.pos;
  while (state.pos < expr.length && (isDigit(expr[state.pos]) || expr[state.pos] === '.')) {
    state.pos++;
  }

  if (start === state.pos) {
    return 0; // Unexpected character
  }

  const num = parseFloat(expr.substring(start, state.pos));
  return negative ? -num : num;
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

interface FieldForResolution {
  id: string;
  type: FieldType;
  required: boolean;
  value: string | null;
  conditionalRules?: ConditionalRule[];
  formula?: string;
  linkedGroupId?: string;
}

/**
 * Resolve field state: compute visibility, required status, and calculated values
 * for all fields given current input.
 */
export function resolveFieldState(
  allFields: FieldForResolution[],
  currentValues: Record<string, string | number | boolean | null>,
): ResolvedField[] {
  // First pass: handle linked fields (propagate values within groups)
  const linkedGroups = new Map<string, string | null>();
  for (const field of allFields) {
    if (field.linkedGroupId && currentValues[field.id] !== undefined && currentValues[field.id] !== null) {
      linkedGroups.set(field.linkedGroupId, String(currentValues[field.id]));
    }
  }

  // Apply linked group values
  for (const field of allFields) {
    if (field.linkedGroupId && linkedGroups.has(field.linkedGroupId)) {
      const groupValue = linkedGroups.get(field.linkedGroupId);
      if (groupValue !== undefined && (currentValues[field.id] === undefined || currentValues[field.id] === null)) {
        currentValues[field.id] = groupValue;
      }
    }
  }

  // Second pass: resolve each field
  return allFields.map((field) => {
    let visible = true;
    let required = field.required;
    let value = currentValues[field.id] !== undefined && currentValues[field.id] !== null
      ? String(currentValues[field.id])
      : field.value;
    let calculatedValue: number | undefined;

    // Evaluate conditional rules
    if (field.conditionalRules) {
      for (const rule of field.conditionalRules) {
        const conditionMet = evaluateCondition(rule, currentValues);
        if (conditionMet) {
          switch (rule.action) {
            case 'show':
              visible = true;
              break;
            case 'hide':
              visible = false;
              break;
            case 'require':
              required = true;
              break;
          }
        }
      }
    }

    // Evaluate calculated fields
    if (field.type === 'calculated' && field.formula) {
      calculatedValue = evaluateFormula(field.formula, currentValues);
      value = String(calculatedValue);
    }

    return {
      id: field.id,
      type: field.type,
      visible,
      required,
      value,
      calculatedValue,
    };
  });
}
