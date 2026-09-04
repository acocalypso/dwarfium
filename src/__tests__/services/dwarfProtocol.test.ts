jest.mock("dwarfii_api", () => ({
  DwarfClientIdDwarfMini: "0000DAF4-0000-1000-8000-00805F9B34FB",
  DwarfDeviceIdDwarfII: 1,
  DwarfDeviceIdDwarf3: 2,
  DwarfDeviceIdDwarfMini: 4,
  WsMinorVersionV3: 20,
  Dwarfii_Api: {
    WsPacket: { decode: (packet: unknown) => packet },
    ModuleId: {
      MODULE_CAMERA_WIDE: 2,
      MODULE_ASTRO: 11,
      MODULE_DEVICE_CONFIG: 14,
    },
    DwarfCMD: {
      CMD_ASTRO_START_ONE_CLICK_GOTO_DSO: 11013,
      CMD_ASTRO_START_ONE_CLICK_GOTO_SOLAR_SYSTEM: 11014,
      CMD_V3_CAMERA_WIDE_OPEN_CAMERA: 12036,
    },
    MessageTypeId: { TYPE_REQUEST: 1 },
    V3ReqOpenWideCamera: { create: (value: unknown) => value },
    V3ReqModeQuery: { create: (value: unknown) => value },
    ReqOneClickGotoDSO: { create: (value: unknown) => value },
    ReqOneClickGotoSolarSystem: { create: (value: unknown) => value },
  },
  createPacket: jest.fn((message, _class, moduleId, cmd, typeId) => ({
    message,
    moduleId,
    cmd,
    typeId,
    minorVersion: 20,
    deviceId: 4,
    clientId: "0000DAF4-0000-1000-8000-00805F9B34FB",
  })),
  setDwarfClientID: jest.fn(() => true),
  setDwarfDeviceID: jest.fn(() => true),
  setDwarfMinorVersion: jest.fn(() => true),
  messageV3GetDeviceStateInfo: jest.fn(() => ({
    cmd: 16405,
    minorVersion: 20,
    deviceId: 4,
    clientId: "0000DAF4-0000-1000-8000-00805F9B34FB",
  })),
  messageV3DeviceConfigModeSwitch: jest.fn(() => ({
    cmd: 16404,
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
  WebSocketHandler: class {
    is_running = true;

    start() {
      this.is_running = true;
    }

    async handleClose() {}
  },
}));

import {
  configureDwarfProtocol,
  createV3ShootingModePacket,
  createV3OneClickGotoDsoPacket,
  createV3SessionPackets,
  Dwarfii_Api,
  getDwarfDeviceProfile,
  summarizeV3CameraCatalog,
  WebSocketHandler,
} from "@/services/dwarf";

describe("DWARF V3 protocol boundary", () => {
  test("stops automatic reconnect after three rapid controller conflicts", async () => {
    const socket = new WebSocketHandler("192.0.2.1");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      socket.start();
      await socket.handleClose({ code: 1006 });
    }

    expect(socket.isReconnectSuppressed()).toBe(true);
    expect(socket.is_running).toBe(false);

    socket.resetReconnectGuard();
    expect(socket.isReconnectSuppressed()).toBe(false);
  });

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
    expect(packets.map((packet) => packet.cmd)).toEqual([
      16405, 16404, 10050, 12036,
    ]);
    expect((packets[3] as unknown as { message: unknown }).message).toEqual({
      action: 1,
    });
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

  test("builds the current task-manager astronomy mode packet", () => {
    const packet = createV3ShootingModePacket() as unknown as {
      cmd: number;
      moduleId: number;
      message: unknown;
    };

    expect(packet).toMatchObject({
      cmd: 16402,
      moduleId: 14,
      message: { targetMode: 8 },
    });
  });

  test("serializes the V3 one-click GOTO fields expected by firmware", () => {
    const packet = createV3OneClickGotoDsoPacket(
      5.588,
      -5.391,
      "M42",
      -10.9,
      49.4,
    ) as unknown as { cmd: number; message: Record<string, unknown> };

    expect(packet.cmd).toBe(11013);
    expect(packet.message).toEqual({
      ra: 5.588,
      dec: -5.391,
      targetName: "M42",
      lon: -10.9,
      lat: 49.4,
      shootingMode: 2,
      gotoOnly: false,
    });
    expect(packet.message).not.toHaveProperty("mode");
  });

  test("summarizes current V3 camera values for device status", () => {
    expect(
      summarizeV3CameraCatalog({
        data: {
          cameraParams: [
            {
              cameraId: 0,
              generalParams: [
                { name: "filterType", currentValue: 1, values: [1, 2] },
              ],
              specialParams: {
                exp: {
                  name: "exp",
                  currentValue: 96,
                  values: [{ name: "1/6", value: 96 }],
                },
              },
            },
          ],
        },
      }),
    ).toEqual([
      {
        cameraId: 0,
        settings: [
          { label: "Filter Type", value: "1" },
          { label: "Exposure", value: "1/6" },
        ],
      },
    ]);
  });
});
