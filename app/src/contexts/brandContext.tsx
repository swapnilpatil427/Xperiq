import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { useAppAuth } from '../lib/auth';
import { useApi } from '../hooks/useApi';
import { applyBrandTheme, saveBrandTheme, injectFonts, DEFAULT_BRAND_THEME } from '../lib/brandTheme';
import type { OrgProfile } from '../types';

interface BrandContextValue {
  logoUrl:     string | null;
  brandName:   string | null;
  isLoaded:    boolean;
  /** Re-fetch brand from API and re-apply. Call after saving brand settings. */
  reloadBrand: () => Promise<void>;
}

const BrandContext = createContext<BrandContextValue>({
  logoUrl:     null,
  brandName:   null,
  isLoaded:    false,
  reloadBrand: async () => {},
});

export function useBrand() {
  return useContext(BrandContext);
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAppAuth();
  const api = useApi();
  const [logoUrl,   setLogoUrl]   = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [isLoaded,  setIsLoaded]  = useState(false);

  const loadBrand = useCallback(async () => {
    if (!isSignedIn) { setIsLoaded(true); return; }
    try {
      const [orgRes, profileRes] = await Promise.all([
        api.getOrg().catch(() => null),
        api.getOrgProfile().catch(() => null),
      ]);
      const org     = (orgRes as { org?: { name?: string | null; logoUrl?: string | null } } | null)?.org;
      const profile = (profileRes as { profile?: OrgProfile | null } | null)?.profile;

      setLogoUrl(org?.logoUrl ?? profile?.logo_url ?? null);
      setBrandName(org?.name ?? profile?.brand_name ?? null);

      if (profile) {
        const colors = (profile.brand_colors ?? {}) as Record<string, string>;
        const fonts  = (profile.brand_fonts  ?? {}) as Record<string, string>;

        // Build partial theme from saved brand — only include defined values
        const partial: Partial<typeof DEFAULT_BRAND_THEME> = {};
        if (colors.primary)   partial.primary   = colors.primary;
        if (colors.accent)    partial.accent     = colors.accent;
        if (colors.secondary) partial.secondary  = colors.secondary;
        if (fonts.heading)    partial.fontHeading = fonts.heading;
        if (fonts.body)       partial.fontBody    = fonts.body;

        if (Object.keys(partial).length) {
          applyBrandTheme(partial);
          saveBrandTheme(partial);
          injectFonts(fonts.heading, fonts.body);
        }
      }
    } catch {
      // Silently fall back to localStorage theme (already applied by loadBrandTheme() in main.tsx)
    } finally {
      setIsLoaded(true);
    }
  }, [isSignedIn, api]);

  useEffect(() => { loadBrand(); }, [loadBrand]);

  return (
    <BrandContext.Provider value={{ logoUrl, brandName, isLoaded, reloadBrand: loadBrand }}>
      {children}
    </BrandContext.Provider>
  );
}
