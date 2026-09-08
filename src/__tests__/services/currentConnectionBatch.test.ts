import { createCurrentPacket, getCurrentProfile } from "dwarfii_api";
import { WebSocketHandler } from "@/services/dwarf/connection";

test("uses the installed SDK rather than a nested checkout", () => {
  expect(typeof jest.requireActual("dwarfii_api").getCurrentProfile).toBe(
    "function",
  );
  expect(typeof getCurrentProfile).toBe("function");
  expect(require.resolve("dwarfii_api").replace(/\\/g, "/")).toBe(
    process.cwd().replace(/\\/g, "/") +
      "/node_modules/dwarfii_api/dist/index.js",
  );
});

test.each([true, false])(
  "invalid command rejects the complete batch (invalid first: %s)",
  async (invalidFirst) => {
    const connection = new WebSocketHandler("192.0.2.1");
    jest.spyOn(connection, "isConnected").mockReturnValue(true);
    const request = jest
      .spyOn(connection, "request")
      .mockResolvedValue({} as any);
    const diagnostic = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const photo = createCurrentPacket(getCurrentProfile(4), "takeTelePhoto");
    const onError = jest.fn();
    try {
      await connection.prepare(
        invalidFirst ? ["invalid", photo] : [photo, "invalid"],
        "test",
        [],
        jest.fn(),
        jest.fn(),
        onError,
      );
      expect(request).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
    } finally {
      diagnostic.mockRestore();
    }
  },
);

test("a valid batch keeps command order and proto3 zero defaults", async () => {
  const connection = new WebSocketHandler("192.0.2.1");
  jest.spyOn(connection, "isConnected").mockReturnValue(true);
  const request = jest
    .spyOn(connection, "request")
    .mockResolvedValue({} as any);
  const profile = getCurrentProfile(2);
  await connection.prepare([
    createCurrentPacket(profile, "switchShootingMode", { mode: 0 }),
    createCurrentPacket(profile, "takeWidePhoto"),
  ]);
  expect(request.mock.calls).toEqual([
    ["switchShootingMode", { mode: 0 }],
    ["takeWidePhoto", {}],
  ]);
});
