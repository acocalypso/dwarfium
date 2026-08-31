import React, { useEffect, useState, useContext } from "react";
import Parser, { Item } from "rss-parser";
import { ConnectionContext } from "@/stores/ConnectionContext";
import { getProxyUrl } from "@/lib/get_proxy_url";

const RSSFeed = () => {
  const [feedItems, setFeedItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  let connectionCtx = useContext(ConnectionContext);

  useEffect(() => {
    const parser = new Parser();
    let lat_long_info = "";
    if (connectionCtx.latitude && connectionCtx.longitude) {
      lat_long_info = `&Latitude=${connectionCtx.latitude}&Longitude=${connectionCtx.longitude}`;
    }
    const rssUrl =
      "https://in-the-sky.org/rss.php?feed=deepsky" + lat_long_info;
    console.log(`RSSFeed: rssUrl ${rssUrl}`);
    const fetchFeed = async () => {
      setStatus("loading");
      try {
        const response = await fetch(
          `${getProxyUrl(connectionCtx)}?target=${encodeURIComponent(rssUrl)}`,
        );

        // Check if the response has data
        if (response.ok) {
          console.log(`RSSFeed: status ${response.status}`);
        }
        if (response.ok && response.status === 200) {
          const xmlData = await response.text();

          const feed = await parser.parseString(xmlData);
          const validItems = feed.items.filter((item) => item.isoDate);
          validItems.sort(
            (a, b) =>
              new Date(a.isoDate!).getTime() - new Date(b.isoDate!).getTime(),
          );
          const currentDate = new Date();
          const filteredItems = validItems.filter(
            (item) =>
              new Date(item.isoDate!).getTime() >= currentDate.getTime(),
          );
          const sanitizedItems = filteredItems.map((item) => ({
            ...item,
            title: item.title
              ? item.title.replace(/\(\d+ days? .+\)/, "").trim()
              : "",
          }));
          setFeedItems(sanitizedItems);
          setStatus("ready");
        } else {
          console.error("RSS feed : Error during the request.");
          setStatus("error");
        }
      } catch (error) {
        console.error("Error fetching RSS feed:", error);
        setStatus("error");
      }
    };

    fetchFeed();
  }, [connectionCtx.latitude, connectionCtx.longitude]);

  return (
    <div>
      {status === "loading" && (
        <div className="dw-inline-empty" role="status">
          <i className="bi bi-calendar-event" aria-hidden="true" />
          <h2>Loading celestial events</h2>
          <p>Fetching the latest observing opportunities for your location.</p>
        </div>
      )}
      {status === "error" && (
        <div className="dw-inline-empty" role="alert">
          <i className="bi bi-cloud-slash" aria-hidden="true" />
          <h2>Calendar unavailable</h2>
          <p>
            Dwarfium could not reach the astronomy feed. Check the proxy service
            and try this page again.
          </p>
        </div>
      )}
      {status === "ready" && feedItems.length === 0 && (
        <div className="dw-inline-empty">
          <i className="bi bi-calendar-check" aria-hidden="true" />
          <h2>No upcoming events found</h2>
          <p>The feed has no future events to show right now.</p>
        </div>
      )}
      {feedItems.map((item, index) => (
        <div
          key={index}
          className="comin-divu-main d-grid align-content-center w-100"
        >
          <div className="row align-items-center">
            <div className="col-lg-1 col-md-3 col-sm-3 col-2">
              <figure className="mx-auto mb-3 mb-md-0">
                <img
                  alt="Deep Sky Object"
                  src="/images/astronomy.png"
                  className="img-fluid w-50 w-md-80"
                />
              </figure>
            </div>
            <div className="col-lg-8 col-md-7 col-sm-7 col-8">
              <h5 className="text-white">
                <span className="rss-feed-title">{item.title}</span> <br />
                <span className="rss-feed-pubDate">{item.pubDate}</span>
              </h5>
              <p className="mt-2">{item.contentSnippet}</p>
              <a
                href={item.link}
                className="btn btn-more mt-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read more
              </a>
            </div>
          </div>
        </div>
      ))}
      <br />
    </div>
  );
};

export default RSSFeed;
