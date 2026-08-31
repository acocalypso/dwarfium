import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import i18n from "@/i18n";
import { useSetupConnection } from "@/hooks/useSetupConnection";
import { useLoadIntialValues } from "@/hooks/useLoadIntialValues";

import RSSFeed from "@/components/RSSFeed";
import PageHeader from "@/components/shared/PageHeader";

export default function AstroCalendar() {
  useSetupConnection();
  useLoadIntialValues();

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
    <div className="dw-page">
      <PageHeader
        eyebrow="Plan"
        title={t("pCalendarTitle")}
        description={`${t("pCalendarYear")} ${new Date().getFullYear()} · upcoming celestial events and observing opportunities.`}
      />
      <section className="dw-panel dw-calendar-feed">
        <RSSFeed />
      </section>
    </div>
  );
}
