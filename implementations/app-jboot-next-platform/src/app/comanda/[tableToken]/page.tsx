"use client";

import React from "react";
import { useParams } from "next/navigation";
import ComandaApp from "@/modules/comanda/components/ComandaApp";

export default function ComandaTablePage() {
  const params = useParams<{ tableToken: string }>();
  const tableToken = decodeURIComponent(params.tableToken);

  return <ComandaApp tableToken={tableToken} />;
}
