import { ConnectionContextType } from "@/types";
import { deviceInfo, normalizeCurrentDeviceInfo } from "@/services/dwarf";
import { getProxyUrl, getIpServerMTX } from "@/lib/get_proxy_url";

/** Device identity must come from successful current deviceInfo discovery.
 * Media folder existence and old parameter configurations cannot identify the
 * connected hardware; unavailable discovery leaves the model unknown.
 */
export async function findDeviceInfo(
  IPDwarf: string | undefined,
  connectionCtx: ConnectionContextType,
): Promise<[number | undefined, string | undefined]> {
  if (!IPDwarf) return [undefined, undefined];
  try {
    const requestAddr = deviceInfo(IPDwarf);
    const response = await fetch(
      `${getProxyUrl(connectionCtx)}?target=${encodeURIComponent(requestAddr)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        redirect: "follow",
      },
    );
    if (!response.ok) {
      throw new Error(`DWARF device discovery failed (${response.status})`);
    }
    const device = normalizeCurrentDeviceInfo(await response.text());
    // Retain the optional discovery-name suffix for existing UI identifiers;
    // it is never evidence of the model, firmware, or protocol identity.
    const uid =
      device.deviceName?.replace(/^DWARF(?:_?MINI|_?II|3)?_/i, "") || undefined;
    return [device.hardwareId, uid];
  } catch (error) {
    console.error(
      "DWARF device discovery unavailable:",
      error instanceof Error ? error.message : String(error),
    );
    return [undefined, undefined];
  }
}

export async function checkMediaMtxStreamWithUpdate(
  IPDwarf: string | undefined,
  connectionCtx: ConnectionContextType,
) {
  if ((await verifyMediaMtxStreamUrls(IPDwarf, connectionCtx)) === false) {
    if (await editMediaMtxStreamD3(IPDwarf, "dwarf_wide", connectionCtx))
      if (await editMediaMtxStreamD3(IPDwarf, "dwarf_tele", connectionCtx))
        return true;
      else return false;
    else return false;
  } else {
    console.log("Streams are already OK");
  }
}

async function verifyMediaMtxStreamUrls(
  inputIP: string | undefined,
  connectionCtx: ConnectionContextType,
) {
  const url1 = `http://${getIpServerMTX()}:9997/v3/config/paths/get/dwarf_wide`;
  const url2 = `http://${getIpServerMTX()}:9997/v3/config/paths/get/dwarf_tele`;

  try {
    const proxyUrl1 = `${getProxyUrl(
      connectionCtx,
    )}?target=${encodeURIComponent(url1)}`;
    const response1 = await fetch(proxyUrl1, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      redirect: "follow",
    });

    if (!response1.ok) {
      throw new Error(`HTTP error! Status: ${response1.status}`);
    }

    const proxyUrl2 = `${getProxyUrl(
      connectionCtx,
    )}?target=${encodeURIComponent(url2)}`;
    const response2 = await fetch(proxyUrl2, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      redirect: "follow",
    });

    if (!response2.ok) {
      throw new Error(`HTTP error! Status: ${response2.status}`);
    }

    const result1 = await response1.json();
    console.log(result1);
    const result2 = await response2.json();
    console.log(result2);
    let result = true;

    try {
      const channelWideUrl = new URL(result1.source);
      result = result && channelWideUrl.hostname === inputIP;
    } catch (error) {
      console.error("Invalid URL format:", result1.source);
      return false;
    }
    try {
      const channelTeleUrl = new URL(result2.source);
      result = result && channelTeleUrl.hostname === inputIP;
    } catch (error) {
      console.error("Invalid URL format:", result2.source);
      return false;
    }

    if (result) {
      console.log(`The source in MediaMTX are well configured`);
      return true;
    } else {
      console.log(`Need to configure the source in MediaMTX`);
      return false;
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error verifying stream info:", error.message);
    } else {
      console.error("Error verifying stream info:", error);
    }
    return false;
  }
}

const editMediaMtxStreamD3 = async (
  IPDwarf: string | undefined,
  name: string | undefined,
  connectionCtx: ConnectionContextType,
) => {
  const url = `http://${getIpServerMTX()}:9997/v3/config/paths/replace/${name}`;
  let data;
  if (name == "dwarf_wide") {
    data = {
      source: `rtsp://${IPDwarf}:554/ch1/stream0`,
      sourceOnDemand: true,
      sourceOnDemandCloseAfter: "10s",
      record: false,
    };
  }
  if (name == "dwarf_tele") {
    data = {
      source: `rtsp://${IPDwarf}:554/ch0/stream0`,
      sourceOnDemand: true,
      sourceOnDemandCloseAfter: "10s",
      record: false,
    };
  }
  try {
    const proxyUrl = `${getProxyUrl(connectionCtx)}?target=${encodeURIComponent(
      url,
    )}`;
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    console.log(data);
    console.log(JSON.stringify(data));
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    // Check the response structure
    if (response.status === 200) {
      console.log("editMediaMtxStreamD3 Success:");
      return true;
    } else {
      console.error("Failed:", response.status);
      return false;
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error editing stream info:", error.message);
    } else {
      console.error("Error editing stream info:", error);
    }
    return false;
  }
};
