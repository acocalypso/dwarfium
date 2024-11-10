import React, { useState, useContext, useRef, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import SlidingPane from "react-sliding-pane";
import JoystickController from "joystick-controller";
import CircularSlider from "@fseehawer/react-circular-slider";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import CameraPanoSettings from "@/components/imaging/CameraPanoSettings";
import CameraBurstSettings from "@/components/imaging/CameraBurstSettings";
import CameraTimeLapseSettings from "@/components/imaging/CameraTimeLapseSettings";
import CameraWideSettings from "@/components/imaging/CameraWideSettings";
import CameraTeleSettings from "@/components/imaging/CameraTeleSettings";
import { getWideAllParamsFn, getTeleAllParamsFn } from "@/lib/dwarf_utils";
import { modeManual, modeAuto } from "dwarfii_api";

import { ConnectionContext } from "@/stores/ConnectionContext";
import {
  messageStepMotorServiceJoystick,
  messageStepMotorServiceJoystickStop,
  messageStepMotorServiceJoystickFixedAngle,
  WebSocketHandler,
} from "dwarfii_api";
import {
  startPhoto,
  startVideo,
  stopVideo,
  startPano,
  stopPano,
  startBurst,
  stopBurst,
  startTimeLapse,
  stopTimeLapse,
} from "@/lib/photo_utils";

type PropTypes = {
  showModal: boolean;
  setShowModal: Dispatch<SetStateAction<boolean>>;
};
// Define a generic event handler type that can handle events from both HTMLButtonElement and HTMLImageElement
type GenericMouseEventHandler<T extends HTMLElement> =
  React.MouseEventHandler<T>;

export default function CameraAddOn(props: PropTypes) {
  let connectionCtx = useContext(ConnectionContext);

  const { showModal, setShowModal } = props;
  const [imgSrc] = useState<string>("/public/images/photo-camera-white.png");
  const [errorTxt, setErrorTxt] = useState("");
  const [oldErrorTxt, setOldErrorTxt] = useState<string>("");
  const [isVisible, setIsVisible] = useState(true);

  const [joystickId, setJoystickId] = useState<JoystickController | undefined>(
    undefined
  );
  const joystickSpeed = useRef(2.2);

  const [activeAction, setActiveAction] = useState<string | undefined>(
    undefined
  ); // State to track active action
  const [activeBtnPhoto, setActiveBtnPhoto] = useState("tele"); // State to track active button
  const [activeBtnVideo, setActiveBtnVideo] = useState("tele"); // State to track active button
  const [activeBtnPano, setActiveBtnPano] = useState("tele"); // State to track active button
  const [activeBtnBurst, setActiveBtnBurst] = useState("tele"); // State to track active button
  const [activeBtnTimeLapse, setActiveBtnTimeLapse] = useState("tele"); // State to track active button
  const [activeBtnSettings, setActiveBtnSettings] = useState("tele"); // State to track active button
  const [showSettingsPanoMenu, setShowSettingsPanoMenu] = useState(false);
  const [showSettingsBurstMenu, setShowSettingsBurstMenu] = useState(false);
  const [showSettingsTimeLapseMenu, setShowSettingsTimeLapseMenu] =
    useState(false);
  const [showSettingsWideMenu, setShowSettingsWideMenu] = useState(false);
  const [showSettingsTeleMenu, setShowSettingsTeleMenu] = useState(false);
  const [rowValue, setRowValue] = useState<number>(3);
  const [colValue, setColValue] = useState<number>(3);
  const [countValue, setCountValue] = useState<number>(0);
  const [intervalBurstValue, setIntervalBurstValue] = useState<number>(0);
  const [intervalIndexValue, setIntervalIndexValue] = useState<number>(0);
  const [totalTimeIndexValue, setTotalTimeIndexValue] = useState<number>(3);

  const [wideExposureAuto, setWideExposureAuto] = useState<number | undefined>(
    connectionCtx.cameraWideSettings.exp_mode
  );
  const [wideExposureIndexValue, setWideExposureIndexValue] = useState<
    number | undefined
  >(connectionCtx.cameraWideSettings.exp_index);
  const [wideGainIndexValue, setWideGainIndexValue] = useState<
    number | undefined
  >(connectionCtx.cameraWideSettings.gain_index);
  const [wideWBAuto, setWideWBAuto] = useState<number | undefined>(
    connectionCtx.cameraWideSettings.wb_mode
  );
  //  const [wideWBMode, setWideWBMode] = useState<numbe|undefinedr>(1);
  const [wideWBColorTempIndexValue, setWideWBColorTempIndexValue] = useState<
    number | undefined
  >(connectionCtx.cameraWideSettings.wb_index);
  //  const [wideWBSceneValue, setWideWBSceneValue] = useState<number|undefined>(3);
  const [wideBrightnessValue, setWideBrightnessValue] = useState<
    number | undefined
  >(connectionCtx.cameraWideSettings.brightness);
  const [wideContrastValue, setWideContrastValue] = useState<
    number | undefined
  >(connectionCtx.cameraWideSettings.contrast);
  const [wideHueValue, setWideHueValue] = useState<number | undefined>(
    connectionCtx.cameraWideSettings.hue
  );
  const [wideSaturationValue, setWideSaturationValue] = useState<
    number | undefined
  >(connectionCtx.cameraWideSettings.saturation);
  const [wideSharpnessValue, setWideSharpnessValue] = useState<
    number | undefined
  >(connectionCtx.cameraWideSettings.sharpness);

  const [teleWBAuto, setTeleWBAuto] = useState<number | undefined>(
    connectionCtx.cameraTeleSettings.wb_mode
  );
  const [teleWBMode, setTeleWBMode] = useState<number | undefined>(
    connectionCtx.cameraTeleSettings.wb_index_mode
  );
  const [teleWBColorTempIndexValue, setTeleWBColorTempIndexValue] = useState<
    number | undefined
  >(connectionCtx.cameraTeleSettings.wb_index);
  const [teleWBSceneValue, setTeleWBSceneValue] = useState<number | undefined>(
    3
  );
  const [teleBrightnessValue, setTeleBrightnessValue] = useState<
    number | undefined
  >(connectionCtx.cameraTeleSettings.brightness);
  const [teleContrastValue, setTeleContrastValue] = useState<
    number | undefined
  >(connectionCtx.cameraTeleSettings.contrast);
  const [teleHueValue, setTeleHueValue] = useState<number | undefined>(
    connectionCtx.cameraTeleSettings.hue
  );
  const [teleSaturationValue, setTeleSaturationValue] = useState<
    number | undefined
  >(connectionCtx.cameraTeleSettings.saturation);
  const [teleSharpnessValue, setTeleSharpnessValue] = useState<
    number | undefined
  >(connectionCtx.cameraTeleSettings.sharpness);

  useEffect(() => {
    if (errorTxt != oldErrorTxt) {
      setIsVisible(true);
      setOldErrorTxt(errorTxt);
      let timer;
      if (activeAction == PhotosModeActions[2].toString()) {
        timer = setTimeout(() => {
          setIsVisible(false);
        }, 30000);
      } else {
        timer = setTimeout(() => {
          setIsVisible(false);
        }, 6000);
      }
      // Clear the timeout if new messages come in within the 10 seconds
      return () => clearTimeout(timer);
    }
  }, [errorTxt]);

  // Size > 1500
  let closePane = useRef(true);
  let ChangeWindowSize = useRef(window.innerWidth);
  let maxRange = useRef(70);
  let radius = useRef(75);
  let joystickRadius = useRef(45);
  let xValue = useRef("80%");
  let yValue = useRef("11%");
  let rightContainer = useRef("10px");
  let leftContainer = useRef("10px");
  let bottomContainer = useRef("75px");
  let WidthSlidePane = useRef("1500px");
  let WidthCircularSlider = useRef(150);
  let trackSize = useRef(24);
  let intervalTimer = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  let isDwarfII = connectionCtx.typeIdDwarf == 1;

  let gLastTimeMotorCmd = Date.now();
  let gMotorState = false;

  let PhotoMode =
    !connectionCtx.imagingSession.isRecording &&
    !connectionCtx.imagingSession.endRecording;

  useEffect(() => {
    setShowModal((prev) => prev && PhotoMode);
    const handleResize = () => {
      //setWindowWidth(window.innerWidth);
      update_control();
    };
    update_control();
    window.addEventListener("resize", handleResize);
    isDwarfII = connectionCtx.typeIdDwarf == 1;

    return () => {
      window.removeEventListener("resize", handleResize);
      if (intervalTimer.current) {
        clearInterval(intervalTimer.current);
      }
    };
  }, []); // Empty dependency array means this effect runs only once on mount

  useEffect(() => {
    getWideAllParamsFn(connectionCtx);
    updateWideData();
  }, [showSettingsWideMenu]);

  useEffect(() => {
    getTeleAllParamsFn(connectionCtx);
    updateTeleData();
  }, [showSettingsTeleMenu]);

  function updateWideData() {
    setWideExposureAuto(connectionCtx.cameraWideSettings.exp_mode);
    setWideExposureIndexValue(connectionCtx.cameraWideSettings.exp_index);
    setWideGainIndexValue(connectionCtx.cameraWideSettings.gain_index);
    setWideWBAuto(connectionCtx.cameraWideSettings.wb_mode);
    setWideWBColorTempIndexValue(connectionCtx.cameraWideSettings.wb_index);
    setWideBrightnessValue(connectionCtx.cameraWideSettings.brightness);
    setWideContrastValue(connectionCtx.cameraWideSettings.contrast);
    setWideHueValue(connectionCtx.cameraWideSettings.hue);
    setWideSaturationValue(connectionCtx.cameraWideSettings.saturation);
    setWideSharpnessValue(connectionCtx.cameraWideSettings.sharpness);
  }
  function updateTeleData() {
    setTeleWBAuto(connectionCtx.cameraTeleSettings.wb_mode);
    setTeleWBMode(connectionCtx.cameraTeleSettings.wb_index_mode);
    if (
      connectionCtx.cameraTeleSettings.wb_mode == modeManual &&
      connectionCtx.cameraTeleSettings.wb_index_mode == modeAuto
    )
      setTeleWBColorTempIndexValue(connectionCtx.cameraTeleSettings.wb_index);
    if (
      connectionCtx.cameraTeleSettings.wb_mode == modeManual &&
      connectionCtx.cameraTeleSettings.wb_index_mode == modeManual
    )
      setTeleWBSceneValue(connectionCtx.cameraTeleSettings.wb_index);
    setTeleBrightnessValue(connectionCtx.cameraTeleSettings.brightness);
    setTeleContrastValue(connectionCtx.cameraTeleSettings.contrast);
    setTeleHueValue(connectionCtx.cameraTeleSettings.hue);
    setTeleSaturationValue(connectionCtx.cameraTeleSettings.saturation);
    setTeleSharpnessValue(connectionCtx.cameraTeleSettings.sharpness);
  }

  const PhotosModeActions = [
    "Photo",
    "Video",
    "Panorama",
    "Burst",
    "Time Lapse",
    "Settings",
  ];

  const CameraType = {
    tele: 0,
    wide: 1,
  };

  const handleBtnPhotoClick = (buttonName) => {
    // Update state to set the active button
    setActiveBtnPhoto(
      buttonName === activeBtnPhoto
        ? buttonName === "tele"
          ? "wide"
          : "tele"
        : buttonName
    );
  };

  const handleBtnVideoClick = (buttonName) => {
    // Update state to set the active button
    setActiveBtnVideo(buttonName);
  };
  const handleBtnPanoClick = (buttonName) => {
    // Update state to set the active button
    setActiveBtnPano(buttonName);
  };
  const handleBtnBurstClick = (buttonName) => {
    // Update state to set the active button
    setActiveBtnBurst(
      buttonName === activeBtnBurst
        ? buttonName === "tele"
          ? "wide"
          : "tele"
        : buttonName
    );
  };
  const handleBtnTimeLapseClick = (buttonName) => {
    // Update state to set the active button
    setActiveBtnTimeLapse(
      buttonName === activeBtnTimeLapse
        ? buttonName === "tele"
          ? "wide"
          : "tele"
        : buttonName
    );
  };
  const handleBtnSettingsClick = (buttonName) => {
    // Update state to set the active button
    setActiveBtnSettings(
      buttonName === activeBtnSettings
        ? buttonName === "tele"
          ? "wide"
          : "tele"
        : buttonName
    );
  };

  function changeColorButton(ImgID, Force = false) {
    const imgElementButton = document.getElementById(ImgID) as HTMLImageElement;
    if (imgElementButton) {
      if (Force) imgElementButton.src = "/public/images/photo-camera-red.png";
      else if (imgElementButton.src.includes("photo-camera-white"))
        imgElementButton.src = "/public/images/photo-camera-red.png";
      else imgElementButton.src = "/public/images/photo-camera-white.png";
    }
  }

  // action Click   Photo
  const handleClickActionPhoto: GenericMouseEventHandler<
    HTMLImageElement
  > = async () => {
    // Update state to set the active button
    setActiveAction(PhotosModeActions[0].toString());
    // Wait for startPhoto() to finish before continuing
    await startPhoto(CameraType[activeBtnPhoto], connectionCtx, setErrorTxt);
    // Change the image source using the ID
    const imgElement = document.getElementById("TakePhoto") as HTMLImageElement;
    if (imgElement) {
      imgElement.src = "/public/images/photo-camera-red.png";
    }
    // Reset the image source back to its original source after a delay
    setTimeout(() => {
      if (imgElement) {
        imgElement.src = "/public/images/photo-camera-white.png";
      }
    }, 2000);
    // Reset the active action after the photo is taken
    setActiveAction(undefined);
  };

  // action Click   Start Video
  const handleClickActionStartVideo: GenericMouseEventHandler<
    HTMLImageElement
  > = async () => {
    // Update state to set the active button
    setActiveAction(PhotosModeActions[1].toString());

    // Wait for startVideo() to finish before continuing
    await startVideo(CameraType[activeBtnVideo], connectionCtx, setErrorTxt);
    // Change the image source using the ID
    changeColorButton("TakeVideo", true);
    intervalTimer.current = setInterval(changeColorButton, 2000, "TakeVideo");
  };

  // action Click   Stop Video
  const handleClickActionStopVideo: GenericMouseEventHandler<
    HTMLImageElement
  > = async () => {
    // Wait for stopVideo() to finish before continuing
    await stopVideo(CameraType[activeBtnVideo], connectionCtx, setErrorTxt);
    // Change the image source using the ID
    clearInterval(intervalTimer.current);
    changeColorButton("TakeVideo", true);
    setTimeout(changeColorButton, 2000, "TakeVideo");
    // Reset the active action after the photo is taken
    setActiveAction(undefined);
  };

  // action Click   Start Pano
  const handleClickActionStartPano: GenericMouseEventHandler<
    HTMLImageElement
  > = async () => {
    // Update state to set the active button
    setActiveAction(PhotosModeActions[2].toString());

    // Wait for startPano() to finish before continuing
    await startPano(
      CameraType[activeBtnPano],
      rowValue,
      colValue,
      connectionCtx,
      setErrorTxt,
      setActiveAction,
      stopPanoAuto
    );
    // Change the image source using the ID
    changeColorButton("TakePano", true);
    intervalTimer.current = setInterval(changeColorButton, 2000, "TakePano");
  };

  // action Click   Stop Pano
  const handleClickActionStopPano: GenericMouseEventHandler<
    HTMLImageElement
  > = async () => {
    // Wait for stopPano() to finish before continuing
    await stopPano(CameraType[activeBtnPano], connectionCtx, setErrorTxt);
    // Change the image source using the ID
    clearInterval(intervalTimer.current);
    changeColorButton("TakePano", true);
    setTimeout(changeColorButton, 2000, "TakePano");
    // Reset the active action after the photo is taken
    setActiveAction(undefined);
  };

  const stopPanoAuto = () => {
    // Change the image source using the ID
    clearInterval(intervalTimer.current);
    changeColorButton("TakePano", true);
    setTimeout(changeColorButton, 2000, "TakePano");
    // Reset the active action after the photo is taken
    setActiveAction(undefined);
  };

  // action Click   Start Burst
  const handleClickActionStartBurst: GenericMouseEventHandler<
    HTMLImageElement
  > = async () => {
    // Update state to set the active button
    setActiveAction(PhotosModeActions[3].toString());

    // Wait for startBurst() to finish before continuing
    await startBurst(
      CameraType[activeBtnBurst],
      countValue,
      intervalBurstValue,
      connectionCtx,
      setErrorTxt,
      setActiveAction,
      stopBurstAuto
    );
    // Change the image source using the ID
    changeColorButton("TakeBurstPhoto", true);
    intervalTimer.current = setInterval(
      changeColorButton,
      2000,
      "TakeBurstPhoto"
    );
  };

  // action Click   Stop Burst
  const handleClickActionStopBurst: GenericMouseEventHandler<
    HTMLImageElement
  > = async () => {
    // Wait for stopBurst() to finish before continuing
    await stopBurst(CameraType[activeBtnBurst], connectionCtx, setErrorTxt);
    // Change the image source using the ID
    clearInterval(intervalTimer.current);
    changeColorButton("TakeBurstPhoto", true);
    setTimeout(changeColorButton, 2000, "TakeBurstPhoto");
    // Reset the active action after the photo is taken
    setActiveAction(undefined);
  };

  const stopBurstAuto = () => {
    // Change the image source using the ID
    clearInterval(intervalTimer.current);
    changeColorButton("TakeBurstPhoto", true);
    setTimeout(changeColorButton, 2000, "TakeBurstPhoto");
    // Reset the active action after the photo is taken
    setActiveAction(undefined);
  };

  // action Click   Start Time Lapse
  const handleClickActionStartTimeLapse: GenericMouseEventHandler<
    HTMLImageElement
  > = async () => {
    // Update state to set the active button
    setActiveAction(PhotosModeActions[4].toString());

    // Wait for startTimeLapse() to finish before continuing
    await startTimeLapse(
      CameraType[activeBtnTimeLapse],
      intervalIndexValue,
      totalTimeIndexValue,
      connectionCtx,
      setErrorTxt,
      setActiveAction,
      stopTimeLapseAuto
    );
    // Change the image source using the ID
    changeColorButton("TakeTimeLapse", true);
    intervalTimer.current = setInterval(
      changeColorButton,
      2000,
      "TakeTimeLapse"
    );
  };

  // action Click   Stop Time Lapse
  const handleClickActionStopTimeLapse: GenericMouseEventHandler<
    HTMLImageElement
  > = async () => {
    // Wait for stopTimeLapse() to finish before continuing
    await stopTimeLapse(
      CameraType[activeBtnTimeLapse],
      connectionCtx,
      setErrorTxt
    );
    // stopTimeLapseAuto is called
  };

  const stopTimeLapseAuto = () => {
    // Change the image source using the ID
    clearInterval(intervalTimer.current);
    changeColorButton("TakeTimeLapse", true);
    setTimeout(changeColorButton, 2000, "TakeTimeLapse");
    // Reset the active action after the photo is taken
    setActiveAction(undefined);
  };

  function update_control() {
    if (window.innerWidth > 1500) {
      maxRange.current = 70;
      radius.current = 75;
      joystickRadius.current = 45;
      xValue.current = "80%";
      yValue.current = "11%";
      rightContainer.current = "10px";
      leftContainer.current = "10px";
      bottomContainer.current = "75px";
      WidthSlidePane.current = "1500px";
      WidthCircularSlider.current = 150;
      trackSize.current = 24;
      if (ChangeWindowSize.current < 1500) {
        setShowModal(false);
      }
      ChangeWindowSize.current = window.innerWidth;
    } else if (window.innerWidth > 1300 && window.innerWidth <= 1500) {
      maxRange.current = 60;
      radius.current = 55;
      joystickRadius.current = 30;
      xValue.current = "60%";
      yValue.current = "10%";
      rightContainer.current = "7px";
      leftContainer.current = "7px";
      bottomContainer.current = "57px";
      WidthSlidePane.current = "1250px";
      WidthCircularSlider.current = 110;
      trackSize.current = 24;
      if (ChangeWindowSize.current <= 1300 || ChangeWindowSize.current > 1500) {
        setShowModal(false);
      }
      ChangeWindowSize.current = window.innerWidth;
    } else if (window.innerWidth > 1200 && window.innerWidth <= 1300) {
      maxRange.current = 60;
      radius.current = 55;
      joystickRadius.current = 30;
      xValue.current = "60%";
      yValue.current = "5%";
      rightContainer.current = "7px";
      leftContainer.current = "7px";
      bottomContainer.current = "57px";
      WidthSlidePane.current = "1100px";
      WidthCircularSlider.current = 110;
      trackSize.current = 24;
      if (ChangeWindowSize.current <= 1200 || ChangeWindowSize.current > 1300) {
        setShowModal(false);
      }
      ChangeWindowSize.current = window.innerWidth;
    } else {
      maxRange.current = 55;
      radius.current = 50;
      joystickRadius.current = 25;
      xValue.current = "50%";
      yValue.current = "1%";
      rightContainer.current = "5px";
      leftContainer.current = "5px";
      bottomContainer.current = "50px";
      WidthSlidePane.current = "1060px";
      WidthCircularSlider.current = 100;
      trackSize.current = 12;
      if (ChangeWindowSize.current > 1200) {
        setShowModal(false);
      }
      ChangeWindowSize.current = window.innerWidth;
    }
  }

  function stop_motor() {
    const webSocketHandler = connectionCtx.socketIPDwarf
      ? connectionCtx.socketIPDwarf
      : new WebSocketHandler(connectionCtx.IPDwarf);

    if (webSocketHandler.isConnected()) {
      let txtInfoCommand = "";
      let WS_Packet = messageStepMotorServiceJoystickStop();
      txtInfoCommand = "Joystick";
      webSocketHandler.prepare(WS_Packet, txtInfoCommand);
    }
  }

  function init_joystick() {
    if (!joystickId) {
      const staticJoystick = new JoystickController(
        {
          maxRange: maxRange.current,
          level: 10,
          radius: radius.current,
          joystickRadius: joystickRadius.current,
          opacity: 0.5,
          leftToRight: false,
          bottomToUp: true,
          containerClass: "joystick-container",
          controllerClass: "joystick-controller",
          joystickClass: "joystick",
          distortion: true,
          x: xValue.current,
          y: yValue.current,
          mouseClickButton: "ALL",
          hideContextMenu: true,
        },
        ({ x, y, leveledX, leveledY, distance, angle }) => {
          console.debug(x, y, leveledX, leveledY, distance, angle);
          console.debug("joystickSpeed", joystickSpeed.current);
          let newTimeMotorCmd = Date.now();
          let elapsedTime = newTimeMotorCmd - gLastTimeMotorCmd;
          let newMotorState = distance > 0;
          // Stop ?
          if (
            newMotorState === false &&
            gMotorState != newMotorState &&
            elapsedTime > 50
          ) {
            gMotorState = newMotorState;
            gLastTimeMotorCmd = newTimeMotorCmd;
            // Send Stop command
            console.debug("stop_motor");
            stop_motor();
          } else if (newMotorState && elapsedTime > 400) {
            gMotorState = newMotorState;
            gLastTimeMotorCmd = newTimeMotorCmd;
            let angle_dec = (angle * 180) / 3.14116;
            if (angle_dec < 0) {
              angle_dec = 360 + angle_dec;
            }
            angle_dec = 360 - angle_dec;
            let vector =
              Math.sqrt(leveledX * leveledX + leveledY * leveledY) / 10;
            console.debug(elapsedTime, angle_dec, vector);
            move_joystick(angle_dec, vector, joystickSpeed.current);
          } else {
            console.debug("command motor not send", elapsedTime);
          }
        }
      );
      setJoystickId(staticJoystick);

      // Define the idString variable
      let idString = staticJoystick.id;

      // Construct the CSS class selectors using the idString
      let containerSelector = ".joystick-container-" + idString;

      // Get the elements matching the constructed selectors
      let containerElement = document.querySelector(
        containerSelector
      ) as HTMLElement;

      // Check if the elements exist
      if (containerElement) {
        // Modify CSS properties of the elements
        containerElement.style.position = "relative"; // fixed
        containerElement.style.right = rightContainer.current; // 80%
        containerElement.style.left = leftContainer.current; // 80%
        containerElement.style.bottom = bottomContainer.current; //  11% 75%
        containerElement.style.transform = "translate(0%,50%)"; //translate(50%,-50%)
      }

      let joystickContainer = staticJoystick.container;
      let newParent = document.getElementById("main_SlidingPane");

      if (joystickContainer && newParent) {
        // Remove joystickContainer from its current parent
        joystickContainer.parentNode.removeChild(joystickContainer);

        // Insert joystickContainer as the first child of the new parent
        if (newParent.firstChild) {
          newParent.insertBefore(joystickContainer, newParent.firstChild);
        } else {
          console.debug("no firstChild");
          newParent.appendChild(joystickContainer);
        }
        staticJoystick.recenterJoystick();

        // Create buttons div element
        create_button_joystick(
          joystickContainer,
          "Up",
          "joystick-button-up",
          90,
          "bi bi-arrow-up-circle"
        );
        create_button_joystick(
          joystickContainer,
          "Down",
          "joystick-button-down",
          270,
          "bi bi-arrow-down-circle"
        );
        create_button_joystick(
          joystickContainer,
          "Left",
          "joystick-button-left",
          180,
          "bi bi-arrow-left-circle"
        );
        create_button_joystick(
          joystickContainer,
          "Right",
          "joystick-button-right",
          0,
          "bi bi-arrow-right-circle"
        );
      }
    }
  }

  function updateNewSpeed(value) {
    joystickSpeed.current = value;
  }

  function create_button_joystick(
    divJoystickContainer,
    title,
    className,
    angle,
    icon
  ) {
    // Create a button div element
    const newDiv = document.createElement("div");
    // Set attributes and classes for the new div
    newDiv.title = title;
    newDiv.className = className;
    // Create the inner content (icon)
    const iconElement = document.createElement("i");
    iconElement.className = icon;
    // Add a mouseup event listener to the new div
    newDiv.addEventListener("mousedown", function (event) {
      // Handle the mousedown event here
      if (event.button == 0)
        move_joystick(angle, 0.8, joystickSpeed.current, false);
      // right click
      else move_joystick(angle, 0.8, joystickSpeed.current, true);
    });
    newDiv.addEventListener("mouseup", function () {
      stop_motor();
    });
    // Append the icon to the new div
    newDiv.appendChild(iconElement);
    // Append the new div into the joystickContainer
    divJoystickContainer.appendChild(newDiv);
  }

  function move_joystick(angle_dec, vector, motorspeed, fixed = false) {
    const webSocketHandler = connectionCtx.socketIPDwarf
      ? connectionCtx.socketIPDwarf
      : new WebSocketHandler(connectionCtx.IPDwarf);

    if (webSocketHandler.isConnected()) {
      let txtInfoCommand = "";
      console.debug("actual motorspeed: ", motorspeed);

      let speed_dwarf = ((motorspeed - 1) * 30) / 4;
      console.debug("new speed: ", speed_dwarf);
      let WS_Packet;
      if (!fixed) {
        WS_Packet = messageStepMotorServiceJoystick(
          angle_dec,
          vector,
          speed_dwarf
        );
      } else {
        WS_Packet = messageStepMotorServiceJoystickFixedAngle(
          angle_dec,
          vector,
          speed_dwarf
        );
      }
      txtInfoCommand = "Joystick";
      webSocketHandler.prepare(WS_Packet, txtInfoCommand);
    }
  }

  function close_joystick(joystick_id) {
    if (joystick_id) {
      joystick_id.destroy();
      setJoystickId(undefined);
    }
  }

  const { t } = useTranslation();
  // eslint-disable-next-line no-unused-vars
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");

  useEffect(() => {
    const storedLanguage = localStorage.getItem("language");
    if (storedLanguage) {
      setSelectedLanguage(storedLanguage);
      i18n.changeLanguage(storedLanguage);
    }
  }, []);

  return (
    <div>
      {isVisible && errorTxt && showModal && closePane.current && (
        <div
          className="slide-pane_from_bottom"
          style={{
            position: "fixed",
            top: "-40px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "fit-content",
            height: "30px",
            paddingTop: "5px",
            paddingBottom: "20px",
            paddingLeft: "50px",
            paddingRight: "50px",
            color: "rgb(255, 255, 255)",
            backgroundColor: "rgba(0,178,128, 0.7)",
          }}
        >
          {errorTxt}
        </div>
      )}
      <SlidingPane
        className="some-custom-class"
        overlayClassName="slide-pane__overlay_hide"
        isOpen={showModal && closePane.current}
        title="Camera Add On"
        hideHeader={true}
        from="bottom"
        width={WidthSlidePane.current}
        onAfterOpen={() => {
          setTimeout(init_joystick, 500);
        }}
        onAfterClose={() => {
          close_joystick(joystickId);
        }}
        onRequestClose={() => {}}
      >
        <div id="main_SlidingPane" className="box-element">
          <div className="speed-meter">
            <CircularSlider
              width={WidthCircularSlider.current}
              min={1.1}
              max={5}
              initialValue={2.2}
              label="SPEED"
              labelColor="#005a58"
              knobColor="#005a58"
              progressColorFrom="#00bfbd"
              progressColorTo="#009c9a"
              progressSize={trackSize.current}
              trackColor="#eeeeee"
              trackSize={trackSize.current}
              data={[
                "1.1",
                "1.2",
                "1.4",
                "1.6",
                "1.8",
                "2.0",
                "2.2",
                "2.4",
                "2.6",
                "2.8",
                "3.0",
                "3.2",
                "3.4",
                "3.6",
                "3.8",
                "4.0",
                "4.2",
                "4.4",
                "4.6",
                "4.8",
                "5",
              ]}
              dataIndex={6}
              onChange={(value) => {
                updateNewSpeed(value);
              }}
            />
          </div>
          <div className="containerCamera">
            <div className="pane">
              <div className="column">
                <div className="header">
                  <div className="title">{t("cCameraAddOnPhoto")}</div>
                </div>
                <div className="separator"></div>
                <img
                  id="TakePhoto"
                  src={imgSrc}
                  className="cameraAddon-image"
                  alt="Take Photos"
                  onClick={
                    activeAction === undefined
                      ? handleClickActionPhoto
                      : undefined
                  }
                  style={{ cursor: "pointer" }}
                />
                <div className="button-container">
                  <button
                    className={`button ${
                      activeBtnPhoto === "tele" ? "active" : ""
                    }`}
                    onClick={() => handleBtnPhotoClick("tele")}
                  >
                    Tele
                  </button>
                  <button
                    className={`button ${
                      activeBtnPhoto === "wide" ? "active" : ""
                    }`}
                    onClick={() => handleBtnPhotoClick("wide")}
                  >
                    Wide
                  </button>
                </div>
              </div>
              <div className="column">
                <div className="header">
                  <div className="title">{t("cCameraAddOnVideo")}</div>
                </div>
                <div className="separator"></div>
                <img
                  id="TakeVideo"
                  src={imgSrc}
                  className="cameraAddon-image"
                  alt="Take Videos"
                  onClick={
                    activeAction === undefined
                      ? handleClickActionStartVideo
                      : activeAction === PhotosModeActions[1].toString()
                      ? handleClickActionStopVideo
                      : undefined
                  }
                  style={{ cursor: "pointer" }}
                />
                {isDwarfII && (
                  <div className="button-container">
                    <button
                      className={`button-cent ${
                        activeBtnVideo === "tele" ? "active" : ""
                      }`}
                      onClick={() => handleBtnVideoClick("tele")}
                    >
                      Tele
                    </button>
                  </div>
                )}
                {!isDwarfII && (
                  <div className="button-container">
                    <button
                      className={`button ${
                        activeBtnVideo === "tele" ? "active" : ""
                      }`}
                      onClick={() => handleBtnVideoClick("tele")}
                    >
                      Tele
                    </button>
                    <button
                      className={`button ${
                        activeBtnVideo === "wide" ? "active" : ""
                      }`}
                      onClick={() => handleBtnVideoClick("wide")}
                    >
                      Wide
                    </button>
                  </div>
                )}
              </div>
              <div className="column">
                <div className="header">
                  <div className="title">{t("cCameraAddOnPanorama")}</div>
                  <Link href="#" className="" title="Show Settings">
                    <OverlayTrigger
                      trigger="click"
                      placement={"left"}
                      show={showSettingsPanoMenu}
                      onToggle={() => setShowSettingsPanoMenu((p) => !p)}
                      overlay={
                        <Popover id="popover-positioned-left">
                          <Popover.Body>
                            <CameraPanoSettings
                              colValue={colValue}
                              setColValue={setColValue}
                              rowValue={rowValue}
                              setRowValue={setRowValue}
                              setShowSettingsMenu={setShowSettingsPanoMenu}
                            />
                          </Popover.Body>
                        </Popover>
                      }
                    >
                      <i
                        className="bi bi-sliders"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1.75rem",
                        }}
                      ></i>
                    </OverlayTrigger>
                  </Link>
                </div>
                <div className="separator"></div>
                <img
                  id="TakePano"
                  src={imgSrc}
                  className="cameraAddon-image"
                  alt="Take Panoramas"
                  onClick={
                    activeAction === undefined
                      ? handleClickActionStartPano
                      : activeAction === PhotosModeActions[2].toString()
                      ? handleClickActionStopPano
                      : undefined
                  }
                  style={{ cursor: "pointer" }}
                />
                {isDwarfII && (
                  <div className="button-container">
                    <button
                      className={`button-cent ${
                        activeBtnPano === "tele" ? "active" : ""
                      }`}
                      onClick={() => handleBtnPanoClick("tele")}
                    >
                      Tele
                    </button>
                  </div>
                )}
                {!isDwarfII && (
                  <div className="button-container">
                    <button
                      className={`button ${
                        activeBtnPano === "tele" ? "active" : ""
                      }`}
                      onClick={() => handleBtnPanoClick("tele")}
                    >
                      Tele
                    </button>
                    <button
                      className={`button ${
                        activeBtnPano === "wide" ? "active" : ""
                      }`}
                      onClick={() => handleBtnPanoClick("wide")}
                    >
                      Wide
                    </button>
                  </div>
                )}
              </div>
              <div className="column">
                <div className="header">
                  <div className="title">Burst Photo</div>
                  <Link href="#" className="" title="Show Settings">
                    <OverlayTrigger
                      trigger="click"
                      placement={"left"}
                      show={showSettingsBurstMenu}
                      onToggle={() => setShowSettingsBurstMenu((p) => !p)}
                      overlay={
                        <Popover id="popover-positioned-left">
                          <Popover.Body>
                            <CameraBurstSettings
                              countValue={countValue}
                              setCountValue={setCountValue}
                              intervalValue={intervalBurstValue}
                              setIntervalValue={setIntervalBurstValue}
                              setShowSettingsMenu={setShowSettingsBurstMenu}
                            />
                          </Popover.Body>
                        </Popover>
                      }
                    >
                      <i
                        className="bi bi-sliders"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1.75rem",
                        }}
                      ></i>
                    </OverlayTrigger>
                  </Link>
                </div>
                <div className="separator"></div>
                <img
                  id="TakeBurstPhoto"
                  src={imgSrc}
                  className="cameraAddon-image"
                  alt="Take Burst Photos"
                  onClick={
                    activeAction === undefined
                      ? handleClickActionStartBurst
                      : activeAction === PhotosModeActions[3].toString()
                      ? handleClickActionStopBurst
                      : undefined
                  }
                  style={{ cursor: "pointer" }}
                />
                <div className="button-container">
                  <button
                    className={`button ${
                      activeBtnBurst === "tele" ? "active" : ""
                    }`}
                    onClick={() => handleBtnBurstClick("tele")}
                  >
                    Tele
                  </button>
                  <button
                    className={`button ${
                      activeBtnBurst === "wide" ? "active" : ""
                    }`}
                    onClick={() => handleBtnBurstClick("wide")}
                  >
                    Wide
                  </button>
                </div>
              </div>
              <div className="column">
                <div className="header">
                  <div className="title">{t("cCameraAddOnTimeLapse")}</div>
                  <Link href="#" className="" title="Show Settings">
                    <OverlayTrigger
                      trigger="click"
                      placement={"left"}
                      show={showSettingsTimeLapseMenu}
                      onToggle={() => setShowSettingsTimeLapseMenu((p) => !p)}
                      overlay={
                        <Popover id="popover-positioned-left">
                          <Popover.Body>
                            <CameraTimeLapseSettings
                              intervalIndexValue={intervalIndexValue}
                              setIntervalIndexValue={setIntervalIndexValue}
                              totalTimeIndexValue={totalTimeIndexValue}
                              setTotalTimeIndexValue={setTotalTimeIndexValue}
                              setShowSettingsMenu={setShowSettingsTimeLapseMenu}
                            />
                          </Popover.Body>
                        </Popover>
                      }
                    >
                      <i
                        className="bi bi-sliders"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1.75rem",
                        }}
                      ></i>
                    </OverlayTrigger>
                  </Link>
                </div>
                <div className="separator"></div>
                <img
                  id="TakeTimeLapse"
                  src={imgSrc}
                  className="cameraAddon-image"
                  alt="Take Time Lapse"
                  onClick={
                    activeAction === undefined
                      ? handleClickActionStartTimeLapse
                      : activeAction === PhotosModeActions[4].toString()
                      ? handleClickActionStopTimeLapse
                      : undefined
                  }
                  style={{ cursor: "pointer" }}
                />
                <div className="button-container">
                  <button
                    className={`button ${
                      activeBtnTimeLapse === "tele" ? "active" : ""
                    }`}
                    onClick={() => handleBtnTimeLapseClick("tele")}
                  >
                    Tele
                  </button>
                  <button
                    className={`button ${
                      activeBtnTimeLapse === "wide" ? "active" : ""
                    }`}
                    onClick={() => handleBtnTimeLapseClick("wide")}
                  >
                    Wide
                  </button>
                </div>
              </div>
              <div className="column">
                {activeBtnSettings === "wide" && (
                  <div className="header">
                    <div className="title">Settings</div>
                    <Link href="#" className="" title="Show Settings">
                      <OverlayTrigger
                        trigger="click"
                        placement={"left"}
                        show={showSettingsWideMenu}
                        onToggle={() => setShowSettingsWideMenu((p) => !p)}
                        overlay={
                          <Popover id="popover-positioned-left">
                            <Popover.Body>
                              <CameraWideSettings
                                wideExposureAuto={wideExposureAuto}
                                setWideExposureAuto={setWideExposureAuto}
                                wideExposureIndexValue={wideExposureIndexValue}
                                setWideExposureIndexValue={
                                  setWideExposureIndexValue
                                }
                                wideGainIndexValue={wideGainIndexValue}
                                setWideGainIndexValue={setWideGainIndexValue}
                                wideWBAuto={wideWBAuto}
                                setWideWBAuto={setWideWBAuto}
                                //wideWBMode={wideWBMode}
                                //setWideWBMode={setWideWBMode}
                                wideWBColorTempIndexValue={
                                  wideWBColorTempIndexValue
                                }
                                setWideWBColorTempIndexValue={
                                  setWideWBColorTempIndexValue
                                }
                                //wideWBSceneValue={wideWBSceneValue}
                                //setWideWBSceneValue={setWideWBSceneValue}
                                wideBrightnessValue={wideBrightnessValue}
                                setWideBrightnessValue={setWideBrightnessValue}
                                wideContrastValue={wideContrastValue}
                                setWideContrastValue={setWideContrastValue}
                                wideHueValue={wideHueValue}
                                setWideHueValue={setWideHueValue}
                                wideSaturationValue={wideSaturationValue}
                                setWideSaturationValue={setWideSaturationValue}
                                wideSharpnessValue={wideSharpnessValue}
                                setWideSharpnessValue={setWideSharpnessValue}
                                setShowSettingsWideMenu={
                                  setShowSettingsWideMenu
                                }
                              />
                            </Popover.Body>
                          </Popover>
                        }
                      >
                        <i
                          className="bi bi-sliders"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "1.75rem",
                          }}
                        ></i>
                      </OverlayTrigger>
                    </Link>
                  </div>
                )}
                {activeBtnSettings === "tele" && (
                  <div className="header">
                    <div className="title">Settings</div>
                    <Link href="#" className="" title="Show Settings">
                      <OverlayTrigger
                        trigger="click"
                        placement={"left"}
                        show={showSettingsTeleMenu}
                        onToggle={() => setShowSettingsTeleMenu((p) => !p)}
                        overlay={
                          <Popover id="popover-positioned-left">
                            <Popover.Body>
                              <CameraTeleSettings
                                teleWBAuto={teleWBAuto}
                                setTeleWBAuto={setTeleWBAuto}
                                teleWBMode={teleWBMode}
                                setTeleWBMode={setTeleWBMode}
                                teleWBColorTempIndexValue={
                                  teleWBColorTempIndexValue
                                }
                                setTeleWBColorTempIndexValue={
                                  setTeleWBColorTempIndexValue
                                }
                                teleWBSceneValue={teleWBSceneValue}
                                setTeleWBSceneValue={setTeleWBSceneValue}
                                teleBrightnessValue={teleBrightnessValue}
                                setTeleBrightnessValue={setTeleBrightnessValue}
                                teleContrastValue={teleContrastValue}
                                setTeleContrastValue={setTeleContrastValue}
                                teleHueValue={teleHueValue}
                                setTeleHueValue={setTeleHueValue}
                                teleSaturationValue={teleSaturationValue}
                                setTeleSaturationValue={setTeleSaturationValue}
                                teleSharpnessValue={teleSharpnessValue}
                                setTeleSharpnessValue={setTeleSharpnessValue}
                                setShowSettingsTeleMenu={
                                  setShowSettingsTeleMenu
                                }
                              />
                            </Popover.Body>
                          </Popover>
                        }
                      >
                        <i
                          className="bi bi-sliders"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "1.75rem",
                          }}
                        ></i>
                      </OverlayTrigger>
                    </Link>
                  </div>
                )}
                <div className="separator"></div>
                <img
                  src="/public/images/settings-white.png"
                  className="cameraAddon-image"
                  alt="Settings"
                  style={{ cursor: "pointer" }}
                />
                <div className="button-container">
                  <button
                    className={`button ${
                      activeBtnSettings === "tele" ? "active" : ""
                    }`}
                    onClick={() => {
                      updateTeleData();
                      handleBtnSettingsClick("tele");
                    }}
                  >
                    Tele
                  </button>
                  <button
                    className={`button ${
                      activeBtnSettings === "wide" ? "active" : ""
                    }`}
                    onClick={() => {
                      updateWideData();
                      handleBtnSettingsClick("wide");
                    }}
                  >
                    Wide
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SlidingPane>
    </div>
  );
}
