import React, { useState, useEffect, useContext } from "react";
import { ConnectionContext } from "@/stores/ConnectionContext";
import { ConnectionContextType } from "@/types";
import { getProxyUrl } from "@/lib/get_proxy_url";
import WeatherInfo from "./weather/WeatherInfo";
import WeatherForecast from "./weather/WeatherForecast";
import axios, { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

interface WeatherData {
  ready: boolean;
  coordinates?: { lat: number; lon: number };
  city?: string;
  date?: Date;
  temperature?: number;
  temp_min?: number;
  temp_max?: number;
  feels_like?: number;
  humidity?: number;
  wind?: number;
  description?: string;
  icon?: string;
}

function Weather() {
  const [cityInput, setCityInput] = useState(
    typeof window !== "undefined" ? localStorage.getItem("city") || "" : "",
  );
  const [apiKey, setApiKey] = useState(
    typeof window !== "undefined" ? localStorage.getItem("apiKey") || "" : "",
  );
  const [weatherData, setWeatherData] = useState<WeatherData>({ ready: false });
  const [error, setError] = useState<string | null>(null);
  let connectionCtx = useContext(ConnectionContext);

  useEffect(() => {
    if (apiKey && cityInput) {
      search(cityInput, connectionCtx);
    }
  }, []); // Empty dependency array means this runs once on mount

  function handleResponse(response) {
    setWeatherData({
      ready: true,
      coordinates: response.data.city.coord,
      city: response.data.city.name,
      date: new Date(response.data.list[0].dt * 1000),
      temperature: response.data.list[0].main.temp,
      temp_min: response.data.list[0].main.temp_min,
      temp_max: response.data.list[0].main.temp_max,
      feels_like: response.data.list[0].main.feels_like,
      humidity: response.data.list[0].main.humidity,
      wind: response.data.list[0].wind.speed,
      description: response.data.list[0].weather[0].description,
      icon: response.data.list[0].weather[0].icon,
    });
    localStorage.setItem("city", response.data.city.name);
  }

  function search(city: string, connectionCtx: ConnectionContextType) {
    let apiUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${apiKey}&units=metric`;
    if (connectionCtx.proxyIP && getProxyUrl(connectionCtx)) {
      const targetUrl = new URL(apiUrl);
      apiUrl = `${getProxyUrl(connectionCtx)}?target=${encodeURIComponent(
        targetUrl.href,
      )}`;
    }
    axios
      .get(apiUrl)
      .then(handleResponse)
      .catch((error: AxiosError) => {
        console.error("Weather data fetch error:", error);
        if (error.response && error.response.status === 429) {
          setError(
            "Error 429: You have exceeded the API rate limit. Please try again later.",
          );
        } else {
          setError("An error occurred while fetching weather data.");
        }
      });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cityInput) {
      search(cityInput, connectionCtx);
    }
  }

  function handleCityInput(event: React.ChangeEvent<HTMLInputElement>) {
    setCityInput(event.target.value);
  }

  function handleApiKeyChange(event: React.ChangeEvent<HTMLInputElement>) {
    setApiKey(event.target.value);
  }

  function handleSaveApiKey(event: React.FormEvent<HTMLButtonElement>) {
    event.preventDefault();
    localStorage.setItem("apiKey", apiKey);
  }

  const { t } = useTranslation();
  // eslint-disable-next-line no-unused-vars
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");

  useEffect(() => {
    const storedLanguage = localStorage.getItem("language");
    if (storedLanguage) {
      setSelectedLanguage(storedLanguage);
      i18n.changeLanguage(storedLanguage);
    }
  }, []);

  return (
    <div className="Weather">
      <form onSubmit={handleSubmit} className="dw-conditions-form">
        <label>
          <span>City</span>
          <input
            type="search"
            value={cityInput}
            placeholder={t("cCloudsCityInput")}
            className="form-control-weather"
            onChange={handleCityInput}
          />
        </label>
        <label>
          <span>OpenWeather API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={handleApiKeyChange}
            placeholder={t("cCloudsApiKeyInput")}
            className="form-control-weather"
          />
        </label>
        <div className="dw-action-row">
          <button type="submit" className="dw-button">
            <i className="bi bi-search" aria-hidden="true" />
            {t("cCloudsSearch")}
          </button>
          <button
            type="button"
            onClick={handleSaveApiKey}
            className="dw-button is-secondary"
          >
            {t("cCloudsSaveAPIKey")}
          </button>
        </div>
      </form>
      {error ? (
        <div className="Error">
          <p>{error}</p>
        </div>
      ) : weatherData.ready ? (
        <>
          <WeatherInfo infoData={weatherData} />
          <WeatherForecast
            coordinates={weatherData.coordinates || { lat: 0, lon: 0 }}
          />
        </>
      ) : (
        <div className="dw-inline-empty">
          <i className="bi bi-cloud-moon" aria-hidden="true" />
          <h2>
            {cityInput && apiKey
              ? t("pWeatherLoading")
              : "Add your forecast source"}
          </h2>
          <p>
            {cityInput && apiKey
              ? "Fetching the latest conditions…"
              : "Enter a city and OpenWeather API key to load observing conditions."}
          </p>
        </div>
      )}
    </div>
  );
}

export default Weather;
