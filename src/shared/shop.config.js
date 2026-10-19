// =====================================================================================
//  CONFIGURAÇÃO DO STUDIO  —  este é o ÚNICO arquivo que você edita para cada cliente.
//  Depois de editar: npm run build  (e reinicie o servidor).
//  Se algo estiver errado aqui, o servidor avisa em português o que corrigir.
// =====================================================================================

export const SHOP = {
  // ---------- Identidade ----------
  name: "Studio Modelo Nails",
  tagline: "cuidado, cor e design nas suas unhas",
  description: "Agende seu horário online no Studio Modelo Nails: manicure, pedicure, esmaltação em gel, alongamento e nail art, sem fila e sem complicação.",
  logo: null, // ex.: "/logo.png" (coloque o arquivo na pasta public/). null = usa o vidrinho de esmalte

  // ---------- Contato ----------
  whatsapp: "5511900000000", // 55 + DDD + número, só dígitos
  instagram: "https://instagram.com/seuperfil", // ou null
  address: {
    street: "Rua dos Esmaltes, 123",
    district: "Centro",
    city: "São Paulo",
    state: "SP",
    zip: "01000-000",
    mapUrl: "https://maps.google.com/?q=Rua+dos+Esmaltes+123+Sao+Paulo", // link do Google Maps, ou null
  },

  // ---------- Visual ----------
  // "rose" (rosé e ameixa) | "nude" (areia e terracota) | "orquidea" (lilás) | "noir" (preto e rosé gold)
  // Ajustar uma cor: theme: { preset: "rose", accent: "#0a7d4b" }
  theme: "rose",
  demoThemes: false, // true = permite trocar o tema pela URL (?tema=noir) — útil só para mostrar a clientes

  // ---------- Regras da agenda ----------
  slotMinutes: 30, // intervalo entre horários
  lunch: { start: "12:00", end: "13:00" }, // pausa de todas as profissionais; null = sem pausa
  closedWeekdays: [0], // dias em que o studio fecha: 0=dom 1=seg 2=ter 3=qua 4=qui 5=sex 6=sáb
  bookAheadDays: 30, // até quantos dias à frente a cliente pode agendar
  retentionDays: 180, // dias até apagar nome/telefone dos atendimentos antigos (LGPD)

  // ---------- Profissionais ----------
  // (a chave técnica continua "barbers" — não renomeie; é só o nome interno da lista)
  // Para 1 profissional só, deixe apenas um item (o passo "Escolha a profissional" some sozinho).
  // id: sem espaços/acentos, nunca mude depois que houver agendamentos.
  // daysOff: folgas semanais desta profissional. lunch: (opcional) pausa própria, no lugar da geral.
  barbers: [
    { id: "camila", name: "Camila", specialty: "Alongamento em gel e nail art", start: "09:00", end: "18:00", daysOff: [1] },
    { id: "bia", name: "Bia", specialty: "Esmaltação em gel e spa dos pés", start: "10:00", end: "19:00", daysOff: [2] },
  ],

  // ---------- Serviços ----------
  // price: número (igual para todas) ou { idDaProfissional: valor } quando o preço muda conforme quem atende
  // duration: minutos (use múltiplos do intervalo, ex.: 30, 60, 90, 120)
  // barbers: (opcional) lista de quem faz o serviço; se omitir, todas fazem
  // priceFrom: true mostra "a partir de"
  services: [
    { id: "manicure", name: "Manicure", desc: "Cutilagem, hidratação e esmaltação tradicional", duration: 60, price: { camila: 45, bia: 40 } },
    { id: "pedicure", name: "Pedicure", desc: "Cutilagem, esfoliação e esmaltação tradicional", duration: 60, price: { camila: 50, bia: 45 } },
    { id: "mao-e-pe", name: "Mão + Pé", desc: "O combo completo de cuidado", duration: 120, price: { camila: 90, bia: 80 } },
    { id: "gel", name: "Esmaltação em gel", desc: "Brilho e durabilidade de até 3 semanas", duration: 60, price: { camila: 80, bia: 70 } },
    { id: "blindagem", name: "Blindagem em gel", desc: "Reforça a unha natural e ajuda a crescer", duration: 90, price: 110 },
    { id: "alongamento", name: "Alongamento em gel", desc: "Molde F1 ou tips, no formato que você preferir. Somente com a Camila", duration: 150, price: 190, priceFrom: true, barbers: ["camila"] },
    { id: "manutencao", name: "Manutenção do alongamento", desc: "Reposição e novo esmalte (a cada 15 a 21 dias). Somente com a Camila", duration: 120, price: 140, barbers: ["camila"] },
    { id: "nailart", name: "Nail art", desc: "Francesinha, decoração e pedrarias, por unha ou mão completa", duration: 30, price: 25, priceFrom: true },
    { id: "remocao", name: "Remoção de gel ou alongamento", desc: "Retirada segura, sem agredir a unha", duration: 30, price: 35 },
  ],

  // ---------- Opcional: crédito no rodapé (ex.: seu nome/empresa) ----------
  credit: null, // ex.: { name: "Site por Fulana", url: "https://seusite.com.br" }

  // ---------- Opcional: fontes ----------
  // fonts: { display: '"Minha Fonte", serif', body: "system-ui, sans-serif" },
};
