import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { repoPath } from "../config/paths.js";

export function createAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

export function loadSchema(relativePath: string) {
  return JSON.parse(readFileSync(repoPath(relativePath), "utf8"));
}
