# Studio Modelo Nails — agendamento online

Site de agendamento para studios de unhas (nail designer, manicure e pedicure): a cliente escolhe serviço, profissional (ou "sem preferência"), dia e horário pelo celular; a profissional acompanha tudo em um painel protegido por senha. Pronto para ser personalizado para cada studio **editando um único arquivo**.

**O que tem:** agenda sem conflito de horário · 1 ou vários profissionais, com folgas, almoço e preços por profissional · serviços exclusivos de uma profissional · bloqueio de horários/feriados · botão de WhatsApp · área do cliente (ver, cancelar e apagar os próprios dados) · painel com relatório mensal · temas de cores prontos · SEO local (Google) · instalável no celular (PWA) · LGPD: nome e telefone criptografados e apagados após o prazo configurado.

## Requisitos
- **Node.js 22.13 ou mais novo** (`node -v` para conferir). Não precisa instalar banco de dados nem compilar nada: o SQLite já vem dentro do Node.

## Primeira vez
```bash
npm install
npm run secrets      # gera a senha do painel e as chaves; copie para o arquivo .env
cp .env.example .env # (no Windows: copy .env.example .env) e cole o que o comando acima mostrou
npm run check        # confere shop.config.js e mostra um resumo (profissionais, serviços, horários)
npm run build        # prepara o site
npm start            # http://localhost:3000   ·   painel em /admin
```
Durante o desenvolvimento: `npm run dev:api` e, em outro terminal, `npm run dev:web`.

## Personalizar para um studio
Tudo em **`src/shared/shop.config.js`**: nome, endereço, WhatsApp, Instagram, tema de cores, profissionais (horário e folgas), serviços (duração e preço, inclusive preço diferente por profissional), almoço, dias fechados e prazo de guarda dos dados. O arquivo tem comentários explicando cada campo, e `npm run check` avisa em português se algo estiver errado.

Depois de qualquer alteração: `npm run build` e reinicie o servidor.

- **Cores:** `theme: "rose"` (rosé e ameixa), `"nude"` (areia e terracota), `"orquidea"` (lilás) ou `"noir"` (preto e rosé gold). Dá para ajustar uma cor: `theme: { preset: "rose", accent: "#0a7d4b" }`. O `npm run check` avisa se alguma cor ficar difícil de ler.
- **Logo e ícones:** coloque a logo em `public/` e informe `logo: "/logo.png"` (sem logo, aparece um vidrinho de esmalte nas cores do tema). Troque também `public/favicon.svg` e os PNGs (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon-32.png`).
- **Demonstração:** com `demoThemes: true`, a URL `?tema=noir` (ou `rose`/`nude`/`orquidea`) troca o visual ao vivo — ótimo para mostrar a possíveis clientes. **Desligue em studios reais.**

## Segurança e LGPD (resumo)
- Nome e telefone ficam **criptografados** (AES-256-GCM) no banco. Sem a `DATA_KEY`, uma cópia do banco não revela nada.
- O cliente acessa a própria reserva por um **link secreto** (256 bits; no banco fica só o hash) ou por **telefone + código de acesso**. Telefone sozinho nunca dá acesso.
- O cliente pode **cancelar e apagar os próprios dados** a qualquer momento; o dono também pode (painel).
- Dados pessoais de atendimentos antigos são apagados automaticamente após `retentionDays`.
- Limite de tentativas em login, reservas e consultas; cookies `HttpOnly` + `SameSite=Strict`; painel e área do cliente fora do Google (`noindex`).
- Nenhuma requisição a terceiros (sem Google Fonts, analytics ou rastreadores).

## Cópia de segurança
`npm run backup` cria um arquivo em `data/backups/` (pode rodar com o site no ar). Guarde também a `DATA_KEY`, **em outro lugar**: sem ela o backup não pode ser lido.

## Publicar
Funciona em qualquer serviço que rode Node 22.13+ com **disco persistente** e **HTTPS** (o banco é um arquivo). O `render.yaml` já está pronto para o Render; veja `docs/NOVO-CLIENTE.md` para o passo a passo completo. Em produção use `NODE_ENV=production`, defina `PUBLIC_URL` e configure as variáveis do `.env` no painel do serviço (nunca envie o `.env` para o Git).

## Estrutura
```
src/shared/shop.config.js   ← o único arquivo que muda de cliente para cliente
src/shared/catalog.js       regras da agenda (usadas pelo site e pelo servidor)
src/shared/themes.js        temas de cores
src/pages/                  telas: agendamento, área do cliente, painel
server/server.js            API, banco e geração do HTML (SEO e tema)
scripts/                    secrets, check, backup
docs/NOVO-CLIENTE.md        checklist para entregar uma novo studio
```
