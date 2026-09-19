import {
  devicePreviewPath,
  ensureDevicePreviewPaths,
} from "@/services/dwarf/previewPaths";
import type { ConnectionContextType } from "@/types";
jest.mock("@/lib/get_proxy_url", () => ({
  getIpServerMTX: () => "127.0.0.1",
  getProxyUrl: () => "http://127.0.0.1:8860",
}));
test("different telescope streams cannot overwrite a shared path", () => {
  expect(devicePreviewPath("192.0.2.1", "tele")).toBe("dwarf_192_0_2_1_tele");
  expect(devicePreviewPath("192.0.2.2", "tele")).not.toBe(
    devicePreviewPath("192.0.2.1", "tele"),
  );
  expect(() => devicePreviewPath("../other", "wide")).toThrow();
});
test("creates missing scoped paths with the correct RTSP camera source", async () => {
  const previousFetch = global.fetch;
  const fetcher = jest
    .fn()
    .mockImplementation(async (_url, options) =>
      options?.method === "POST" ? { ok: true } : { ok: false, status: 404 },
    );
  global.fetch = fetcher;
  try {
    await ensureDevicePreviewPaths({
      IPDwarf: "192.0.2.1",
    } as ConnectionContextType);
    const writes = fetcher.mock.calls.filter(
      ([, options]) => options?.method === "POST",
    );
    expect(writes).toHaveLength(2);
    expect(decodeURIComponent(writes[0][0])).toContain(
      "/add/dwarf_192_0_2_1_tele",
    );
    expect(JSON.parse(writes[0][1].body).source).toBe(
      "rtsp://192.0.2.1:554/ch0/stream0",
    );
    expect(JSON.parse(writes[1][1].body).source).toBe(
      "rtsp://192.0.2.1:554/ch1/stream0",
    );
  } finally {
    global.fetch = previousFetch;
  }
});
