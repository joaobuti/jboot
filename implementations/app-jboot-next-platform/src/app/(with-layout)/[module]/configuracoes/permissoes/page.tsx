import { notFound } from "next/navigation";
import { ModuleUserManager } from "@/components/Common/ModuleUserManager";
import type { PlatformModuleSlug } from "@/config/module-settings";

const MODULES = new Set<PlatformModuleSlug>(["pdv", "juridico", "flow"]);

export default async function ModulePermissionsPage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!MODULES.has(module as PlatformModuleSlug)) notFound();

  return <ModuleUserManager />;
}
