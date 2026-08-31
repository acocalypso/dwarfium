import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { useEffect, useState } from "react";
import ConnectDwarfSTA from "@/components/setup/ConnectDwarfSTA";
import ConnectDwarf from "@/components/setup/ConnectDwarf";
import ConnectStellarium from "@/components/setup/ConnectStellarium";
import SetLocation from "@/components/setup/SetLocation";
import { useSetupConnection } from "@/hooks/useSetupConnection";
import { useLoadIntialValues } from "@/hooks/useLoadIntialValues";

export default function SetupScope() {
  useSetupConnection();
  useLoadIntialValues();
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
      <header className="dw-page-header">
        <div>
          <p className="dw-eyebrow">Device</p>
          <h1>Connection setup</h1>
          <p>
            Prepare your observing location, network and telescope integrations.
            Your saved values remain available between sessions.
          </p>
        </div>
      </header>

      <div className="dw-setup-intro">
        <section className="dw-panel">
          <div className="dw-panel-header">
            <div>
              <h2>{t("pFirstSteps")}</h2>
              <p>{t("pFirstStepsContent")}.</p>
            </div>
            <span className="dw-panel-icon">
              <i className="bi bi-signpost-split" aria-hidden="true" />
            </span>
          </div>
        </section>
        <section className="dw-panel">
          <div className="dw-panel-header">
            <div>
              <h2>Recommended order</h2>
              <p>Location → network → DWARF → Stellarium</p>
            </div>
          </div>
        </section>
      </div>

      <div className="dw-setup-stack">
        <details className="dw-setup-section" open>
          <summary>
            <i className="bi bi-geo-alt" aria-hidden="true" />
            Observing location
          </summary>
          <div className="dw-setup-section-body">
            <SetLocation />
          </div>
        </details>
        <details className="dw-setup-section">
          <summary>
            <i className="bi bi-wifi" aria-hidden="true" />
            DWARF network mode
          </summary>
          <div className="dw-setup-section-body">
            <ConnectDwarfSTA />
          </div>
        </details>
        <details className="dw-setup-section" open>
          <summary>
            <i className="bi bi-router" aria-hidden="true" />
            Connect your DWARF
          </summary>
          <div className="dw-setup-section-body">
            <ConnectDwarf />
          </div>
        </details>
        <details className="dw-setup-section">
          <summary>
            <i className="bi bi-stars" aria-hidden="true" />
            Stellarium integration
          </summary>
          <div className="dw-setup-section-body">
            <ConnectStellarium showInfoTxt={true} />
          </div>
        </details>
      </div>
    </div>
  );
}
