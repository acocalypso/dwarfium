import Link from "next/link";
import { useFleet, useFleetRegistry } from "@/stores/FleetContext";
import { useSyncExternalStore } from "react";
import { offlineRuntime } from "@/services/fleet/controller";
import type { FleetRegistration } from "@/services/fleet/registry";

export function storageLabel(telemetry: typeof offlineRuntime.telemetry) {
  return telemetry.storageValid &&
    telemetry.availableSize !== undefined &&
    telemetry.totalSize !== undefined
    ? `${telemetry.availableSize} / ${telemetry.totalSize} GB free`
    : "Unavailable";
}

function DeviceStatus({
  device,
  selected,
}: {
  device: FleetRegistration;
  selected: boolean;
}) {
  const manager = useFleet();
  const controller = manager.getDevice(device.id);
  const runtime = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    () => offlineRuntime,
  );
  const t = runtime.telemetry;
  return (
    <button
      type="button"
      className="dw-fleet-status-device"
      aria-label={`${device.alias} ${runtime.connection} · ${runtime.activity}`}
      aria-pressed={selected}
      onClick={() => manager.registry.select(device.id)}
    >
      <strong>{device.alias}</strong>
      <span>
        {runtime.connection} · {runtime.activity}
      </span>
      <span>
        Battery{" "}
        {t.batteryPercentage === undefined
          ? "Unavailable"
          : `${t.batteryPercentage}%`}{" "}
        · Temperature{" "}
        {t.temperature === undefined ? "Not reported" : `${t.temperature}°C`}
      </span>
      <span>Storage {storageLabel(t)}</span>
    </button>
  );
}

export default function FleetStatusBar() {
  const manager = useFleet();
  const registry = useFleetRegistry();
  return (
    <div className="dw-fleet-statusbar" aria-label="Fleet device status">
      <label>
        Target device
        <select
          value={registry.selectedDeviceId ?? ""}
          onChange={(event) =>
            manager.registry.select(event.target.value || undefined)
          }
        >
          <option value="">Select a telescope</option>
          {Object.values(registry.devices).map((device) => (
            <option key={device.id} value={device.id}>
              {device.alias}
            </option>
          ))}
        </select>
      </label>
      <div className="dw-fleet-status-list">
        {Object.values(registry.devices).map((device) => (
          <DeviceStatus
            key={device.id}
            device={device}
            selected={registry.selectedDeviceId === device.id}
          />
        ))}
      </div>
      <Link href="/fleet">Manage fleet</Link>
    </div>
  );
}
