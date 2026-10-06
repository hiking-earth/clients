export function startBackground(session: string, changed: () => void, error: (message: string) => void): boolean;
export function stopBackground(): void;
export function backgroundBuffer(): string;
export function acknowledgeBackground(timestamp: number): boolean;
