import { decodeV3DeviceStateTelemetry } from "@/services/dwarf/telemetry";

describe("V3 device-state compatibility decoder", () => {
  it("decodes battery, charging, storage and temperature fields", () => {
    const deviceState = [
      26,
      2,
      8,
      1, // charging_state.state = 1
      34,
      8,
      8,
      42,
      16,
      64,
      24,
      1,
      32,
      1, // storage_info
      58,
      4,
      8,
      0,
      16,
      36, // temperature.temperature = 36
      74,
      2,
      8,
      73, // battery_info.percentage = 73
    ];
    const response = new Uint8Array([50, deviceState.length, ...deviceState]);

    expect(decodeV3DeviceStateTelemetry(response)).toEqual({
      batteryPercentage: 73,
      chargingState: 1,
      availableSize: 42,
      totalSize: 64,
      storageValid: true,
      temperature: 36,
    });
  });

  it("prefers the telephoto CMOS temperature", () => {
    const teleCamera = [58, 2, 8, 35];
    const deviceState = [58, 4, 8, 0, 16, 41];
    const response = new Uint8Array([
      18,
      teleCamera.length,
      ...teleCamera,
      50,
      deviceState.length,
      ...deviceState,
    ]);

    expect(decodeV3DeviceStateTelemetry(response)?.temperature).toBe(35);
  });
});
