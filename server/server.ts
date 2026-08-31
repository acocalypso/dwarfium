////////////////////////////////////////////////////////////////////////
// use same value as NEXT_PUBLIC_PORT_PROXY_CORS in env.production file
// use same value as NEXT_PUBLIC_PORT_PROXY_CORS_HTTPS in env.production file
////////////////////////////////////////////////////////////////////////
const NEXT_PUBLIC_PORT_PROXY_CORS = 8860;
const NEXT_PUBLIC_PORT_PROXY_CORS_HTTPS = 9443;
const USE_CLIENT_CERTIFICATE = false; // if need set USE_CLIENT_CERTIFICATE to true

import express from "express";
const WebSocket = require("ws");
const http = require("http");
const https = require("https");
import fetch from "node-fetch";
import cors from "cors";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
const os = require("os");

// Function to check if body is a valid JSON string
function isJSONString(body) {
  if (typeof body !== "string") {
    return false;
  }
  try {
    JSON.parse(body);
    return true;
  } catch (e) {
    return false;
  }
}

function getLocalIPAddress(): string[] {
  const interfaces = os.networkInterfaces();
  let localIPs: string[] = [];

  for (const key in interfaces) {
    const iface = interfaces[key];

    if (Array.isArray(iface)) {
      for (const entry of iface) {
        if (entry.family === "IPv4" && !entry.internal) {
          localIPs.push(entry.address);
        }
      }
    }
  }

  // Sort the IPs: 192.x.x.x first, others next, 127.0.0.1 last
  localIPs = localIPs.sort((a, b) => {
    if (a.startsWith("192.") && !b.startsWith("192.")) return -1; // 192.x first
    if (!a.startsWith("192.") && b.startsWith("192.")) return 1;
    if (a === "127.0.0.1") return 1; // 127.0.0.1 always last
    if (b === "127.0.0.1") return -1;
    return a.localeCompare(b); // Otherwise, sort numerically
  });

  return localIPs;
}

function check_certificates() {
  const basePath = "."; // Current directory
  const caPath = path.join(basePath, "CADwarfiumCert.pem"); // Your Root CA

  // Possible certificate and key names
  const certPath = path.join(basePath, "DwarfiumCert.pem");
  const keyPath = path.join(basePath, "DwarfiumKey.pem");

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    console.log(`✅ Using certificate: ${certPath}`);
    return {
      key: fs.readFileSync(keyPath, "utf-8"),
      cert: fs.readFileSync(certPath, "utf-8"),
      requestCert: true, // Require client certificates
      rejectUnauthorized: false, // Enforce validation
      ca: fs.existsSync(caPath) ? fs.readFileSync(caPath, "utf-8") : undefined,
    };
  }

  console.warn(
    "🔒 SSL Certificates not found, use createSSLcert tool to generate and install them...",
  );
  return false;
}

const app = express();

app.use(express.json());
app.use(cors({ origin: "*", methods: "GET,POST,PUT,DELETE,PATCH,OPTIONS" }));

if (USE_CLIENT_CERTIFICATE) {
  // Middleware to check if a client certificate was provided
  app.use((req, res, next) => {
    const cert = req.socket.getPeerCertificate();
    if (!req.client.authorized) {
      return res
        .status(401)
        .send("Unauthorized: Invalid or missing certificate");
    }
    console.log(`Client connected: ${cert.subject.CN}`);
    next();
  });
}

// Handle preflight requests
app.options("*", (req, res) => {
  res.sendStatus(200);
});

// Create HTTP server
const httpServer = http.createServer(app);

const httpsOptions = check_certificates();

// Create HTTPS server if certificates are presents
const httpsServer = httpsOptions
  ? https.createServer(httpsOptions, app)
  : false;

// Function to determine the correct agent dynamically
function getAgentForUrl(url: string) {
  const targetUrl = new URL(url);
  if (targetUrl.protocol === "https:" && httpsOptions) {
    return new https.Agent({
      ca: httpsOptions.ca, // Use the CA certificate
      rejectUnauthorized: false,
    });
  } else if (targetUrl.protocol === "http:") {
    return new http.Agent(); // Use a regular HTTP agent for HTTP requests
  }
  return undefined;
}

// WebSocket Server
const wss = new WebSocket.Server({ noServer: true });

