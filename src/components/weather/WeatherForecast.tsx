import React, { useState, useEffect, useContext } from "react";
import axios from "axios";
import { ConnectionContext } from "@/stores/ConnectionContext";
import { getProxyUrl } from "@/lib/get_proxy_url";
import WeatherForecastDay from "./WeatherForecastDay";

interface ForecastData {
  dt: number;
  weather: { icon: string }[];
  main: { temp_max: number; temp_min: number };
}

function WeatherForecast(props: { coordinates: { lat: number; lon: number } }) {
  const [loaded, setLoaded] = useState(false);
  const [forecast, setForecast] = useState<ForecastData[]>([]);
  const [apiKey] = useState<string>(
    typeof window !== "undefined" ? localStorage.getItem("apiKey") || "" : "",
  );
  let connectionCtx = useContext(ConnectionContext);

  useEffect(() => {
    if (
      props.coordinates &&
      props.coordinates.lat &&
      props.coordinates.lon &&
      apiKey
    ) {
      let units = "metric";
      let lat = props.coordinates.lat;
      let lon = props.coordinates.lon;
      let apiURL = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${units}`;
      if (connectionCtx.proxyIP && getProxyUrl(connectionCtx)) {
        const targetUrl = new URL(apiURL);
        apiURL = `${getProxyUrl(connectionCtx)}?target=${encodeURIComponent(
          targetUrl.href,
        )}`;
      }

      axios
        .get(apiURL)
        .then((response) => {
          const filteredForecast = processForecastData(response.data.list);
          setForecast(filteredForecast);
          setLoaded(true);
        })
        .catch((error) => {
          console.error("Weather forecast API call failed:", error);
          if (error.response && error.response.status === 429) {
            console.error(
              "Error 429: API rate limit exceeded. Try again later.",
            );
            alert(
              "Error 429: You have exceeded the API rate limit. Please try again later.",
            );
          }
        });
    } else {
      console.error("Invalid coordinates or API key provided.");
    }
  }, [props.coordinates, apiKey]);

  const processForecastData = (forecastData: any[]): ForecastData[] => {
    const dailyForecast: { [key: string]: ForecastData } = {};

    forecastData.forEach((entry) => {
      const date = new Date(entry.dt * 1000).toDateString(); // Unieke dag
      const tempMax = entry.main.temp_max;
      const tempMin = entry.main.temp_min;
      const icon = entry.weather[0].icon;

      if (!dailyForecast[date]) {
        dailyForecast[date] = {
          dt: entry.dt,
          weather: [{ icon }],
          main: { temp_max: tempMax, temp_min: tempMin },
        };
      } else {
        dailyForecast[date].main.temp_max = Math.max(
          dailyForecast[date].main.temp_max,
          tempMax,
        );
        dailyForecast[date].main.temp_min = Math.min(
          dailyForecast[date].main.temp_min,
          tempMin,
        );
      }
    });

    return Object.values(dailyForecast);
  };

  if (!loaded) {
    return null;
  }
  return (
    <div className="WeatherForecast">
      <div className="row">
        {forecast.map((dailyForecast, index) => (
          <div className="col" key={index}>
            <WeatherForecastDay data={dailyForecast} />
          </div>
        ))}
      </div>
    </div>
  );
}
export default WeatherForecast;
