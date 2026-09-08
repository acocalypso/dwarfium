import Head from "next/head";
import { useContext, useState, useSyncExternalStore } from "react";
import { useFleet, useFleetRegistry } from "@/stores/FleetContext";
import { ConnectionContext } from "@/stores/ConnectionContext";
import { getProxyUrl } from "@/lib/get_proxy_url";
import { offlineRuntime, validFleetHost } from "@/services/fleet/controller";
import type { FleetRegistration } from "@/services/fleet/registry";
import type { DwarfModel } from "@/services/dwarf/deviceProfile";
import styles from "@/styles/fleet.module.css";

const modelNames = {
  dwarf2: "DWARF 2",
  dwarf3: "DWARF 3",
  dwarfmini: "DWARF Mini",
};

function ModelIcon({ model }: { model?: DwarfModel }) {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect
        x={model === "dwarfmini" ? 10 : 5}
        y="6"
        width={model === "dwarfmini" ? 20 : 30}
        height="25"
        rx={model === "dwarf2" ? 3 : 8}
      />
      <circle
        cx={model === "dwarfmini" ? 20 : 14}
        cy="16"
        r={model === "dwarf3" ? 6 : 4}
      />
      {model !== "dwarfmini" && <circle cx="28" cy="15" r="2" />}
      <path d="M14 34h12M20 31v3" />
    </svg>
  );
}

