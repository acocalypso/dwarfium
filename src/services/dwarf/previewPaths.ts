import { getIpServerMTX, getProxyUrl } from "@/lib/get_proxy_url";
import type { ConnectionContextType } from "@/types";

export function devicePreviewPath(host: string, camera: "tele" | "wide") {
  if (
    !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) ||
    host.split(".").some((part) => Number(part) > 255)
  )
    throw new Error("A valid telescope address is required for preview.");
  return `dwarf_${host.replaceAll(".", "_")}_${camera}`;
}

/** Each telescope has its own MediaMTX paths, including across browser tabs. */
export async function ensureDevicePreviewPaths(context: ConnectionContextType) {
  const host = context.IPDwarf;
  if (!host) throw new Error("Select a connected telescope first.");
  await Promise.all(
    (["tele", "wide"] as const).map(async (camera) => {
      const name = devicePreviewPath(host, camera);
      const source = `rtsp://${host}:554/ch${camera === "tele" ? 0 : 1}/stream0`;
      const url = (action: string) =>
        `${getProxyUrl(context)}?target=${encodeURIComponent(`http://${getIpServerMTX()}:9997/v3/config/paths/${action}/${name}`)}`;
      const response = await fetch(url("get"), {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok && (await response.json()).source === source) return;
      if (!response.ok && response.status !== 404)
        throw new Error(
          `Preview configuration unavailable (${response.status}).`,
        );
      const update = await fetch(
        url(response.status === 404 ? "add" : "replace"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source,
            sourceOnDemand: true,
            sourceOnDemandCloseAfter: "10s",
            record: false,
          }),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!update.ok)
        throw new Error(
          `Could not configure ${camera} preview (${update.status}).`,
        );
    }),
  );
}
