import type { Configuration, Parameters } from "./types.js";
import { fail, t } from "./errors.js";

export const PAGE_SIZE = 50;
export const folder = (config: Configuration): Parameters => config.folder ? { musicFolderId: config.folder } : {};
export function offsetOf(value = 0): number {
  if (!Number.isSafeInteger(value) || value < 0) throw fail("unavailable", t("This list position is invalid. Open the list again."));
  return value;
}
export function identifier(value: string): string {
  if (value === undefined || value === null || String(value) === "") throw fail("unavailable", t("This item has no server ID. Reload the library."));
  return String(value);
}
export function pageOf<T>(items: T[], offset = 0): { items: T[]; more: boolean } {
  return { items: items.slice(offset, offset + PAGE_SIZE), more: items.length > offset + PAGE_SIZE };
}
