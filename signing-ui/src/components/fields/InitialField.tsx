import { useState } from 'react';
import { SignaturePad } from '../SignaturePad';

interface Props {
  id: string;
  label?: string;
  required: boolean;
  value: string;
  onChange: (value: string) => void;
}

export function InitialField({ id: _id, label, required, value, onChange }: Props) {
  const [showPad, setShowPad] = useState(false);

  return (
    <>
      <div
        className="w-full h-full flex items-center justify-center cursor-pointer"
        onClick={() => setShowPad(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowPad(true); }}
        role="button"
        tabIndex={0}
        aria-label={label ?? 'Initials field'}
        aria-required={required}
      >
        {value ? (
          <img src={value} alt="Your initials" className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-blue-600 text-xs font-medium">Initial</span>
        )}
      </div>

      {showPad && (
        <SignaturePad
          onApply={(dataUrl) => { onChange(dataUrl); setShowPad(false); }}
          onCancel={() => setShowPad(false)}
        />
      )}
    </>
  );
}
