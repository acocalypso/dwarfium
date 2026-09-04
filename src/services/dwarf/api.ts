/* eslint-disable no-unused-vars */
/**
 * The sole application boundary for the telescope protocol. UI code must import
 * from here rather than binding itself to the generated API package.
 */
export * from "dwarfii_api";

import {
  createPacket,
  Dwarfii_Api,
  messageV3CameraTeleOpenCamera,
  messageV3CameraWideOpenCamera,
  messageV3DeviceConfigModeSwitch,
  messageV3GetDeviceStateInfo,
  setDwarfClientID,
  setDwarfDeviceID,
  setDwarfMinorVersion,
} from "dwarfii_api";
import type { DwarfDeviceProfile } from "./deviceProfile";

export type DwarfSocket = {
  setDeviceIdDwarf(deviceId: number): boolean;
  setMinorVersionDwarf(minorVersion: number): boolean;
};

export class DwarfProtocolError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DwarfProtocolError";
  }
}

export function configureDwarfProtocol(
  socket: DwarfSocket,
  profile: DwarfDeviceProfile,
): void {
  const configured =
    setDwarfClientID(profile.clientId) &&
    setDwarfDeviceID(profile.deviceId) &&
    setDwarfMinorVersion(profile.protocolMinorVersion) &&
    socket.setDeviceIdDwarf(profile.deviceId) &&
    socket.setMinorVersionDwarf(profile.protocolMinorVersion);

  if (!configured) {
    throw new DwarfProtocolError(
      `Could not configure the V3 protocol for ${profile.displayName}`,
    );
  }
}

export function createV3SessionPackets(): Uint8Array[] {
  return [
    messageV3GetDeviceStateInfo(),
    messageV3DeviceConfigModeSwitch(),
    messageV3CameraTeleOpenCamera(),
    messageV3CameraWideOpenCamera(),
  ];
}

export const V3_SESSION_READY_COMMAND = 16405;

/**
 * Build the V3 one-click DSO command with the field names used by the current
 * firmware schema. dwarfii_api 3.0.0 still writes a legacy `mode` property,
 * which protobuf discards instead of serializing `shootingMode`.
 */
export function createV3OneClickGotoDsoPacket(
  raHours: number,
  decDegrees: number,
  targetName: string,
  longitude: number,
  latitude: number,
  shootingMode = 2,
): Uint8Array {
  const messageClass = Dwarfii_Api.ReqOneClickGotoDSO;
  const message = messageClass.create({
    ra: raHours,
    dec: decDegrees,
    targetName,
    lon: longitude,
    lat: latitude,
    shootingMode,
    gotoOnly: false,
  });
  return createPacket(
    message,
    messageClass,
    Dwarfii_Api.ModuleId.MODULE_ASTRO,
    Dwarfii_Api.DwarfCMD.CMD_ASTRO_START_ONE_CLICK_GOTO_DSO,
    Dwarfii_Api.MessageTypeId.TYPE_REQUEST,
  );
}

export function createV3OneClickGotoSolarPacket(
  index: number,
  longitude: number,
  latitude: number,
  targetName: string,
  shootingMode = 8,
): Uint8Array {
  const messageClass = Dwarfii_Api.ReqOneClickGotoSolarSystem;
  const message = messageClass.create({
    index,
    lon: longitude,
    lat: latitude,
    targetName,
    shootingMode,
    forceStart: false,
  });
  return createPacket(
    message,
    messageClass,
    Dwarfii_Api.ModuleId.MODULE_ASTRO,
    Dwarfii_Api.DwarfCMD.CMD_ASTRO_START_ONE_CLICK_GOTO_SOLAR_SYSTEM,
    Dwarfii_Api.MessageTypeId.TYPE_REQUEST,
  );
}
