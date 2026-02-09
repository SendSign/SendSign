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

export interface FieldData {
  id: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  value: string | null;
  signerId: string | null;
  label?: string;
  options?: string[];
  formula?: string;
  conditionalRules?: ConditionalRule[];
  linkedGroupId?: string;
  validationRules?: ValidationRule[];
}

export interface ConditionalRule {
  sourceFieldId: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'empty';
  value?: string;
  action: 'show' | 'hide' | 'require';
}

export interface ValidationRule {
  type: 'text' | 'email' | 'date' | 'phone' | 'zipCode5' | 'zipCode9' | 'ssn' | 'url' | 'regex';
  pattern?: string;
  message?: string;
  min?: number;
  max?: number;
}

export interface SignerData {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

export interface EnvelopeData {
  id: string;
  subject: string;
  message: string | null;
}

export interface SigningSessionData {
  envelope: EnvelopeData;
  signer: SignerData;
  fields: FieldData[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
