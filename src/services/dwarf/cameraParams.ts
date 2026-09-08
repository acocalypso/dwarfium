import type { ConnectionContextType } from "@/types";
import { getProxyUrl } from "@/lib/get_proxy_url";
import { allowedGains } from "@/lib/data_utils";
import { allowedWideGains } from "@/lib/data_wide_utils";
import {
  decodeCurrentParamId,
  getCurrentProfile,
  normalizeCurrentCameraCatalog,
  normalizeCurrentParamId,
  parseCurrentJsonLossless,
  sameCurrentParameterAcrossModes,
  type CurrentCameraCatalog,
  type CurrentCatalogParameter,
  type CurrentSession,
} from "./api";

export type V3ParameterValue = {
  paramId: string;
  value: number;
  mode?: number;
};
export type V3CameraSettingSummary = {
  cameraId: number;
  settings: { label: string; value: string }[];
};
type CatalogScope = {
  ip: string;
  socket: unknown;
  session?: CurrentSession;
  generation?: number;
};
let currentScope: CatalogScope | undefined;
let unsubscribeSession: (() => void) | undefined;
let cacheEpoch = 0;
const rawCatalogs = new Map<number, unknown>();
const normalizedCatalogs = new Map<number, CurrentCameraCatalog>();
const pendingCatalogs = new Map<number, Promise<unknown>>();
const authoritativeValues = new Map<string, V3ParameterValue>();
const runtimeNamespaces = new Map<number, number>();

/** Bind to SDK session lifecycle; root connection disposal may call this too. */
export function resetV3CameraParameterCache(): void {
  unsubscribeSession?.();
  unsubscribeSession = undefined;
  currentScope = undefined;
  cacheEpoch += 1;
  rawCatalogs.clear();
  normalizedCatalogs.clear();
  pendingCatalogs.clear();
  authoritativeValues.clear();
  runtimeNamespaces.clear();
}

function synchronizeScope(
  ip: string,
  connectionCtx: ConnectionContextType,
): void {
  const socket = connectionCtx.socketIPDwarf;
  const session: CurrentSession | undefined = socket?.session;
  const next = { ip, socket, session, generation: session?.state.generation };
  if (
    currentScope?.ip === next.ip &&
    currentScope?.socket === next.socket &&
    currentScope?.session === next.session &&
    currentScope?.generation === next.generation
  )
    return;
  resetV3CameraParameterCache();
  currentScope = next;
  if (session) {
    unsubscribeSession = session.subscribe((state) => {
      if (
        state.generation !== next.generation ||
        state.phase === "disconnected"
      )
        resetV3CameraParameterCache();
    });
  }
}

function checkCurrentScope(connectionCtx?: ConnectionContextType): void {
  if (connectionCtx?.IPDwarf)
    synchronizeScope(connectionCtx.IPDwarf, connectionCtx);
  else if (connectionCtx) resetV3CameraParameterCache();
  if (
    currentScope?.session &&
    (currentScope.session.state.generation !== currentScope.generation ||
      currentScope.session.state.phase === "disconnected")
  )
    resetV3CameraParameterCache();
}

/** Display current reported labels, never model-static explanatory values. */
export function summarizeV3CameraCatalog(
  catalog: unknown,
): V3CameraSettingSummary[] {
  if (!catalog) return [];
  try {
    const normalized =
      typeof catalog === "object" && catalog !== null && "cameras" in catalog
        ? (catalog as CurrentCameraCatalog)
        : normalizeCurrentCameraCatalog(catalog, 2);
    return normalized.cameras.map((camera) => ({
      cameraId: camera.cameraId,
      settings: [...camera.parameters]
        .sort(
          (first, second) =>
            Number(first.source === "special") -
            Number(second.source === "special"),
        )
        .filter((parameter) => parameter.currentValue !== undefined)
        .map((parameter) => ({
          label: parameter.label,
          value: parameter.currentLabel ?? String(parameter.currentValue),
        })),
    }));
  } catch {
    return [];
  }
}

/** SDK owns discovery parsing/legal values; this layer owns request scope. */
export async function loadV3CameraParameterCatalog(
  ip: string,
  connectionCtx: ConnectionContextType,
  modeId: number,
): Promise<unknown> {
  synchronizeScope(ip, connectionCtx);
  const pending = pendingCatalogs.get(modeId);
  if (pending) return pending;
  const epoch = cacheEpoch;
  const scope = currentScope;
  const request = (async () => {
    const target = "http://" + ip + ":8082/shootingMode/getParamAndSetting";
    const response = await fetch(
      getProxyUrl(connectionCtx) + "?target=" + encodeURIComponent(target),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modeId }),
      },
    );
    if (!response.ok)
      throw new Error(
        "Camera parameter discovery failed (" + response.status + ")",
      );
    const raw = parseCurrentJsonLossless(await response.text());
    const normalized = normalizeCurrentCameraCatalog(raw, modeId);
    if (
      epoch !== cacheEpoch ||
      scope !== currentScope ||
      scope?.session?.state.generation !== scope?.generation
    ) {
      throw new Error("Camera discovery belongs to a previous connection.");
    }
    rawCatalogs.set(modeId, raw);
    normalizedCatalogs.set(modeId, normalized);
    return raw;
  })();
  pendingCatalogs.set(modeId, request);
  try {
    return await request;
  } finally {
    if (pendingCatalogs.get(modeId) === request) pendingCatalogs.delete(modeId);
  }
}

