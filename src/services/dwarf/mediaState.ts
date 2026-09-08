import type { CurrentPacket, CurrentSessionState } from "dwarfii_api";

export type MediaState = {
  operation: "photo" | "video";
  cameraId: 0 | 1;
  state: "idle" | "running" | "stopping" | "stopped";
};

/** Canonical notify.proto PhotoState/RecordState; never infer state from ACK. */
export function decodeMediaState(
  packet?: Pick<CurrentPacket, "type" | "cmd" | "data">,
): MediaState | undefined {
  if (!packet || packet.type !== 2 || ![15273, 15275].includes(packet.cmd))
    return;
  const cameraId = packet.data.cameraType ?? 0;
  const state = packet.data.state ?? 0;
  if (
    (cameraId !== 0 && cameraId !== 1) ||
    !Number.isInteger(state) ||
    state < 0 ||
    state > 3
  )
    return;
  return {
    operation: packet.cmd === 15273 ? "photo" : "video",
    cameraId,
    state: (["idle", "running", "stopping", "stopped"] as const)[state],
  };
}

/** Rehydrate an already running camera from the full state snapshot. */
export function snapshotMediaStates(state: CurrentSessionState): MediaState[] {
  if (state.phase !== "ready" || !state.snapshot) return [];
  const result: MediaState[] = [];
  for (const cameraId of [0, 1] as const) {
    const camera =
      state.snapshot[
        cameraId === 0 ? "teleCameraStateInfo" : "wideCameraStateInfo"
      ];
    for (const [key, cmd] of [
      ["photoState", 15273],
      ["recordState", 15275],
    ] as const) {
      const value = camera?.exclusiveState?.[key];
      if (!value) continue;
      const decoded = decodeMediaState({
        type: 2,
        cmd,
        data: { ...value, cameraType: cameraId },
      });
      if (decoded) result.push(decoded);
    }
  }
  return result;
}
