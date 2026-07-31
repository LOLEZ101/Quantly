import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

export function repoPath(...parts: string[]): string {
  return join(ROOT, ...parts);
}
