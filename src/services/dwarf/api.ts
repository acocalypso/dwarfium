/* eslint-disable no-unused-vars */
/**
 * The sole application boundary for the telescope protocol. UI code must import
 * from here rather than binding itself to the generated API package.
 */
export * from "dwarfii_api";

import {
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
