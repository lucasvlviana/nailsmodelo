// Gera os segredos do .env:  npm run secrets
import crypto from "node:crypto";

const hex = () => crypto.randomBytes(32).toString("hex");
// senha forte e fácil de digitar (sem caracteres parecidos como 0/O ou 1/l)
const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const password = Array.from({ length: 16 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");

console.log(`
Copie estas linhas para o seu arquivo .env (cada studio deve ter valores DIFERENTES):

ADMIN_PASSWORD=${password}
SESSION_SECRET=${hex()}
DATA_KEY=${hex()}

IMPORTANTE:
- Guarde uma cópia da DATA_KEY em local seguro (gerenciador de senhas). Sem ela, os nomes e telefones salvos não podem ser lidos.
- Entregue a ADMIN_PASSWORD ao dono do studio por um canal seguro; ele pode trocá-la quando quiser.
`);
