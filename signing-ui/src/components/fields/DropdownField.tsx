interface Props {
  id: string;
  label?: string;
  required: boolean;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  error?: string;
}

export function DropdownField({ id, label, required, value, options, onChange, error }: Props) {
  return (
    <div className="w-full h-full flex items-center px-1">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs border-0 bg-transparent focus:outline-none focus:ring-0"
        aria-label={label ?? 'Dropdown'}
        aria-required={required}
        aria-invalid={!!error}
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}
