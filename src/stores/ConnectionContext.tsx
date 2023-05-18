import React, { createContext, useState } from "react";

import { ConnectionContextType } from "@/types";

type ProviderProps = {
  children: React.ReactNode;
};

export const ConnectionContext = createContext<ConnectionContextType>(
  {} as ConnectionContextType
);

export function ConnectionContextProvider({ children }: ProviderProps) {
  const [connectionStatus, setConnectionStatus] = useState<
    boolean | undefined
  >();
  const [initialConnectionTime, setInitialConnectionTime] = useState<
    number | undefined
  >();
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();

  function deleteSettings() {
    setConnectionStatus(undefined);
    setInitialConnectionTime(undefined);

    setLatitude(undefined);
    setLongitude(undefined);
  }

  function deleteConnection() {
    setConnectionStatus(undefined);
    setInitialConnectionTime(undefined);

  }

  let context = {
    connectionStatus,
    setConnectionStatus,
    initialConnectionTime,
    setInitialConnectionTime,
    latitude,
    setLatitude,
    longitude,
    setLongitude,

    deleteSettings,
    deleteConnection,
  };
  return (
    <ConnectionContext.Provider value={context}>
      {children}
    </ConnectionContext.Provider>
  );
}

export default ConnectionContext;
