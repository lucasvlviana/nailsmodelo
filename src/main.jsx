import { createRoot } from "react-dom/client";
import "./styles/theme.css";
import { SHOP, THEME, FONTS } from "./shared/catalog.js";
import { THEMES, resolveTheme, themeVars } from "./shared/themes.js";
import BookingPage from "./pages/BookingPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import MyBookingPage from "./pages/MyBookingPage.jsx";

// Aplica o tema de shop.config.js. (O servidor já injeta as mesmas cores no HTML para a página abrir
// sem "piscar"; isto garante o mesmo resultado em desenvolvimento e na troca de tema da demonstração.)
const demoTheme = SHOP.demoThemes ? new URLSearchParams(location.search).get("tema") : null;
const theme = demoTheme && THEMES[demoTheme] ? resolveTheme(demoTheme) : THEME;
for (const [name, value] of Object.entries(themeVars(theme, FONTS))) document.documentElement.style.setProperty(name, value);
document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.brandBg);
document.title = `${SHOP.name} · Agende seu horário`;

const path = location.pathname;
const Page = path.startsWith("/admin") ? AdminPage : path.startsWith("/meu-agendamento") ? MyBookingPage : BookingPage;
createRoot(document.getElementById("root")).render(<Page />);
