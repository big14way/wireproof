import "server-only";
import path from "node:path";

/** Where cases, captured media and the egress log are written. Point DATA_DIR at a persistent volume when hosted. */
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), ".data");

/** A saved demo case (`npm run seed:save`), committed so a fresh deploy opens on a real job. Read-only. */
export const SEED_DIR = path.join(process.cwd(), "seed");

/** On a hosted server, "start again" goes back to the seeded job so a visitor can't wipe the demo for everyone. */
export const HOSTED = process.env.WIREPROOF_HOSTED === "1";
