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
  test("page facades borrow a single connection and never close either Fleet device", async () => {
    const a = harness("a"),
      b = harness("b");
    try {
      await ready(a, 21);
      await ready(b, 87);
      const page = a.controller.getWorkspaceSocket()!;
      expect(page).toBe(a.controller.getWorkspaceSocket());
      expect(await page.run()).toBe(true);
      expect(a.sockets).toHaveLength(1);
      await page.cleanup(true);
      expect(a.sockets[0].closed).toBe(false);
      expect(b.sockets[0].closed).toBe(false);
      const bCount = b.sockets[0].sent.length;
      const pending = page.request("getDeviceState");
      a.sockets[0].emit("message", {
        data: wire("getDeviceState", {
          deviceStateInfo: { batteryInfo: { percentage: 22 } },
        }),
      });
      await pending;
      expect(b.sockets[0].sent).toHaveLength(bCount);
      expect(a.controller.getSnapshot().telemetry.batteryPercentage).toBe(22);
      a.controller.releaseWorkspaceSocket();
      await expect(page.request("getDeviceState")).rejects.toThrow();
      expect(a.sockets[0].closed).toBe(false);
      expect(a.controller.getWorkspaceSocket()).not.toBe(page);
    } finally {
      a.controller.disconnect();
      b.controller.disconnect();
    }
  });

  test("temperature notifications survive partial snapshots and reset on disconnect", async () => {
    const h = harness("a");
    try {
      await ready(h, 21);
      h.sockets[0].emit("message", {
        data: CurrentDwarfSchema.WsPacket.encode({
          majorVersion: 1,
          minorVersion: 20,
          deviceId: 4,
          moduleId: 9,
          cmd: 15243,
          type: 2,
          data: encodeCurrentMessage("notify.Temperature", { temperature: 34 }),
        }).finish(),
      });
      await flush();
      expect(h.controller.getSnapshot().telemetry.temperature).toBe(34);
      h.sockets[0].emit("message", {
        data: wire("getDeviceState", {
          deviceStateInfo: { batteryInfo: { percentage: 25 } },
        }),
      });
      await flush();
      expect(h.controller.getSnapshot().telemetry).toMatchObject({
        temperature: 34,
        batteryPercentage: 25,
      });
      h.controller.disconnect();
      expect(h.controller.getSnapshot().telemetry).toEqual({});
    } finally {
      h.controller.disconnect();
    }
  });
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
  test("relative HTTP proxy discovery uses a direct SDK WebSocket", async () => {
    const h = harness("a");
    try {
      await h.controller.connect(
        { id: "a", alias: "A", lastKnownHost: "192.0.2.1" },
        "/api/proxy",
      );
      expect(h.fetcher.mock.calls[0][0]).toContain("/api/proxy?target=");
      expect(h.sockets).toHaveLength(1);
      expect(h.controller.getSnapshot().error).toBeUndefined();
    } finally {
      h.controller.disconnect();
    }
  });
  test("mount coordinates are validated before sending and routed only to A", async () => {
    const a = harness("a"),
      b = harness("b");
    try {
      await ready(a, 20);
      await ready(b, 80);
      a.sockets[0].emit("message", {
        data: wire("getDeviceState", {
          connectionStateInfo: { hostSlaveMode: { mode: 0, lock: true } },
        }),
      });
      await flush();
      const aCount = a.sockets[0].sent.length,
        bCount = b.sockets[0].sent.length;
      await expect(a.controller.gotoCoordinates(24, 0)).rejects.toThrow("RA");
      await expect(a.controller.gotoCoordinates(1, NaN)).rejects.toThrow("RA");
      expect(a.sockets[0].sent).toHaveLength(aCount);
      const pending = a.controller.gotoCoordinates(12.5, -30);
      const packet = CurrentDwarfSchema.WsPacket.decode(
        a.sockets[0].sent.at(-1) as Uint8Array,
      );
      expect(packet.cmd).toBe(11002);
      const values = CurrentDwarfSchema.ReqGotoDSO.decode(packet.data!);
      expect(values.ra).toBe(12.5);
      expect(values.dec).toBe(-30);
      expect(values.gotoOnly).toBe(true);
      a.sockets[0].emit("message", {
        data: wire("gotoEquatorial", { code: 0 }),
      });
      await pending;
      expect(b.sockets[0].sent).toHaveLength(bCount);
    } finally {
      a.controller.disconnect();
      b.controller.disconnect();
    }
  });
  test("control request and release are scoped and require reported ownership", async () => {
    const a = harness("a"),
      b = harness("b");
    try {
      await ready(a, 20);
      await ready(b, 80);
      const bCount = b.sockets[0].sent.length;
      const pending = a.controller.setControl(true);
      const packet = CurrentDwarfSchema.WsPacket.decode(
        a.sockets[0].sent.at(-1) as Uint8Array,
      );
      expect(packet.cmd).toBe(13004);
      expect(
        CurrentDwarfSchema.ReqsetMasterLock.decode(packet.data!).lock,
      ).toBe(true);
      expect(a.controller.getSnapshot().ownership).not.toBe("control");
      a.sockets[0].emit("message", {
        data: wire("setMasterLock", { code: 0 }),
      });
      await pending;
      expect(a.controller.getSnapshot().ownership).not.toBe("control");
      a.sockets[0].emit("message", {
        data: wire("getDeviceState", {
          connectionStateInfo: { hostSlaveMode: { mode: 0, lock: true } },
        }),
      });
      await flush();
      expect(a.controller.getSnapshot().ownership).toBe("control");
      const release = a.controller.setControl(false);
      const unlocked = CurrentDwarfSchema.WsPacket.decode(
        a.sockets[0].sent.at(-1) as Uint8Array,
      );
      expect(
        CurrentDwarfSchema.ReqsetMasterLock.decode(unlocked.data!).lock,
      ).toBe(false);
      a.sockets[0].emit("message", {
        data: wire("setMasterLock", { code: 0 }),
      });
      await release;
      expect(b.sockets[0].sent).toHaveLength(bCount);
      expect(b.controller.getSnapshot().ownership).not.toBe("control");
    } finally {
      a.controller.disconnect();
      b.controller.disconnect();
    }
  });
  test("a completed response cannot escape into a disconnected workspace", async () => {
    const h = harness("a");
    try {
      await ready(h, 20);
      const pending = h.controller.request("getDeviceState");
      h.sockets[0].emit("message", {
        data: wire("getDeviceState", {
          deviceStateInfo: { batteryInfo: { percentage: 21 } },
        }),
      });
      h.controller.disconnect();
      await expect(pending).rejects.toThrow();
      expect(h.controller.getSnapshot().error).toBeUndefined();
      expect(h.controller.getSnapshot().telemetry).toEqual({});
    } finally {
      h.controller.disconnect();
    }
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
