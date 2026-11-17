"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Cookies from "js-cookie";
import { getBranding, IdentityBranding, saveBranding } from "@/lib/identity-applications";

const FALLBACK_LOGO_LIGHT = "/brand/jboot/logo-white.png";
const FALLBACK_LOGO_DARK = "/brand/jboot/logo-black.png";
const MAX_UPLOAD_BYTES = 144 * 1024;

interface BrandLogoProps {
  sidebarType?: string;
  small?: boolean;
}

function isDarkSidebar(sidebarType?: string): boolean {
  return sidebarType !== "light";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function BrandLogo({ sidebarType, small = false }: BrandLogoProps) {
  const [branding, setBranding] = useState<IdentityBranding | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const accessToken = Cookies.get("accessToken");
  const fallbackLogo = isDarkSidebar(sidebarType) ? FALLBACK_LOGO_DARK : FALLBACK_LOGO_LIGHT;
  const logoSrc = branding?.logoDataUrl || fallbackLogo;
  const alt = branding?.displayName || "JBoot";

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;
    void getBranding(accessToken).then(currentBranding => {
      if (active) {
        setBranding(currentBranding);
      }
    });

    return () => {
      active = false;
    };
  }, [accessToken]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !accessToken) {
      return;
    }

    if (!file.type.startsWith("image/") || file.size > MAX_UPLOAD_BYTES) {
      window.alert("Envie uma imagem PNG, JPG, WEBP ou SVG com ate 144 KB.");
      return;
    }

    setIsSaving(true);
    try {
      const logoDataUrl = await readFileAsDataUrl(file);
      const nextBranding = await saveBranding(accessToken, {
        ...branding,
        logoDataUrl,
      });
      setBranding(nextBranding);
    } catch {
      window.alert("Nao foi possivel salvar o logo agora.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="brand-logo-editor">
      <Link href="/" className="brand-logo-editor__link" aria-label={alt}>
        <img
          src={logoSrc}
          alt={alt}
          className={small ? "brand-logo-editor__image-sm" : "brand-logo-editor__image"}
        />
      </Link>
      {!small && (
        <>
          <button
            type="button"
            className="brand-logo-editor__button"
            aria-label="Alterar logo"
            title="Alterar logo"
            disabled={isSaving || !accessToken}
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              inputRef.current?.click();
            }}
          >
            <i className={isSaving ? "ri-loader-4-line" : "ri-pencil-line"} />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="d-none"
            onChange={handleUpload}
          />
        </>
      )}
    </div>
  );
}
