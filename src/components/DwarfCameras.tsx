/*  eslint-disable @next/next/no-img-element */

import { useState, useContext, useEffect } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import Link from "next/link";

import { ConnectionContext } from "@/stores/ConnectionContext";
import {
  Dwarfii_Api,
  DwarfIP,
  wideangleURL,
  telephotoURL,
  rawPreviewURL,
  messageCameraTeleGetSystemWorkingState,
  messageCameraTeleOpenCamera,
  messageCameraWideOpenCamera,
  WebSocketHandler,
} from "dwarfii_api";

import styles from "@/components/DwarfCameras.module.css";
import { ConnectionContextType } from "@/types";
import { logger } from "@/lib/logger";
import {
  telephotoCamera,
  wideangleCamera,
  turnOnTeleCameraFn,
  turnOnWideCameraFn,
} from "@/lib/dwarf_utils";

type PropType = {
  showWideangle: boolean;
  useRawPreviewURL: boolean;
};

export default function DwarfCameras(props: PropType) {
  const { showWideangle, useRawPreviewURL } = props;
  let connectionCtx = useContext(ConnectionContext);

  const [errorTxt, setErrorTxt] = useState("");
  const [telephotoCameraStatus, setTelephotoCameraStatus] = useState<
    string | undefined
  >("off");
  const [wideangleCameraStatus, setWideangleCameraStatus] = useState<
    string | undefined
  >("off");
  const [wideCameraSrc, setWideCameraSrc] = useState("");
  const [teleCameraSrc, setTeleCameraSrc] = useState("");

  let IPDwarf = connectionCtx.IPDwarf || DwarfIP;

  useEffect(() => {
    checkCameraStatus(connectionCtx);
    return () => {
      setWideangleCameraStatus("off");
      setTelephotoCameraStatus("off");
      setWideCameraSrc("");
      setTeleCameraSrc("");
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function turnOnCameraHandler(cameraId: number, connectionCtx) {
    if (cameraId === telephotoCamera) {
      turnOnTeleCameraFn(
        connectionCtx,
        setTelephotoCameraStatus,
        setSrcTeleCamera
      );
    } else {
      turnOnWideCameraFn(
        connectionCtx,
        setWideangleCameraStatus,
        setSrcWideCamera
      );
    }
  }

  function checkCameraStatus(connectionCtx: ConnectionContextType) {
    if (wideCameraSrc) setWideangleCameraStatus("on");
    else setWideangleCameraStatus("off");
    if (teleCameraSrc) setTelephotoCameraStatus("on");
    else setTelephotoCameraStatus("off");
    setTimeout(() => {
      checkCameraStatusLater(connectionCtx);
    }, 2000);
  }

  const customMessageHandlerTeleWide = (txt_info, result_data) => {
    if (
      result_data.cmd ==
      Dwarfii_Api.DwarfCMD.CMD_CAMERA_TELE_GET_SYSTEM_WORKING_STATE
    ) {
      if (result_data.data.code != Dwarfii_Api.DwarfErrorCode.OK) {
        setTelephotoCameraStatus("off");
        setTelephotoCameraStatus("off");
        if (result_data.data.errorTxt)
          setErrorTxt(errorTxt + " " + result_data.data.errorTxt);
        else setErrorTxt(errorTxt + " " + "Error: " + result_data.data.code);
      }
    } else if (
      result_data.cmd == Dwarfii_Api.DwarfCMD.CMD_CAMERA_TELE_OPEN_CAMERA
    ) {
      if (result_data.data.code == Dwarfii_Api.DwarfErrorCode.OK) {
        logger(txt_info, result_data, connectionCtx);
        setTelephotoCameraStatus("on");
        setSrcTeleCamera(true);
        return;
      } else {
        logger(txt_info, result_data, connectionCtx);
        setTelephotoCameraStatus("off");
        setSrcTeleCamera(false);
        return;
      }
    } else if (
      result_data.cmd == Dwarfii_Api.DwarfCMD.CMD_CAMERA_WIDE_OPEN_CAMERA
    ) {
      if (result_data.data.code == Dwarfii_Api.DwarfErrorCode.OK) {
        logger(txt_info, result_data, connectionCtx);
        setWideangleCameraStatus("on");
        setSrcWideCamera(true);
        return;
      } else {
        logger(txt_info, result_data, connectionCtx);
        setWideangleCameraStatus("off");
        setSrcWideCamera(false);
        return;
      }
    } else if (
      result_data.cmd == Dwarfii_Api.DwarfCMD.CMD_CAMERA_TELE_GET_ALL_PARAMS
    ) {
      if (result_data.data.code == Dwarfii_Api.DwarfErrorCode.OK) {
        logger("telephoto open", {}, connectionCtx);
        setTelephotoCameraStatus("on");
      } else if (
        result_data.data.code ==
        Dwarfii_Api.DwarfErrorCode.CODE_CAMERA_TELE_CLOSED
      ) {
        console.error(txt_info + " CAMERA TELE CLOSED!");
        setTelephotoCameraStatus("off");
      }
    } else if (
      result_data.cmd == Dwarfii_Api.DwarfCMD.CMD_CAMERA_WIDE_GET_ALL_PARAMS
    ) {
      if (result_data.data.code == Dwarfii_Api.DwarfErrorCode.OK) {
        logger("wide open", {}, connectionCtx);
        setWideangleCameraStatus("on");
      } else if (
        result_data.data.code ==
        Dwarfii_Api.DwarfErrorCode.CODE_CAMERA_WIDE_CLOSED
      ) {
        console.error(txt_info + " CAMERA WIDE CLOSED!");
        setWideangleCameraStatus("off");
      }
    } else if (result_data.cmd == Dwarfii_Api.DwarfCMD.CMD_NOTIFY_SDCARD_INFO) {
      connectionCtx.setAvailableSizeDwarf(result_data.data.availableSize);
      connectionCtx.setTotalSizeDwarf(result_data.data.totalSize);
      connectionCtx.setConnectionStatus(true);
    } else if (result_data.cmd == Dwarfii_Api.DwarfCMD.CMD_NOTIFY_ELE) {
      if (result_data.data.code == Dwarfii_Api.DwarfErrorCode.OK) {
        connectionCtx.setBatteryLevelDwarf(result_data.data.value);
      }
    } else if (result_data.cmd == Dwarfii_Api.DwarfCMD.CMD_NOTIFY_CHARGE) {
      if (result_data.data.code == Dwarfii_Api.DwarfErrorCode.OK) {
        connectionCtx.setBatteryStatusDwarf(result_data.data.value);
      }
    } else {
      logger("", result_data, connectionCtx);
    }
    logger(txt_info, result_data, connectionCtx);
  };

  const customErrorHandler = () => {
    console.error("ConnectDwarf : Socket Close!");
    connectionCtx.setConnectionStatus(false);
  };

  const customStateHandler = (state) => {
    if (state != connectionCtx.connectionStatus) {
      connectionCtx.setConnectionStatus(state);
    }
  };

  function checkCameraStatusLater(connectionCtx: ConnectionContextType) {
    if (connectionCtx.IPDwarf === undefined) {
      return;
    }
    console.log("socketIPDwarf: ", connectionCtx.socketIPDwarf); // Create WebSocketHandler if need
    const webSocketHandler = connectionCtx.socketIPDwarf
      ? connectionCtx.socketIPDwarf
      : new WebSocketHandler(connectionCtx.IPDwarf);

    // Send Command : messageCameraTeleOpenCamera
    let txtInfoCommand = "";
    let WS_Packet1 = messageCameraTeleGetSystemWorkingState();
    let WS_Packet2 = messageCameraTeleOpenCamera();
    let WS_Packet3 = messageCameraWideOpenCamera();
    txtInfoCommand = "CheckCamera";
    webSocketHandler.prepare(
      [WS_Packet1, WS_Packet2, WS_Packet3],
      txtInfoCommand,
      [
        Dwarfii_Api.DwarfCMD.CMD_CAMERA_TELE_GET_SYSTEM_WORKING_STATE,
        Dwarfii_Api.DwarfCMD.CMD_CAMERA_TELE_OPEN_CAMERA,
        Dwarfii_Api.DwarfCMD.CMD_CAMERA_WIDE_OPEN_CAMERA,
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_SDCARD_INFO,
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_ELE,
        Dwarfii_Api.DwarfCMD.CMD_NOTIFY_CHARGE,
      ],
      customMessageHandlerTeleWide,
      customStateHandler,
      customErrorHandler
    );

    if (!webSocketHandler.run()) {
      console.error(" Can't launch Web Socket Run Action!");
    }
  }

  // Function to set the source for the wide-angle camera
  function setSrcWideCamera(status: boolean) {
    console.info("Render setSrcWideCamera : ", status);
    if (status) {
      const url = wideangleURL(IPDwarf);
      setWideCameraSrc(url);
    } else {
      const url = "";
      setWideCameraSrc(url);
    }
  }

  // Function to set the source for the tele camera
  function setSrcTeleCamera(status: boolean) {
    console.info("Render setSrcTeleCamera : ", status);
    if (status) {
      const url = rawPreviewURL(IPDwarf);
      setTeleCameraSrc(url);
    } else {
      const url = "";
      setTeleCameraSrc(url);
    }
  }

  function renderWideAngle() {
    console.info("Render showWideangle : ", showWideangle);
    console.info("Render SRC : ", wideCameraSrc);
    return (
      <div className={`${showWideangle ? "" : "d-none"}`}>
        <img
          id="idWideCamera"
          onLoad={() =>
            wideCameraSrc
              ? setWideangleCameraStatus("on")
              : setWideangleCameraStatus("off")
          }
          src={wideCameraSrc}
          alt={wideCameraSrc ? "livestream for wideangle camera" : ""}
          className={styles.wideangle}
        ></img>
      </div>
    );
  }

  function renderMainCamera() {
    console.info("Render useRawPreviewURL : ", useRawPreviewURL);
    // TODO: use rawPreviewURL vs   telephotoURL,
    return (
      <div className="camera-container">
        <img
          id="idTeleCamera"
          onLoad={() =>
            teleCameraSrc
              ? setTelephotoCameraStatus("on")
              : setTelephotoCameraStatus("off")
          }
          src={teleCameraSrc}
          alt={teleCameraSrc ? "livestream for telephoto camera" : ""}
          className={styles.telephoto}
        ></img>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      {wideangleCameraStatus === "off" && (
        <div className="py-2 clearfix">
          <div className="float-end">
            <button
              className="btn btn-more02"
              onClick={() =>
                turnOnCameraHandler(wideangleCamera, connectionCtx)
              }
            >
              Turn on wideangle camera
            </button>
            <br />
            <Link href={wideangleURL(IPDwarf)}>{wideangleURL(IPDwarf)}</Link>
          </div>
        </div>
      )}
      {telephotoCameraStatus === "off" && (
        <div className="py-2">
          <div className="float-end">
            <button
              className="btn btn-more02"
              onClick={() =>
                turnOnCameraHandler(telephotoCamera, connectionCtx)
              }
            >
              Turn on telephoto camera
            </button>
            <br />
            <Link href={telephotoURL(IPDwarf)}>{telephotoURL(IPDwarf)}</Link>
          </div>
        </div>
      )}
      <span className="text-danger">{errorTxt}</span>
      <TransformWrapper>
        <TransformComponent>
          {renderWideAngle()}
          {renderMainCamera()}
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
