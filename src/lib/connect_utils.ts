import { ConnectionContextType } from "@/types";

import {
  configureDwarfProtocol,
  createV3SessionPackets,
  Dwarfii_Api,
  applyAuthoritativeCameraParam,
  getDwarfDeviceProfile,
  ingestV3ParameterNotification,
  loadV3AstroParameterCatalog,
  V3_SESSION_READY_COMMAND,
  WebSocketHandler,
} from "@/services/dwarf";
import {
  saveConnectionStatusDB,
  saveInitialConnectionTimeDB,
  fetchConnectionStatusDB,
} from "@/db/db_utils";
import { telephotoCamera, wideangleCamera, get_error } from "@/lib/dwarf_utils";
import {
  findDeviceInfo,
  checkMediaMtxStreamWithUpdate,
} from "@/lib/get_dwarf_type";
import { getAllTelescopeISPSetting } from "@/lib/dwarf_utils";
import { saveImagingSessionDb, saveIPConnectDB } from "@/db/db_utils";
import { logger } from "@/lib/logger";

function updateAstroCamera(connectionCtx: ConnectionContextType, cmd) {
  if (
    cmd ==
      Dwarfii_Api.DwarfCMD.CMD_NOTIFY_STATE_WIDE_CAPTURE_RAW_LIVE_STACKING ||
    cmd ==
      Dwarfii_Api.DwarfCMD.CMD_NOTIFY_PROGRASS_WIDE_CAPTURE_RAW_LIVE_STACKING
  ) {
    saveImagingSessionDb("astroCamera", wideangleCamera.toString());
    connectionCtx.setImagingSession((prev) => ({
      ...prev,
      astroCamera: wideangleCamera,
    }));

    connectionCtx.setCurrentAstroCamera(wideangleCamera);
  } else {
    saveImagingSessionDb("astroCamera", telephotoCamera.toString());
    connectionCtx.setImagingSession((prev) => ({
      ...prev,
      astroCamera: telephotoCamera,
    }));
    connectionCtx.setCurrentAstroCamera(telephotoCamera);
  }
}

/**
 * Apply model-independent telemetry emitted by both the legacy notification
 * commands and the current V3 protocol. V3's initial device-state response
 * also carries the current CMOS temperature, so the header does not have to
 * wait for the next periodic notification after connecting.
 */
export function applyDeviceTelemetry(
  connectionCtx: ConnectionContextType,
  resultData: { cmd?: number; data?: any },
): boolean {
  const { cmd, data } = resultData;
  if (!data) return false;

  if (cmd === Dwarfii_Api.DwarfCMD.CMD_NOTIFY_ELE) {
    const battery = Number(data.value);
    if (
      Number.isFinite(battery) &&
      (data.code === undefined || data.code === Dwarfii_Api.DwarfErrorCode.OK)
    ) {
      connectionCtx.setBatteryLevelDwarf(
        Math.max(0, Math.min(100, Math.round(battery))),
      );
    }
    return true;
  }

  if (cmd === Dwarfii_Api.DwarfCMD.CMD_NOTIFY_CHARGE) {
    const chargeState = Number(data.value);
    if (
      Number.isFinite(chargeState) &&
      (data.code === undefined || data.code === Dwarfii_Api.DwarfErrorCode.OK)
    ) {
      connectionCtx.setBatteryStatusDwarf(chargeState);
    }
    return true;
  }

  if (cmd === Dwarfii_Api.DwarfCMD.CMD_NOTIFY_SDCARD_INFO) {
    const availableSize = Number(data.availableSize);
    const totalSize = Number(data.totalSize);
    if (Number.isFinite(availableSize) && Number.isFinite(totalSize)) {
      connectionCtx.setAvailableSizeDwarf(availableSize);
      connectionCtx.setTotalSizeDwarf(totalSize);
    }
    return true;
  }

  if (
    cmd === Dwarfii_Api.DwarfCMD.CMD_NOTIFY_TEMPERATURE ||
    cmd === Dwarfii_Api.DwarfCMD.CMD_V3_NOTIFY_TEMPERATURE2
  ) {
    const temperature = Number(data.temperature);
    if (Number.isFinite(temperature)) {
      connectionCtx.setStatusTemperatureDwarf(temperature);
    }
    return true;
  }

  if (cmd === V3_SESSION_READY_COMMAND) {
    const temperature = Number(
      data.teleCameraStateInfo?.cmosTemperature?.temperature,
    );
    if (Number.isFinite(temperature)) {
      connectionCtx.setStatusTemperatureDwarf(temperature);
    }
  }

  return false;
}

