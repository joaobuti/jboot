import { landingContent } from "@/content/landing-content";
import { Reveal } from "@/components/Reveal";

export function ClientsSection() {
  return (
    <section className="section section-light" id="clientes" aria-labelledby="clients-title">
      <div className="section-inner">
        <Reveal as="div" className="section-heading">
          <p className="eyebrow eyebrow-dark">{landingContent.clients.eyebrow}</p>
          <h2 id="clients-title">{landingContent.clients.title}</h2>
          <p>{landingContent.clients.description}</p>
        </Reveal>

        <div className="client-grid">
          {landingContent.clients.items.map((client, index) => (
            <Reveal as="article" className="client-item" key={client.name} delayMs={index * 60}>
              <strong>{client.name}</strong>
              <span>{client.segment}</span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
