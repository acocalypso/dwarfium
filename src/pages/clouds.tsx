import React, { useState, useEffect, useRef, useContext } from "react";
import axios from "axios";
import { ConnectionContext } from "@/stores/ConnectionContext";
import { getProxyUrl } from "@/lib/get_proxy_url";
import CustomChart from "@/components/clouds/Chart";
import Daypicker from "@/components/clouds/Daypicker";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import PageHeader from "@/components/shared/PageHeader";

const Clouds = () => {
  const [forecastTimes, setForecastTimes] = useState<string[]>([]);
  const [cloudArray, setCloudArray] = useState<string[]>([]);
  const [humidityArray, setHumidityArray] = useState<number[]>([]);
  const [windArray, setWindArray] = useState<number[]>([]);
  const [apiKey, setApiKey] = useState(
    typeof window !== "undefined" ? localStorage.getItem("apiKey") || "" : "",
  );
  const [city, setCity] = useState(
    typeof window !== "undefined" ? localStorage.getItem("city") || "" : "",
  );
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [initialRequestMade, setInitialRequestMade] = useState(false);
  const [apiRequestCount, setApiRequestCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const cityInputRef = useRef<HTMLInputElement>(null);
  let connectionCtx = useContext(ConnectionContext);

  useEffect(() => {
    setIsClient(true);

    const fetchData = async () => {
      if (city && apiKey) {
        try {
          let apiUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${apiKey}`;
          if (connectionCtx.proxyIP && getProxyUrl(connectionCtx)) {
            const targetUrl = new URL(apiUrl);
            apiUrl = `${getProxyUrl(connectionCtx)}?target=${encodeURIComponent(
              targetUrl.href,
            )}`;
          }
          const response = await axios.get(apiUrl);

          setSelectedDate((prevDate) => {
            const newDate = new Date(prevDate);
            newDate.setHours(23, 0, 0, 0);
            return newDate;
          });

          const weatherTonight = response.data.list.filter((weathersingle) => {
            const currentTime = new Date(weathersingle.dt * 1000).getTime();
            const lowerBound = selectedDate.getTime() - 3600000 * 6;
            const upperBound = selectedDate.getTime() + 3600000 * 12;
            return currentTime >= lowerBound && currentTime <= upperBound;
          });

          setForecastTimes(
            weatherTonight.map((hr) => hr.dt_txt.substring(11, 16)),
          );
          setCloudArray(weatherTonight.map((hr) => hr.clouds.all));
          setHumidityArray(weatherTonight.map((hr) => hr.main.humidity));
          setWindArray(weatherTonight.map((hr) => hr.wind.speed));

          setInitialRequestMade(true);
          setApiRequestCount((prevCount) => prevCount + 1);
          console.log(
            "API Request Successful. Total API Requests Made:",
            apiRequestCount + 1,
          );
        } catch (error: any) {
          if (error.response && error.response.status === 429) {
            setErrorMessage(
              "Too many requests. Please wait before trying again.",
            );
          } else if (error.response && error.response.status === 500) {
            setErrorMessage("Internal server error. Please try again later.");
          } else {
            setError(error.message);
            console.error("API Request Failed:", error.message);
          }
        }
      }
    };

    if (!initialRequestMade && city && apiKey) {
      fetchData();
    }
  }, [city, apiKey, selectedDate, initialRequestMade, apiRequestCount]);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
    setInitialRequestMade(false);
    setErrorMessage("");
  };

  const handleApiKeySave = (e: React.FormEvent<HTMLButtonElement>) => {
    e.preventDefault();
    localStorage.setItem("apiKey", apiKey);
    setInitialRequestMade(false);
    setErrorMessage("");
  };

  const handleSearch = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    fetchData();
  };

  const handleSearchWithCityChange = (
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const newCityValue = cityInputRef.current?.value || "";
    setCity(newCityValue);
    handleSearch(e);
  };

  // eslint-disable-next-line no-unused-vars
  const handleDateChange = (newDate: Date | ((prevState: Date) => Date)) => {
    if (typeof newDate === "function") {
      setSelectedDate((prevState) => newDate(prevState));
    } else {
      setSelectedDate(newDate);
    }
    setInitialRequestMade(false);
    setErrorMessage("");
  };

  const fetchData = async () => {
    setErrorMessage("");
    try {
      let apiUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${apiKey}`;
      if (connectionCtx.proxyIP && getProxyUrl(connectionCtx)) {
        const targetUrl = new URL(apiUrl);
        apiUrl = `${getProxyUrl(connectionCtx)}?target=${encodeURIComponent(
          targetUrl.href,
        )}`;
      }
      const response = await axios.get(apiUrl);

      setSelectedDate((prevDate) => {
        const newDate = new Date(prevDate);
        newDate.setHours(23, 0, 0, 0);
        return newDate;
      });

      const weatherTonight = response.data.list.filter((weathersingle) => {
        const currentTime = new Date(weathersingle.dt * 1000).getTime();
        const lowerBound = selectedDate.getTime() - 3600000 * 6;
        const upperBound = selectedDate.getTime() + 3600000 * 12;
        return currentTime >= lowerBound && currentTime <= upperBound;
      });

      setForecastTimes(weatherTonight.map((hr) => hr.dt_txt.substring(11, 16)));
      setCloudArray(weatherTonight.map((hr) => hr.clouds.all));
      setHumidityArray(weatherTonight.map((hr) => hr.main.humidity));
      setWindArray(weatherTonight.map((hr) => hr.wind.speed));

      setInitialRequestMade(true);
      setApiRequestCount((prevCount) => prevCount + 1);
      console.log(
        "API Request Successful. Total API Requests Made:",
        apiRequestCount + 1,
      );
    } catch (error: any) {
      if (error.response && error.response.status === 429) {
        setErrorMessage("Too many requests. Please wait before trying again.");
      } else if (error.response && error.response.status === 500) {
        setErrorMessage("Internal server error. Please try again later.");
      } else {
        setError(error.message);
        console.error("API Request Failed:", error.message);
      }
    }
  };
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
    <>
      {isClient && (
        <div className="dw-page">
          <PageHeader
            eyebrow="Conditions"
            title="Cloud forecast"
            description="Compare cloud cover, humidity and wind across the observing window."
          />
          <section className="dw-panel dw-conditions-panel">
            <form className="dw-conditions-form">
              <label>
                <span>City</span>
                <input
                  type="search"
                  defaultValue={city}
                  ref={cityInputRef}
                  placeholder={t("cCloudsCityInput")}
                  className="form-control-weather"
                />
              </label>
              <label>
                <span>OpenWeather API key</span>
                <input
                  type="password"
                  value={apiKey}
                  placeholder={t("cCloudsApiKeyInput")}
                  className="form-control-weather"
                  onChange={handleApiKeyChange}
                />
              </label>
              <div className="dw-action-row">
                <button
                  type="button"
                  className="dw-button"
                  onClick={handleSearchWithCityChange}
                >
                  {t("cCloudsSearch")}
                </button>
                <button
                  type="button"
                  className="dw-button is-secondary"
                  onClick={handleApiKeySave}
                >
                  {t("cCloudsSaveAPIKey")}
                </button>
                <Daypicker
                  selectedDate={selectedDate}
                  setSelectedDate={handleDateChange}
                />
              </div>
            </form>
            {error && (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            )}
            {errorMessage && (
              <div className="alert alert-warning" role="alert">
                {errorMessage}
              </div>
            )}
            {forecastTimes.length > 0 ? (
              <CustomChart
                forecastTimes={forecastTimes}
                cloudArray={cloudArray}
                humidityArray={humidityArray.map(String)}
                windArray={windArray.map(String)}
              />
            ) : (
              <div className="dw-inline-empty">
                <i className="bi bi-clouds" aria-hidden="true" />
                <h2>No forecast loaded</h2>
                <p>Enter a city and API key to see tonight’s cloud outlook.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
};

export default Clouds;
