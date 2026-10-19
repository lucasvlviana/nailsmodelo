// Cópia de segurança consistente do banco (pode rodar com o site no ar):  npm run backup
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const { DB_PATH = "./data/studio.db" } = process.env;
if (!fs.existsSync(DB_PATH)) throw new Error(`Banco não encontrado em ${DB_PATH}`);
const dir = path.join(path.dirname(DB_PATH), "backups");
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const target = path.join(dir, `studio-${stamp}.db`);
const db = new DatabaseSync(DB_PATH);
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();
console.log(`Backup criado: ${target}`);
console.log("Os nomes e telefones continuam criptografados: guarde também a DATA_KEY (separada do backup).");
