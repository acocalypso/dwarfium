import type { CurrentPacket } from "dwarfii_api";

export type ActivityEvidence = Readonly<{
  tele?: number;
  wide?: number;
  focus?: number;
  goto?: number;
}>;

function stateOf(value: any): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const state = value.state ?? 0;
  return Number.isInteger(state) && state >= 0 && state <= 3
    ? state
    : undefined;
}

/** Snapshot absence is unknown. Separate channels prevent wide-idle clearing tele capture. */
export function reduceActivity(
  previous: ActivityEvidence,
  packet: CurrentPacket,
): ActivityEvidence {
  if (!packet.known || packet.type === 0 || (packet.data.code ?? 0) !== 0)
    return previous;
  if (packet.cmd === 16405) {
    const value = packet.data;
    const focus = value.focusMotorStateInfo?.exclusiveState;
    return Object.freeze({
      tele: stateOf(value.teleCameraStateInfo?.exclusiveState?.captureRawState),
      wide: stateOf(value.wideCameraStateInfo?.exclusiveState?.captureRawState),
      focus: stateOf(
        focus?.astroAutoFocusState ??
          focus?.normalAutoFocusState ??
          focus?.astroAutoFocusFastState ??
          focus?.areaAutoFocusState,
      ),
      goto: stateOf(value.motionMotorStateInfo?.exclusiveState?.astroGotoState),
    });
  }
  if (packet.type !== 2) return previous;
  const field = (
    {
      15208: "tele",
      15236: "wide",
      15278: "focus",
      15280: "focus",
      15211: "goto",
    } as const
  )[packet.cmd];
  const state = stateOf(packet.data);
  return field && state !== undefined
    ? Object.freeze({ ...previous, [field]: state })
    : previous;
}

export function summarizeActivity(evidence: ActivityEvidence) {
  const active = (value?: number) => value === 1 || value === 2;
  if (active(evidence.tele) || active(evidence.wide))
    return "capturing" as const;
  if (active(evidence.focus)) return "focusing" as const;
  if (active(evidence.goto)) return "slewing" as const;
  // Partial idle evidence is not proof that all other subsystems are idle.
  if (
    [evidence.tele, evidence.wide, evidence.focus, evidence.goto].every(
      (value) => value === 0 || value === 3,
    )
  )
    return "idle" as const;
  return "unknown" as const;
}
