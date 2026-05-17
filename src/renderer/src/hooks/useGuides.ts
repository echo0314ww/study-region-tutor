import { useCallback, useState } from 'react';
import type { GuideKind } from '../uiTypes';
import { PRODUCT_GUIDE_SEEN_VERSION_KEY, RELEASE_GUIDE_SEEN_VERSION_KEY } from '../constants';
import type { GuideDefinition } from '../uiTypes';
import { guideDefinition, hasGuideContent } from '../guides';

export interface UseGuidesReturn {
  activeGuideKind: GuideKind | null;
  activeGuide: GuideDefinition | null;
  openGuide: (kind: GuideKind) => void;
  markGuideSeen: (kind: GuideKind) => void;
  setActiveGuideKind: (kind: GuideKind | null) => void;
}

export function useGuides(appVersion: string): UseGuidesReturn {
  const [activeGuideKind, setActiveGuideKind] = useState<GuideKind | null>(null);

  const activeGuide = activeGuideKind ? guideDefinition(activeGuideKind, appVersion || 'dev') : null;

  const markGuideSeen = useCallback(
    (kind: GuideKind): void => {
      if (appVersion && kind !== 'history') {
        const key = kind === 'product' ? PRODUCT_GUIDE_SEEN_VERSION_KEY : RELEASE_GUIDE_SEEN_VERSION_KEY;
        try {
          localStorage.setItem(key, appVersion);
        } catch {
          // Local storage can be unavailable in hardened environments
        }
      }

      setActiveGuideKind(null);
    },
    [appVersion]
  );

  const openGuide = useCallback((kind: GuideKind): void => {
    setActiveGuideKind(kind);
  }, []);

  return {
    activeGuideKind,
    activeGuide,
    openGuide,
    markGuideSeen,
    setActiveGuideKind
  };
}

export function shouldAutoShowGuide(appVersion: string, currentGuideKind: GuideKind | null): GuideKind | null {
  if (!appVersion || currentGuideKind) {
    return null;
  }

  try {
    const productSeenVersion = localStorage.getItem(PRODUCT_GUIDE_SEEN_VERSION_KEY);

    if (productSeenVersion !== appVersion) {
      return 'product';
    }

    const releaseSeenVersion = localStorage.getItem(RELEASE_GUIDE_SEEN_VERSION_KEY);

    if (releaseSeenVersion !== appVersion && hasGuideContent('release', appVersion)) {
      return 'release';
    }
  } catch {
    return 'product';
  }

  return null;
}