function FleetCard({ device }: { device: FleetRegistration }) {
  const manager = useFleet();
  const registry = useFleetRegistry();
  const legacy = useContext(ConnectionContext);
  const controller = manager.getDevice(device.id);
  const runtime = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    () => offlineRuntime,
  );
  const [alias, setAlias] = useState(device.alias);
  const [error, setError] = useState<string>();
  const [details, setDetails] = useState(false);
  const busy = ["connected", "connecting", "reconnecting"].includes(
    runtime.connection,
  );
  const act = async (action: () => unknown) => {
    setError(undefined);
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const connect = () =>
    act(() => {
      if (
        legacy.socketIPDwarf?.isConnected() &&
        legacy.IPDwarf === device.lastKnownHost
      )
        throw new Error(
          "This telescope is open in the legacy workspace. Disconnect it there before connecting in Fleet.",
        );
      return manager.connect(device.id, getProxyUrl(legacy));
    });
  return (
    <article className={styles.card} aria-label={device.alias}>
      <header>
        <ModelIcon model={runtime.model ?? device.model} />
        <div>
          <h2>{device.alias}</h2>
          <span>
            {runtime.model || device.model
              ? modelNames[(runtime.model ?? device.model)!]
              : "Model not verified"}
          </span>
        </div>
        <span className={styles.badge}>{runtime.connection}</span>
      </header>
      <dl>
        <div>
          <dt>Activity</dt>
          <dd>
            {runtime.activity === "unknown"
              ? "Not yet known"
              : runtime.activity}
          </dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>Target unknown</dd>
        </div>
        <div>
          <dt>Frames received</dt>
          <dd>{runtime.frames ?? "—"}</dd>
        </div>
      </dl>
      <div className={styles.telemetry}>
        <span>
          Battery{" "}
          <strong>
            {runtime.telemetry.batteryPercentage === undefined
              ? "—"
              : `${runtime.telemetry.batteryPercentage}%`}
          </strong>
        </span>
        <span>
          Temperature{" "}
          <strong>
            {runtime.telemetry.temperature === undefined
              ? "—"
              : `${runtime.telemetry.temperature}°C`}
          </strong>
        </span>
      </div>
      <label>
        Observing session
        <select
          value={device.sessionId ?? ""}
          onChange={(event) =>
            void act(() =>
              manager.registry.assignSession(
                device.id,
                event.target.value || undefined,
              ),
            )
          }
        >
          <option value="">No session assigned</option>
          {Object.values(registry.sessions).map((session) => (
            <option key={session.id} value={session.id}>
              {session.name}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.hint}>
        Assignment is planning metadata. It does not start capture or move the
        telescope.
      </p>
      {(error || runtime.error) && (
        <p role="alert" className={styles.error}>
          {error || runtime.error}
        </p>
      )}
      <div className={styles.actions}>
        <button
          onClick={() => (busy ? controller.disconnect() : void connect())}
        >
          {busy ? "Disconnect" : "Connect"}
        </button>
        <button onClick={() => setDetails(!details)} aria-expanded={details}>
          Device details
        </button>
      </div>
      {details && (
        <div className={styles.details}>
          <label>
            Friendly name
            <input
              value={alias}
              maxLength={100}
              onChange={(event) => setAlias(event.target.value)}
            />
          </label>
          <button
            onClick={() =>
              void act(() => manager.registry.rename(device.id, alias))
            }
          >
            Save name
          </button>
          <dl>
            <div>
              <dt>Address</dt>
              <dd>{device.lastKnownHost ?? "Not set"}</dd>
            </div>
            <div>
              <dt>Ownership</dt>
              <dd>{runtime.ownership}</dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>
                {runtime.lastSeen
                  ? new Date(runtime.lastSeen).toLocaleTimeString()
                  : "Not seen in this window"}
              </dd>
            </div>
          </dl>
          <p className={styles.hint}>
            Fleet monitoring is available. Camera and mount workspaces are still
            being migrated; use the existing single-device workspace for those
            controls.
          </p>
          <button
            disabled={busy}
            onClick={() => void act(() => manager.remove(device.id))}
          >
            Remove registration
          </button>
        </div>
      )}
    </article>
  );
}

export default function FleetPage() {
  const manager = useFleet();
  const snapshot = useFleetRegistry();
  const [alias, setAlias] = useState("");
  const [host, setHost] = useState("");
  const [model, setModel] = useState<DwarfModel | "">("");
  const [sessionName, setSessionName] = useState("");
  const [error, setError] = useState<string>();
  const [adding, setAdding] = useState(false);
  const devices = Object.values(snapshot.devices).sort((a, b) =>
    a.alias.localeCompare(b.alias),
  );
  return (
    <section className={styles.page}>
      <Head>
        <title>Fleet · Dwarfium</title>
      </Head>
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>WORKSPACE</span>
          <h1>Your telescope fleet</h1>
          <p>
            {devices.length} registered{" "}
            {devices.length === 1 ? "telescope" : "telescopes"} · Independent
            connections
          </p>
        </div>
        <button onClick={() => setAdding(!adding)} aria-expanded={adding}>
          Add telescope
        </button>
      </header>
      <p className={styles.notice}>
        Fleet preview: independent monitoring and session assignment. Device
        control and video migration are still in progress.
      </p>
      {adding && (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            try {
              manager.registry.register({
                alias,
                lastKnownHost: validFleetHost(host),
                model: model || undefined,
              });
              setAlias("");
              setHost("");
              setAdding(false);
              setError(undefined);
            } catch (failure) {
              setError(String(failure));
            }
          }}
        >
          <label>
            Friendly name
            <input
              required
              maxLength={100}
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="Garden Mini"
            />
          </label>
          <label>
            IP address
            <input
              required
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="192.168.178.97"
            />
          </label>
          <label>
            Expected model
            <select
              value={model}
              onChange={(event) =>
                setModel(event.target.value as DwarfModel | "")
              }
            >
              <option value="">Identify when connecting</option>
              {Object.entries(modelNames).map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Register telescope</button>
          <p className={styles.hint}>
            Registration does not connect or take control. Confirm the address
            belongs to your telescope.
          </p>
        </form>
      )}
      <form
        className={styles.sessionForm}
        onSubmit={(event) => {
          event.preventDefault();
          try {
            manager.registry.createSession(sessionName);
            setSessionName("");
            setError(undefined);
          } catch (failure) {
            setError(String(failure));
          }
        }}
      >
        <label>
          New observing session
          <input
            required
            maxLength={100}
            value={sessionName}
            onChange={(event) => setSessionName(event.target.value)}
            placeholder="Andromeda night"
          />
        </label>
        <button>Create session</button>
      </form>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!devices.length && (
        <div className={styles.empty}>
          <h2>Start with your first DWARF</h2>
          <p>
            Add a telescope to keep its name and session here, even while it is
            offline.
          </p>
        </div>
      )}
      <div className={styles.grid}>
        {devices.map((device) => (
          <FleetCard key={device.id} device={device} />
        ))}
      </div>
    </section>
  );
}
