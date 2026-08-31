import { wrapper } from "@/components/asteroids/api/store";
import { Provider } from "react-redux";
import "@/styles/globals.css";
import "@/styles/bootstrap.min.css";
import "@/styles/font-awesome.min.css";
import "@/styles/style.min.css";
import "@/styles/all.min.css";
import "@/styles/navbar.css";
import "@/styles/modal.css";
import "@/styles/sliding-pane.css";
import "@/styles/moonphase.css";
import "@/styles/weather.css";
import "@/styles/astrocalendar.css";
import "@/styles/clouds.css";
import "@/styles/Calendar.css";
import "@/styles/asteroids.css";
import "@/styles/image-editor.css";
import "@/styles/witsensordata.css";
import "@/styles/mosaic.css";
import "@/styles/sheduler.css";
import "@/styles/camera.css";
import "@/styles/dwarfium-ui.css";

import "bootstrap-icons/font/bootstrap-icons.css";
import "@/fontello/css/custom-focus.css";

import type { AppProps } from "next/app";
import { useEffect } from "react";

import Layout from "@/components/shared/Layout";
import { ConnectionContextProvider } from "@/stores/ConnectionContext";

export default function App({ Component, pageProps }: AppProps) {
  const { store, props } = wrapper.useWrappedStore(pageProps);

  useEffect(() => {
    require("bootstrap/dist/js/bootstrap.bundle.min.js");
    let disposed = false;
    const children: Array<{ kill: () => Promise<void> }> = [];

    const startDesktopServices = async () => {
      const { isTauri } = await import("@tauri-apps/api/core");
      if (!isTauri()) return;

      try {
        const { join, resourceDir } = await import("@tauri-apps/api/path");
        const { Command } = await import("@tauri-apps/plugin-shell");
        const configFile = await join(await resourceDir(), "mediamtx.yml");

        const proxy = await Command.sidecar("bin/DwarfiumProxy").spawn();
        children.push(proxy);
        console.log("DwarfiumProxy started successfully.");

        const mediaMtx = await Command.sidecar("bin/mediamtx", [
          configFile,
        ]).spawn();
        children.push(mediaMtx);
        console.log("mediamtx started successfully with:", configFile);
      } catch (error) {
        console.error("Failed to start desktop sidecars:", error);
      }

      if (disposed) return;

      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (
          update?.available &&
          window.confirm(
            `Dwarfium ${update.version} is available. Install it now?`,
          )
        ) {
          await update.downloadAndInstall();
          const { relaunch } = await import("@tauri-apps/plugin-process");
          await relaunch();
        }
      } catch (error) {
        console.error("Failed to check for a desktop update:", error);
      }
    };

    void startDesktopServices();

    return () => {
      disposed = true;
      for (const child of children) void child.kill();
    };
  }, []);

  return (
    <ConnectionContextProvider>
      <Provider store={store}>
        <Layout>
          <Component {...props.pageProps} />
        </Layout>
      </Provider>
    </ConnectionContextProvider>
  );
}
