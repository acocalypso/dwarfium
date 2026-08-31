import DwarfIIStatus from "@/components/DwarfIIStatus";
import { useSetupConnection } from "@/hooks/useSetupConnection";
import { useLoadIntialValues } from "@/hooks/useLoadIntialValues";
import PageHeader from "@/components/shared/PageHeader";

export default function DwarfiiStatusPage() {
  useSetupConnection();
  useLoadIntialValues();

  return (
    <div className="dw-page">
      <PageHeader
        eyebrow="Device"
        title="Device status"
        description="Inspect live telescope telemetry, hardware state and active camera settings."
      />
      <section className="dw-panel dw-tool-panel">
        <DwarfIIStatus />
      </section>
    </div>
  );
}
