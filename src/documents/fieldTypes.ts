/**
 * Field type definitions for CoSeal documents.
 *
 * All coordinates are percentages (0-100) relative to page dimensions.
 */

export type FieldType =
  | 'signature'
  | 'initial'
  | 'date'
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'number'
  | 'currency'
  | 'calculated'
  | 'attachment';

export interface FieldPlacement {
  id: string;
  type: FieldType;
  page: number;
  x: number; // % from left
  y: number; // % from top
  width: number; // % of page width
  height: number; // % of page height
  signerId?: string;
  required: boolean;
  label?: string;
  value?: string;
}

export interface ValidationRule {
  type: 'text' | 'email' | 'date' | 'phone' | 'zipCode5' | 'zipCode9' | 'ssn' | 'url' | 'regex';
  pattern?: string; // for regex type
  message?: string; // custom error message
  min?: number;
  max?: number;
  decimals?: number;
}

export interface FieldConfig {
  type: FieldType;
  required: boolean;
  label?: string;
  defaultValue?: string;
  options?: string[]; // for radio/dropdown
  formula?: string; // for calculated fields
  groupId?: string; // for radio button groups
  linkedGroupId?: string; // for linked fields
  validationRules?: ValidationRule[];
  conditionalRules?: ConditionalRule[];
}

export interface ConditionalRule {
  sourceFieldId: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'empty';
  value?: string;
  action: 'show' | 'hide' | 'require';
}

export interface FilledField {
  fieldId: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
  signatureImage?: Buffer;
}

export interface AnchorFieldConfig {
  anchor: string;
  fieldType: FieldType;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  signerId?: string;
  required?: boolean;
}

export interface AnchorMatch {
  anchor: string;
  page: number;
  x: number;
  y: number;
}

export interface SignerRole {
  role: string;
  order: number;
  fields: FieldConfig[];
}

export interface ResolvedField {
  id: string;
  type: FieldType;
  visible: boolean;
  required: boolean;
  value: string | null;
  calculatedValue?: number;
}

/**
 * Map of field types to their display names.
 */
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  signature: 'Signature',
  initial: 'Initial',
  date: 'Date',
  text: 'Text',
  checkbox: 'Checkbox',
  radio: 'Radio Button',
  dropdown: 'Dropdown',
  number: 'Number',
  currency: 'Currency',
  calculated: 'Calculated',
  attachment: 'Attachment',
};

/**
 * Check if a string is a valid field type.
 */
export function isValidFieldType(type: string): type is FieldType {
  return type in FIELD_TYPE_LABELS;
}

/**
 * Get the default width and height for a field type (in % of page).
 */
export function getFieldDefaults(type: FieldType): { width: number; height: number } {
  switch (type) {
    case 'signature':
      return { width: 25, height: 6 };
    case 'initial':
      return { width: 10, height: 5 };
    case 'date':
      return { width: 20, height: 4 };
    case 'text':
      return { width: 30, height: 4 };
    case 'checkbox':
      return { width: 3, height: 3 };
    case 'radio':
      return { width: 3, height: 3 };
    case 'dropdown':
      return { width: 25, height: 4 };
    case 'number':
    case 'currency':
      return { width: 15, height: 4 };
    case 'calculated':
      return { width: 15, height: 4 };
    case 'attachment':
      return { width: 25, height: 10 };
    default:
      return { width: 20, height: 4 };
  }
}
