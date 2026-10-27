import { createRequire } from "node:module";

/** Garu's version, read once from this package's package.json: the one place it is written. */
export const VERSION: string = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
