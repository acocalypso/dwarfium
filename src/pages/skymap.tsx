import React, { useEffect } from "react";
import PageHeader from "@/components/shared/PageHeader";

export default function SkyMap() {
  useEffect(() => {
    let cancelled = false;
    const container = document.querySelector("#aladin-lite-div");

    const labelControls = () => {
      const labels = [
        "Choose sky survey",
        "Center sky map",
        "Toggle coordinate grid",
        "Copy coordinates",
        "Zoom out",
        "Zoom in",
        "Change projection",
        "Toggle full screen",
      ];
      container?.querySelectorAll("button").forEach((button, index) => {
        if (!button.getAttribute("aria-label")) {
          const label = button.classList.contains("aladin-zoom-out")
            ? "Zoom out"
            : button.classList.contains("aladin-zoom-in")
              ? "Zoom in"
              : button.classList.contains("aladin-location-copy")
                ? "Copy coordinates"
                : labels[index] || `Sky map control ${index + 1}`;
          button.setAttribute("aria-label", label);
          button.setAttribute("title", label);
        }
      });
    };

    const observer = new MutationObserver(labelControls);
    if (container)
      observer.observe(container, { childList: true, subtree: true });

    if (typeof window !== "undefined") {
      import("aladin-lite").then((A) => {
        A.default.init.then(() => {
          if (cancelled || !container) return;
          container.replaceChildren();
          A.default.aladin(container, {
            target: "M42",
            fov: 3,
            projection: "AIT",
            cooFrame: "equatorial",
            showCooGridControl: true,
            showSimbadPointerControl: true,
            showCooGrid: true,
          });
          labelControls();
        });
      });
    }

    return () => {
      cancelled = true;
      observer.disconnect();
      container?.replaceChildren();
    };
  }, []);

  return (
    <div className="dw-page">
      <PageHeader
        eyebrow="Explore"
        title="Sky map"
        description="Explore the sky, inspect coordinates and identify targets in an interactive atlas."
      />
      <section className="dw-panel dw-sky-map">
        <div id="aladin-lite-div" />
      </section>
    </div>
  );
}
