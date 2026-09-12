import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { FleetManager } from "@/services/fleet/manager";

const FleetContext = createContext<FleetManager | undefined>(undefined);

export function FleetProvider({ children }: { children: ReactNode }) {
  const [manager] = useState(() => new FleetManager());
  const [error, setError] = useState<string>();
  useEffect(() => {
    try {
      manager.initialize(localStorage, setError);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
    return () => manager.dispose();
  }, [manager]);
  return (
    <FleetContext.Provider value={manager}>
      {error && (
        <div role="alert" className="alert alert-warning">
          {error}
        </div>
      )}
      {children}
    </FleetContext.Provider>
  );
}

export function useFleet() {
  const manager = useContext(FleetContext);
  if (!manager) throw new Error("FleetProvider is required.");
  return manager;
}

export function useFleetRegistry() {
  const { registry } = useFleet();
  return useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot,
  );
}
