import { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import unzipper from "unzipper"; // Install with `npm install unzipper`
import { getLocalIPAddress } from "@/lib/getLocalIp";

interface Config {
  DWARF_IP?: string;
  DWARF_ID?: string;
}

const INSTALL_DIR = path.resolve("./install");
const EXTERN_DIR = path.join(INSTALL_DIR, "extern");
const ZIP_PATH =
  process.platform === "win32"
    ? path.join(INSTALL_DIR, "windows", "extern", "extern.zip")
    : path.join(INSTALL_DIR, "linux", "extern", "extern.zip");
const EXE_NAME = "connect_bluetooth";
const CONFIG_PATH = path.join(EXTERN_DIR, "config.py");

async function ensureUnzipped(): Promise<void> {
  const exePath =
    process.platform === "win32"
      ? path.join(EXTERN_DIR, `${EXE_NAME}.exe`)
      : `./${path.join(EXTERN_DIR, EXE_NAME)}`;

  if (fs.existsSync(EXTERN_DIR) && fs.existsSync(exePath)) {
    return; // ? Already extracted, no need to unzip again
  }

  if (!fs.existsSync(ZIP_PATH)) {
    throw new Error(`Zip file not found: ${ZIP_PATH}`);
  }

  console.log("Extracting extern.zip...");
  await fs
    .createReadStream(ZIP_PATH)
    .pipe(unzipper.Extract({ path: EXTERN_DIR }))
    .promise();
}

function readConfigPy(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error("config.py not found");
  }

  const content = fs.readFileSync(CONFIG_PATH, "utf-8");

  const dwarfIpMatch = content.match(/DWARF_IP\s*=\s*["']([^"']+)["']/);
  const dwarfIdMatch = content.match(/DWARF_ID\s*=\s*["']([^"']+)["']/);

  return {
    DWARF_IP: dwarfIpMatch ? dwarfIpMatch[1] : undefined,
    DWARF_ID: dwarfIdMatch ? dwarfIdMatch[1] : undefined,
  };
}

