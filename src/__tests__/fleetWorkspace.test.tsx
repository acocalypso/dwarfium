import { useContext } from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { FleetProvider } from "@/stores/FleetContext";
import {
  ConnectionContext,
  ConnectionContextProvider,
} from "@/stores/ConnectionContext";
import FleetStatusBar from "@/components/fleet/FleetStatusBar";
import FleetWorkspace from "@/components/fleet/FleetWorkspace";
import { FLEET_STORAGE_KEY } from "@/services/fleet/manager";

jest.mock("next/router", () => ({ useRouter: () => ({ pathname: "/" }) }));
const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
function Page() {
  const context = useContext(ConnectionContext);
  return (
    <>
      <span data-testid="host">{context.IPDwarf}</span>
      <span data-testid="state">{String(context.connectionStatus)}</span>
    </>
  );
}
test("selection gates the page and routes context to only the chosen registration", () => {
  localStorage.setItem(
    FLEET_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      sessions: [],
      devices: [
        {
          id: a,
          alias: "Mini",
          model: "dwarfmini",
          lastKnownHost: "192.0.2.1",
        },
        { id: b, alias: "D3", model: "dwarf3", lastKnownHost: "192.0.2.2" },
      ],
    }),
  );
  render(
    <FleetProvider>
      <ConnectionContextProvider>
        <FleetStatusBar />
        <FleetWorkspace>
          <Page />
        </FleetWorkspace>
      </ConnectionContextProvider>
    </FleetProvider>,
  );
  expect(screen.queryByTestId("host")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Target device" }), {
    target: { value: a },
  });
  expect(screen.getByTestId("host")).toHaveTextContent("192.0.2.1");
  expect(screen.getByTestId("state")).toHaveTextContent("false");
  fireEvent.change(screen.getByRole("combobox", { name: "Target device" }), {
    target: { value: b },
  });
  expect(screen.getByTestId("host")).toHaveTextContent("192.0.2.2");
  expect(
    screen.getByRole("button", { name: /Mini disconnected/ }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: /D3 disconnected/ })).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Target device" }), {
    target: { value: "" },
  });
  expect(screen.queryByTestId("host")).not.toBeInTheDocument();
  localStorage.clear();
});
