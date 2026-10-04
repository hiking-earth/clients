export type PrivacyConsentKey = "location" | "backgroundLocation" | "teamLocation" | "trackCloudSync" | "gearImageUpload";
export type PrivacyConsents = Record<PrivacyConsentKey, boolean>;

const listeners = new Set<(consents: PrivacyConsents) => void>();

export function onPrivacyChange(listener: (consents: PrivacyConsents) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const STORAGE_KEY = "he_privacy_consents_v1";
const DEFAULT_CONSENTS: PrivacyConsents = {
  location: false,
  backgroundLocation: false,
  teamLocation: false,
  trackCloudSync: false,
  gearImageUpload: false,
};

export function getPrivacyConsents(): PrivacyConsents {
  try {
    const saved = uni.getStorageSync(STORAGE_KEY);
    if (!saved || typeof saved !== "object") return { ...DEFAULT_CONSENTS };
    return {
      location: saved.location === true,
      backgroundLocation: saved.backgroundLocation === true,
      teamLocation: saved.teamLocation === true,
      trackCloudSync: saved.trackCloudSync === true,
      gearImageUpload: saved.gearImageUpload === true,
    };
  } catch {
    return { ...DEFAULT_CONSENTS };
  }
}

export function hasPrivacyConsent(key: PrivacyConsentKey): boolean {
  return getPrivacyConsents()[key];
}

export function setPrivacyConsent(key: PrivacyConsentKey, enabled: boolean): PrivacyConsents {
  const next = { ...getPrivacyConsents(), [key]: enabled };
  uni.setStorageSync(STORAGE_KEY, next);
  listeners.forEach((listener) => listener(next));
  return next;
}
