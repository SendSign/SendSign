import { useEffect, useRef } from 'react';

export function CoSealBranding() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Runtime integrity check: verify branding is visible
    const el = ref.current;
    if (el) {
      const check = () => {
        const style = window.getComputedStyle(el);
        if (
          el.offsetHeight === 0 ||
          style.visibility === 'hidden' ||
          parseFloat(style.opacity) === 0 ||
          style.display === 'none'
        ) {
          console.warn('CoSeal branding must remain visible. See LICENSE for details.');
        }
      };
      check();
      const interval = setInterval(check, 10000);
      return () => clearInterval(interval);
    }
  }, []);

  return (
    <div
      ref={ref}
      className="text-center py-4 text-xs text-gray-400 border-t border-gray-100"
      data-coseal-branding="true"
    >
      <span>Powered by </span>
      <a
        href="https://github.com/coseal"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-gray-500 hover:text-blue-600 transition-colors"
      >
        CoSeal
      </a>
      <span> — Open Source E-Signature Engine</span>
    </div>
  );
}
