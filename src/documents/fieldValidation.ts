import type { FieldType, ValidationRule } from './fieldTypes.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a field value against its type and validation rules.
 * Runs both client-side (signing UI) and server-side (API).
 */
export function validateFieldValue(
  value: string,
  fieldType: FieldType,
  validationRules: ValidationRule[] = [],
): ValidationResult {
  const errors: string[] = [];

  // Type-based validation
  switch (fieldType) {
    case 'number':
    case 'currency':
    case 'calculated':
      if (value !== '' && isNaN(Number(value))) {
        errors.push(`Value must be a valid number`);
      }
      break;
    case 'checkbox':
      if (value !== 'true' && value !== 'false' && value !== '') {
        errors.push('Checkbox value must be true or false');
      }
      break;
    case 'date':
      if (value !== '' && isNaN(Date.parse(value))) {
        errors.push('Invalid date format');
      }
      break;
    default:
      break;
  }

  // Rule-based validation
  for (const rule of validationRules) {
    const ruleResult = validateRule(value, rule);
    if (!ruleResult.valid) {
      errors.push(...ruleResult.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateRule(value: string, rule: ValidationRule): ValidationResult {
  const errors: string[] = [];

  switch (rule.type) {
    case 'text': {
      if (rule.min !== undefined && value.length < rule.min) {
        errors.push(rule.message ?? `Minimum length is ${rule.min} characters`);
      }
      if (rule.max !== undefined && value.length > rule.max) {
        errors.push(rule.message ?? `Maximum length is ${rule.max} characters`);
      }
      break;
    }

    case 'email': {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (value !== '' && !emailPattern.test(value)) {
        errors.push(rule.message ?? 'Invalid email address');
      }
      break;
    }

    case 'date': {
      if (value !== '' && isNaN(Date.parse(value))) {
        errors.push(rule.message ?? 'Invalid date format');
      }
      break;
    }

    case 'phone': {
      // E.164 format: + followed by 1-15 digits
      const phonePattern = /^\+[1-9]\d{1,14}$/;
      if (value !== '' && !phonePattern.test(value)) {
        errors.push(rule.message ?? 'Invalid phone number (expected E.164 format, e.g., +12125551234)');
      }
      break;
    }

    case 'zipCode5': {
      const zip5Pattern = /^\d{5}$/;
      if (value !== '' && !zip5Pattern.test(value)) {
        errors.push(rule.message ?? 'Invalid ZIP code (expected 5 digits, e.g., 10001)');
      }
      break;
    }

    case 'zipCode9': {
      const zip9Pattern = /^\d{5}-\d{4}$/;
      if (value !== '' && !zip9Pattern.test(value)) {
        errors.push(rule.message ?? 'Invalid ZIP+4 code (expected format: 12345-6789)');
      }
      break;
    }

    case 'ssn': {
      const ssnPattern = /^\d{3}-\d{2}-\d{4}$/;
      if (value !== '' && !ssnPattern.test(value)) {
        errors.push(rule.message ?? 'Invalid SSN format (expected XXX-XX-XXXX)');
      }
      break;
    }

    case 'url': {
      try {
        if (value !== '') new URL(value);
      } catch {
        errors.push(rule.message ?? 'Invalid URL');
      }
      break;
    }

    case 'regex': {
      if (rule.pattern && value !== '') {
        const regex = new RegExp(rule.pattern);
        if (!regex.test(value)) {
          errors.push(rule.message ?? `Value does not match required pattern`);
        }
      }
      break;
    }

    default:
      break;
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Mask an SSN for display (show last 4 only).
 */
export function maskSSN(ssn: string): string {
  if (!/^\d{3}-\d{2}-\d{4}$/.test(ssn)) return ssn;
  return `***-**-${ssn.slice(-4)}`;
}
