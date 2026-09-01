import React, { useContext, useEffect, useMemo, useState } from "react";
import Parser, { Item } from "rss-parser";
import { ConnectionContext } from "@/stores/ConnectionContext";
import { getProxyUrl } from "@/lib/get_proxy_url";

type FeedStatus = "loading" | "ready" | "error";

function eventDate(item: Item) {
  return new Date(item.isoDate || item.pubDate || 0);
}

function cleanTitle(title = "Celestial event") {
  return title
    .replace(/^[^:]+:\s*/, "")
    .replace(/\(\d+ days? .+\)/, "")
    .trim();
}

function eventIcon(title = "") {
  const normalized = title.toLowerCase();
  if (normalized.includes("meteor")) return "bi-stars";
  if (normalized.includes("moon") || normalized.includes("lunar"))
    return "bi-moon-stars";
  if (normalized.includes("planet") || normalized.includes("opposition"))
    return "bi-globe";
  if (normalized.includes("galaxy") || normalized.includes("nebula"))
    return "bi-stars";
  return "bi-binoculars";
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

export default function RSSFeed() {
  const connection = useContext(ConnectionContext);
  const [feedItems, setFeedItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<FeedStatus>("loading");
  const [refreshKey, setRefreshKey] = useState(0);
  const hasLocation =
    connection.latitude !== undefined && connection.longitude !== undefined;

  useEffect(() => {
    const controller = new AbortController();
    const parser = new Parser();
    const locationQuery = hasLocation
      ? `&Latitude=${connection.latitude}&Longitude=${connection.longitude}`
      : "";
    const rssUrl =
      "https://in-the-sky.org/rss.php?feed=deepsky" + locationQuery;

    const fetchFeed = async () => {
      setStatus("loading");
      try {
        const response = await fetch(
          `${getProxyUrl(connection)}?target=${encodeURIComponent(rssUrl)}`,
          { signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(`Calendar request failed (${response.status})`);

        const feed = await parser.parseString(await response.text());
        const now = Date.now();
        const upcoming = feed.items
          .filter((item) => {
            const date = eventDate(item);
            return !Number.isNaN(date.getTime()) && date.getTime() >= now;
          })
          .map((item) => ({ ...item, title: cleanTitle(item.title) }))
          .sort((a, b) => eventDate(a).getTime() - eventDate(b).getTime());

        setFeedItems(upcoming);
        setStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Error fetching astronomy calendar:", error);
        setStatus("error");
      }
    };

    void fetchFeed();
    return () => controller.abort();
  }, [
    connection,
    connection.latitude,
    connection.longitude,
    hasLocation,
    refreshKey,
  ]);

  const groupedEvents = useMemo(() => {
    const groups: { key: string; label: string; items: Item[] }[] = [];
    feedItems.forEach((item) => {
      const date = eventDate(item);
      const key = monthKey(date);
      const existing = groups.find((group) => group.key === key);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.push({
          key,
          label: date.toLocaleDateString([], {
            month: "long",
            year: "numeric",
          }),
          items: [item],
        });
      }
    });
    return groups;
  }, [feedItems]);

  const nextEvent = feedItems[0];

  return (
    <div className="dw-celestial-calendar">
      <div className="dw-calendar-toolbar">
        <div>
          <p className="dw-eyebrow">Live astronomy feed</p>
          <h2>Upcoming deep-sky events</h2>
          <p>
            Dates are shown in your local time. Event visibility is
            {hasLocation
              ? " tailored to your observing location."
              : " global until an observing location is set."}
          </p>
        </div>
        <button
          className="dw-button dw-button-secondary"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={status === "loading"}
        >
          <i
            className={`bi bi-arrow-clockwise ${status === "loading" ? "is-spinning" : ""}`}
            aria-hidden="true"
          />
          {status === "loading" ? "Updating…" : "Refresh events"}
        </button>
      </div>

      {status === "ready" && feedItems.length > 0 && (
        <div className="dw-calendar-summary">
          <article>
            <i className="bi bi-calendar3" aria-hidden="true" />
            <span>
              <small>Upcoming events</small>
              <strong>{feedItems.length}</strong>
            </span>
          </article>
          <article>
            <i className="bi bi-clock" aria-hidden="true" />
            <span>
              <small>Next event</small>
              <strong>
                {eventDate(nextEvent).toLocaleDateString([], {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </strong>
            </span>
          </article>
          <article>
            <i className="bi bi-geo-alt" aria-hidden="true" />
            <span>
              <small>Visibility</small>
              <strong>{hasLocation ? "Local" : "Global"}</strong>
            </span>
          </article>
        </div>
      )}

      {status === "loading" && (
        <div className="dw-inline-empty" role="status">
          <span className="dw-spinner" aria-hidden="true" />
          <h2>Loading celestial events</h2>
          <p>Fetching the latest observing opportunities for your location.</p>
        </div>
      )}
      {status === "error" && (
        <div className="dw-inline-empty" role="alert">
          <i className="bi bi-cloud-slash" aria-hidden="true" />
          <h2>Calendar unavailable</h2>
          <p>
            Dwarfium could not reach the astronomy feed. Check the proxy
            service, then try again.
          </p>
          <button
            className="dw-button dw-button-primary"
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      )}
      {status === "ready" && feedItems.length === 0 && (
        <div className="dw-inline-empty">
          <i className="bi bi-calendar-check" aria-hidden="true" />
          <h2>No upcoming events found</h2>
          <p>The feed has no future deep-sky events to show right now.</p>
        </div>
      )}

      {status === "ready" && groupedEvents.length > 0 && (
        <div className="dw-calendar-groups">
          {groupedEvents.map((group) => (
            <section key={group.key} className="dw-calendar-month">
              <div className="dw-calendar-month-heading">
                <h3>{group.label}</h3>
                <span>
                  {group.items.length} event
                  {group.items.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="dw-calendar-events">
                {group.items.map((item) => {
                  const date = eventDate(item);
                  const title = item.title || "Celestial event";
                  return (
                    <article
                      className="dw-calendar-event"
                      key={
                        item.guid ||
                        item.link ||
                        `${date.toISOString()}-${title}`
                      }
                    >
                      <time dateTime={date.toISOString()}>
                        <strong>{date.getDate()}</strong>
                        <span>
                          {date.toLocaleDateString([], { month: "short" })}
                        </span>
                        <small>
                          {date.toLocaleDateString([], { weekday: "short" })}
                        </small>
                      </time>
                      <div className="dw-calendar-event-icon">
                        <i
                          className={`bi ${eventIcon(title)}`}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="dw-calendar-event-content">
                        <div>
                          <h4>{title}</h4>
                          <span>
                            {date.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZoneName: "short",
                            })}
                          </span>
                        </div>
                        {item.contentSnippet && <p>{item.contentSnippet}</p>}
                      </div>
                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open details for ${title}`}
                        >
                          Details
                          <i
                            className="bi bi-arrow-up-right"
                            aria-hidden="true"
                          />
                        </a>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <footer className="dw-calendar-source">
        <i className="bi bi-info-circle" aria-hidden="true" />
        Event data provided by In-The-Sky.org. Exact visibility depends on local
        horizon, weather and light pollution.
      </footer>
    </div>
  );
}
