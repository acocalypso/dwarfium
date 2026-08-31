import React from "react";
import AstroDwarfSessionUI from "@/components/scheduler/AstroScheduler";
import PageHeader from "@/components/shared/PageHeader";

const WeatherForeCast = () => {
  return (
    <div className="dw-page">
      <PageHeader
        eyebrow="Plan"
        title="Observation scheduler"
        description="Build and manage automated target sequences for your observing window."
      />
      <section className="dw-panel dw-tool-panel">
        <AstroDwarfSessionUI />
      </section>
    </div>
  );
};

export default WeatherForeCast;
