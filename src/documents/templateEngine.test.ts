import { describe, it, expect } from 'vitest';
import { createTemplate, instantiateTemplate } from './templateEngine.js';
import type { FieldConfig, SignerRole } from './fieldTypes.js';

describe('createTemplate', () => {
  it('creates a template with field config and signer roles', async () => {
    const fieldConfig: FieldConfig[] = [
      { type: 'signature', required: true, label: 'Sign Here' },
      { type: 'date', required: true, label: 'Date' },
    ];

    const signerRoles: SignerRole[] = [
      { role: 'signer', order: 1, fields: fieldConfig },
      { role: 'witness', order: 2, fields: [{ type: 'signature', required: true, label: 'Witness' }] },
    ];

    const template = await createTemplate(Buffer.from('pdf'), fieldConfig, signerRoles);
    expect(template.id).toBeTruthy();
    expect(template.fieldConfig).toEqual(fieldConfig);
    expect(template.signerRoles).toHaveLength(2);
  });
});

describe('instantiateTemplate', () => {
  it('generates field placements for each signer', async () => {
    const fieldConfig: FieldConfig[] = [
      { type: 'signature', required: true },
      { type: 'date', required: true },
    ];

    const signerRoles: SignerRole[] = [
      { role: 'signer', order: 1, fields: fieldConfig },
    ];

    const template = await createTemplate(Buffer.from('pdf'), fieldConfig, signerRoles);

    const { fields } = await instantiateTemplate(template, [
      { role: 'signer', name: 'Alice', email: 'alice@example.com' },
    ]);

    expect(fields).toHaveLength(2);
    expect(fields[0].type).toBe('signature');
    expect(fields[1].type).toBe('date');
    expect(fields[0].required).toBe(true);
  });

  it('skips signers with unknown roles', async () => {
    const template = await createTemplate(
      Buffer.from('pdf'),
      [],
      [{ role: 'signer', order: 1, fields: [{ type: 'signature', required: true }] }],
    );

    const { fields } = await instantiateTemplate(template, [
      { role: 'unknown', name: 'Bob', email: 'bob@example.com' },
    ]);

    expect(fields).toHaveLength(0);
  });
});
