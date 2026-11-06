import { ipcMain } from "electron";

import { dispatcher } from "./calls";
import {
  deData,
  deserialData,
  encodeAnonymousId,
  enData,
  SERIAL_AES_KEY,
  serialData,
} from "./crypto";

import "./calls/index";

ipcMain.on("channel.encryptId", (event, id: string) => {
  event.returnValue = encodeAnonymousId(String(id)).replace(/\//g, "_").replace(/\+/g, "-");
});

ipcMain.handle("channel.call", (event, command: string, ...params: unknown[]) => {
  return new Promise((resolve) => {
    void dispatcher
      .dispatch(
        command,
        (...args: unknown[]) => {
          resolve(args);
        },
        event,
        ...params
      )
      .then((result: unknown | false) => {
        if (result === false) {
          LOGGER.warn({ command }, "No handler registered for channel command");
          resolve(false); // No handler found for the command
        } else {
          LOGGER.trace({ command }, "Channel command handled");
        }
      })
      .catch((err: unknown) => {
        LOGGER.error({ command, err }, "Channel command failed");
        resolve(false);
      });
  });
});

ipcMain.on("channel.enData", (event, plaintext: string) => {
  const ciphertext = enData(plaintext);
  event.returnValue = ciphertext;
});

ipcMain.on("channel.deData", (event, doubleBase64: string) => {
  const plaintextBuf = deData(doubleBase64);
  event.returnValue = plaintextBuf ? plaintextBuf.toString("utf8") : null;
});

ipcMain.on("channel.serialData", (event, apiPath: string, body: string | object) => {
  const hexParams = serialData(apiPath ?? "", body ?? "");
  event.returnValue = hexParams;
});

ipcMain.on("channel.deserialData", (event, hexParams: string | ArrayBuffer) => {
  try {
    // 2.x FileReader.readAsBinaryString passes Latin-1 bytes rather than hex.
    const input =
      typeof hexParams === "string" && !/^(?:[0-9a-f]{2})+$/i.test(hexParams)
        ? Uint8Array.from(Buffer.from(hexParams, "latin1")).buffer
        : hexParams;
    event.returnValue = deserialData(input);
  } catch (err) {
    LOGGER.warn({ err }, "Unable to decrypt API response");
    event.returnValue = "";
  }
});

ipcMain.on("channel.encodeAnonymousId", (event, id: string) => {
  event.returnValue = Buffer.from(id + " " + encodeAnonymousId(id)).toString("base64");
});

ipcMain.on("channel.serialKey", (event, key: string) => {
  const ciphertext = enData(key, SERIAL_AES_KEY, false);
  event.returnValue = ciphertext;
});
