"use client";

import { useState } from "react";
import { v5Content } from "@/content/v5-content";

export function HubPilot() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeModule = v5Content.hub.modules[activeIndex];

  return (
    <section className="v5-section v5-hub-section" id={v5Content.hub.id} aria-labelledby="v5-hub-title">
      <div className="v5-container">
        <div className="v5-section-heading">
          <p className="v5-eyebrow">{v5Content.hub.eyebrow}</p>
          <h2 id="v5-hub-title">{v5Content.hub.headline}</h2>
          <p>{v5Content.hub.description}</p>
        </div>
        <div className="v5-hub-console">
          <div className="v5-module-tabs" role="tablist" aria-label="Frentes do hub JBoot">
            {v5Content.hub.modules.map((module, index) => (
              <button
                aria-controls="v5-hub-panel"
                aria-selected={activeIndex === index}
                className="v5-module-tab"
                id={`v5-hub-tab-${index}`}
                key={module.name}
                onClick={() => setActiveIndex(index)}
                role="tab"
                type="button"
              >
                <i className={module.icon} aria-hidden="true" />
                <span>{module.name}</span>
              </button>
            ))}
          </div>
          <div
            aria-labelledby={`v5-hub-tab-${activeIndex}`}
            className={`v5-hub-panel v5-accent-${activeModule.accent}`}
            id="v5-hub-panel"
            role="tabpanel"
          >
            <div>
              <p className="v5-panel-kicker">{activeModule.role}</p>
              <h3>{activeModule.name}</h3>
              <p>{activeModule.status}</p>
            </div>
            <div className="v5-focus-grid">
              {activeModule.focus.map(item => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
