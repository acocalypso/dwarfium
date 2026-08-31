import Grid2 from "@mui/material/Unstable_Grid2";
import { Inner } from "@/components/witmotion/Inner";
import { ApplicationProvider } from "@/components/witmotion/ApplicationProvider";
import { Application } from "@/lib/witmotion/Application";
// import PolarAlign from "@/components/shared/PolarAlign";
import DwarfCameras from "@/components/DwarfCameras";
// import ConnectDwarfII from "@/components/setup/ConnectDwarfII";
import { useEffect, useState } from "react";
import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import PageHeader from "@/components/shared/PageHeader";

export default function WitSensorData() {
  const application = new Application();
  const { t } = useTranslation();
  // eslint-disable-next-line no-unused-vars
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");

  useEffect(() => {
    const storedLanguage = localStorage.getItem("language");
    if (storedLanguage) {
      setSelectedLanguage(storedLanguage);
      i18n.changeLanguage(storedLanguage);
    }
  }, []);

  return (
    <div className="dw-page">
      <PageHeader
        eyebrow="Align"
        title="Polar alignment"
        description="Use the motion sensor and live camera view to align the mount with Polaris."
      />
      <section className="dw-panel dw-tool-panel">
        <ApplicationProvider application={application}>
          <div className="witsensor">
            <div className="witimage">
              <img src="/images/witmotion.png" alt="WitMotion" />
            </div>
            <Grid2 container spacing={2}>
              <Inner />
            </Grid2>
          </div>
        </ApplicationProvider>
      </section>
      <section className="dw-panel dw-tool-panel dw-polar-camera">
        <Grid2 container spacing={3}>
          <Grid2 md={12} xs={12} className="camera-container">
            <div className="camera-witmotion">
              <main className="camera-con">
                <DwarfCameras
                  setExchangeCamerasStatus={function () {}}
                  showWideangle={false}
                  useRawPreviewURL={false}
                  showControls={false}
                />
                <div className="overlay-circle"></div>
              </main>
            </div>
          </Grid2>
          <Grid2 md={12} xs={12} sm={12} className="altitude-description-wit">
            <div className="camera-witmotion-content  ms-4">
              <p>{t("cWitmotionPolaris1")}</p>
              <p>{t("cWitmotionPolaris2")}</p>
            </div>
          </Grid2>
        </Grid2>
      </section>
    </div>
  );
}
