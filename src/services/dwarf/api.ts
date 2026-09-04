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
  WebSocketHandler as ApiWebSocketHandler,
} from "dwarfii_api";
import type { DwarfDeviceProfile } from "./deviceProfile";
import {
  decodeV3DeviceStateTelemetry,
  type V3DeviceTelemetry,
} from "./telemetry";

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

const RAPID_CLOSE_WINDOW_MS = 10_000;
const MAX_RAPID_CLOSES = 3;

/**
 * The Mini accepts one controlling websocket at a time. The upstream handler
 * resets its reconnect counter as soon as a socket opens, so two Dwarfium
 * clients can otherwise evict each other forever. Keep the normal automatic
 * recovery, but stop after repeated short-lived connections and let the user
 * deliberately retry after closing the other controller.
 */
export class WebSocketHandler extends ApiWebSocketHandler {
  private openedAt = 0;
  private rapidCloseCount = 0;
  private reconnectSuppressed = false;
  private telemetryHandler?: (telemetry: V3DeviceTelemetry) => void;
  private protocolResponseHandler?: (command: number) => void;
  private telemetryTimer?: ReturnType<typeof setInterval>;

  setTelemetryHandler(
    handler: ((telemetry: V3DeviceTelemetry) => void) | undefined,
  ): void {
    this.telemetryHandler = handler;
  }

  setProtocolResponseHandler(
    handler: ((command: number) => void) | undefined,
  ): void {
    this.protocolResponseHandler = handler;
  }

  startTelemetryPolling(intervalMs = 10_000): void {
    this.stopTelemetryPolling();
    this.telemetryTimer = setInterval(() => {
      if (this.isConnected()) {
        void this.prepare(messageV3GetDeviceStateInfo(), "");
      }
    }, intervalMs);
  }

  stopTelemetryPolling(): void {
    if (this.telemetryTimer !== undefined) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = undefined;
    }
  }

  resetReconnectGuard(): void {
    this.openedAt = 0;
    this.rapidCloseCount = 0;
    this.reconnectSuppressed = false;
  }

  isReconnectSuppressed(): boolean {
    return this.reconnectSuppressed;
  }

  override start(): void {
    this.openedAt = Date.now();
    super.start();
  }

  override async handleMessage(event: MessageEvent): Promise<void> {
    if (typeof event.data !== "string") {
      try {
        const bytes =
          event.data instanceof ArrayBuffer
            ? new Uint8Array(event.data)
            : ArrayBuffer.isView(event.data)
              ? new Uint8Array(
                  event.data.buffer,
                  event.data.byteOffset,
                  event.data.byteLength,
                )
              : undefined;
        if (bytes) {
          const packet = Dwarfii_Api.WsPacket.decode(bytes);
          const command = Number(packet.cmd);
          if (Number.isFinite(command)) this.protocolResponseHandler?.(command);
          if (command === V3_SESSION_READY_COMMAND && packet.data) {
            const telemetry = decodeV3DeviceStateTelemetry(
              packet.data as Uint8Array,
            );
            if (telemetry) this.telemetryHandler?.(telemetry);
          }
        }
      } catch (error) {
        console.debug("Could not inspect V3 telemetry payload", error);
      }
    }

    await super.handleMessage(event);
  }

  override async handleClose(message: unknown): Promise<void> {
    const connectionLifetime = this.openedAt
      ? Date.now() - this.openedAt
      : Number.POSITIVE_INFINITY;

    if (connectionLifetime < RAPID_CLOSE_WINDOW_MS) {
      this.rapidCloseCount += 1;
    } else {
      this.rapidCloseCount = 0;
    }

    if (this.rapidCloseCount >= MAX_RAPID_CLOSES) {
      this.reconnectSuppressed = true;
      // cleanup() checks this flag before deciding to reconnect.
      this.is_running = false;
      console.warn(
        "DWARF websocket repeatedly closed shortly after opening; automatic reconnect stopped to avoid a controller conflict.",
      );
    }

    await super.handleClose(message);
  }

  override async cleanup(forceStop = false): Promise<void> {
    await super.cleanup(forceStop);
    if (forceStop || !this.is_running) this.stopTelemetryPolling();
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
    createV3WidePreviewPacket(),
  ];
}

/**
 * Build the Mini/V3 wide preview-quality request used to make its RTSP feed
 * available. dwarfii_api 3.0.0 currently emits an empty payload for command
 * 12036, but current firmware expects level 1 (wire field 1), matching the
 * camera workflow captured in dwarfAlp.
 */
export function createV3WidePreviewPacket(): Uint8Array {
  const messageClass = Dwarfii_Api.V3ReqOpenWideCamera;
  const message = messageClass.create({ action: 1 });
  return createPacket(
    message,
    messageClass,
    Dwarfii_Api.ModuleId.MODULE_CAMERA_WIDE,
    Dwarfii_Api.DwarfCMD.CMD_V3_CAMERA_WIDE_OPEN_CAMERA,
    Dwarfii_Api.MessageTypeId.TYPE_REQUEST,
  );
}

/** Build the current task-manager shooting-mode request (command 16402). */
export function createV3ShootingModePacket(mode = 8): Uint8Array {
  // dwarfii_api 3.0.0 still calls this schema a mode query. Its field 1 has
  // the same wire representation as the current ReqSwitchShootingMode.mode.
  const messageClass = Dwarfii_Api.V3ReqModeQuery;
  const message = messageClass.create({ targetMode: mode });
  return createPacket(
    message,
    messageClass,
    Dwarfii_Api.ModuleId.MODULE_DEVICE_CONFIG,
    16402,
    Dwarfii_Api.MessageTypeId.TYPE_REQUEST,
  );
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
