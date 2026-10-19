// Temas prontos. Para trocar o visual de um studio, basta escolher um nome em shop.config.js:
//   theme: "rose"   |   theme: "nude"   |   theme: "orquidea"   |   theme: "noir"
// Também dá para ajustar só algumas cores: theme: { preset: "rose", accent: "#0a7d4b" }
//
// Este arquivo é usado tanto pelo site quanto pelo servidor (que injeta as cores no HTML,
// para a página já abrir com o tema certo, sem "piscar").

export const THEMES = {
  // Rosé e ameixa: delicado e acolhedor
  rose: {
    label: "Rosé",
    bg: "#fbf1ef",
    surface: "#fffaf8",
    surface2: "#f5e3df",
    text: "#3b2230",
    textMuted: "#7a5c68",
    border: "#ead3ce",
    accent: "#b0386a",
    onAccent: "#fff7fa",
    danger: "#a4161f",
    brandBg: "#4a1f36",
    brandText: "#fdeef0",
    decoA: "#d9648a",
    decoB: "#f6c9d3",
    decoC: "#c9a45f",
    whatsapp: "#25d366",
    onWhatsapp: "#0b2a17",
  },
  // Areia e terracota: elegante e neutro
  nude: {
    label: "Nude",
    bg: "#f4ece4",
    surface: "#fffaf5",
    surface2: "#eadccf",
    text: "#3a2b24",
    textMuted: "#6f5a4e",
    border: "#dcc9b8",
    accent: "#9a5a3c",
    onAccent: "#fff8f1",
    danger: "#a4161f",
    brandBg: "#3a2b24",
    brandText: "#f6ece2",
    decoA: "#c98b6b",
    decoB: "#ead2bd",
    decoC: "#a9835f",
    whatsapp: "#25d366",
    onWhatsapp: "#0b2a17",
  },
  // Lilás e ameixa: moderno e divertido
  orquidea: {
    label: "Orquídea",
    bg: "#f3eef8",
    surface: "#fbf8ff",
    surface2: "#e7def2",
    text: "#2b2140",
    textMuted: "#625778",
    border: "#d5c8e6",
    accent: "#6b3fa0",
    onAccent: "#fbf8ff",
    danger: "#a4161f",
    brandBg: "#2b2140",
    brandText: "#f3eef8",
    decoA: "#8f6fd0",
    decoB: "#d9c8f0",
    decoC: "#e58fb5",
    whatsapp: "#25d366",
    onWhatsapp: "#0b2a17",
  },
  // Preto com rosé gold: sofisticado
  noir: {
    label: "Noir",
    bg: "#161214",
    surface: "#211a1d",
    surface2: "#2c2327",
    text: "#f5e9e8",
    textMuted: "#b3a0a3",
    border: "#43363b",
    accent: "#e0a1a0",
    onAccent: "#1d1214",
    danger: "#ef8a84",
    brandBg: "#0d0a0b",
    brandText: "#f5e9e8",
    decoA: "#e0a1a0",
    decoB: "#b76e79",
    decoC: "#d8b36a",
    whatsapp: "#25d366",
    onWhatsapp: "#0b2a17",
  },
};

// Fontes do sistema: carregam instantaneamente e não fazem nenhuma requisição a terceiros (bom para a LGPD).
// Para usar uma fonte própria, veja docs/NOVO-CLIENTE.md.
export const DEFAULT_FONTS = {
  display: '"Cormorant Garamond", "Playfair Display", "Didot", "Bodoni MT", "Hoefler Text", Georgia, "Times New Roman", serif',
  body: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const HEX = /^#[0-9a-f]{6}$/i;

// Aceita "rose", { preset: "noir", accent: "#ff0000" } ou um tema completo
export function resolveTheme(spec = "rose") {
  const preset = typeof spec === "string" ? spec : spec.preset || "rose";
  const base = THEMES[preset];
  if (!base) throw new Error(`Tema "${preset}" não existe. Opções: ${Object.keys(THEMES).join(", ")}`);
  const theme = { ...base, ...(typeof spec === "object" ? spec : {}) };
  delete theme.preset;
  for (const [key, value] of Object.entries(theme)) {
    if (key !== "label" && !HEX.test(value)) throw new Error(`Cor inválida em theme.${key}: "${value}" (use o formato #rrggbb)`);
  }
  return theme;
}

const VAR_NAMES = {
  bg: "--bg", surface: "--surface", surface2: "--surface-2", text: "--text", textMuted: "--text-muted",
  border: "--border", accent: "--accent", onAccent: "--on-accent", danger: "--danger",
  brandBg: "--brand-bg", brandText: "--brand-text", decoA: "--deco-a", decoB: "--deco-b", decoC: "--deco-c", whatsapp: "--whatsapp", onWhatsapp: "--on-whatsapp",
};

export function themeVars(theme, fonts = DEFAULT_FONTS) {
  const vars = {};
  for (const [key, cssName] of Object.entries(VAR_NAMES)) vars[cssName] = theme[key];
  vars["--font-display"] = fonts.display || DEFAULT_FONTS.display;
  vars["--font-body"] = fonts.body || DEFAULT_FONTS.body;
  return vars;
}

export const themeCss = (theme, fonts) =>
  // ":root:root" tem mais força que o ":root" do CSS padrão, então o tema vence qualquer que seja a ordem de carregamento
  `:root:root{${Object.entries(themeVars(theme, fonts)).map(([k, v]) => `${k}:${v}`).join(";")}}`;
