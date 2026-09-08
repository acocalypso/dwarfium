import { render, screen, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import FleetPage from "@/pages/fleet";
import { FleetProvider } from "@/stores/FleetContext";
import { FLEET_STORAGE_KEY } from "@/services/fleet/manager";

jest.mock("next/head", () => ({
  __esModule: true,
  default: ({ children }: any) => <>{children}</>,
}));

const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
const session = "00000000-0000-4000-8000-000000000003";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    FLEET_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      devices: [
        {
          id: a,
          alias: "Garden Mini",
          model: "dwarfmini",
          lastKnownHost: "192.0.2.1",
        },
        {
          id: b,
          alias: "Observatory D3",
          model: "dwarf3",
          lastKnownHost: "192.0.2.2",
        },
      ],
      sessions: [
        { id: session, name: "Orion night", createdAt: "2026-09-08T00:00:00Z" },
      ],
    }),
  );
});

test("shows saved offline devices with models and honest unknown status", async () => {
  render(
    <FleetProvider>
      <FleetPage />
    </FleetProvider>,
  );
  const mini = await screen.findByRole("article", { name: "Garden Mini" });
  const d3 = screen.getByRole("article", { name: "Observatory D3" });
  expect(within(mini).getByText("DWARF Mini")).toBeInTheDocument();
  expect(within(d3).getByText("DWARF 3")).toBeInTheDocument();
  expect(within(mini).getByText("Target unknown")).toBeInTheDocument();
  expect(within(mini).getByText("disconnected")).toBeInTheDocument();
});

test("assigning session A persists metadata without assigning B", async () => {
  render(
    <FleetProvider>
      <FleetPage />
    </FleetProvider>,
  );
  const mini = await screen.findByRole("article", { name: "Garden Mini" });
  fireEvent.change(within(mini).getByLabelText("Observing session"), {
    target: { value: session },
  });
  const saved = JSON.parse(localStorage.getItem(FLEET_STORAGE_KEY)!);
  expect(saved.devices.find((value: any) => value.id === a).sessionId).toBe(
    session,
  );
  expect(
    saved.devices.find((value: any) => value.id === b).sessionId,
  ).toBeUndefined();
  expect(within(mini).getByText("disconnected")).toBeInTheDocument();
});

test("offline devices do not offer control commands", async () => {
  render(
    <FleetProvider>
      <FleetPage />
    </FleetProvider>,
  );
  const mini = await screen.findByRole("article", { name: "Garden Mini" });
  expect(
    within(mini).queryByRole("button", { name: "Request control" }),
  ).not.toBeInTheDocument();
  expect(
    within(mini).queryByRole("button", { name: "Release control" }),
  ).not.toBeInTheDocument();
});
