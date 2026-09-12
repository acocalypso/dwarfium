import {
  CurrentCommands,
  CurrentWebSocketHandler,
  CurrentProtocolError,
  decodeCurrentPacket,
  currentMessageType,
  getCurrentProfile,
  wsURL,
  type CurrentCommand,
  type CurrentPacket,
  type CurrentProfile,
} from "dwarfii_api";
import {
  decodeV3DeviceStateTelemetry,
  type V3DeviceTelemetry,
} from "./telemetry";
import { requestCaptureCommand } from "./captureCommands";

type MessageCallback = (sender: string, packet: CurrentPacket) => void;
type Callback = {
  commands: (string | number)[];
  message: MessageCallback;
  state: (ready: boolean) => void;
  error: (error?: unknown) => void;
};

/** Transitional callback facade over the current, non-singleton SDK session.
 * Packet callers are migrated incrementally; only registered current commands
 * can cross this boundary. No request is replayed after reconnect.
 */
export class WebSocketHandler {
  IPDwarf?: string;
  private proxyURL?: string;
  private useHttps = false;
  private profile?: CurrentProfile;
  private client?: CurrentWebSocketHandler;
  private callbacks = new Map<string, Callback>();
  private queue: {
    operation: CurrentCommand;
    values: Record<string, unknown>;
  }[] = [];
  private flushing = false;
  private polling?: ReturnType<typeof setInterval>;
  private telemetryHandler?: (telemetry: V3DeviceTelemetry) => void;
  private readyHandler?: (command: number) => void;
  closeSocketTimer?: ReturnType<typeof setTimeout>;
  closeTimerHandler = () => {};
  onStopTimerHandler = () => {};

  constructor(ip?: string) {
    this.IPDwarf = ip;
  }
  get session() {
    return this.client?.session;
  }
  setProfile(profile: CurrentProfile): void {
    if (
      this.profile?.hardwareId !== profile.hardwareId ||
      this.profile?.clientId !== profile.clientId
    ) {
      this.client?.close("Device profile changed");
      this.client = undefined;
      this.queue = [];
    }
    this.profile = profile;
  }
  setDeviceIdDwarf(id: number): boolean {
    return Number.isInteger(id) && id > 0;
  }
  setMinorVersionDwarf(version: number): boolean {
    return version === 20;
  }
  async setNewIpDwarf(ip: string): Promise<void> {
    if (this.IPDwarf !== ip) {
      this.close();
      this.client = undefined;
    }
    this.IPDwarf = ip;
  }
  async setProxyUrl(url?: string): Promise<void> {
    if (this.proxyURL !== url) {
      this.close();
      this.client = undefined;
    }
    this.proxyURL = url;
  }
  async setHttpsMode(enabled: boolean): Promise<void> {
    if (this.useHttps !== enabled) {
      this.close();
      this.client = undefined;
    }
    this.useHttps = enabled;
  }
  isConnected(): boolean {
    return this.client?.ready === true;
  }
  isReconnectSuppressed(): boolean {
    return (
      this.client?.state.transport === "disconnected" &&
      Boolean(this.client?.state.error)
    );
  }
  resetReconnectGuard(): void {
    /* Reconnect attempts belong to the owned SDK transport. */
  }
  setTelemetryHandler(handler?: (telemetry: V3DeviceTelemetry) => void): void {
    this.telemetryHandler = handler;
  }
  setProtocolResponseHandler(handler?: (command: number) => void): void {
    this.readyHandler = handler;
  }

  async request(
    operation: CurrentCommand,
    values: Record<string, unknown> = {},
  ): Promise<CurrentPacket> {
    if (!this.client?.ready)
      throw new CurrentProtocolError(
        "transport",
        "Connect to the DWARF and wait for device status first.",
      );
    const readOnly = [
      "getDeviceState",
      "getQuickSets",
      "getSavedInfinityPosition",
    ];
    const ownership = operation === "setMasterLock";
    const stopping = [
      "stopTeleCapture",
      "stopWideCapture",
      "stopFocus",
      "stopAstroAutoFocus",
      "stopGoto",
      "stopOneClickGoto",
      "stopJoystick",
      "stopCalibration",
      "stopEqSolving",
    ];
    if (
      !readOnly.includes(operation) &&
      !ownership &&
      !stopping.includes(operation) &&
      this.client.session.state.ownership !== "control"
    ) {
      throw new CurrentProtocolError(
        "device",
        "This connection does not have control of the DWARF. Request control in Connection setup.",
      );
    }
    return requestCaptureCommand(this.client, operation, values);
  }

