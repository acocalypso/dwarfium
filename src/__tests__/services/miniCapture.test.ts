import {
  encodeCurrentParamId,
  getCurrentProfile,
  type CurrentCameraCatalog,
  type CurrentPacket,
  type CurrentWebSocketHandler,
} from "dwarfii_api";
import { executeCurrentCaptureWithRuntime } from "@/services/dwarf/captureRuntime";

const id = (category: number, paramIndex: number) =>
  encodeCurrentParamId({
    shootingMode: 2,
    category,
    cameraId: 0,
    paramIndex,
  });
const catalog: CurrentCameraCatalog = {
  modeId: 2,
  cameras: [
    {
      cameraId: 0,
      parameters: [
        {
          key: "exp",
          label: "Exposure",
          source: "special",
          paramId: id(1, 1),
          currentValue: 150,
          options: [{ value: 150, label: "10", seconds: 10 }],
        },
        {
          key: "gain",
          label: "Gain",
          source: "special",
          paramId: id(1, 2),
          currentValue: 100,
          options: [{ value: 100, label: "100" }],
        },
        {
          key: "stackCount",
          label: "Frame count",
          source: "general",
          paramId: id(2, 16),
          currentValue: 5,
          options: [{ value: 5, label: "5" }],
        },
      ],
    },
  ],
};
const settings = {
  cameraId: 0 as const,
  exposureSeconds: 10,
  gain: 100,
  frameCount: 5,
  filterIndex: 2,
};
const state = { session: { generation: 1, phase: "ready" as const } };
const packet = (cmd: number, data: Record<string, unknown>) =>
  ({ cmd, type: 2, known: true, data }) as CurrentPacket;

test("Mini ignores stale frame progress and stops after five new frames", async () => {
  let listener: ((state: any, packet?: CurrentPacket) => void) | undefined;
  const client = {
    session: { state: { generation: 1 } },
    subscribe: jest.fn((callback) => {
      listener = callback;
      callback(state);
      return () => {
        listener = undefined;
      };
    }),
  } as unknown as CurrentWebSocketHandler;
  const sent: string[] = [];
  const transport = {
    request: jest.fn(async (operation: string) => {
      sent.push(operation);
      if (operation === "startTeleCapture") {
        listener?.(state, packet(15208, { state: 1 }));
        listener?.(state, packet(15209, { currentCount: 5, totalCount: 30 }));
      }
      if (operation === "stopTeleCapture")
        listener?.(state, packet(15208, { state: 3 }));
      return packet(0, {
        ...(operation === "switchShootingMode" ? { shootingModeId: 8 } : {}),
        ...(operation === "enterCamera" ? { shootingModeId: 8 } : {}),
        ...(operation === "switchShootingTech" ? { shootingTechId: 2 } : {}),
      });
    }),
  } as any;
  const capture = executeCurrentCaptureWithRuntime(
    client,
    transport,
    getCurrentProfile(4),
    catalog,
    settings,
    async () => catalog,
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(sent).toContain("startTeleCapture");
  expect(sent).not.toContain("setQuickSet");
  expect(sent).not.toContain("stopTeleCapture");
  listener?.(state, packet(15209, { updateType: 2, totalCount: 30 }));
  for (let count = 1; count <= 5; count++)
    listener?.(state, packet(15209, { currentCount: count, totalCount: 30 }));
  await expect(capture).resolves.toEqual({ status: "completed", frames: 5 });
  expect(sent.filter((name) => name === "stopTeleCapture")).toHaveLength(1);
});