// Handle WebSocket connections
wss.on("connection", (clientSocket, req) => {
  try {
    const urlParams = new URL(req.url, `ws://${req.headers.host}`).searchParams;
    const targetUrl = urlParams.get("target");
    const authToken = urlParams.get("token");

    if (!targetUrl) {
      clientSocket.close(3008, "Missing target parameter");
      return;
    }

    console.log(`WebSocket proxying to target: ${targetUrl}`);

    const targetSocket = new WebSocket(targetUrl);

    targetSocket.on("open", () => {
      console.log(`Connected to target: ${targetUrl}`);

      // If a token is provided, send it to the target server
      if (authToken) {
        console.log(`Sending auth token: ${authToken}`);
        targetSocket.send(authToken);
      }
    });

    clientSocket.on("message", (data) => {
      if (targetSocket.readyState === WebSocket.OPEN) {
        // Check if the received message is a ping
        if (data instanceof Buffer) {
          const message = data.toString();
          try {
            // Try parsing as JSON
            const jsonData = JSON.parse(message);
            console.log("Received JSON data:", jsonData);

            // Send JSON as a string
            targetSocket.send(JSON.stringify(jsonData));
          } catch (error) {
            if (message === "ping") {
              // If it's a ping, resend it as text
              console.log("Received ping as binary, sending as text...");
              targetSocket.send("ping"); // Send ping back as text
            } else {
              // Otherwise, forward it as is
              console.log(
                "Forwarding message from client to target:",
                data.toString("hex"),
              );
              targetSocket.send(data); // Forward data to client
            }
          }
        }
      }
    });

    targetSocket.on("message", (data) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        if (data instanceof Buffer) {
          const message = data.toString();

          try {
            // Try parsing as JSON
            const jsonData = JSON.parse(message);
            console.log("Received JSON data:", jsonData);

            // Send JSON as a string
            clientSocket.send(JSON.stringify(jsonData));
          } catch (error) {
            if (message === "pong") {
              // If it's a pong, resend it as text
              console.log("Received pong as binary, sending as text...");
              clientSocket.send("pong"); // Send pong back as text
            } else {
              // Otherwise, forward it as is
              console.log(
                "Forwarding message from target to client:",
                data.toString("hex"),
              );
              clientSocket.send(data); // Forward data to client
            }
          }
        }
      }
    });

    clientSocket.on("close", () => {
      try {
        targetSocket.close(1000, "Normal closure");
      } catch (error: any) {
        console.error("Proxy WebSocket Close error:", error);
      }
    });

    targetSocket.on("close", () => {
      try {
        clientSocket.close(1000, "Normal closure");
      } catch (error: any) {
        console.error("Proxy WebSocket Close error:", error);
      }
    });

    targetSocket.on("error", (err) => {
      try {
        console.error("Target WebSocket error:", err);
        clientSocket.close(3000, "Target WebSocket error");
      } catch (error: any) {
        console.error("Proxy WebSocket error:", error);
      }
    });
    clientSocket.on("error", (err) => {
      try {
        console.error("Client WebSocket error:", err);
        clientSocket.close(3000, "Client WebSocket error");
      } catch (error: any) {
        console.error("Proxy WebSocket error:", error);
      }
    });
  } catch (error: any) {
    console.error("Proxy WebSocket error:", error);
  }
});

// Upgrade HTTP to WebSocket
httpServer.on("upgrade", (req, socket, head) => {
  if (req.headers["upgrade"] !== "websocket") {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    try {
      wss.emit("connection", ws, req);
    } catch (error: any) {
      console.error("Proxy Upgrade http error:", error);
      const err = error as Error; // Cast error to Error
      console.error(
        "Client WebSocket details:",
        err.message || "An unknown error occurred",
      );
    }
  });
});

if (httpsServer) {
  // Upgrade HTTPS to WebSocket
  httpsServer.on("upgrade", (req, socket, head) => {
    if (req.headers["upgrade"] !== "websocket") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      try {
        wss.emit("connection", ws, req);
      } catch (error: any) {
        console.error("Proxy Upgrade https error:", error);
        const err = error as Error; // Cast error to Error
        console.error(
          "Client WebSocket details:",
          err.message || "An unknown error occurred",
        );
      }
    });
  });
}

app.get("/health", (req, res) => {
  res.status(200).json({ status: "Proxy is running" });
});

// Run BLE Health Route
app.get("/run-ble-health", async (req, res) => {
  const externPath = path.resolve("./extern"); // Adjust path if needed
  const exeName = "connect_bluetooth";
  const exePath =
    process.platform === "win32"
      ? path.join(externPath, exeName + ".exe")
      : path.join(externPath, exeName);

  // Ensure the executable exists
  if (!fs.existsSync(exePath)) {
    return res.status(404).json({ error: "Executable not found" });
  } else {
    return res.status(200).json({ status: "Executable found" });
  }
});

