import { Metadata } from "next";
import { Container } from "reactstrap";
import GoogleDriveSettingsPage from "@/modules/kanban/components/drive/GoogleDriveSettingsPage";

export const metadata: Metadata = { title: "Google Drive | JBoot Flow" };

export default function FlowGoogleDrivePage() {
  return <div className="page-content"><Container fluid><GoogleDriveSettingsPage /></Container></div>;
}
