import { memo } from 'react';
import type { FieldData } from '../types/index';
import {
  SignatureField,
  InitialField,
  DateField,
  TextField,
  CheckboxField,
  RadioGroupField,
  DropdownField,
  NumberField,
  CurrencyField,
  CalculatedField,
  AttachmentField,
} from './fields/index';

interface FieldOverlayProps {
  field: FieldData;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  required: boolean;
  completed: boolean;
  errors: string[];
  pageWidth?: number;
  pageHeight?: number;
  scale?: number;
}

export const FieldOverlay = memo(function FieldOverlay({
  field,
  value,
  onChange,
  visible,
  required,
  completed,
  errors,
}: FieldOverlayProps) {
  if (!visible) return null;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${field.x}%`,
    top: `${field.y}%`,
    width: `${field.width}%`,
    height: `${field.height}%`,
    minHeight: '24px',
    minWidth: '24px',
  };

  const borderClass = completed
    ? 'border-green-500 bg-green-50/30'
    : required
      ? 'border-blue-400 bg-blue-50/40 animate-pulse'
      : 'border-gray-300 bg-gray-50/30';

  const error = errors.length > 0 ? errors[0] : undefined;

  const renderField = () => {
    switch (field.type) {
      case 'signature':
        return <SignatureField id={field.id} label={field.label} required={required} value={value} onChange={onChange} completed={completed} />;
      case 'initial':
        return <InitialField id={field.id} label={field.label} required={required} value={value} onChange={onChange} />;
      case 'date':
        return <DateField id={field.id} label={field.label} required={required} value={value} onChange={onChange} error={error} />;
      case 'text':
        return <TextField id={field.id} label={field.label} required={required} value={value} onChange={onChange} error={error} />;
      case 'checkbox':
        return <CheckboxField id={field.id} label={field.label} required={required} value={value} onChange={onChange} />;
      case 'radio':
        return <RadioGroupField id={field.id} label={field.label} required={required} value={value} options={field.options ?? []} onChange={onChange} />;
      case 'dropdown':
        return <DropdownField id={field.id} label={field.label} required={required} value={value} options={field.options ?? []} onChange={onChange} error={error} />;
      case 'number':
        return <NumberField id={field.id} label={field.label} required={required} value={value} onChange={onChange} error={error} />;
      case 'currency':
        return <CurrencyField id={field.id} label={field.label} required={required} value={value} onChange={onChange} error={error} />;
      case 'calculated':
        return <CalculatedField id={field.id} label={field.label} value={value} />;
      case 'attachment':
        return <AttachmentField id={field.id} label={field.label} required={required} value={value} onChange={onChange} />;
      default:
        return <TextField id={field.id} label={field.label} required={required} value={value} onChange={onChange} />;
    }
  };

  return (
    <div
      style={style}
      className={`absolute border-2 rounded transition-all ${borderClass}`}
      data-field-id={field.id}
      data-field-type={field.type}
    >
      {renderField()}
    </div>
  );
});
