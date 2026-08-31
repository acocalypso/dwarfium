import React, { useEffect } from "react";
import PageHeader from "@/components/shared/PageHeader";

export default function SkyMap() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      import("aladin-lite").then((A) => {
        A.default.init.then(() => {
          // eslint-disable-next-line no-unused-vars
          let aladin = A.default.aladin("#aladin-lite-div", {
            target: "M42",
            fov: 3,
            projection: "AIT",
            cooFrame: "equatorial",
            showCooGridControl: true,
            showSimbadPointerControl: true,
            showCooGrid: true,
          });
        });
      });
    }
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
