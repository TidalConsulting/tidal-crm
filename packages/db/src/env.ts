// Load the single repo-root .env, whichever package's script is running.
// Variables already set in the environment (e.g. in CI) take precedence.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
