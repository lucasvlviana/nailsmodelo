import { build } from "vite";
import config from "../vite.config.js";

// Load the shared Vite config directly, without asking Vite to bundle the config file.
await build({ ...config, configFile: false });
