import {
  CurrentDwarfSchema,
  CurrentCommands,
  encodeCurrentMessage,
} from "dwarfii_api";
import { FleetDeviceController } from "@/services/fleet/controller";

class Socket {
  readyState = 0;
  binaryType: "blob" | "arraybuffer" = "arraybuffer";
  handlers = new Map<string, Set<(event: any) => void>>();
  sent: (string | Uint8Array)[] = [];
  closed = false;
  addEventListener(name: string, handler: (event: any) => void) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(handler);
  }
  removeEventListener(name: string, handler: (event: any) => void) {
    this.handlers.get(name)?.delete(handler);
  }
  send(bytes: string | Uint8Array) {
    this.sent.push(bytes);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  emit(name: string, event = {}) {
    if (name === "open") this.readyState = 1;
    this.handlers.get(name)?.forEach((handler) => handler(event));
  }
}

function wire(operation: keyof typeof CurrentCommands, values = {}) {
  const [moduleId, cmd, , name] = CurrentCommands[operation];
  return CurrentDwarfSchema.WsPacket.encode({
    majorVersion: 1,
    minorVersion: 20,
    deviceId: 4,
    moduleId,
    cmd,
    type: 1,
    data: encodeCurrentMessage(name!, values),
    clientId: "test",
  }).finish();
}
async function flush() {
  for (let i = 0; i < 15; i++) await Promise.resolve();
}
function harness(id: string) {
  const sockets: Socket[] = [];
  const fetcher = jest.fn().mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({ code: 0, data: { deviceId: 4 } }),
  });
  const controller = new FleetDeviceController(
    id,
    {
      heartbeatIntervalMs: 0,
      reconnectDelaysMs: [],
      webSocketFactory: () => {
        const socket = new Socket();
        sockets.push(socket);
        return socket;
      },
    },
    fetcher,
  );
  return { controller, sockets, fetcher };
}
async function ready(h: ReturnType<typeof harness>, battery: number) {
  await h.controller.connect({
    id: h.controller.id,
    alias: "Test",
    model: "dwarfmini",
    lastKnownHost: "192.0.2.1",
  });
  const socket = h.sockets[0];
  socket.emit("open");
  socket.emit("message", {
    data: wire("getDeviceState", {
      deviceStateInfo: { batteryInfo: { percentage: battery } },
    }),
  });
  await flush();
}

describe("Fleet controller isolation through real SDK sessions", () => {
  afterEach(() => jest.restoreAllMocks());
  test.each([1, 2, 4, 8])(
    "%i simultaneous controllers retain independent state",
    async (count) => {
      const fleet = Array.from({ length: count }, (_, index) =>
        harness(`scope-${index}`),
      );
      try {
        await Promise.all(
          fleet.map((scope, index) => ready(scope, 20 + index)),
        );
        fleet.forEach((scope, index) =>
          expect(
            scope.controller.getSnapshot().telemetry.batteryPercentage,
          ).toBe(20 + index),
        );
        fleet[0].controller.disconnect();
        fleet
          .slice(1)
          .forEach((scope) =>
            expect(scope.controller.getSnapshot().connection).toBe("connected"),
          );
      } finally {
        fleet.forEach((scope) => scope.controller.disconnect());
      }
    },
  );
  test("A telemetry and disconnect do not alter or close B", async () => {
    const a = harness("a"),
      b = harness("b");
    try {
      await ready(a, 21);
      await ready(b, 87);
      expect(a.controller.getSnapshot().telemetry.batteryPercentage).toBe(21);
      expect(b.controller.getSnapshot().telemetry.batteryPercentage).toBe(87);
      const before = b.controller.getSnapshot();
      a.controller.disconnect();
      expect(b.controller.getSnapshot()).toBe(before);
      expect(b.sockets[0].closed).toBe(false);
      expect(a.controller.getSnapshot().activity).toBe("unknown");
    } finally {
      a.controller.disconnect();
      b.controller.disconnect();
    }
  });
  test("request for A goes only to A and ownership gates physical operations", async () => {
    const a = harness("a"),
      b = harness("b");
    try {
      await ready(a, 21);
      await ready(b, 87);
      const bCount = b.sockets[0].sent.length;
      await expect(a.controller.request("takeTelePhoto")).rejects.toThrow(
        "control",
      );
      const request = a.controller.request("getDeviceState");
      expect(b.sockets[0].sent).toHaveLength(bCount);
      a.sockets[0].emit("message", {
        data: wire("getDeviceState", {
          deviceStateInfo: { batteryInfo: { percentage: 22 } },
        }),
      });
      await request;
      expect(a.controller.getSnapshot().telemetry.batteryPercentage).toBe(22);
      expect(b.controller.getSnapshot().telemetry.batteryPercentage).toBe(87);
    } finally {
      a.controller.disconnect();
      b.controller.disconnect();
    }
  });
  test("identity mismatch never performs discovery", async () => {
    const h = harness("a");
    await expect(
      h.controller.connect({ id: "b", alias: "B", lastKnownHost: "192.0.2.1" }),
    ).rejects.toThrow("identity");
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  test("late HTTP discovery cannot reopen a disconnected device", async () => {
    const h = harness("a");
    let resolve!: (value: unknown) => void;
    h.fetcher.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = h.controller.connect({
      id: "a",
      alias: "A",
      lastKnownHost: "192.0.2.1",
    });
    h.controller.disconnect();
    resolve({
      ok: true,
      text: async () => JSON.stringify({ code: 0, data: { deviceId: 4 } }),
    });
    await pending;
    expect(h.sockets).toHaveLength(0);
    expect(h.controller.getSnapshot().connection).toBe("disconnected");
  });
});
