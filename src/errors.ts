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
    10: "The server rejected a required request parameter.",
    20: "The server requires a newer Subsonic client API.",
    30: "The server must support Subsonic API 1.16.1 or newer.",
    40: "The server rejected the username or password.",
    41: "This account requires legacy authentication. Change the authentication mode in settings.",
    50: "This account does not have permission for this operation.",
    60: "The server requires an active Subsonic Premium subscription.",
    70: "The requested item was not found on the server.",
  };
  // Never display untrusted server errors: they may echo a credential URL.
  let category: ErrorCode = "server";
  if ([40, 41].includes(code)) category = "signIn";
  else if (code === 70) category = "unavailable";
  return new PluginError(category, t(messages[code] || "The Subsonic server could not complete the request."), code);
}
