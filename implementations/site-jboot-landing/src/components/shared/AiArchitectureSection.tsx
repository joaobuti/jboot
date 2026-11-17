import { AgentPipeline } from "@/components/ai-first/AgentPipeline";
import { hubHomeContent, type HubLocale } from "@/content/hub-home-content";

type AiArchitectureContent = {
  eyebrow: string;
  title: string;
  description: string;
};

export function AiArchitectureSection({
  content = hubHomeContent.pipeline,
  locale = "pt",
}: {
  content?: AiArchitectureContent;
  locale?: HubLocale;
}) {
  return (
    <section
      id="pipeline"
      className="jb-ai-architecture-block ai-section ai-section--bordered"
      aria-labelledby="ai-architecture-title"
    >
      <div className="ai-container">
        <div className="ai-section-heading ai-section-heading--split">
          <div>
            <p className="ai-eyebrow">{content.eyebrow}</p>
            <h2 id="ai-architecture-title">{content.title}</h2>
          </div>
          <p>{content.description}</p>
        </div>
        <AgentPipeline autoStart locale={locale} />
      </div>
    </section>
  );
}
