export type PrivacyConsentKey = "location" | "backgroundLocation" | "teamLocation" | "trackCloudSync" | "gearImageUpload";
export type PrivacyConsents = Record<PrivacyConsentKey, boolean>;

const listeners = new Set<(consents: PrivacyConsents) => void>();

export function onPrivacyChange(listener: (consents: PrivacyConsents) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const STORAGE_PREFIX = "he_privacy_consents_v2:";
const DEFAULT_CONSENTS: PrivacyConsents = {
  location: false,
  backgroundLocation: false,
  teamLocation: false,
  trackCloudSync: false,
  gearImageUpload: false,
};

export function getPrivacyConsents(): PrivacyConsents {
  try {
    const owner=String(uni.getStorageSync('he_openid')||'anonymous');
    const saved = uni.getStorageSync(`${STORAGE_PREFIX}${encodeURIComponent(owner)}`);
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
  const owner=String(uni.getStorageSync('he_openid')||'anonymous');
  uni.setStorageSync(`${STORAGE_PREFIX}${encodeURIComponent(owner)}`, next);
  listeners.forEach((listener) => listener(next));
  return next;
}
