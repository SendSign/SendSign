interface Props {
  id: string;
  label?: string;
  required: boolean;
  value: string;
  onChange: (value: string) => void;
}

export function CheckboxField({ id, label, required, value, onChange }: Props) {
  const checked = value === 'true';

  return (
    <div className="w-full h-full flex items-center justify-center">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        aria-label={label ?? 'Checkbox'}
        aria-required={required}
      />
    </div>
  );
}