export async function connectionHandler(
  connectionCtx: ConnectionContextType,
  IPDwarf: string | undefined,
  forceIP: boolean,
  setConnecting: Function,
  setSlavemode: Function,
  setGoLive: Function,
  setErrorTxt: Function,
) {
  if (IPDwarf === undefined) {
    return;
  }
  let getInfoCamera = true;
  let isStopRecording = false;

  const [deviceId, deviceUid] = await findDeviceInfo(IPDwarf, connectionCtx);
  if (!deviceId) {
    setConnecting(false);
    setErrorTxt("Unable to identify a supported DWARF device.");
    return;
  }

  let deviceProfile;
  try {
    deviceProfile = getDwarfDeviceProfile(deviceId);
  } catch (error) {
    setConnecting(false);
    setErrorTxt(error instanceof Error ? error.message : String(error));
    return;
  }

  connectionCtx.setTypeIdDwarf(deviceProfile.deviceId);
  connectionCtx.setTypeNameDwarf(deviceProfile.displayName);
  if (deviceUid) connectionCtx.setTypeUidDwarf(deviceUid);

  console.log("socketIPDwarf: ", connectionCtx.socketIPDwarf); // Create WebSocketHandler if need
  const webSocketHandler = connectionCtx.socketIPDwarf
    ? connectionCtx.socketIPDwarf
    : new WebSocketHandler(IPDwarf);

  webSocketHandler.resetReconnectGuard?.();

  connectionCtx.setSocketIPDwarf(webSocketHandler);
  const proxyLocalIP =
    connectionCtx.proxyInLan && connectionCtx.proxyLocalIP
      ? connectionCtx.proxyLocalIP
      : connectionCtx.proxyIP;
  console.log("Current Proxy: " + proxyLocalIP);
  if (proxyLocalIP) {
    const port = connectionCtx.useHttps
      ? process.env.NEXT_PUBLIC_PORT_PROXY_CORS_HTTPS
      : process.env.NEXT_PUBLIC_PORT_PROXY_CORS;
    await webSocketHandler.setProxyUrl(`${proxyLocalIP}:${port}`);
  }
  await webSocketHandler.setHttpsMode(connectionCtx.useHttps);
  // Force IP
  if (forceIP) {
    await webSocketHandler.setNewIpDwarf(IPDwarf);
  }

  try {
    configureDwarfProtocol(webSocketHandler, deviceProfile);
  } catch (error) {
    setConnecting(false);
    setErrorTxt(error instanceof Error ? error.message : String(error));
    return;
  }

  if (deviceProfile.capabilities.rtspPreview) {
    await checkMediaMtxStreamWithUpdate(IPDwarf, connectionCtx);
  }

  const customMessageHandler = async (txt_info, result_data) => {
    const handledTelemetry = applyDeviceTelemetry(connectionCtx, result_data);

    if (result_data.cmd == V3_SESSION_READY_COMMAND) {
      if (
        result_data.data.code === undefined ||
        result_data.data.code == Dwarfii_Api.DwarfErrorCode.OK
      ) {
        connectionCtx.setConnectionStatus(true);
        connectionCtx.setInitialConnectionTime(Date.now());
        saveConnectionStatusDB(true);
        saveInitialConnectionTimeDB();
        saveIPConnectDB(IPDwarf);
        try {
          await loadV3AstroParameterCatalog(IPDwarf, connectionCtx);
        } catch (error) {
          logger(
            "V3 parameter discovery unavailable",
            { error: error instanceof Error ? error.message : String(error) },
            connectionCtx,
          );
        }
        if (getInfoCamera) {
          getAllTelescopeISPSetting(connectionCtx, webSocketHandler);
          getInfoCamera = false;
        }
      } else {
        connectionCtx.setConnectionStatus(true);
        get_error("Error: ", result_data, setErrorTxt);
      }
    } else if (result_data.cmd == 15264) {
      const parameter = ingestV3ParameterNotification(result_data.data);
      if (parameter) applyAuthoritativeCameraParam(connectionCtx, parameter);
    } else if (
      result_data.cmd == Dwarfii_Api.DwarfCMD.CMD_NOTIFY_WS_HOST_SLAVE_MODE
    ) {
      if (result_data.data.mode == 1) {
        console.log("WARNING SLAVE MODE");
        connectionCtx.setConnectionStatusSlave(true);
        setSlavemode(true);
      } else {
        console.log("OK : HOST MODE");
        connectionCtx.setConnectionStatusSlave(false);
        setSlavemode(false);
      }
    } else if (
      result_data.cmd ==
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_STATE_CAPTURE_RAW_LIVE_STACKING ||
      result_data.cmd ==
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_STATE_WIDE_CAPTURE_RAW_LIVE_STACKING
    ) {
      // update astroCamera
      updateAstroCamera(connectionCtx, result_data.cmd);
      if (
        result_data.data.state ==
        Dwarfii_Api.OperationState.OPERATION_STATE_STOPPED
      ) {
        isStopRecording = true;
        logger("Need Go LIVE", {}, connectionCtx);
        connectionCtx.setImagingSession((prev) => ({
          ...prev, // Spread the previous state
          isRecording: false, // Update the value for isRecording
        }));

        connectionCtx.setImagingSession((prev) => ({
          ...prev, // Spread the previous state
          endRecording: true, // Update the value for endRecording
        }));

        connectionCtx.setImagingSession((prev) => ({
          ...prev, // Spread the previous state
          isGoLive: true, // Update the value for isGoLive
        }));

        saveImagingSessionDb("isRecording", false.toString());
        saveImagingSessionDb("endRecording", true.toString());
        saveImagingSessionDb("isGoLive", true.toString());
        setGoLive(true);
      } else if (
        result_data.data.state ==
        Dwarfii_Api.OperationState.OPERATION_STATE_STOPPING
      ) {
        isStopRecording = true;
        connectionCtx.setImagingSession((prev) => ({
          ...prev, // Spread the previous state
          isRecording: false, // Update the value for isRecording
        }));

        connectionCtx.setImagingSession((prev) => ({
          ...prev, // Spread the previous state
          endRecording: true, // Update the value for endRecording
        }));
        saveImagingSessionDb("isRecording", false.toString());
        saveImagingSessionDb("endRecording", true.toString());
      } else if (
        result_data.data.state ==
        Dwarfii_Api.OperationState.OPERATION_STATE_RUNNING
      ) {
        isStopRecording = false;
        connectionCtx.setImagingSession((prev) => ({
          ...prev, // Spread the previous state
          isRecording: true, // Update the value for isRecording
        }));

        connectionCtx.setImagingSession((prev) => ({
          ...prev, // Spread the previous state
          endRecording: false, // Update the value for endRecording
        }));
        saveImagingSessionDb("isRecording", true.toString());
        saveImagingSessionDb("endRecording", false.toString());
      }
    } else if (
      result_data.cmd ==
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_PROGRASS_CAPTURE_RAW_LIVE_STACKING ||
      result_data.cmd ==
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_PROGRASS_WIDE_CAPTURE_RAW_LIVE_STACKING
    ) {
      // update astroCamera
      updateAstroCamera(connectionCtx, result_data.cmd);
      if (
        result_data.data.updateCountType == 0 ||
        result_data.data.updateCountType == 2
      ) {
        if (isStopRecording == false) {
          connectionCtx.setImagingSession((prev) => ({
            ...prev, // Spread the previous state
            isRecording: true, // Update the value for isRecording
          }));

          connectionCtx.setImagingSession((prev) => ({
            ...prev, // Spread the previous state
            endRecording: false, // Update the value for endRecording
          }));
          saveImagingSessionDb("isRecording", true.toString());
          saveImagingSessionDb("endRecording", false.toString());
        }
        connectionCtx.setImagingSession((prev) => ({
          ...prev, // Spread the previous state
          imagesTaken: result_data.data.currentCount, // Update the imagesTaken property
        }));
        saveImagingSessionDb(
          "imagesTaken",
          result_data.data.currentCount.toString(),
        );
      }
      if (
        result_data.data.updateCountType == 1 ||
        result_data.data.updateCountType == 2
      ) {
        if (isStopRecording == false) {
          if (connectionCtx.imagingSession.endRecording) {
            connectionCtx.setImagingSession((prev) => ({
              ...prev, // Spread the previous state
              isRecording: false, // Update the value for isRecording
            }));
          }
        }
        saveImagingSessionDb("isRecording", false.toString());
        if (connectionCtx.imagingSession.isStackedCountStart) {
          connectionCtx.setImagingSession((prev) => ({
            ...prev, // Spread the previous state
            isStackedCountStart: true, // Update the isStackedCountStart property
          }));
        }
        saveImagingSessionDb("isStackedCountStart", true.toString());
        connectionCtx.setImagingSession((prev) => ({
          ...prev, // Spread the previous state
          imagesStacked: result_data.data.stackedCount, // Update the imagesStacked property
        }));
        saveImagingSessionDb(
          "imagesStacked",
          result_data.data.stackedCount.toString(),
        );
      }
    } else if (result_data.cmd == Dwarfii_Api.DwarfCMD.CMD_NOTIFY_STREAM_TYPE) {
      if (result_data.data.camId == 0) {
        connectionCtx.setStreamTypeTeleDwarf(result_data.data.streamType);
        console.log("C setStreamTypeTeleDwarf: ", result_data.data.streamType);
      } else if (result_data.data.camId == 1) {
        connectionCtx.setStreamTypeWideDwarf(result_data.data.streamType);
        console.log("C setStreamTypeWideDwarf: ", result_data.data.streamType);
      }
    } else if (result_data.cmd == Dwarfii_Api.DwarfCMD.CMD_NOTIFY_FOCUS) {
      connectionCtx.setValueFocusDwarf(result_data.data.focus);
    } else if (result_data.cmd == Dwarfii_Api.DwarfCMD.CMD_NOTIFY_RGB_STATE) {
      connectionCtx.setStatusRingLightsDwarf(result_data.data.state == 1);
    } else if (
      result_data.cmd == Dwarfii_Api.DwarfCMD.CMD_NOTIFY_POWER_IND_STATE
    ) {
      connectionCtx.setStatusPowerLightsDwarf(result_data.data.state == 1);
    } else if (result_data.cmd == Dwarfii_Api.DwarfCMD.CMD_NOTIFY_POWER_OFF) {
      setErrorTxt(` The ${connectionCtx.typeNameDwarf} is powering Off!`);
      console.error(`The ${connectionCtx.typeNameDwarf} is powering Off!`);
      setConnecting(false);
      connectionCtx.setConnectionStatus(false);
      saveConnectionStatusDB(false);
      // force stop webSocketHandler
      webSocketHandler.cleanup(true);
    } else if (!handledTelemetry) {
      logger("", result_data, connectionCtx);
    }
    logger(txt_info, result_data, connectionCtx);
  };

  let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelPendingDisconnect = () => {
    if (disconnectTimer !== undefined) {
      clearTimeout(disconnectTimer);
      disconnectTimer = undefined;
    }
  };
  const markDisconnected = () => {
    cancelPendingDisconnect();
    connectionCtx.setConnectionStatus(false);
    saveConnectionStatusDB(false);
  };
  const scheduleDisconnect = () => {
    cancelPendingDisconnect();
    disconnectTimer = setTimeout(() => {
      if (!webSocketHandler.isConnected()) markDisconnected();
    }, 6_500);
  };

  const customErrorHandler = () => {
    console.error("ConnectDwarf : Socket Close!");
    setConnecting(false);
    if (webSocketHandler.isReconnectSuppressed?.()) {
      setErrorTxt(
        "Another Dwarfium or DWARFLAB client may be controlling this telescope. Close the other client, then select Connect.",
      );
      markDisconnected();
    } else {
      scheduleDisconnect();
    }
  };

  const customStateHandler = (state) => {
    if (state) {
      cancelPendingDisconnect();
      if (state != fetchConnectionStatusDB()) {
        connectionCtx.setConnectionStatus(true);
        saveConnectionStatusDB(true);
      }
    } else if (webSocketHandler.isReconnectSuppressed?.()) {
      markDisconnected();
    } else {
      scheduleDisconnect();
    }
  };

  webSocketHandler.closeTimerHandler = () => {
    setConnecting(false);
  };
  webSocketHandler.onStopTimerHandler = () => {
    setConnecting(false);
  };

  // close socket is request takes too long
  webSocketHandler.closeSocketTimer = setTimeout(() => {
    webSocketHandler.handleClose("");
    console.log(" -> Close Timer2.....");
    setConnecting(false);
    scheduleDisconnect();
  }, 10000);

  // function for connection and reconnection
  const customReconnectHandler = () => {
    startConnect();
  };

  function startConnect() {
    console.log("ConnectDwarf startConnect Function started");

    setSlavemode(false);
    setGoLive(false);
    connectionCtx.setConnectionStatusSlave(false);
    setConnecting(true);

    const sessionPackets = createV3SessionPackets();
    let txtInfoCommand = "Connection";

    webSocketHandler.prepare(
      sessionPackets,
      txtInfoCommand,
      [
        "*", // Get All Data
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_SDCARD_INFO,
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_ELE,
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_CHARGE,
        V3_SESSION_READY_COMMAND,
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_WS_HOST_SLAVE_MODE,
        Dwarfii_Api.DwarfCMD.CMD_V3_CAMERA_TELE_OPEN_CAMERA,
        Dwarfii_Api.DwarfCMD.CMD_V3_CAMERA_WIDE_OPEN_CAMERA,
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_STATE_CAPTURE_RAW_LIVE_STACKING,
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_PROGRASS_CAPTURE_RAW_LIVE_STACKING,
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_STATE_WIDE_CAPTURE_RAW_LIVE_STACKING,
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_PROGRASS_WIDE_CAPTURE_RAW_LIVE_STACKING,
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_TEMPERATURE,
        Dwarfii_Api.DwarfCMD.CMD_V3_NOTIFY_TEMPERATURE2,
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_STREAM_TYPE,
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_FOCUS,
      ],
      customMessageHandler,
      customStateHandler,
      customErrorHandler,
      customReconnectHandler,
    );
  }

  // Start Connection
  startConnect();

  if (!webSocketHandler.run()) {
    console.error(" Can't launch Web Socket Run Action!");
  }
}
