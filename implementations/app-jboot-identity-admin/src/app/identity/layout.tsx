import React from "react";
import Layout from "@/layouts/Layouts";

export default function IdentityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Layout>{children}</Layout>;
}
