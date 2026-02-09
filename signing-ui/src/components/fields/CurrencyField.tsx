interface Props {
  id: string;
  label?: string;
  required: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  symbol?: string;
}

export function CurrencyField({ id, label, required, value, onChange, error, symbol = '$' }: Props) {
  return (
    <div className="w-full h-full flex items-center px-1">
      <span className="text-xs text-gray-500 mr-1">{symbol}</span>
      <input
        type="number"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        step="0.01"
        className="w-full text-xs border-0 bg-transparent focus:outline-none focus:ring-0"
        aria-label={label ?? 'Currency field'}
        aria-required={required}
        aria-invalid={!!error}
      />
    </div>
  );
}
