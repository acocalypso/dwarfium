jest.mock("@/services/dwarf", () => ({
  Dwarfii_Api: {
    DwarfCMD: {
      CMD_ASTRO_STOP_GOTO: 11004,
      CMD_ASTRO_STOP_ONE_CLICK_GOTO: 11015,
      CMD_NOTIFY_STATE_ASTRO_GOTO: 15211,
    },
    DwarfErrorCode: { OK: 0 },
  },
  createV3OneClickGotoDsoPacket: jest.fn(() => new Uint8Array([1])),
  messageV3AstroGotoDone: jest.fn(() => new Uint8Array([2])),
  messageAstroStartEqSolving: jest.fn(() => new Uint8Array([3])),
  messageCameraTeleStartBurst: jest.fn(() => new Uint8Array([4])),
  messageCameraWideStartBurst: jest.fn(() => new Uint8Array([5])),
  messageCameraTeleSetFeatureParams: jest.fn(() => new Uint8Array([6])),
  messageCameraTeleGetAllFeatureParams: jest.fn(() => new Uint8Array([7])),
  messageCameraTeleStartTimeLapsePhoto: jest.fn(() => new Uint8Array([8])),
  messageCameraWideStartTimeLapsePhoto: jest.fn(() => new Uint8Array([9])),
}));
jest.mock("@/lib/dwarf_utils", () => ({ get_error: jest.fn() }));
jest.mock("@/lib/logger", () => ({ logger: jest.fn() }));
jest.mock("@/lib/event_bus", () => ({
  __esModule: true,
  default: { dispatch: jest.fn() },
}));

import {
  createV3OneClickGotoDsoPacket,
  messageAstroStartEqSolving,
  messageCameraTeleSetFeatureParams,
  messageCameraWideStartBurst,
} from "@/services/dwarf";
import {
  EQSolvingHandlerFn,
  startGotoHandler,
  stopGotoHandler,
} from "@/lib/goto_utils";
import { startBurst, startTimeLapse } from "@/lib/photo_utils";
import { get_error } from "@/lib/dwarf_utils";

function createContext(latitude = 49, longitude: number | undefined = 11) {
  return {
    IPDwarf: "192.0.2.1",
    latitude,
    longitude,
    isSavedPosition: true,
    socketIPDwarf: { prepare: jest.fn(), run: jest.fn(() => true) },
    setAstroSettings: jest.fn(),
    setAstroEQSolvingResult: jest.fn(),
  } as any;
}

describe("operation request routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  test.each([11, -11, 0])(
    "preserves east-positive longitude %s for one-click GOTO and EQ",
    async (longitude) => {
      const context = createContext(49, longitude);
      await startGotoHandler(
        context,
        jest.fn(),
        jest.fn(),
        undefined,
        "12h00m00s",
        "+20°00'00\"",
        "Test target",
      );
      expect(createV3OneClickGotoDsoPacket).toHaveBeenCalledWith(
        12,
        20,
        "Test_target",
        longitude,
        49,
      );
      await EQSolvingHandlerFn(context, jest.fn(), jest.fn());
      expect(messageAstroStartEqSolving).toHaveBeenCalledWith(longitude, 49);
    },
  );

  test("does not silently replace a missing location with zero", async () => {
    const context = createContext();
    context.longitude = undefined;
    const setErrors = jest.fn();
    await startGotoHandler(
      context,
      setErrors,
      jest.fn(),
      undefined,
      "12h00m00s",
      "+20°00'00\"",
      "Test target",
    );
    expect(createV3OneClickGotoDsoPacket).not.toHaveBeenCalled();
    expect(setErrors).toHaveBeenLastCalledWith(
      "Set an observing location before starting GOTO.",
    );
  });

  test("correlates the one-click stop ACK without marking motion complete", async () => {
    const context = createContext();
    const setSuccess = jest.fn();
    await stopGotoHandler(context, jest.fn(), setSuccess);
    const handler = context.socketIPDwarf.prepare.mock.calls[0][3];

    handler("stop", { cmd: 11004, data: { code: 0 } });
    expect(setSuccess).toHaveBeenCalledTimes(1);
    handler("stop", { cmd: 11015, data: { code: 0 } });
    expect(setSuccess).toHaveBeenLastCalledWith(
      "GOTO stop accepted. Waiting for telescope state.",
    );
    expect(context.setAstroSettings).not.toHaveBeenCalled();
  });

  test("reports a rejected stop and keeps authoritative mount state", async () => {
    const context = createContext();
    const setErrors = jest.fn();
    await stopGotoHandler(context, setErrors, jest.fn());
    const handler = context.socketIPDwarf.prepare.mock.calls[0][3];
    const response = { cmd: 11015, data: { code: -1 } };
    handler("stop", response);
    expect(get_error).toHaveBeenCalledWith(
      "Unable to stop GOTO: ",
      response,
      setErrors,
    );
    expect(context.setAstroSettings).not.toHaveBeenCalled();
  });

  test("keeps the wide burst start after settings with no empty packets", async () => {
    const context = createContext();
    await startBurst(1, 3, 1, context, jest.fn(), jest.fn(), jest.fn());
    const packets = context.socketIPDwarf.prepare.mock.calls[0][0];
    expect(messageCameraWideStartBurst).toHaveBeenCalledTimes(1);
    expect(packets).toEqual([new Uint8Array([6]), new Uint8Array([5])]);
    expect(packets.every(Boolean)).toBe(true);
  });

  test.each([0, 1])(
    "uses the requested total time independently of interval for camera %s",
    async (camera) => {
      const context = createContext();
      await startTimeLapse(
        camera,
        2,
        7,
        context,
        jest.fn(),
        jest.fn(),
        jest.fn(),
      );
      expect(messageCameraTeleSetFeatureParams).toHaveBeenNthCalledWith(
        1,
        false,
        1,
        4,
        0,
        2,
        0,
      );
      expect(messageCameraTeleSetFeatureParams).toHaveBeenNthCalledWith(
        2,
        false,
        1,
        5,
        0,
        7,
        0,
      );
    },
  );
});
