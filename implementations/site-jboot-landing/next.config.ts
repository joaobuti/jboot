import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Dev-only: sem isso o Next bloqueia o websocket de HMR quando o dev
  // server e acessado via localhost/127.0.0.1 de fora do container
  // (ver aviso "Blocked cross-origin request to Next.js dev resource"
  // nos logs). Sem HMR, edicoes de codigo so aparecem apos hard refresh
  // manual do navegador, mesmo com o servidor ja compilado corretamente.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
