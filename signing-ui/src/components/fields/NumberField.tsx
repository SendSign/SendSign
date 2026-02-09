interface Props {
  id: string;
  label?: string;
  required: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  min?: number;
  max?: number;
  step?: number;
}

export function NumberField({ id, label, required, value, onChange, error, min, max, step }: Props) {
  return (
    <div className="w-full h-full flex items-center px-1">
      <input
        type="number"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label ?? '0'}
        min={min}
        max={max}
        step={step}
        className="w-full text-xs border-0 bg-transparent focus:outline-none focus:ring-0"
        aria-label={label ?? 'Number field'}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <span id={`${id}-error`} className="field-error text-[10px]" role="alert">{error}</span>}
    </div>
  );
}
