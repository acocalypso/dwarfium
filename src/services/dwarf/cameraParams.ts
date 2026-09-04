import type { ConnectionContextType } from "@/types";
import { getProxyUrl } from "@/lib/get_proxy_url";
import { decodeParamId, V3_PARAM_INDEX } from "./api";

export type V3ParameterValue = {
  paramId: string;
  value: number;
};

export type V3CameraSettingSummary = {
  cameraId: number;
  settings: { label: string; value: string }[];
};

type CatalogParameter = {
  name?: string;
  currentMode?: number;
  currentValue?: unknown;
  values?: ({ name?: string; value?: unknown } | string | number)[];
};

function formatCatalogValue(parameter: CatalogParameter): string {
  const match = parameter.values?.find(
    (candidate) =>
      typeof candidate === "object" &&
      candidate !== null &&
      candidate.value === parameter.currentValue,
  );
  if (typeof match === "object" && match?.name) return match.name;
  if (typeof parameter.currentValue === "boolean")
    return parameter.currentValue ? "On" : "Off";
  return String(parameter.currentValue ?? "Unavailable");
}

function displayParameterName(name = "Parameter") {
  const knownNames: Record<string, string> = {
    exp: "Exposure",
    wb: "White balance",
  };
  if (knownNames[name]) return knownNames[name];
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

export function summarizeV3CameraCatalog(
  catalog: unknown,
): V3CameraSettingSummary[] {
  const root = catalog as {
    data?: {
      cameraParams?: {
        cameraId?: number;
        generalParams?: CatalogParameter[];
        specialParams?: Record<string, CatalogParameter>;
      }[];
    };
  };
  return (root?.data?.cameraParams ?? []).map((camera) => {
    const parameters = [
      ...(camera.generalParams ?? []),
      ...Object.values(camera.specialParams ?? {}),
    ];
    return {
      cameraId: camera.cameraId ?? -1,
      settings: parameters
        .filter((parameter) => parameter.currentValue !== undefined)
        .map((parameter) => ({
          label: displayParameterName(parameter.name),
          value: formatCatalogValue(parameter),
        })),
    };
  });
}

let astroParameterCatalog: unknown;
const authoritativeValues = new Map<string, number>();

export async function loadV3AstroParameterCatalog(
  ip: string,
  connectionCtx: ConnectionContextType,
): Promise<unknown> {
  const target = `http://${ip}:8082/shootingMode/getParamAndSetting`;
  const response = await fetch(
    `${getProxyUrl(connectionCtx)}?target=${encodeURIComponent(target)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modeId: 2 }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `V3 astronomy parameter discovery failed (${response.status})`,
    );
  }
  astroParameterCatalog = await response.json();
  return astroParameterCatalog;
}

export function getV3AstroParameterCatalog(): unknown {
  return astroParameterCatalog;
}

export function ingestV3ParameterNotification(data: {
  paramId?: string | number;
  value?: number;
  value1?: number;
}): V3ParameterValue | undefined {
  if (data.paramId === undefined) return undefined;
  const value = data.value ?? data.value1;
  if (value === undefined) return undefined;
  const paramId = String(data.paramId);
  authoritativeValues.set(paramId, value);
  return { paramId, value };
}

export function applyAuthoritativeCameraParam(
  connectionCtx: ConnectionContextType,
  parameter: V3ParameterValue,
): void {
  const decoded = decodeParamId(parameter.paramId);
  if (decoded.paramIndex === V3_PARAM_INDEX.EXPOSURE) {
    connectionCtx.setAstroSettings((current) => ({
      ...current,
      exposure: parameter.value,
    }));
  } else if (decoded.paramIndex === V3_PARAM_INDEX.GAIN) {
    connectionCtx.setAstroSettings((current) => ({
      ...current,
      gain: parameter.value,
    }));
  } else if (decoded.paramIndex === V3_PARAM_INDEX.FRAME_COUNT) {
    connectionCtx.setAstroSettings((current) => ({
      ...current,
      count: parameter.value,
    }));
  }
}
