import { useRef } from 'react';

interface Props {
  id: string;
  label?: string;
  required: boolean;
  value: string;
  onChange: (value: string) => void;
}

export function AttachmentField({ id: _id, label, required, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.size > 10 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFile}
        aria-label={label ?? 'Attachment'}
        aria-required={required}
      />
      {value ? (
        <img src={value} alt="Attachment" className="max-w-full max-h-full object-contain cursor-pointer" onClick={() => inputRef.current?.click()} />
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="text-blue-600 text-xs font-medium hover:text-blue-800"
        >
          Upload
        </button>
      )}
    </div>
  );
}
