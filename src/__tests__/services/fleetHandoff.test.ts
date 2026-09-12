import { disconnectSetupDevice } from "@/services/fleet/handoff";
import { createSessionProfile } from "@/services/dwarf/sessionProfile";
import { getCurrentProfile } from "dwarfii_api";

test("Setup handoff closes its socket and clears auto-connect, without device stop commands", async () => {
  const context = {
    socketIPDwarf: {
      cleanup: jest.fn().mockResolvedValue(undefined),
      request: jest.fn(),
    },
    setConnectionStatus: jest.fn(),
    setConnectionStatusSlave: jest.fn(),
  };
  localStorage.setItem("IPConnect", "192.0.2.1");
  await disconnectSetupDevice(context as any);
  expect(context.socketIPDwarf.cleanup).toHaveBeenCalledWith(true);
  expect(context.socketIPDwarf.request).not.toHaveBeenCalled();
  expect(localStorage.getItem("IPConnect")).toBe("");
  expect(context.setConnectionStatus).toHaveBeenCalledWith(false);
});

test("separate connections have distinct valid client IDs without changing model routing", () => {
  const base = getCurrentProfile(4),
    a = createSessionProfile(base),
    b = createSessionProfile(base);
  expect(a.clientId).not.toBe(b.clientId);
  expect(a.clientId).not.toBe(base.clientId);
  expect(a.clientId).toMatch(
    /^[a-fA-F0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  expect(a.hardwareId).toBe(base.hardwareId);
  expect(a.wireDeviceId).toBe(base.wireDeviceId);
});
