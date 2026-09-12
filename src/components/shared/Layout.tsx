import type { ReactNode } from "react";
import { useCallback, useEffect, useState, useContext } from "react";
import { ConnectionContext } from "@/stores/ConnectionContext";

import Nav from "@/components/shared/Nav";
import Footer from "@/components/shared/Footer";
import Themesettings from "@/components/shared/Themesettings";
import StatusBar from "@/components/shared/StatusBar";
import { useRouter } from "next/router";

export default function Layout({ children }: { children: ReactNode }) {
  const isFleet = useRouter().pathname === "/fleet";
  const { deviceError, setDeviceError } = useContext(ConnectionContext);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("dwarfium-sidebar-collapsed") === "true");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      localStorage.setItem("dwarfium-sidebar-collapsed", String(!current));
      return !current;
    });
  };

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <div className={`dw-app ${collapsed ? "has-collapsed-sidebar" : ""}`}>
      <a className="dw-skip-link" href="#main-content">
        Skip to main content
      </a>
      <Nav
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCollapsedChange={toggleCollapsed}
        onMobileClose={closeMobile}
      />
      <div className="dw-app-column">
        <header className="dw-mobile-header">
          <button
            type="button"
            className="dw-icon-button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <i className="bi bi-list" aria-hidden="true" />
          </button>
          <span>Dwarfium</span>
          <span className="dw-mobile-header-spacer" aria-hidden="true" />
        </header>
        {!isFleet && <StatusBar />}
        <main id="main-content" className="dw-main" tabIndex={-1}>
          {!isFleet && deviceError && (
            <div
              role="alert"
              className="alert alert-warning d-flex align-items-center justify-content-between gap-3 m-3"
              style={{ fontSize: "0.875rem" }}
            >
              <span>{deviceError}</span>
              <button
                type="button"
                className="btn-close"
                aria-label="Dismiss device error"
                onClick={() => setDeviceError?.(undefined)}
              />
            </div>
          )}
          {children}
        </main>
        <Footer />
      </div>
      <Themesettings />
    </div>
  );
}
