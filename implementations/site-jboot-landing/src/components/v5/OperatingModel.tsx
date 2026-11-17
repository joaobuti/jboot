import { v5Content } from "@/content/v5-content";

export function OperatingModel() {
  return (
    <section className="v5-section v5-operating" id={v5Content.operatingModel.id} aria-labelledby="v5-operating-title">
      <div className="v5-container">
        <div className="v5-section-heading">
          <p className="v5-eyebrow">{v5Content.operatingModel.eyebrow}</p>
          <h2 id="v5-operating-title">{v5Content.operatingModel.headline}</h2>
        </div>
        <div className="v5-timeline">
          {v5Content.operatingModel.steps.map((step, index) => (
            <article className="v5-step" key={step.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
