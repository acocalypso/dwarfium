jest.mock("@/lib/dwarf_utils", () => ({ get_error: jest.fn() }));
jest.mock("@/lib/logger", () => ({ logger: jest.fn() }));

import { startPhoto, startVideo, stopVideo } from "@/lib/photo_utils";
import {
  decodeMediaState,
  snapshotMediaStates,
} from "@/services/dwarf/mediaState";
import type { CurrentSessionState } from "dwarfii_api";

test.each([
  [0, startPhoto, "takeTelePhoto"],
  [1, startPhoto, "takeWidePhoto"],
  [0, startVideo, "startTeleRecord"],
  [1, startVideo, "startWideRecord"],
  [0, stopVideo, "stopTeleRecord"],
  [1, stopVideo, "stopWideRecord"],
] as const)("camera %i action %s uses %s", async (camera, action, command) => {
  const request = jest.fn().mockResolvedValue({ data: {} });
  const message = jest.fn();
  const ctx = { socketIPDwarf: { isConnected: () => true, request } } as any;
  expect(await action(camera, ctx, message)).toBe(true);
  expect(request).toHaveBeenCalledWith(command, {});
  expect(message).toHaveBeenLastCalledWith(
    "Request accepted. Waiting for camera state.",
  );
});

test("rejected photo does not report success or use another connection", async () => {
  const request = jest.fn().mockRejectedValue(new Error("Control required"));
  const message = jest.fn();
  const ctx = { socketIPDwarf: { isConnected: () => true, request } } as any;
  expect(await startPhoto(0, ctx, message)).toBe(false);
  expect(message).toHaveBeenLastCalledWith("Control required");
});

test("unknown camera fails locally", async () => {
  const request = jest.fn();
  const ctx = { socketIPDwarf: { isConnected: () => true, request } } as any;
  expect(await startPhoto(9, ctx, jest.fn())).toBe(false);
  expect(request).not.toHaveBeenCalled();
});

test.each([0, 1, 2, 3])(
  "canonical video notification state %i is authoritative",
  (state) => {
    const packet = {
      type: 2,
      cmd: 15275,
      data: { cameraType: 1, state },
    };
    expect(decodeMediaState(packet)).toEqual({
      operation: "video",
      cameraId: 1,
      state: ["idle", "running", "stopping", "stopped"][state],
    });
  },
);

test("ACK, legacy function state and unknown states cannot change media state", () => {
  for (const packet of [
    { type: 1, cmd: 10005, data: { code: 0 } },
    { type: 2, cmd: 15201, data: { functionId: 4, state: 1 } },
    { type: 2, cmd: 15275, data: { state: 9 } },
  ])
    expect(decodeMediaState(packet)).toBeUndefined();
});

test("proto3 omitted fields mean telephoto idle", () => {
  expect(decodeMediaState({ type: 2, cmd: 15273, data: {} })).toEqual({
    operation: "photo",
    cameraId: 0,
    state: "idle",
  });
});

test("full snapshot restores wide video, disconnected snapshots do not", () => {
  const state = {
    phase: "ready",
    snapshot: {
      wideCameraStateInfo: { exclusiveState: { recordState: { state: 1 } } },
    },
    ownership: "control",
    notifications: new Map(),
    parameters: new Map(),
    generation: 1,
  } satisfies CurrentSessionState;
  expect(snapshotMediaStates(state)).toEqual([
    { operation: "video", cameraId: 1, state: "running" },
  ]);
  expect(snapshotMediaStates({ ...state, phase: "disconnected" })).toEqual([]);
});
