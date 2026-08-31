import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import Weather from "@/components/Weather";
import { ConnectionContext } from "@/stores/ConnectionContext";
import { ConnectionContextType } from "@/types";

jest.mock("axios");
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        cCloudsSearch: "Search",
        cCloudsSaveAPIKey: "Save API key",
        cCloudsCityInput: "Enter a city",
        cCloudsApiKeyInput: "Enter an API key",
        pWeatherLoading: "Loading…",
      })[key] || key,
  }),
}));
jest.mock("@/i18n", () => ({
  __esModule: true,
  default: { changeLanguage: jest.fn() },
}));
jest.mock("@/components/weather/WeatherInfo", () => () => null);
jest.mock("@/components/weather/WeatherForecast", () => () => null);

const mockedAxios = axios as jest.Mocked<typeof axios>;

function renderWeather() {
  return render(
    <ConnectionContext.Provider value={{} as ConnectionContextType}>
      <Weather />
    </ConnectionContext.Provider>,
  );
}

describe("Weather", () => {
  beforeEach(() => {
    localStorage.clear();
    mockedAxios.get.mockReset();
  });

  it("asks for an API key without sending an invalid request", () => {
    renderWeather();

    fireEvent.change(screen.getByLabelText("City"), {
      target: { value: "Berlin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter your OpenWeather API key before loading the forecast.",
    );
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it("handles an OpenWeather error payload returned through the proxy", async () => {
    localStorage.setItem("city", "Berlin");
    localStorage.setItem("apiKey", "invalid-key");
    mockedAxios.get.mockResolvedValue({
      data: { cod: 401, message: "Invalid API key" },
    });

    renderWeather();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "OpenWeather rejected the API key. Check it and try again.",
      ),
    );
  });
});
