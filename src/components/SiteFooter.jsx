import { MapPin, ExternalLink, Instagram, MessageCircle } from "lucide-react";
import { SHOP } from "../shared/catalog.js";

export default function SiteFooter() {
  const a = SHOP.address;
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__title">{SHOP.name}</div>
        {a && (
          <address>
            <MapPin size={17} aria-hidden="true" />
            <span>{`${a.street} - ${a.district}, ${a.city} - ${a.state}, ${a.zip}`}</span>
          </address>
        )}
        <div className="site-footer__links">
          {a?.mapUrl && (
            <a href={a.mapUrl} target="_blank" rel="noopener noreferrer">
              Como chegar <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
          <a href={`https://wa.me/${SHOP.whatsapp}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={15} aria-hidden="true" /> WhatsApp
          </a>
          {SHOP.instagram && (
            <a href={SHOP.instagram} target="_blank" rel="noopener noreferrer">
              <Instagram size={15} aria-hidden="true" /> Instagram
            </a>
          )}
        </div>
        <div className="site-footer__legal">
          Usamos seu nome e telefone apenas para gerenciar o agendamento (LGPD).{" "}
          <a href="/admin">Área da profissional</a>
          {SHOP.credit && (
            <>
              {" · "}
              <a href={SHOP.credit.url} target="_blank" rel="noopener noreferrer">{SHOP.credit.name}</a>
            </>
          )}
        </div>
      </div>
    </footer>
  );
}
