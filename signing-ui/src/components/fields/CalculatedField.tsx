interface Props {
  id: string;
  label?: string;
  value: string;
}

export function CalculatedField({ id: _id, label, value }: Props) {
  return (
    <div className="w-full h-full flex items-center px-1">
      <span className="text-xs text-gray-700" aria-label={label ?? 'Calculated value'} aria-live="polite">
        {value || '—'}
      </span>
    </div>
  );
}
