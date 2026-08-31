import React from "react";
import Weather from "@/components/Weather";
import PageHeader from "@/components/shared/PageHeader";

export default function WeatherForeCast() {
  return (
    <div className="dw-page">
      <PageHeader
        eyebrow="Conditions"
        title="Weather"
        description="Check current conditions and the forecast before starting an observing session."
      />
      <section className="dw-panel dw-conditions-panel">
        <Weather />
      </section>
    </div>
  );
}
