import ConnectDwarf from "@/components/setup/ConnectDwarf";
import ConnectStellarium from "@/components/setup/ConnectStellarium";
import AppDebugger from "@/components/setup/Debugger";
import SetLocation from "@/components/setup/SetLocation";
import { useSetupConnection } from "@/hooks/useSetupConnection";
import StatusBar from "@/components/shared/StatusBar";
import { useLoadIntialValues } from "@/hooks/useLoadIntialValues";

export default function SetupScope() {
  useSetupConnection();
  useLoadIntialValues();

  return (
    <div>
      <StatusBar mode="setup" />
      <SetLocation />
      <hr />
      <ConnectDwarf />
      <hr />
      <ConnectStellarium />
      <hr />
      <AppDebugger />
    </div>
  );
}