// Normalize IPv4 and IPv6 localhost
const normalizeIP = (ip: string | undefined) => {
  if (!ip) return "Unknown IP";
  if (ip === "::1" || ip === "127.0.0.1") return "127.0.0.1";
  return ip;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    await ensureUnzipped(); // ? Only unzips if necessary

    // ? Get client IP (Handles proxies)
    const clientIp =
      normalizeIP(
        (req.headers["x-forwarded-for"] as string)?.split(",")[0] || // If behind a proxy
          req.socket.remoteAddress,
      ) || // Direct connection
      "Unknown IP";

    console.log(`Received request from IP: ${clientIp}`);

    const on_server =
      clientIp === "127.0.0.1" || getLocalIPAddress().includes(clientIp);

    const exePath =
      process.platform === "win32"
        ? path.join(EXTERN_DIR, `${EXE_NAME}.exe`)
        : `./${path.join(EXTERN_DIR, EXE_NAME)}`;

    if (!fs.existsSync(exePath)) {
      return res.status(404).json({ error: "Executable not found" });
    }

    const {
      ble_psd = "DWARF_12345678",
      ble_STA_ssid = "",
      ble_STA_pwd = "",
      auto_select = "0",
    } = req.body;

    const command_line = on_server
      ? ["--psd", ble_psd, "--ssid", ble_STA_ssid, "--pwd", ble_STA_pwd]
      : [
          "--psd",
          ble_psd,
          "--ssid",
          ble_STA_ssid,
          "--pwd",
          ble_STA_pwd,
          "--select",
          auto_select,
          "--cmd",
        ];

    console.log("run_exe_path : " + exePath);
    console.log("run_exe_instal_path : " + EXTERN_DIR);
    const childProcess = spawn(`"${exePath}"`, command_line, {
      cwd: EXTERN_DIR,
      shell: true,
    });

    interface DwarfScanResult {
      step: string;
      dwarf_devices?: string[]; // Optional, since it might not be present in every step
      dwarf_device?: string | null;
      error?: string | null;
      is_connected?: boolean;
      connecting?: boolean;
      device_dwarf_id?: number;
      device_dwarf_name?: string;
      device_dwarf_uid?: string;
      ip_address?: string;
    }

    let stdoutData = "";
    let stderrData = "";
    let stdMessageData = {};

    childProcess.stdout.on("data", (data) => {
      stdoutData += data.toString().trim();
      console.log("Received:", stdoutData);
    });

    childProcess.stderr.on("data", (data) => {
      const text = data.toString().trim();
      console.info("Info:", text);
      stderrData += text;

      // Try parsing JSON immediately if the data contains a valid JSON object
      try {
        let jsonString = text;
        if (text.startsWith("{")) {
          jsonString = text.slice(0, text.indexOf("}") + 1);
        }
        const sanitizedJson = jsonString
          .replace(/None/g, "null")
          .replace(/True/g, "true")
          .replace(/False/g, "false")
          .replace(/([{,]\s*)'([^']+)'(\s*[:])/g, '$1"$2"$3') // Convert keys to double quotes
          .replace(/(:\s*)'([^']+)'/g, '$1"$2"') // Convert string values to double quotes
          .replace(/BLEDevice\(([^)]+)\)/g, '"$1"'); // Convert Python-style objects
        console.info("sanitizedJson:", sanitizedJson);
        const parsedJson = JSON.parse(sanitizedJson);
        stdMessageData = parsedJson; // Store the last JSON object
        console.info("MessageData:", stdMessageData);
      } catch (err) {
        // Ignore non-JSON data
        console.log("Ignore non JSPN data");
      }
    });

    childProcess.on("close", (code) => {
      if (code !== 0) {
        return res.status(500).json({ error: `Process failed: ${stderrData}` });
      }

      let jsonResult: DwarfScanResult | null = null;

      jsonResult = stdMessageData as DwarfScanResult;
      console.info("Final jsonResult:", stdMessageData);
      console.log("Final jsonResult:", JSON.stringify(jsonResult, null, 2));

      if (jsonResult) {
        if (
          jsonResult?.step === "1" &&
          (jsonResult.dwarf_devices ?? []).length === 0
        ) {
          return res
            .status(204)
            .json({ message: "No devices found", action: "restart_scan" });
        }
        if (
          jsonResult?.step === "3" &&
          Array.isArray(jsonResult.dwarf_devices) &&
          jsonResult.dwarf_devices.length > 1
        ) {
          const deviceNames = jsonResult.dwarf_devices.map((device: string) => {
            // Split by comma and take the second part (the device name)
            return device.split(", ")[1]; // This will give "DWARF3_3C2E2A" and "DWARF3_3AD246"
          });
          return res.status(202).json({
            message: "Multiple devices found, user selection needed",
            devices: deviceNames,
          });
        }
        if (jsonResult?.step === "4") {
          if (jsonResult.is_connected) {
            return res.status(200).json({
              dwarfIp: jsonResult.ip_address,
              dwarfId: jsonResult.device_dwarf_id,
              details: jsonResult,
            });
          } else {
            return res.status(401).json({
              dwarfIp: jsonResult.ip_address,
              dwarfId: jsonResult.device_dwarf_id,
              details: jsonResult,
            });
          }
        }
        return res.status(500).json({
          error: "Unexpected error, retrying...",
          details: jsonResult,
        });
      }

      try {
        const config = readConfigPy(); // ? Read Python config file
        return res.status(200).json({
          dwarfIp: config.DWARF_IP || "",
          dwarfId: config.DWARF_ID || "",
          details: stderrData.trim(),
        });
      } catch (configError) {
        return res.status(500).json({ error: (configError as Error).message });
      }
    });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
}
