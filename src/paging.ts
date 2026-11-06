import type { Configuration, Parameters } from "./types.js";
import { fail, t } from "./errors.js";

export const PAGE_SIZE = 50;
export const folder = (config: Configuration): Parameters => config.folder ? { musicFolderId: config.folder } : {};
export function offsetOf(value = 0): number {
  if (!Number.isSafeInteger(value) || value < 0) throw fail("unavailable", t("Invalid page offset."));
  return value;
}
export function identifier(value: string): string {
  if (value === undefined || value === null || String(value) === "") throw fail("unavailable", t("An item ID is required."));
  return String(value);
}
export function pageOf<T>(items: T[], offset = 0): { items: T[]; more: boolean } {
  return { items: items.slice(offset, offset + PAGE_SIZE), more: items.length > offset + PAGE_SIZE };
}
