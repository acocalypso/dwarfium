import { FleetRegistry } from "./registry";
import { FleetDeviceController, validFleetHost } from "./controller";

export const FLEET_STORAGE_KEY = "dwarfium.fleet.v1";

export class FleetManager {
  readonly registry = new FleetRegistry();
  private controllers = new Map<string, FleetDeviceController>();
  private stopSaving?: () => void;

  constructor(
    private readonly factory = (id: string) => new FleetDeviceController(id),
  ) {}

  getDevice(id: string): FleetDeviceController {
    this.registry.getDevice(id);
    let controller = this.controllers.get(id);
    if (!controller) {
      controller = this.factory(id);
      this.controllers.set(id, controller);
    }
    return controller;
  }

  async connect(id: string, proxy?: string) {
    const registration = this.registry.getDevice(id);
    const host = validFleetHost(registration.lastKnownHost ?? "");
    for (const [otherId, controller] of Array.from(this.controllers)) {
      if (
        otherId !== id &&
        this.registry.getDevice(otherId).lastKnownHost === host &&
        ["connected", "connecting", "reconnecting"].includes(
          controller.getSnapshot().connection,
        )
      )
        throw new Error("This address already has an active Fleet connection.");
    }
    await this.getDevice(id).connect(registration, proxy);
  }

  remove(id: string) {
    const controller = this.controllers.get(id);
    if (
      controller &&
      !["disconnected", "error"].includes(controller.getSnapshot().connection)
    )
      throw new Error("Disconnect this telescope before removing it.");
    controller?.disconnect();
    this.controllers.delete(id);
    this.registry.removeDisconnected(id);
  }

  initialize(
    storage: Pick<Storage, "getItem" | "setItem">,
    onError: (message: string) => void,
  ) {
    this.stopSaving?.();
    const saved = storage.getItem(FLEET_STORAGE_KEY);
    if (saved !== null) this.registry.restore(saved);
    else {
      const legacyHost = storage.getItem("IPDwarf");
      if (
        legacyHost &&
        !Object.keys(this.registry.getSnapshot().devices).length
      ) {
        try {
          validFleetHost(legacyHost);
          this.registry.register({
            alias: "My DWARF",
            lastKnownHost: legacyHost,
          });
        } catch {
          onError(
            "Your previous device address needs review. Existing settings have been preserved.",
          );
        }
      }
      storage.setItem(FLEET_STORAGE_KEY, this.registry.serialize());
    }
    this.stopSaving = this.registry.subscribe(() => {
      try {
        storage.setItem(FLEET_STORAGE_KEY, this.registry.serialize());
      } catch {
        onError(
          "Fleet changes could not be saved. Keep this window open and check available browser storage.",
        );
      }
    });
  }

  dispose() {
    this.stopSaving?.();
    this.stopSaving = undefined;
    this.controllers.forEach((controller) => controller.disconnect());
  }
}
