export const t = (text: string): string => host.t(text);
export type ErrorCode = "setup" | "signIn" | "unavailable" | "unsupported" | "server" | "network";

export class PluginError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly subsonicCode?: number, public readonly httpStatus?: number) {
    super(message);
    this.name = "PluginError";
  }
}
export const fail = (code: ErrorCode, message: string): PluginError => new PluginError(code, message);

export function apiFailure(error: { code: number } | undefined): PluginError {
  const code = Number(error?.code ?? 0);
  const messages: Record<number, string> = {
    10: "The server could not understand this request. Check that it supports the required Subsonic feature.",
    20: "This server requires a newer Subsonic API version than this plugin uses.",
    30: "This server's Subsonic API is too old. Version 1.16.1 or newer is required.",
    40: "Sign-in failed. Check your username and password.",
    41: "This server requires password sign-in. Set Sign-in method to legacy in the plugin settings.",
    50: "Your account is not allowed to do this. Ask your server administrator for access.",
    60: "The server requires an active Subsonic Premium subscription.",
    70: "This item is no longer available on the server. Reload the library.",
  };
  // Never display untrusted server errors: they may echo a credential URL.
  let category: ErrorCode = "server";
  if ([40, 41].includes(code)) category = "signIn";
  else if (code === 70) category = "unavailable";
  return new PluginError(category, t(messages[code] || "The server could not complete this action. Try again; if it keeps failing, check the server logs."), code);
}
