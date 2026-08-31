import { useContext, useEffect, useState } from "react";

import { ConnectionContext } from "@/stores/ConnectionContext";
import { useLoadIntialValues } from "@/hooks/useLoadIntialValues";
import { deleteLogMessagesDb, saveLoggerStatusDb } from "@/db/db_utils";
import DebugMessageItem from "./LogMessageItem";

export default function DebugMessages() {
  let connectionCtx = useContext(ConnectionContext);
  useLoadIntialValues();
  let [messages, setMessages] = useState(connectionCtx.logger);

  // React context cannot update state between different browser tabs.
  // Use local storage events instead of React context to show new messages
  // whenever messages are added to local storage.
  // https://dev.to/cassiolacerda/how-to-syncing-react-state-across-multiple-tabs-with-usestate-hook-4bdm
  useEffect(() => {
    const onStorageUpdate = (e: any) => {
      const { key, newValue } = e;
      if (key === "logMessages") {
        setMessages(JSON.parse(newValue));
      }
    };

    window.addEventListener("storage", onStorageUpdate);
    return () => {
      window.removeEventListener("storage", onStorageUpdate);
    };
  }, []);

  function deleteHandler() {
    connectionCtx.setLogger(undefined);
    deleteLogMessagesDb();
    setMessages(undefined);
  }

  function toggleLogger() {
    if (connectionCtx.loggerStatus) {
      saveLoggerStatusDb("false");
    } else {
      saveLoggerStatusDb("true");
    }

    connectionCtx.setLoggerStatus((prev) => !prev);
  }

  let displayMessages = messages?.length ? messages : connectionCtx.logger;

  return (
    <div>
      <h2>Message log</h2>
      <p>
        Turn on logging to record messages exchanged between Dwarfium and your
        DWARF. Messages are shown from oldest to newest and stay on this device.
      </p>
      <div className="mb-3 dw-log-status">
        <span
          className={`dw-badge ${connectionCtx.loggerStatus ? "is-ready" : ""}`}
        >
          Logger {connectionCtx.loggerStatus ? "on" : "off"}
        </span>
        {connectionCtx.loggerStatus && (
          <span>, {displayMessages?.length || 0} messages</span>
        )}
      </div>
      {!connectionCtx.loggerStatus && (
        <button className="dw-button" onClick={toggleLogger}>
          Turn on logger
        </button>
      )}
      {connectionCtx.loggerStatus && (
        <>
          <button
            className="dw-button is-secondary me-3"
            onClick={toggleLogger}
          >
            Turn off logger
          </button>
          <button className="dw-button" onClick={deleteHandler}>
            Delete all messages
          </button>
        </>
      )}
      {connectionCtx.loggerStatus &&
        displayMessages &&
        displayMessages.map((m, i) => <DebugMessageItem key={i} message={m} />)}
    </div>
  );
}
