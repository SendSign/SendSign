import { v4 as uuidv4 } from 'uuid';
import type { FieldConfig, FieldPlacement, SignerRole } from './fieldTypes.js';
import { getFieldDefaults } from './fieldTypes.js';

export interface TemplateData {
  id: string;
  name: string;
  documentKey: string;
  fieldConfig: FieldConfig[];
  signerRoles: SignerRole[];
}

export interface SignerInfo {
  role: string;
  name: string;
  email: string;
}

/**
 * Create a template from a PDF with field config and signer roles.
 */
export async function createTemplate(
  pdfData: Buffer,
  fieldConfig: FieldConfig[],
  signerRoles: SignerRole[],
): Promise<TemplateData> {
  const id = uuidv4();

  return {
    id,
    name: `Template ${id.substring(0, 8)}`,
    documentKey: '', // Set after uploading to storage
    fieldConfig,
    signerRoles,
  };
}

/**
 * Instantiate a template with actual signer information.
 * Generates field placements for each signer based on their role.
 */
export async function instantiateTemplate(
  template: TemplateData,
  signers: SignerInfo[],
): Promise<{ fields: FieldPlacement[] }> {
  const placements: FieldPlacement[] = [];

  // Match signers to roles
  for (const signer of signers) {
    const role = template.signerRoles.find((r) => r.role === signer.role);
    if (!role) continue;

    // Generate placements for this signer's fields based on the role config
    for (const fieldConfig of role.fields) {
      const defaults = getFieldDefaults(fieldConfig.type);

      placements.push({
        id: uuidv4(),
        type: fieldConfig.type,
        page: 1, // Default to page 1 unless specified
        x: 10 + placements.length * 5, // Auto-space fields
        y: 20 + role.order * 15, // Stagger by signer order
        width: defaults.width,
        height: defaults.height,
        signerId: undefined, // Will be set by the workflow engine
        required: fieldConfig.required,
        label: fieldConfig.label ?? `${signer.name} - ${fieldConfig.type}`,
        value: fieldConfig.defaultValue,
      });
    }
  }

  return { fields: placements };
}
