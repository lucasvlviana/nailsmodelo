# Checklist: entregar o sistema para uma novo studio

Cada studio tem a **sua própria cópia** do projeto, o **seu próprio banco** e **segredos diferentes**. Nunca compartilhe banco, `.env` ou senha entre clientes. Tempo estimado: 1 a 2 horas.

## 1. Levantar as informações (peça ao dono)
- [ ] Nome, frase de efeito (opcional), endereço completo e link do Google Maps
- [ ] WhatsApp (com DDD) e Instagram
- [ ] Profissionais: nome, horário de entrada/saída, folga semanal, especialidade (opcional)
- [ ] Serviços: nome, duração, preço (e se o preço muda por profissional; se algum serviço é só de uma profissional)
- [ ] Horário de almoço (ou "sem pausa") e dias em que a loja fecha
- [ ] Logo (PNG com fundo transparente) e cor preferida, se houver
- [ ] Endereço do site desejado (domínio próprio ou o do serviço de hospedagem)

## 2. Preparar o projeto
1. Copie a pasta do modelo para uma **nova pasta/repositório** com o nome do cliente.
2. Edite `src/shared/shop.config.js` com os dados acima e escolha o tema.
3. Rode `npm install` e `npm run check`: ele lista profissionais, serviços e horários e avisa se algo estiver errado.
4. Coloque a logo em `public/` (e `logo: "/logo.png"` na configuração) e troque os ícones (`favicon.svg` e PNGs).
5. Confira `demoThemes: false`.

## 3. Segredos
```bash
npm run secrets
```
Copie o resultado para o `.env` (local) **e** para as variáveis do serviço de hospedagem. Guarde a `DATA_KEY` num gerenciador de senhas — sem ela, nomes e telefones salvos não podem ser lidos. Use valores **diferentes** para cada cliente.

## 4. Testar localmente
`npm run build && npm start` e confira no celular (ou no modo celular do navegador):
- [ ] Fazer uma reserva completa e receber o ticket + código de acesso
- [ ] Reservar o mesmo horário de novo (deve ser recusado) e "sem preferência" (se houver 2+ profissionais)
- [ ] Dia de folga e horário de almoço aparecem indisponíveis
- [ ] Botão "Confirmar pelo WhatsApp" abre a conversa com o número certo
- [ ] Área do cliente: ver, cancelar, apagar dados
- [ ] Painel `/admin`: login, marcar "Já foi", bloquear um horário e um dia, relatório

## 5. Publicar (exemplo: Render)
1. Suba o projeto para um repositório **privado** (o `.gitignore` já exclui `.env`, `data/` e `node_modules`).
2. No Render: *New → Blueprint* apontando para o repositório (usa o `render.yaml`) ou crie um *Web Service* com disco persistente em `/var/data`.
3. Preencha `ADMIN_PASSWORD`, `SESSION_SECRET`, `DATA_KEY` e `PUBLIC_URL` (ex.: `https://www.seustudio.com.br`).
4. Em produção, `NODE_ENV=production` (já no `render.yaml`) exige HTTPS e senhas fortes: `ADMIN_PASSWORD` com 12+ caracteres e `SESSION_SECRET` com 32+.
5. Aponte o domínio próprio (se houver) e confirme o cadeado HTTPS.
6. Abra `/healthz` (deve responder `{"ok":true}`).

## 6. Entregar ao dono
- [ ] Mostrar o painel: agenda, "Já foi", cancelar, bloquear horários, relatório
- [ ] Entregar a senha do painel por canal seguro e orientar a guardá-la
- [ ] Colocar o link do agendamento no Instagram, no WhatsApp (mensagem automática) e no Google Meu Negócio; gerar um QR code para o balcão
- [ ] Explicar que cada cliente recebe um código de acesso na primeira reserva e que o dono pode apagar dados a pedido
- [ ] Combinar como serão feitas alterações (novos serviços/preços): editar `shop.config.js` → `npm run build` → publicar de novo

## 7. Depois da entrega
- Backup: `npm run backup` (agende semanalmente) e guarde fora do servidor.
- Atualizações de serviço/preço: só `shop.config.js`. **Nunca mude o `id` de uma profissional ou serviço** já usado em agendamentos (mude só o nome).
- Profissional que saiu: remova-o da lista; os atendimentos antigos continuam mostrando o nome dele no histórico.

## Mostrar o sistema para novos clientes (demonstração)
1. Faça uma cópia **só para demonstração**, com `demoThemes: true` e dados fictícios.
2. Publique em um endereço próprio (ex.: `demo.seudominio.com.br`).
3. Compartilhe `…/?tema=rose`, `…/?tema=nude`, `…/?tema=orquidea` e `…/?tema=noir` para o dono ver qual visual combina mais.
4. **Nunca use dados reais de clientes na demonstração.** Use o botão "Apagar todos os agendamentos" do painel para limpar de vez em quando.

## LGPD e contrato (leia)
Cada studio é a **controladora** dos dados dos próprios clientes; quem hospeda e mantém o sistema atua como **operador**. Formalize isso em contrato (responsabilidades, prazo de guarda, backup, o que acontece se o serviço for encerrado) e mantenha uma política de privacidade simples no site/WhatsApp do studio. Este documento é um guia técnico, não aconselhamento jurídico: consulte um advogado para o modelo de contrato.