export function loadV3AstroParameterCatalog(
  ip: string,
  connectionCtx: ConnectionContextType,
): Promise<unknown> {
  return loadV3CameraParameterCatalog(ip, connectionCtx, 2);
}

/** Compatibility accessor keeps the raw response shape with lossless string IDs. */
export function getV3AstroParameterCatalog(
  connectionCtx?: ConnectionContextType,
): unknown {
  checkCurrentScope(connectionCtx);
  return rawCatalogs.get(2);
}
export function getV3NormalizedCameraCatalog(
  modeId = 2,
  connectionCtx?: ConnectionContextType,
): CurrentCameraCatalog | undefined {
  checkCurrentScope(connectionCtx);
  return normalizedCatalogs.get(modeId);
}
export function getV3CameraParameterOptions(
  cameraId: number,
  key: string,
  modeId = 2,
  connectionCtx?: ConnectionContextType,
): CurrentCatalogParameter | undefined {
  return getV3NormalizedCameraCatalog(modeId, connectionCtx)
    ?.cameras.find((camera) => camera.cameraId === cameraId)
    ?.parameters.find((parameter) => parameter.key === key);
}
export function getV3ActiveParameterNamespace(
  cameraId: number,
  connectionCtx?: ConnectionContextType,
): number | undefined {
  checkCurrentScope(connectionCtx);
  return runtimeNamespaces.get(cameraId);
}

/** Only for canonical 15264 payloads: omitted non-optional proto3 value means zero. */
export function ingestV3ParameterNotification(
  data: { paramId?: string | number; value?: number; mode?: number },
  connectionCtx?: ConnectionContextType,
): V3ParameterValue | undefined {
  checkCurrentScope(connectionCtx);
  if (data.paramId === undefined) return undefined;
  const value = data.value ?? 0;
  if (
    !Number.isSafeInteger(value) ||
    (data.mode !== undefined && !Number.isSafeInteger(data.mode))
  )
    return undefined;
  try {
    const result = {
      paramId: normalizeCurrentParamId(data.paramId),
      value,
      mode: data.mode ?? 0,
    };
    authoritativeValues.set(result.paramId, result);
    return result;
  } catch {
    return undefined;
  }
}

export function applyAuthoritativeCameraParam(
  connectionCtx: ConnectionContextType,
  parameter: V3ParameterValue,
): void {
  checkCurrentScope(connectionCtx);
  if (!connectionCtx.IPDwarf || !Number.isSafeInteger(parameter.value)) return;
  const decoded = decodeCurrentParamId(parameter.paramId);
  if (![0, 1].includes(decoded.cameraId) || decoded.reserved !== "0") return;
  if (decoded.shootingMode !== 2) {
    // Runtime namespaces are accepted only when reported and matching a
    // discovered astronomy parameter for the same camera/category/index.
    if (![11, 13].includes(decoded.shootingMode)) return;
    const known = normalizedCatalogs
      .get(2)
      ?.cameras.find((camera) => camera.cameraId === decoded.cameraId)
      ?.parameters.some(
        (entry) =>
          entry.paramId !== undefined &&
          sameCurrentParameterAcrossModes(entry.paramId, parameter.paramId),
      );
    if (!known) return;
    runtimeNamespaces.set(decoded.cameraId, decoded.shootingMode);
  }
  if (decoded.category === 1 && decoded.paramIndex === 1) {
    connectionCtx.setAstroSettings((current) => ({
      ...current,
      ...(decoded.cameraId === 0
        ? { exposure: parameter.value }
        : { wideExposure: parameter.value }),
    }));
  } else if (decoded.category === 1 && decoded.paramIndex === 2) {
    const options =
      decoded.cameraId === 0
        ? allowedGains[connectionCtx.typeIdDwarf!]?.values
        : allowedWideGains[connectionCtx.typeIdDwarf!]?.values;
    const uiValue = options?.find(
      (option) => Number(option.name) === parameter.value,
    )?.index;
    if (uiValue === undefined) return;
    connectionCtx.setAstroSettings((current) => ({
      ...current,
      ...(decoded.cameraId === 0 ? { gain: uiValue } : { wideGain: uiValue }),
    }));
  } else if (
    decoded.category === 2 &&
    decoded.paramIndex === 16 &&
    decoded.cameraId === connectionCtx.currentAstroCamera
  ) {
    connectionCtx.setAstroSettings((current) => ({
      ...current,
      count: parameter.value,
    }));
  }
}

/** Legacy UI selects by list position; translate semantic label, not Mini index+1. */
export function resolveScienceFilterIndex(
  hardwareId: number,
  uiIndex: number,
): number {
  const uiLabels: Record<number, readonly string[]> = {
    1: ["IR cut", "IR pass"],
    2: ["VIS", "Astro", "Duo-Band"],
    4: ["Astro", "Duo-Band"],
  };
  if (!Number.isInteger(uiIndex) || uiIndex < 0)
    throw new Error("Select a supported science filter.");
  const label = uiLabels[hardwareId]?.[uiIndex];
  const filter = getCurrentProfile(hardwareId).scienceFilters.find(
    (option) => option.label === label,
  );
  if (!filter)
    throw new Error(
      "This science filter is not supported by the connected DWARF.",
    );
  return filter.index;
}