// Run BLE Route
app.post("/run-ble", async (req, res) => {
  try {
    let clientIp = req.ip.replace(/^::ffff:/, ""); // Normalize IPv6-mapped IPv4 addresses
    if (clientIp === "::1") clientIp = "127.0.0.1";
    console.log(`Received request from IP: ${clientIp}`);
    const on_server =
      clientIp === "127.0.0.1" || getLocalIPAddress().includes(clientIp);

    const externPath = path.resolve("./extern"); // Adjust path if needed
    const exeName = "connect_bluetooth";
    const exePath =
      process.platform === "win32"
        ? path.join(externPath, exeName + ".exe")
        : path.join(externPath, exeName);

    // Extract parameters from the request body
    const {
      ble_psd = "DWARF_12345678",
      ble_STA_ssid = "",
      ble_STA_pwd = "",
      auto_select = "0",
    } = req.body;

    // Ensure the executable exists
    if (!fs.existsSync(exePath)) {
      return res.status(404).json({ error: "Executable not found" });
    }

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

    // Run the executable with parameters
    const childProcess = spawn(`"${exePath}"`, command_line, {
      cwd: externPath,
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

    childProcess.on("close", async (code) => {
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

      // Read DWARF_IP from config.py (Simple Read Instead of Execution)
      const configPath = path.join(externPath, "config.py");
      if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: "config.py not found" });
      }

      // Extract DWARF_IP and DWARF_ID manually (Assuming `config.py` follows `KEY = VALUE` format)
      const configContent = fs.readFileSync(configPath, "utf8");
      const dwarfIpMatch = configContent.match(/DWARF_IP\s*=\s*["'](.+?)["']/);
      const dwarfIdMatch = configContent.match(/DWARF_ID\s*=\s*["'](.+?)["']/);

      return res.status(200).json({
        dwarfIp: dwarfIpMatch ? dwarfIpMatch[1] : "",
        dwarfId: dwarfIdMatch ? dwarfIdMatch[1] : "",
        details: stderrData.trim(),
      });
    });
  } catch (error) {
    console.error("Error executing EXE:", error);
    const err = error as Error;
    res.status(500).json({ error: err.message || "An unknown error occurred" });
  }
});

// Run Stellarium config Health Route
app.get("/stellarium-config-health", async (req, res) => {
  const INSTALL_DIR = path.resolve(".");
  const EXE_NAME = "stellarium_auto_config";
  const EXE_FULL_NAME =
    process.platform === "win32" ? `${EXE_NAME}.exe` : `${EXE_NAME}`;

  const exePath = path.join(INSTALL_DIR, EXE_FULL_NAME);

  if (fs.existsSync(exePath)) {
    const urlExe = "/stellarium-config-exe";
    return res.status(200).json({ status: "Executable found", data: urlExe });
  }

  return res.status(404).json({ error: "Executable not found" });
});

// Run Stellarium config Exe Route
app.get("/stellarium-config-exe", async (req, res) => {
  const INSTALL_DIR = path.resolve(".");
  const EXE_NAME = "stellarium_auto_config";
  const EXE_FULL_NAME =
    process.platform === "win32" ? `${EXE_NAME}.exe` : `${EXE_NAME}`;

  const exePath = path.join(INSTALL_DIR, EXE_FULL_NAME);

  if (!fs.existsSync(exePath)) {
    return res.status(404).json({ error: "Executable not found" });
  }

  try {
    const childProcess = spawn(`"${exePath}"`, [], {
      cwd: INSTALL_DIR,
      shell: process.platform !== "win32",
    });

    let stdoutData = "",
      stderrData = "";

    childProcess.stdout.on("data", (data: Buffer) => {
      stdoutData += data.toString();
    });

    childProcess.stderr.on("data", (data: Buffer) => {
      stderrData += data.toString();
    });

    childProcess.on("close", (code) => {
      if (code === 0) {
        console.log("Process exited successfully:", stdoutData);
        return res
          .status(200)
          .json({ message: "Process completed", output: stdoutData });
      } else {
        console.error("Process exited with error:", stderrData);
        return res
          .status(500)
          .json({ error: "Process failed", details: stderrData });
      }
    });

    childProcess.on("error", (err) => {
      console.error("Error starting the executable:", err);
      res.status(500).json({ error: "Executable failed to start" });
    });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/getLocalIP", async (req, res) => {
  res.status(200).json({ ips: getLocalIPAddress() });
});

app.use((req, res, next) => {
  console.debug(`📥 Incoming Request: ${req.method} ${req.originalUrl}`);
  next();
});

// Proxy route
app.all("*", async (req, res) => {
  const controller = new AbortController();
  const timeout = 90000; // 90 seconds timeout

  // Set up the timeout manually
  const timeoutSignal = setTimeout(() => {
    controller.abort(); // Abort the request after timeout
  }, timeout);

  try {
    console.log("Proxy is running");
    const { target } = req.query;
    console.log("target: ", target);
    console.log("originalUrl: ", req.originalUrl);
    if (!target) {
      // Log the full query object to see all parameters
      console.log("Request error:", req.originalUrl);
      return res.status(400).json({ error: "Target URL is required" });
    }

    // Extract the last target from the query string if it's recursive
    const lastTarget = new URL(target).searchParams.get("target") || target;
    console.log("target: ", lastTarget);
    const urlLastTarget = new URL(target);
    console.log("target port: ", urlLastTarget.port);

    // Assign the correct agent based on `lastTarget`
    const agent = getAgentForUrl(lastTarget);

    // Prepare headers, removing problematic ones
    const filteredHeaders = Object.fromEntries(
      Object.entries(req.headers).filter(
        ([key]) => !["host", "transfer-encoding"].includes(key.toLowerCase()),
      ),
    );

    // Ensure headers only contain strings (this prevents TypeScript errors)
    const sanitizedHeaders: { [key: string]: string } = Object.fromEntries(
      Object.entries(filteredHeaders).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.join(",") : String(value), // Ensure value is a string
      ]),
    );

    // Validate if the body is valid for the method
    const isBodyValid =
      ["PUT", "DELETE", "PATCH"].includes(req.method || "") ||
      (req.method === "POST" &&
        req.body && // Ensure `req.body` exists
        typeof req.body === "object" && // Check it's an object
        Object.keys(req.body).length > 0); // Confirm it's not empty

    // Only include body if valid
    if (isBodyValid) {
      // Ensure proper content type
      sanitizedHeaders["Content-Type"] = "application/json";
    }

    interface FetchOptions {
      method: string;
      headers: { [key: string]: string };
      body?: string;
      signal?: AbortSignal; // Ensure signal is part of the type
    }

    const fetchOptions: FetchOptions = {
      signal: req.signal ?? controller.signal,
      method: req.method ?? "GET", // Fallback to "GET" if req.method is undefined
      headers: sanitizedHeaders,
      ...(agent ? { agent } : {}), // Add `agent` only when using HTTPS
    };
    console.log(fetchOptions.signal);
    console.log(fetchOptions);

    // Include the body only if valid
    if (isBodyValid) {
      const finalBody = isJSONString(req.body)
        ? req.body
        : JSON.stringify(req.body);
      fetchOptions.body = finalBody;
    }
    const response = await fetch(lastTarget, fetchOptions);
    console.log(response);

    let contentType = response.headers.get("content-type");
    console.log(contentType);

    if (typeof contentType === "string" && contentType.includes("multipart")) {
      // Cancel the timeout signal for multipart
      clearTimeout(timeoutSignal);
      res.setHeader("Content-Type", contentType);
    } else if (contentType) {
      res.setHeader("Content-Type", contentType.split(";")[0].trim());
    } else {
      res.setHeader("Content-Type", "application/octet-stream");
    }

    // Handle multipart streaming (if applicable)
    if (typeof contentType === "string" && contentType.includes("multipart")) {
      if (response.body) {
        return response.body.pipe(res); // Stream response directly
      } else {
        // Handle the case where response.body is null or undefined
        return res
          .status(500)
          .send("Error: Multipart response body is missing.");
      }
    } else if (
      contentType?.includes("image") ||
      contentType?.includes("octet-stream")
    ) {
      const buffer = Buffer.from(await response.arrayBuffer()); // ? Convert response to Buffer
      return res.status(response.status).send(buffer); // ? Send binary data
    } else {
      // Check if it contains JSON
      const isJSON = contentType?.includes("application/json");

      const data = isJSON ? await response.json() : await response.text();
      //console.log(data);

      res.status(response.status).send(data);
    }
  } catch (error: any) {
    if (error.name === "AbortError") {
      return res.status(504).json({
        error: "Error: Proxy request timed out",
        details: "Timeout error occurred",
      });
    }
    console.error("Proxy error:", error);
    const err = error as Error; // Cast error to Error
    return res.status(500).json({
      error: "Proxy request failed",
      details: err.message || "An unknown error occurred",
    });
  } finally {
    clearTimeout(timeoutSignal);
  }
});

httpServer.listen(NEXT_PUBLIC_PORT_PROXY_CORS, "0.0.0.0", () => {
  console.log(
    `Proxy server is running on http://localhost:${NEXT_PUBLIC_PORT_PROXY_CORS}`,
  );
});

if (httpsServer) {
  httpsServer.listen(NEXT_PUBLIC_PORT_PROXY_CORS_HTTPS, "0.0.0.0", () => {
    console.log(
      `HTTPS Proxy server is running on https://localhost:${NEXT_PUBLIC_PORT_PROXY_CORS_HTTPS}`,
    );
  });
}
