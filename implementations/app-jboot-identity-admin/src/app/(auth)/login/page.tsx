"use client";

import React, { Suspense } from "react";
import GlobalLogin from "@/components/auth/GlobalLogin";

export default function LoginPage() {
  return (
    <Suspense>
      <GlobalLogin />
    </Suspense>
  );
}
