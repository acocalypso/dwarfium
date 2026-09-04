export type V3DeviceTelemetry = {
  batteryPercentage?: number;
  chargingState?: number;
  availableSize?: number;
  totalSize?: number;
  storageValid?: boolean;
  temperature?: number;
};

type WireField = {
  wireType: number;
  value: number | Uint8Array;
};

function readVarint(
  bytes: Uint8Array,
  start: number,
): { value: number; next: number } | undefined {
  let value = 0;
  let shift = 0;

  for (let index = start; index < bytes.length && shift < 56; index += 1) {
    const byte = bytes[index];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, next: index + 1 };
    shift += 7;
  }

  return undefined;
}

function decodeWireFields(bytes: Uint8Array): Map<number, WireField[]> {
  const fields = new Map<number, WireField[]>();
  let offset = 0;

  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    if (!key) break;
    offset = key.next;

    const fieldNumber = Math.floor(key.value / 8);
    const wireType = key.value % 8;
    let value: number | Uint8Array;

    if (wireType === 0) {
      const decoded = readVarint(bytes, offset);
      if (!decoded) break;
      value = decoded.value;
      offset = decoded.next;
    } else if (wireType === 1) {
      if (offset + 8 > bytes.length) break;
      value = bytes.subarray(offset, offset + 8);
      offset += 8;
    } else if (wireType === 2) {
      const decodedLength = readVarint(bytes, offset);
      if (!decodedLength) break;
      offset = decodedLength.next;
      const length = decodedLength.value;
      if (!Number.isSafeInteger(length) || offset + length > bytes.length)
        break;
      value = bytes.subarray(offset, offset + length);
      offset += length;
    } else if (wireType === 5) {
      if (offset + 4 > bytes.length) break;
      value = bytes.subarray(offset, offset + 4);
      offset += 4;
    } else {
      break;
    }

    const existing = fields.get(fieldNumber) ?? [];
    existing.push({ wireType, value });
    fields.set(fieldNumber, existing);
  }

  return fields;
}

function nestedField(
  fields: Map<number, WireField[]>,
  fieldNumber: number,
): Map<number, WireField[]> | undefined {
  const field = fields.get(fieldNumber)?.at(-1);
  if (!field || field.wireType !== 2 || !(field.value instanceof Uint8Array)) {
    return undefined;
  }
  return decodeWireFields(field.value);
}

function int32Field(
  fields: Map<number, WireField[]> | undefined,
  fieldNumber: number,
): number | undefined {
  const field = fields?.get(fieldNumber)?.at(-1);
  if (!field || field.wireType !== 0 || typeof field.value !== "number") {
    return undefined;
  }
  const unsigned = field.value >>> 0;
  return unsigned > 0x7fffffff ? unsigned - 0x1_0000_0000 : unsigned;
}

function uint32Field(
  fields: Map<number, WireField[]> | undefined,
  fieldNumber: number,
): number | undefined {
  const field = fields?.get(fieldNumber)?.at(-1);
  if (!field || field.wireType !== 0 || typeof field.value !== "number") {
    return undefined;
  }
  return field.value >>> 0;
}

/**
 * Decode the current V3 `ResGetDeviceStateInfo` payload (command 16405).
 *
 * dwarfii_api 3.0.0 only knows the calibration member of DeviceStateInfo, so
 * protobuf correctly skips the newer battery, storage and temperature fields.
 * This small wire-level compatibility decoder can be removed once the package
 * ships the complete task_center.proto schema.
 */
export function decodeV3DeviceStateTelemetry(
  payload: Uint8Array,
): V3DeviceTelemetry | undefined {
  const response = decodeWireFields(payload);
  const teleCamera = nestedField(response, 2);
  const cmosTemperature = nestedField(teleCamera ?? new Map(), 7);
  const deviceState = nestedField(response, 6);
  if (!deviceState && !cmosTemperature) return undefined;

  const chargingState = int32Field(nestedField(deviceState ?? new Map(), 3), 1);
  const storage = nestedField(deviceState ?? new Map(), 4);
  const systemTemperature = nestedField(deviceState ?? new Map(), 7);
  const battery = nestedField(deviceState ?? new Map(), 9);
  const temperature =
    int32Field(cmosTemperature, 1) ?? int32Field(systemTemperature, 2);

  const telemetry: V3DeviceTelemetry = {
    batteryPercentage: int32Field(battery, 1),
    chargingState,
    availableSize: uint32Field(storage, 1),
    totalSize: uint32Field(storage, 2),
    storageValid:
      uint32Field(storage, 4) === undefined
        ? undefined
        : uint32Field(storage, 4) !== 0,
    temperature,
  };

  return Object.values(telemetry).some((value) => value !== undefined)
    ? telemetry
    : undefined;
}
