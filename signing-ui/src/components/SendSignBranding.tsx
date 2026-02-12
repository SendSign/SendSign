import { useEffect, useRef, useState } from 'react';

interface BrandingConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  companyName: string;
  emailFooter: string | null;
  signingHeader: string | null;
  logoUrl: string | null;
  logoData: string | null;
  faviconUrl: string | null;
  customCss: string | null;
  isDefault: boolean;
  entitlementActive: boolean;
}

/**
 * SendSignBranding — Renders branding based on entitlement and config.
 *
 * - No entitlement: Default SendSign branding (always visible)
 * - Entitlement + no config: Clean white-label (nothing rendered)
 * - Entitlement + config: Custom branding (company name, logo, colors)
 */
export function SendSignBranding() {
  const ref = useRef<HTMLDivElement>(null);
  const [branding, setBranding] = useState<BrandingConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Fetch branding config from API
    const fetchBranding = async () => {
      try {
        const res = await fetch('/api/admin/branding');
        if (res.ok) {
          const data = await res.json();
          setBranding(data.data);
        }
      } catch {
        // On error, show default branding
      }
      setLoaded(true);
    };

    fetchBranding();
  }, []);

  // Apply custom CSS if provided
  useEffect(() => {
    if (branding?.customCss && branding.entitlementActive) {
      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-sendsign-custom', 'true');
      styleEl.textContent = branding.customCss;
      document.head.appendChild(styleEl);

      return () => {
        styleEl.remove();
      };
    }
  }, [branding]);

  // Apply custom favicon
  useEffect(() => {
    if (branding?.faviconUrl && branding.entitlementActive) {
      const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement
        || document.createElement('link');
      link.type = 'image/x-icon';
      link.rel = 'shortcut icon';
      link.href = branding.faviconUrl;
      document.head.appendChild(link);
    }
  }, [branding]);

  // Apply CSS custom properties for colors
  useEffect(() => {
    if (branding && branding.entitlementActive) {
      document.documentElement.style.setProperty('--sendsign-primary', branding.primaryColor);
      document.documentElement.style.setProperty('--sendsign-secondary', branding.secondaryColor);
      document.documentElement.style.setProperty('--sendsign-accent', branding.accentColor);
    }
  }, [branding]);

  // Runtime integrity check for default branding
  useEffect(() => {
    if (!branding?.entitlementActive) {
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
            console.warn('SendSign branding must remain visible. See LICENSE for details.');
          }
        };
        check();
        const interval = setInterval(check, 10000);
        return () => clearInterval(interval);
      }
    }
  }, [branding]);

  // Not loaded yet — render nothing
  if (!loaded) return null;

  // Entitlement active + no custom config → clean white-label (nothing)
  if (branding?.entitlementActive && branding.isDefault && !branding.companyName) {
    return null;
  }

  // Entitlement active + custom config → render custom branding
  if (branding?.entitlementActive && !branding.isDefault) {
    return (
      <div
        className="text-center py-4 text-xs border-t"
        style={{
          color: branding.secondaryColor,
          borderColor: branding.accentColor + '33',
        }}
        data-sendsign-branding="custom"
      >
        {branding.logoUrl && (
          <div className="mb-2">
            <img
              src={branding.logoUrl}
              alt={branding.companyName || 'Company Logo'}
              className="inline-block max-h-8"
            />
          </div>
        )}
        {branding.companyName && (
          <span className="font-semibold">{branding.companyName}</span>
        )}
      </div>
    );
  }

  // Default SendSign branding (no entitlement)
  return (
    <div
      ref={ref}
      className="text-center py-5 text-xs text-gray-400 border-t border-gray-100"
      data-sendsign-branding="true"
    >
      <div className="flex items-center justify-center gap-2.5 mb-2">
        <span className="font-medium">Powered by</span>
        <img 
          src="/sendsign-logo.svg" 
          alt="SendSign" 
            className="h-8 w-auto inline-block"
        />
      </div>
      <p className="text-gray-300">
        Electronic signatures secured with SHA-256 encryption
      </p>
    </div>
  );
}

/**
 * Signing header component — renders custom text above signing area.
 */
export function SigningHeader() {
  const [header, setHeader] = useState<string | null>(null);
  const [color, setColor] = useState('#2563EB');

  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const res = await fetch('/api/admin/branding');
        if (res.ok) {
          const data = await res.json();
          if (data.data.entitlementActive && data.data.signingHeader) {
            setHeader(data.data.signingHeader);
            setColor(data.data.primaryColor);
          }
        }
      } catch {
        // Ignore
      }
    };
    fetchBranding();
  }, []);

  if (!header) return null;

  return (
    <div
      className="text-center py-3 px-4 text-sm font-medium rounded-lg mb-4"
      style={{
        backgroundColor: color + '10',
        color: color,
        borderLeft: `4px solid ${color}`,
      }}
    >
      {header}
    </div>
  );
}
