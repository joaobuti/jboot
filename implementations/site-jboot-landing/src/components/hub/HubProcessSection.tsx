import type { HubHomeContent } from "@/content/hub-home-content";

export function HubProcessSection({ content }: { content: HubHomeContent }) {
  return (
    <section id="processo" className="ai-section ai-section--bordered">
      <div className="ai-container">
        <h2 className="ai-process-title">{content.process.title}</h2>
        <ol className="ai-process-grid">
          {content.process.steps.map(([title, body], index) => (
            <li key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></li>
          ))}
        </ol>
      </div>
    </section>
  );
}
