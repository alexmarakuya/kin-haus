import path from "node:path";

/** Absolute path to the runtime data directory (data/). Single source of truth
 *  — import this instead of repeating path.join(process.cwd(), 'data') in
 *  every lib file. */
export const DATA_DIR = path.join(process.cwd(), "data");
