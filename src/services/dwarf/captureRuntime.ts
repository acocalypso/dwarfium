import {
  assertCurrentSuccess,
  executeCurrentCapture,
  findCurrentCameraParameter,
  resolveCurrentCaptureControls,
  type CurrentCameraCatalog,
  type CurrentCaptureSettings,
  type CurrentCaptureTransport,
  type CurrentPacket,
  type CurrentProfile,
  type CurrentWebSocketHandler,
} from "dwarfii_api";

/** Mini firmware accepts manual mode-2 exposure/gain writes, but a subsequent
 * 11041 quick-set makes those writes fail with -1 and can reload stale capture
 * values. Its 16703 count echo also does not change the 11005 job's 30-frame
 * target, so stop on actual 15209 frame progress rather than trusting the ACK.
 */
async function executeMiniCapture(
  client: CurrentWebSocketHandler,
  transport: CurrentCaptureTransport,
  profile: CurrentProfile,
  catalog: CurrentCameraCatalog,
  settings: CurrentCaptureSettings,
  readCurrent: () => Promise<CurrentCameraCatalog>,
) {
  const controls = resolveCurrentCaptureControls(profile, catalog, settings);
  const generation = client.session.state.generation;
  const send = async (
    operation: Parameters<CurrentCaptureTransport["request"]>[0],
    values: Record<string, unknown>,
  ) => {
    const packet = await transport.request(operation, values);
    assertCurrentSuccess(packet);
    return packet;
  };
  const mode = await send("switchShootingMode", { mode: 8 });
  if (mode.data.shootingModeId !== 8)
    throw new Error("Mini did not confirm astronomy shooting mode.");
  const camera = await send("enterCamera", { clientParam: { encodeType: 1 } });
  if (![2, 8].includes(camera.data.shootingModeId ?? -1))
    throw new Error("Mini did not confirm the astronomy camera.");
  const tech = await send("switchShootingTech", { tech: 2 });
  if (tech.data.shootingTechId !== 2)
    throw new Error("Mini did not confirm deep-sky stacking mode.");
  const current = await readCurrent();
  const exposure = findCurrentCameraParameter(
    current,
    settings.cameraId,
    "exp",
  );
  const gain = findCurrentCameraParameter(current, settings.cameraId, "gain");
  if (Number(exposure.currentValue) !== controls.exposure.value)
    await send("setExposure", controls.exposure);
  if (Number(gain.currentValue) !== controls.gain.value)
    await send("setGain", controls.gain);
  await send("setIntegerParameter", controls.frameCount);
  const verified = await readCurrent();
  const verifiedExposure = findCurrentCameraParameter(
    verified,
    settings.cameraId,
    "exp",
  );
  const verifiedGain = findCurrentCameraParameter(
    verified,
    settings.cameraId,
    "gain",
  );
  const verifiedCount = findCurrentCameraParameter(
    verified,
    settings.cameraId,
    "stackCount",
  );
  if (
    Number(verifiedExposure.currentValue) !== controls.exposure.value ||
    Number(verifiedGain.currentValue) !== controls.gain.value ||
    Number(verifiedCount.currentValue) !== settings.frameCount
  )
    throw new Error(
      "Mini did not apply the requested astronomy settings; capture was not started.",
    );

  let count = 0;
  let captureStarted = false;
  let progressSession = false;
  let stopRequested = false;
  let settled = false;
  let finish!: (error?: Error) => void;
  const completed = new Promise<void>((resolve, reject) => {
    finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
  });
  // The subscription may reject before the start command resolves.
  void completed.catch(() => undefined);
  const requestStop = (error?: Error) => {
    if (stopRequested) return;
    stopRequested = true;
    void transport
      .request(
        settings.cameraId === 0 ? "stopTeleCapture" : "stopWideCapture",
        {},
      )
      .then(() => finish(error))
      .catch((failure) =>
        finish(
          error ??
            (failure instanceof Error ? failure : new Error(String(failure))),
        ),
      );
  };
  const unsubscribe = client.subscribe((state, packet?: CurrentPacket) => {
    if (
      state.session.generation !== generation ||
      state.session.phase !== "ready"
    ) {
      finish(
        new Error(
          "Mini connection changed during capture; check the telescope before retrying.",
        ),
      );
      return;
    }
    if (!packet || packet.type !== 2) return;
    if (packet.cmd === (settings.cameraId === 0 ? 15208 : 15236)) {
      if (packet.data.state === 1) captureStarted = true;
      if ([0, 3].includes(packet.data.state ?? -1) && !settled)
        finish(
          progressSession && count >= settings.frameCount
            ? undefined
            : new Error(
                "Mini capture stopped before the requested frame count.",
              ),
        );
    }
    if (!captureStarted) return;
    if (
      packet.cmd === (settings.cameraId === 0 ? 15209 : 15237) &&
      packet.data.updateType === 2
    ) {
      progressSession = true;
      count = 0;
    }
    if (!progressSession) return;
    if (
      packet.cmd === 15288 &&
      packet.data.totalTime !== undefined &&
      Number(packet.data.totalTime) !== settings.exposureSeconds
    )
      requestStop(
        new Error(
          "Mini started a different exposure duration; capture stopped.",
        ),
      );
    if (packet.cmd === (settings.cameraId === 0 ? 15209 : 15237)) {
      if (
        packet.data.expIndex !== undefined &&
        Number(packet.data.expIndex) !== controls.exposure.value
      )
        requestStop(
          new Error(
            "Mini started a different exposure setting; capture stopped.",
          ),
        );
      if (packet.data.currentCount !== undefined)
        count = Math.max(count, Number(packet.data.currentCount));
      if (count >= settings.frameCount) requestStop();
    }
  });
  const timer = setTimeout(
    () => {
      requestStop(
        new Error(
          "Mini capture did not reach the requested frame count in time.",
        ),
      );
    },
    Math.max(
      120_000,
      settings.frameCount * (settings.exposureSeconds + 8) * 1000 + 90_000,
    ),
  );
  try {
    await send(
      settings.cameraId === 0 ? "startTeleCapture" : "startWideCapture",
      settings.cameraId === 0 ? { irIndex: settings.filterIndex } : {},
    );
    await completed;
    return { status: "completed" as const, frames: count };
  } catch (error) {
    if (!settled)
      requestStop(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    clearTimeout(timer);
    unsubscribe();
  }
}

/** Keep the established SDK sequence for D2/D3; Mini needs the verified
 * firmware-specific preparation and progress handling above. */
export async function executeCurrentCaptureWithRuntime(
  client: CurrentWebSocketHandler,
  transport: CurrentCaptureTransport,
  profile: CurrentProfile,
  catalog: CurrentCameraCatalog,
  settings: CurrentCaptureSettings,
  readCurrent: () => Promise<CurrentCameraCatalog>,
) {
  if (profile.model === "dwarfmini")
    return executeMiniCapture(
      client,
      transport,
      profile,
      catalog,
      settings,
      readCurrent,
    );
  return executeCurrentCapture(transport, profile, catalog, settings);
}
