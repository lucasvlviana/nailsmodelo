import { createServer } from "vite";
import config from "../vite.config.js";

const server = await createServer({ ...config, configFile: false });
await server.listen();
server.printUrls();

const close = async () => {
  await server.close();
  process.exit(0);
};
process.once("SIGINT", close);
process.once("SIGTERM", close);
