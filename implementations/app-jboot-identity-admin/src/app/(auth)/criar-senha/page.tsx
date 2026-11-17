"use client";

import React, { Suspense } from "react";
import SetPassword from "@/components/auth/SetPassword";

export default function CriarSenhaPage() {
  return (
    <Suspense>
      <SetPassword />
    </Suspense>
  );
}
