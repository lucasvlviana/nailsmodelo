// Confere o arquivo shop.config.js sem subir o servidor:  npm run check
import { SHOP, BARBERS, SERVICES, THEME, priceLabel, openingHours, WEEKDAYS } from "../src/shared/catalog.js";

console.log(`\n✔ Configuração válida: ${SHOP.name}\n`);
console.log(`Profissionais (${BARBERS.length}):`);
for (const b of BARBERS) {
  const off = (b.daysOff || []).map((d) => WEEKDAYS[d]).join(", ") || "nenhuma";
  console.log(`  • ${b.name} (${b.id}) ${b.start}–${b.end} · folga: ${off}`);
}
console.log(`\nServiços (${SERVICES.length}):`);
for (const s of SERVICES) console.log(`  • ${s.name} — ${s.duration} min — ${priceLabel(s)}${s.barbers ? ` — só com: ${s.barbers.join(", ")}` : ""}`);
console.log("\nFuncionamento:");
for (const d of openingHours()) console.log(`  • ${WEEKDAYS[d.dow]}: ${d.opens}–${d.closes}`);
console.log(`\nTema: ${THEME.label} · WhatsApp: +${SHOP.whatsapp}\n`);

// Contraste das cores (WCAG): avisa se alguma combinação ficar difícil de ler no celular
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs = [["text", "bg"], ["text", "surface"], ["textMuted", "bg"], ["textMuted", "surface"], ["onAccent", "accent"], ["accent", "surface"], ["danger", "bg"], ["danger", "surface"], ["brandText", "brandBg"], ["onWhatsapp", "whatsapp"]];
const weak = pairs.filter(([f, b]) => ratio(THEME[f], THEME[b]) < 4.5);
if (weak.length) {
  console.log("⚠ Cores com pouco contraste (difíceis de ler no celular):");
  for (const [f, b] of weak) console.log(`  • theme.${f} sobre theme.${b}: ${ratio(THEME[f], THEME[b]).toFixed(1)}:1 (o ideal é 4.5:1 ou mais)`);
  console.log("");
} else console.log("✔ Contraste das cores adequado (WCAG AA).\n");
