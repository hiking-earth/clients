export function chooseTextFile(success: (text: string) => void, cancel: () => void, fail: (message: string) => void): void;
export function saveTextFile(name: string, text: string, success: () => void, cancel: () => void, fail: (message: string) => void): void;
