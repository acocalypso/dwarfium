import {
  DwarfClientIdDwarfMini,
  DwarfDeviceIdDwarf3,
  DwarfDeviceIdDwarfII,
  DwarfDeviceIdDwarfMini,
  WsMinorVersionV3,
} from "dwarfii_api";

export type DwarfModel = "dwarf2" | "dwarf3" | "dwarfmini";

export type DwarfCapabilities = Readonly<{
  teleCamera: boolean;
  wideCamera: boolean;
  rtspPreview: boolean;
  filterWheel: boolean;
  astroAutofocus: boolean;
  darkFrameContinue: boolean;
}>;

export type DwarfDeviceProfile = Readonly<{
  model: DwarfModel;
  deviceId: number;
  displayName: string;
  clientId: string;
  protocolMinorVersion: number;
  capabilities: DwarfCapabilities;
}>;

const DEFAULT_CLIENT_ID = "0000DAF2-0000-1000-8000-00805F9B34FB";

const profiles: Record<number, DwarfDeviceProfile> = {
  [DwarfDeviceIdDwarfII]: {
    model: "dwarf2",
    deviceId: DwarfDeviceIdDwarfII,
    displayName: "DWARF II",
    clientId: DEFAULT_CLIENT_ID,
    protocolMinorVersion: WsMinorVersionV3,
    capabilities: {
      teleCamera: true,
      wideCamera: true,
      rtspPreview: false,
      filterWheel: false,
      astroAutofocus: true,
      darkFrameContinue: false,
    },
  },
  [DwarfDeviceIdDwarf3]: {
    model: "dwarf3",
    deviceId: DwarfDeviceIdDwarf3,
    displayName: "DWARF 3",
    clientId: DEFAULT_CLIENT_ID,
    protocolMinorVersion: WsMinorVersionV3,
    capabilities: {
      teleCamera: true,
      wideCamera: true,
      rtspPreview: true,
      filterWheel: true,
      astroAutofocus: true,
      darkFrameContinue: true,
    },
  },
  [DwarfDeviceIdDwarfMini]: {
    model: "dwarfmini",
    deviceId: DwarfDeviceIdDwarfMini,
    displayName: "DWARF mini",
    clientId: DwarfClientIdDwarfMini,
    protocolMinorVersion: WsMinorVersionV3,
    capabilities: {
      teleCamera: true,
      wideCamera: true,
      rtspPreview: true,
      filterWheel: true,
      astroAutofocus: true,
      darkFrameContinue: true,
    },
  },
};

export function getDwarfDeviceProfile(deviceId: number): DwarfDeviceProfile {
  const profile = profiles[deviceId];
  if (!profile) {
    throw new Error(`Unsupported DWARF device ID: ${deviceId}`);
  }
  return profile;
}

export function getDwarfDeviceName(deviceId: number): string {
  return getDwarfDeviceProfile(deviceId).displayName;
}
