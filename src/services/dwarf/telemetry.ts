import { CurrentDwarfSchema } from "dwarfii_api";

export type V3DeviceTelemetry = {
  batteryPercentage?: number;
  chargingState?: number;
  availableSize?: number;
  totalSize?: number;
  storageValid?: boolean;
  temperature?: number;
};

/**
 * Decode the canonical 16405 snapshot through the shared generated SDK schema.
 * A missing nested message is unknown. Inside a present proto3 message an
 * omitted non-optional scalar is its default, including a real zero reading.
 * CMOS temperature is optional, so its absence must NOT become zero.
 */
export function decodeV3DeviceStateTelemetry(
  payload: Uint8Array,
): V3DeviceTelemetry | undefined {
  try {
    const type = CurrentDwarfSchema.ResGetDeviceStateInfo;
    const response = type.toObject(type.decode(payload), {
      longs: String,
      defaults: false,
    });
    if ((response.code ?? 0) !== 0) return undefined;

    const state = response.deviceStateInfo;
    const cmos = response.teleCameraStateInfo?.cmosTemperature;
    const battery = state?.batteryInfo;
    const charging = state?.chargingState;
    const storage = state?.storageInfo;
    const systemTemperature = state?.temperature;

    const batteryPercentage = battery ? (battery.percentage ?? 0) : undefined;
    const temperature =
      cmos?.temperature ??
      (systemTemperature && (systemTemperature.code ?? 0) === 0
        ? (systemTemperature.temperature ?? 0)
        : undefined);

    const telemetry: V3DeviceTelemetry = {
      batteryPercentage:
        batteryPercentage !== undefined &&
        batteryPercentage >= 0 &&
        batteryPercentage <= 100
          ? batteryPercentage
          : undefined,
      chargingState: charging ? (charging.state ?? 0) : undefined,
      availableSize: storage ? (storage.availableSize ?? 0) : undefined,
      totalSize: storage ? (storage.totalSize ?? 0) : undefined,
      storageValid: storage ? (storage.isValid ?? false) : undefined,
      temperature,
    };

    return Object.values(telemetry).some((value) => value !== undefined)
      ? telemetry
      : undefined;
  } catch {
    // A malformed snapshot has no telemetry authority. Never return partially
    // decoded values from a truncated/corrupt protobuf frame.
    return undefined;
  }
}
