import { FleetRegistry } from "@/services/fleet/registry";
import { FleetManager, FLEET_STORAGE_KEY } from "@/services/fleet/manager";

describe("Fleet metadata persistence", () => {
  beforeEach(() => localStorage.clear());
  test("legacy migration is idempotent and never restores connection authority", () => {
    localStorage.setItem("IPDwarf", "192.0.2.1");
    localStorage.setItem("connectionStatus", "true");
    const manager = new FleetManager();
    try {
      manager.initialize(localStorage, jest.fn());
      const first = manager.registry.serialize();
      manager.initialize(localStorage, jest.fn());
      expect(manager.registry.serialize()).toBe(first);
      const devices = Object.values(manager.registry.getSnapshot().devices);
      expect(devices).toHaveLength(1);
      expect(manager.getDevice(devices[0].id).getSnapshot().connection).toBe(
        "disconnected",
      );
      expect(localStorage.getItem("connectionStatus")).toBe("true");
      expect(localStorage.getItem("IPDwarf")).toBe("192.0.2.1");
    } finally {
      manager.dispose();
    }
  });
  test("round trips IDs, aliases and many-device session assignment", () => {
    let index = 0;
    const fleet = new FleetRegistry(
      () => `00000000-0000-4000-8000-${String(++index).padStart(12, "0")}`,
    );
    const a = fleet.register({ alias: "A", model: "dwarf2" });
    const b = fleet.register({ alias: "B", model: "dwarfmini" });
    const session = fleet.createSession("Orion");
    fleet.assignSession(a.id, session.id);
    fleet.assignSession(b.id, session.id);
    const restored = new FleetRegistry();
    restored.restore(fleet.serialize());
    expect(restored.getSnapshot()).toEqual(fleet.getSnapshot());
    expect(restored.getSessionDevices(session.id)).toHaveLength(2);
  });
  test("future version and corrupt data are preserved rather than overwritten", () => {
    const saved = JSON.stringify({ version: 42 });
    localStorage.setItem(FLEET_STORAGE_KEY, saved);
    const manager = new FleetManager();
    expect(() => manager.initialize(localStorage, jest.fn())).toThrow();
    expect(localStorage.getItem(FLEET_STORAGE_KEY)).toBe(saved);
  });
  test("restore strips forged connected/capturing fields", () => {
    const fleet = new FleetRegistry();
    fleet.restore(
      JSON.stringify({
        version: 1,
        sessions: [],
        devices: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            alias: "A",
            connected: true,
            activity: "capturing",
          },
        ],
      }),
    );
    expect(fleet.serialize()).not.toContain("capturing");
    expect(fleet.serialize()).not.toContain("connected");
  });
});
