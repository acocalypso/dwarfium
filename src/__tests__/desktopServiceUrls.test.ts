import { getIpServerMTX, getProxyUrl, getServerUrl } from "@/lib/get_proxy_url";
import type { ConnectionContextType } from "@/types";

jest.mock("@tauri-apps/api/core", () => ({
  isTauri: () =>
    Boolean((globalThis as typeof globalThis & { isTauri?: boolean }).isTauri),
}));

const connection = {
  proxyIP: "192.168.178.20",
  proxyLocalIP: "192.168.178.21",
  proxyInLan: true,
} as ConnectionContextType;

afterEach(() => {
  delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
});

test("desktop service URLs use the bundled loopback proxy, not tauri.localhost", () => {
  (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri = true;

  expect(getProxyUrl(connection)).toBe("http://127.0.0.1:8860");
  expect(getIpServerMTX()).toBe("localhost");
  expect(getServerUrl()).toBe("/api");
});

test("browser service URLs can still use a LAN proxy", () => {
  process.env.NEXT_PUBLIC_PORT_PROXY_CORS = "8860";
  expect(getProxyUrl(connection)).toBe("http://192.168.178.21:8860");
});
