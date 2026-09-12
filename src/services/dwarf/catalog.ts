import {
  CurrentProtocolError,
  decodeCurrentParamId,
  normalizeCurrentCameraCatalog,
  parseCurrentJsonLossless,
  type CurrentCameraCatalog,
} from "dwarfii_api";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CurrentProtocolError(
      "decode",
      "Invalid shooting technique catalog",
    );
  }
  return value as Record<string, unknown>;
}

/** Firmware publishes stackCount separately from cameraParams. Keep the SDK's
 * validation and lossless IDs, but include these per-camera technique controls.
 * Shared camera 15 controls must not leak into telephoto/wide-angle catalogs.
 */
export function normalizeDeviceCameraCatalog(
  input: unknown,
  modeId: number,
): CurrentCameraCatalog {
  const raw =
    typeof input === "string" ? parseCurrentJsonLossless(input) : input;
  const catalog = normalizeCurrentCameraCatalog(raw, modeId);
  const response = record(raw);
  const settings = record(response.data).shootingTechSettings;
  if (settings === undefined) return catalog;
  if (!Array.isArray(settings)) {
    throw new CurrentProtocolError(
      "decode",
      "Invalid shooting technique settings",
    );
  }
  const entries = settings.map(record);
  return {
    ...catalog,
    cameras: catalog.cameras.map((camera) => {
      const parameters = [...camera.parameters];
      for (const entry of entries.filter(
        (e) =>
          e.cameraId === camera.cameraId &&
          (e.cameraId === 0 || e.cameraId === 1),
      )) {
        if (!Array.isArray(entry.generalParams)) {
          throw new CurrentProtocolError(
            "decode",
            "Invalid technique parameters",
          );
        }
        const generalParams = entry.generalParams.map((value) => {
          const parameter = record(value);
          const namespace = decodeCurrentParamId(parameter.paramId);
          if (
            namespace.cameraId !== camera.cameraId ||
            namespace.shootingMode !== modeId
          ) {
            throw new CurrentProtocolError(
              "decode",
              "Technique parameter namespace mismatch",
            );
          }
          if (namespace.category !== 2 || namespace.paramIndex !== 16)
            return parameter;
          // The SDK validates discrete options. Expand only the firmware's
          // advertised integer count range, never a model-specific default.
          const min = parameter.minValue;
          const max = parameter.maxValue;
          if (
            min === undefined &&
            max === undefined &&
            Array.isArray(parameter.values)
          )
            return parameter;
          if (
            typeof min !== "number" ||
            typeof max !== "number" ||
            !Number.isSafeInteger(min) ||
            !Number.isSafeInteger(max) ||
            min < 1 ||
            max < min ||
            max - min > 10000
          ) {
            throw new CurrentProtocolError(
              "decode",
              "Invalid runtime frame-count bounds",
            );
          }
          const values = Array.isArray(parameter.values)
            ? parameter.values.filter(
                (v) =>
                  typeof v === "number" &&
                  v >= min &&
                  v <= max &&
                  Number.isInteger(v),
              )
            : Array.from({ length: max - min + 1 }, (_, i) => min + i);
          return { ...parameter, values };
        });
        const extra = normalizeCurrentCameraCatalog(
          {
            code: 0,
            data: {
              modeId,
              cameraParams: [{ cameraId: camera.cameraId, generalParams }],
            },
          },
          modeId,
        );
        parameters.push(...extra.cameras[0].parameters);
      }
      // Preserve duplicates so SDK uniqueness checks reject ambiguous controls.
      return { ...camera, parameters };
    }),
  };
}
