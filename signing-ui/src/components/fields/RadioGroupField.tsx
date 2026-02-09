interface Props {
  id: string;
  label?: string;
  required: boolean;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

export function RadioGroupField({ id, label, required, value, options, onChange }: Props) {
  return (
    <div className="w-full h-full flex items-center gap-2 px-1 overflow-auto" role="radiogroup" aria-label={label ?? 'Radio group'}>
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-1 text-xs whitespace-nowrap cursor-pointer">
          <input
            type="radio"
            name={id}
            value={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
            className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            aria-required={required}
          />
          {opt}
        </label>
      ))}
    </div>
  );
}
