import { v2Content } from "@/content/v2-content";
import { Reveal } from "@/components/Reveal";

export function Faq() {
  return (
    <section className="section" id={v2Content.faq.id}>
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <h3 className="mb-4 fw-semibold text-center">{v2Content.faq.headline}</h3>

            <div className="accordion" id="v2-faq-accordion">
              {v2Content.faq.items.map((item, index) => {
                const id = `v2-faq-${index}`;
                return (
                  <Reveal as="div" className="accordion-item" key={item.question} delayMs={index * 60}>
                    <h2 className="accordion-header">
                      <button
                        className={`accordion-button ${index === 0 ? "" : "collapsed"}`}
                        type="button"
                        data-bs-toggle="collapse"
                        data-bs-target={`#${id}`}
                        aria-expanded={index === 0}
                        aria-controls={id}
                      >
                        {item.question}
                      </button>
                    </h2>
                    <div
                      id={id}
                      className={`accordion-collapse collapse ${index === 0 ? "show" : ""}`}
                      data-bs-parent="#v2-faq-accordion"
                    >
                      <div className="accordion-body text-muted">{item.answer}</div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
