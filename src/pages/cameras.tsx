import { useContext, useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

import { ConnectionContext } from "@/stores/ConnectionContext";

import DwarfCameras from "@/components/DwarfCameras";
import ImagingMenu from "@/components/imaging/ImagingMenu";
import OBSWebSocket from "obs-websocket-js";
import { getProxyUrl, isModeHttps } from "@/lib/get_proxy_url";

export default function AstroPhoto() {
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

  let connectionCtx = useContext(ConnectionContext);
  const [exchangeCamerasStatus, setExchangeCamerasStatus] = useState(false);
  // The wide camera is the framing overlay for the telephoto preview. Keep it
  // visible by default so starting the wide stream cannot succeed invisibly.
  const [showWideangle, setShowWideangle] = useState(true);
  const [useRawPreviewURL, setUseRawPreviewURL] = useState(false);

  let notConnected =
    connectionCtx.connectionStatus === undefined ||
    connectionCtx.connectionStatus === false;
  let noCoordinates =
    connectionCtx.latitude === undefined ||
    connectionCtx.longitude === undefined;
  let hasErrors = notConnected || noCoordinates;
  const [obs, setObs] = useState<OBSWebSocket | null>(null);
  const [obsError, setObsError] = useState<string | null>(null);
  const [isObsConnected, setIsObsConnected] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  useEffect(() => {
    const obsInstance = new OBSWebSocket();
    setObs(obsInstance);

    const checkConnection = async () => {
      try {
        const urlSocketOBS = "ws://localhost:4455";
        console.log("urlSocketOBS: ", urlSocketOBS);

        if (!isModeHttps())
          await obsInstance.connect(urlSocketOBS, "ZesqL9dGu2Uv3XlE");
        else {
          const urlProxySocketOBS = `${getProxyUrl(
            connectionCtx,
          )}?target=${urlSocketOBS}&token=ZesqL9dGu2Uv3XlE`;
          console.log("urlSocketOBS: ", urlProxySocketOBS);
          const wssProxySocketOBS = urlProxySocketOBS.replace("http", "ws");
          console.log("wssProxySocketOBS: ", wssProxySocketOBS);
          await obsInstance.connect(wssProxySocketOBS);
        }
        setIsObsConnected(true);
        setObsError(null);
        console.log("Verbonden met OBS WebSocket!");
      } catch (error: any) {
        console.warn("OBS WebSocket niet beschikbaar:", error.message);
        setIsObsConnected(false);
        setObsError(t("cOBSNotFound"));
      }
    };

    checkConnection(); // Probeer te verbinden

    obsInstance.on("ConnectionClosed", () => {
      setIsObsConnected(false);
      setObsError(t("cOBSSocketClose"));
    });

    return () => {
      obsInstance.disconnect().catch(() => {}); // Voorkom fouten bij disconnect
    };
  }, []);

  const toggleStreaming = async () => {
    if (!obs) {
      setObsError(t("cOBSSocketNotConnect"));
      return;
    }

    try {
      // Controleer eerst of OBS verbonden is
      const status = await obs.call("GetStreamStatus");

      if (!isStreaming && !status.outputActive) {
        // Start de stream
        await obs.call("StartStream");
        console.log("Stream gestart!");
        setIsStreaming(true);
      } else if (isStreaming && status.outputActive) {
        // Stop de stream
        await obs.call("StopStream");
        console.log("Stream gestopt!");
        setIsStreaming(false);
      } else {
        console.warn("Geen actie nodig, streamstatus is al correct.");
      }
    } catch (error: any) {
      console.error("Fout bij streamen:", error);
      setObsError(t("cOBSErrorStream"));
    }
  };

  if (hasErrors) {
    return (
      <div className="dw-page">
        <Head>
          <title>{t("cCameraTitle")}</title>
        </Head>
        <header className="dw-page-header">
          <div>
            <p className="dw-eyebrow">Observe</p>
            <h1>Camera workspace</h1>
            <p>
              Live preview, framing, focus and capture controls for your DWARF.
            </p>
          </div>
        </header>
        <section className="dw-empty-state" role="status">
          <div className="dw-empty-state-icon">
            <i className="bi bi-camera-video-off" aria-hidden="true" />
          </div>
          <h2>Camera workspace is not ready</h2>
          <p>
            Complete the items below, then return here to start the live
            preview.
          </p>
          <ul className="dw-check-list">
            <li>
              <i
                className={`bi ${notConnected ? "bi-exclamation-circle" : "bi-check-circle"}`}
                aria-hidden="true"
              />
              <span>
                {notConnected
                  ? t("cCameraConnection", {
                      DwarfType: connectionCtx.typeNameDwarf,
                    })
                  : `${connectionCtx.typeNameDwarf} is connected.`}
              </span>
            </li>
            <li>
              <i
                className={`bi ${noCoordinates ? "bi-exclamation-circle" : "bi-check-circle"}`}
                aria-hidden="true"
              />
              <span>
                {noCoordinates
                  ? t("cCameraLocation")
                  : "Observing location is set."}
              </span>
            </li>
          </ul>
          <div className="dw-action-row" style={{ justifyContent: "center" }}>
            <Link href="/setup-scope" className="dw-button">
              <i className="bi bi-router" aria-hidden="true" />
              Open connection setup
            </Link>
            <Link href="/" className="dw-button is-secondary">
              Back to dashboard
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="dw-page">
      <Head>
        <title>{t("cCameraTitle")}</title>
      </Head>
      <header className="dw-page-header">
        <div>
          <p className="dw-eyebrow">Observe</p>
          <h1>Camera workspace</h1>
          <p>
            Frame your target, tune the optics and control the active capture.
          </p>
        </div>
        <div className="dw-header-actions">
          <button
            onClick={toggleStreaming}
            disabled={!isObsConnected}
            className={`dw-button ${isStreaming ? "is-secondary" : ""}`}
          >
            <i
              className={`bi ${isStreaming ? "bi-stop-circle" : "bi-broadcast"}`}
              aria-hidden="true"
            />
            {isStreaming ? "Stop OBS stream" : "Start OBS stream"}
          </button>
        </div>
      </header>
      {obsError && (
        <div className="alert alert-warning" role="alert">
          {obsError}
        </div>
      )}
      <div className="dw-camera-layout">
        <section className="dw-camera-stage" aria-label="Live camera preview">
          <div className="container">
            <div className="row px-0">
              <div className="live-stream-container" hidden>
                <button
                  onClick={toggleStreaming}
                  disabled={!isObsConnected}
                  className={isStreaming ? "stop-button" : "start-button"}
                >
                  {isStreaming ? "Stop Stream" : "Start Stream"}
                </button>
              </div>
              <main className="col">
                <DwarfCameras
                  setExchangeCamerasStatus={setExchangeCamerasStatus}
                  showWideangle={showWideangle}
                  useRawPreviewURL={useRawPreviewURL}
                  showControls={true}
                />
              </main>
            </div>
          </div>
        </section>
        <section className="dw-camera-controls" aria-label="Camera controls">
          <div className="dropdown-wrapper px-0">
            <ImagingMenu
              exchangeCamerasStatus={exchangeCamerasStatus}
              setShowWideangle={setShowWideangle}
              setUseRawPreviewURL={setUseRawPreviewURL}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