  async prepare(
    packets: unknown,
    sender = "",
    commands: (string | number)[] = [],
    message: MessageCallback = () => {},
    state: (ready: boolean) => void = () => {},
    error: (error?: unknown) => void = () => {},
    _reconnect?: () => void,
  ): Promise<void> {
    if (sender) this.callbacks.set(sender, { commands, message, state, error });
    const batch: {
      operation: CurrentCommand;
      values: Record<string, unknown>;
    }[] = [];
    for (const bytes of Array.isArray(packets) ? packets : [packets]) {
      if (bytes === undefined || bytes === null) continue;
      try {
        if (
          !ArrayBuffer.isView(bytes) ||
          Object.prototype.toString.call(bytes) !== "[object Uint8Array]"
        )
          throw new CurrentProtocolError(
            "invalid-parameter",
            "Invalid DWARF command buffer",
          );
        // Node Buffer and browser/iframe Uint8Array may use different realms.
        const packet = decodeCurrentPacket(
          new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        );
        const entry = Object.entries(CurrentCommands).find(
          ([, descriptor]) =>
            descriptor[0] === packet.moduleId && descriptor[1] === packet.cmd,
        );
        if (!entry || !packet.known || packet.type !== 0)
          throw new CurrentProtocolError(
            "unsupported",
            `Command ${packet.moduleId}:${packet.cmd} has not been migrated to the current API.`,
          );
        // The SDK performs its own initial16405. Avoid racing a second poll.
        if (entry[0] === "getDeviceState" && !this.client?.ready) continue;
        batch.push({
          operation: entry[0] as CurrentCommand,
          // Request defaults are intentional inputs (e.g. far focus=0), unlike
          // optional telemetry. Preserve them when adapting a legacy caller.
          values: Object.fromEntries(
            Object.entries(
              currentMessageType(entry[1][2]).toObject(
                currentMessageType(entry[1][2]).decode(packet.rawData),
                { defaults: true, longs: String },
              ),
            ).filter(([, value]) => value !== null),
          ),
        });
      } catch (failure) {
        this.reportError(failure);
        // Never run a capture/movement after rejecting its preceding settings.
        // The complete caller batch must validate before any command is queued.
        return;
      }
    }
    this.queue.push(...batch);
    await this.flush();
  }

  async run(): Promise<boolean> {
    if (!this.IPDwarf || !this.profile) return false;
    if (
      this.client?.transportOpen ||
      this.client?.state.transport === "connecting" ||
      this.client?.state.transport === "reconnecting"
    )
      return true;
    if (!this.client) {
      this.client = new CurrentWebSocketHandler(this.profile);
      this.client.subscribe((state, packet) => {
        const ready = state.session.phase === "ready";
        if (!ready) this.queue = [];
        if (ready) {
          if (this.closeSocketTimer) clearTimeout(this.closeSocketTimer);
          this.closeTimerHandler();
          this.readyHandler?.(16405);
        }
        for (const callback of Array.from(this.callbacks.values()))
          callback.state(ready);
        if (packet) {
          if (
            packet.cmd === 16405 &&
            packet.type !== 0 &&
            (packet.data.code ?? 0) === 0
          ) {
            const telemetry = decodeV3DeviceStateTelemetry(packet.rawData);
            if (telemetry) this.telemetryHandler?.(telemetry);
          }
          for (const [sender, callback] of Array.from(this.callbacks)) {
            if (
              callback.commands.some(
                (command) => command === "*" || Number(command) === packet.cmd,
              )
            )
              callback.message(sender, packet);
          }
        }
        if (state.error) this.reportError(state.error);
        if (ready) void this.flush();
      });
    }
    this.client.connect(wsURL(this.IPDwarf, this.proxyURL, this.useHttps));
    return true;
  }

  private async flush(): Promise<void> {
    if (!this.isConnected() || this.flushing) return;
    this.flushing = true;
    try {
      while (this.queue.length && this.isConnected()) {
        const entry = this.queue.shift()!;
        try {
          await this.request(entry.operation, entry.values);
        } catch (error) {
          this.reportError(error);
          this.queue = [];
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }
  private reportError(error: unknown): void {
    console.error("DWARF operation failed", error);
    for (const callback of Array.from(this.callbacks.values()))
      callback.error(error);
  }
  stopCallbacks(sender: string): void {
    this.callbacks.delete(sender);
  }
  deleteCallbacks(sender = ""): void {
    if (sender) this.callbacks.delete(sender);
    else this.callbacks.clear();
  }
  startTelemetryPolling(intervalMs = 10_000): void {
    this.stopTelemetryPolling();
    this.polling = setInterval(() => {
      if (this.isConnected())
        void this.request("getDeviceState").catch((error) =>
          this.reportError(error),
        );
    }, intervalMs);
  }
  stopTelemetryPolling(): void {
    if (this.polling) clearInterval(this.polling);
    this.polling = undefined;
  }
  close(): void {
    this.stopTelemetryPolling();
    if (this.closeSocketTimer) clearTimeout(this.closeSocketTimer);
    this.queue = [];
    this.client?.close();
    this.callbacks.clear();
  }
  async cleanup(_forceStop = false): Promise<void> {
    this.close();
  }
  async handleClose(_message?: unknown): Promise<void> {
    this.close();
  }
}

export function configureCurrentConnection(
  socket: WebSocketHandler,
  hardwareId: number,
): void {
  socket.setProfile(getCurrentProfile(hardwareId));
}
