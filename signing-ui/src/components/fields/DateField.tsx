interface Props {
  id: string;
  label?: string;
  required: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function DateField({ id, label, required, value, onChange, error }: Props) {
  return (
    <div className="w-full h-full flex items-center px-1">
      <input
        type="date"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs border-0 bg-transparent focus:outline-none focus:ring-0"
        aria-label={label ?? 'Date field'}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <span id={`${id}-error`} className="field-error" role="alert">{error}</span>}
    </div>
  );
}
