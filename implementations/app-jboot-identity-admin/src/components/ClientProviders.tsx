"use client";

import React from "react";
import { Providers } from "@/providers";
import { Toaster } from "react-hot-toast";
import FakeBackendProvider from "./providers/FakeBackendProvider";
import BrowserTitle from "./BrowserTitle";

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FakeBackendProvider>
      <Providers>
        <BrowserTitle />
        {children}
        <Toaster position="top-right" />
      </Providers>
    </FakeBackendProvider>
  );
}
