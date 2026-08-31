import React, { useState, useEffect, useContext } from "react";
import { ConnectionContext } from "@/stores/ConnectionContext";
import { ConnectionContextType } from "@/types";
import { getProxyUrl } from "@/lib/get_proxy_url";
import WeatherInfo from "./weather/WeatherInfo";
import WeatherForecast from "./weather/WeatherForecast";
import axios, { AxiosError, AxiosResponse } from "axios";
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

interface OpenWeatherForecastResponse {
  cod?: number | string;
  message?: string;
  city?: {
    coord?: { lat: number; lon: number };
    name?: string;
  };
  list?: Array<{
    dt?: number;
    main?: {
      temp?: number;
      temp_min?: number;
      temp_max?: number;
      feels_like?: number;
      humidity?: number;
    };
    wind?: { speed?: number };
    weather?: Array<{ description?: string; icon?: string }>;
  }>;
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
  const [isLoading, setIsLoading] = useState(false);
  let connectionCtx = useContext(ConnectionContext);

  useEffect(() => {
    if (apiKey && cityInput) {
      search(cityInput, connectionCtx);
    }
  }, []); // Empty dependency array means this runs once on mount

  function handleResponse(
    response: AxiosResponse<OpenWeatherForecastResponse>,
  ) {
    const data = response.data;
    const current = data.list?.[0];
    const conditions = current?.weather?.[0];

    if (
      !data.city?.coord ||
      !data.city.name ||
      typeof current?.dt !== "number" ||
      typeof current.main?.temp !== "number" ||
      typeof current.main.temp_min !== "number" ||
      typeof current.main.temp_max !== "number" ||
      typeof current.main.feels_like !== "number" ||
      typeof current.main.humidity !== "number" ||
      typeof current.wind?.speed !== "number" ||
      !conditions?.description ||
      !conditions.icon
    ) {
      const responseCode = Number(data.cod);
      if (responseCode === 401) {
        setError("OpenWeather rejected the API key. Check it and try again.");
      } else if (responseCode === 404) {
        setError("City not found. Check the spelling and try again.");
      } else {
        setError(
          data.message ||
            "OpenWeather returned an incomplete forecast. Please try again.",
        );
      }
      setWeatherData({ ready: false });
      return;
    }

    setWeatherData({
      ready: true,
      coordinates: data.city.coord,
      city: data.city.name,
      date: new Date(current.dt * 1000),
      temperature: current.main.temp,
      temp_min: current.main.temp_min,
      temp_max: current.main.temp_max,
      feels_like: current.main.feels_like,
      humidity: current.main.humidity,
      wind: current.wind.speed,
      description: conditions.description,
      icon: conditions.icon,
    });
    setError(null);
    localStorage.setItem("city", data.city.name);
  }

  function search(city: string, connectionCtx: ConnectionContextType) {
    const normalizedCity = city.trim();
    const normalizedApiKey = apiKey.trim();
    setError(null);

    if (!normalizedCity) {
      setError("Enter a city before loading the weather forecast.");
      return;
    }
    if (!normalizedApiKey) {
      setError("Enter your OpenWeather API key before loading the forecast.");
      return;
    }

    setIsLoading(true);
    let apiUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(normalizedCity)}&appid=${encodeURIComponent(normalizedApiKey)}&units=metric`;
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
        if (error.response?.status === 401) {
          setError("OpenWeather rejected the API key. Check it and try again.");
        } else if (error.response?.status === 404) {
          setError("City not found. Check the spelling and try again.");
        } else if (error.response?.status === 429) {
          setError(
            "OpenWeather request limit reached. Please try again later.",
          );
        } else {
          setError("The weather forecast could not be loaded. Please try again.");
        }
        setWeatherData({ ready: false });
      })
      .finally(() => setIsLoading(false));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    search(cityInput, connectionCtx);
  }

  function handleCityInput(event: React.ChangeEvent<HTMLInputElement>) {
    setCityInput(event.target.value);
    setError(null);
  }

  function handleApiKeyChange(event: React.ChangeEvent<HTMLInputElement>) {
    setApiKey(event.target.value);
    setError(null);
  }

  function handleSaveApiKey(event: React.FormEvent<HTMLButtonElement>) {
    event.preventDefault();
    const normalizedApiKey = apiKey.trim();
    if (!normalizedApiKey) {
      setError("Enter an OpenWeather API key before saving it.");
      return;
    }
    localStorage.setItem("apiKey", normalizedApiKey);
    setApiKey(normalizedApiKey);
    setError(null);
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
          <button type="submit" className="dw-button" disabled={isLoading}>
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
        <div className="Error" role="alert">
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
            {isLoading ? t("pWeatherLoading") : "Add your forecast source"}
          </h2>
          <p>
            {isLoading
              ? "Fetching the latest conditions…"
              : "Enter a city and OpenWeather API key to load observing conditions."}
          </p>
        </div>
      )}
    </div>
  );
}

export default Weather;
