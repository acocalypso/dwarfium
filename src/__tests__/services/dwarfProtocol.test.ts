jest.mock("dwarfii_api", () => ({
  DwarfClientIdDwarfMini: "0000DAF4-0000-1000-8000-00805F9B34FB",
  DwarfDeviceIdDwarfII: 1,
  DwarfDeviceIdDwarf3: 2,
  DwarfDeviceIdDwarfMini: 4,
  WsMinorVersionV3: 20,
  Dwarfii_Api: { WsPacket: { decode: (packet: unknown) => packet } },
  setDwarfClientID: jest.fn(() => true),
  setDwarfDeviceID: jest.fn(() => true),
  setDwarfMinorVersion: jest.fn(() => true),
  messageV3GetDeviceStateInfo: jest.fn(() => ({
    cmd: 16405,
    minorVersion: 20,
    deviceId: 4,
    clientId: "0000DAF4-0000-1000-8000-00805F9B34FB",
  })),
  messageV3CameraTeleOpenCamera: jest.fn(() => ({
    cmd: 10050,
    minorVersion: 20,
    deviceId: 4,
    clientId: "0000DAF4-0000-1000-8000-00805F9B34FB",
  })),
  messageV3CameraWideOpenCamera: jest.fn(() => ({
    cmd: 12036,
    minorVersion: 20,
    deviceId: 4,
    clientId: "0000DAF4-0000-1000-8000-00805F9B34FB",
  })),
}));

import {
  configureDwarfProtocol,
  createV3SessionPackets,
  Dwarfii_Api,
  getDwarfDeviceProfile,
} from "@/services/dwarf";

describe("DWARF V3 protocol boundary", () => {
  test.each([
    [1, "dwarf2", "DWARF II", false],
    [2, "dwarf3", "DWARF 3", true],
    [4, "dwarfmini", "DWARF mini", true],
  ])("maps device %i to its capabilities", (id, model, name, filterWheel) => {
    const profile = getDwarfDeviceProfile(id as number);
    expect(profile.model).toBe(model);
    expect(profile.displayName).toBe(name);
    expect(profile.protocolMinorVersion).toBe(20);
    expect(profile.capabilities.filterWheel).toBe(filterWheel);
    expect(profile.teleFieldOfView.widthDegrees).toBeGreaterThan(2);
    expect(profile.teleFieldOfView.heightDegrees).toBeGreaterThan(1);
  });

  test("uses the Mini identity before constructing session packets", () => {
    const socket = {
      setDeviceIdDwarf: jest.fn(() => true),
      setMinorVersionDwarf: jest.fn(() => true),
    };
    configureDwarfProtocol(socket, getDwarfDeviceProfile(4));

    const packets = createV3SessionPackets().map((packet) =>
      Dwarfii_Api.WsPacket.decode(packet),
    );
    expect(socket.setDeviceIdDwarf).toHaveBeenCalledWith(4);
    expect(socket.setMinorVersionDwarf).toHaveBeenCalledWith(20);
    expect(packets.map((packet) => packet.cmd)).toEqual([16405, 10050, 12036]);
    expect(
      packets.every(
        (packet) =>
          packet.minorVersion === 20 &&
          packet.deviceId === 4 &&
          packet.clientId === "0000DAF4-0000-1000-8000-00805F9B34FB",
      ),
    ).toBe(true);
  });

  test("rejects unknown hardware", () => {
    expect(() => getDwarfDeviceProfile(3)).toThrow("Unsupported DWARF");
  });
});
