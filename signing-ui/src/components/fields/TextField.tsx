interface Props {
  id: string;
  label?: string;
  required: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function TextField({ id, label, required, value, onChange, error }: Props) {
  return (
    <div className="w-full h-full flex flex-col justify-center px-1">
      <input
        type="text"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label ?? 'Enter text'}
        className="w-full text-xs border-0 bg-transparent focus:outline-none focus:ring-0 placeholder-gray-400"
        aria-label={label ?? 'Text field'}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <span id={`${id}-error`} className="field-error text-[10px]" role="alert">{error}</span>}
    </div>
  );
}
