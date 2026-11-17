"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ComandaMesa } from "@/modules/pdv/lib/comanda-admin-api";

/**
 * Folha de impressao dos QR de mesa (Sprint 7).
 *
 * O QR e gerado no cliente e impresso pelo proprio navegador (`window.print()`),
 * em vez de PDF gerado no servidor: o conteudo do QR e a URL publica do front
 * (`<origin>/comanda/<token>`), que so o front conhece sem configuracao extra,
 * e o navegador ja resolve paginacao e "salvar como PDF" na propria caixa de
 * impressao.
 */
export function comandaPublicUrl(qrToken: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/comanda/${encodeURIComponent(qrToken)}`;
}

interface ComandaQrSheetProps {
  mesas: ComandaMesa[];
  /** Chamado apos as imagens estarem no DOM e pintadas — nunca antes. */
  onRendered?: () => void;
  onError?: (message: string) => void;
}

export function ComandaQrSheet({ mesas, onRendered, onError }: ComandaQrSheetProps) {
  const [images, setImages] = useState<Record<string, string>>({});
  const printables = mesas.filter((mesa) => mesa.qrToken);
  const ready = printables.length > 0 && printables.every((mesa) => images[mesa.id]);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const entries = await Promise.all(
          printables.map(async (mesa) => {
            const dataUrl = await QRCode.toDataURL(comandaPublicUrl(mesa.qrToken as string), {
              width: 512,
              margin: 1,
              errorCorrectionLevel: "M"
            });
            // Decodifica antes de montar o DOM: `window.print()` fotografa o
            // que ja esta pronto, e imagem so anexada (sem decode) sai em
            // branco na folha.
            const preloaded = new Image();
            preloaded.src = dataUrl;
            if (typeof preloaded.decode === "function") {
              await preloaded.decode().catch(() => undefined);
            }
            return [mesa.id, dataUrl] as const;
          })
        );
        if (!cancelled) {
          setImages(Object.fromEntries(entries));
        }
      } catch (err) {
        if (!cancelled) {
          onError?.(err instanceof Error ? err.message : "Erro ao gerar o QR das mesas");
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
    // Dependencia apenas em `mesas`: `onRendered`/`onError` sao callbacks de
    // efeito colateral e reiniciar a geracao a cada render do pai imprimiria
    // duas vezes. `printables` deriva de `mesas`.
  }, [mesas]);

  /**
   * A impressao so pode disparar depois que o React comitou as imagens no DOM
   * e o browser pintou. Chamar `window.print()` logo apos `setImages` — como
   * na primeira versao — abre a caixa de impressao antes do commit e imprime
   * o cartao sem o QR.
   */
  useEffect(() => {
    if (!ready) {
      return;
    }
    let frame = 0;
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => onRendered?.());
    });
    return () => cancelAnimationFrame(frame);
  }, [ready]);

  return (
    <div className="comanda-qr-sheet">
      <style>{`
        .comanda-qr-sheet { display: none; }
        @media print {
          body * { visibility: hidden; }
          .comanda-qr-sheet, .comanda-qr-sheet * { visibility: visible; }
          .comanda-qr-sheet {
            display: block;
            position: absolute;
            top: 0; left: 0; width: 100%;
            background: #fff; color: #000;
          }
          .comanda-qr-card {
            page-break-inside: avoid;
            break-inside: avoid;
            display: inline-block;
            width: 48%;
            margin: 0 1% 24px 1%;
            padding: 16px;
            border: 1px solid #000;
            border-radius: 8px;
            text-align: center;
            vertical-align: top;
          }
          .comanda-qr-card img { width: 240px; height: 240px; }
          .comanda-qr-number { font-size: 40px; font-weight: 700; line-height: 1.1; }
          .comanda-qr-label { font-size: 16px; margin-bottom: 8px; }
          .comanda-qr-hint { font-size: 13px; margin-top: 8px; }
        }
      `}</style>

      {printables.map((mesa) => (
          <div className="comanda-qr-card" key={mesa.id}>
            <div className="comanda-qr-number">Mesa {mesa.tableNumber}</div>
            {mesa.label && <div className="comanda-qr-label">{mesa.label}</div>}
            {/* `img` cru de proposito: o QR e um data URL gerado no cliente,
                que `next/image` nao otimiza nem precisa otimizar. */}
            {images[mesa.id] ? (
              <img src={images[mesa.id]} alt={`QR da mesa ${mesa.tableNumber}`} />
            ) : null}
            <div className="comanda-qr-hint">Aponte a camera do celular para pedir</div>
          </div>
      ))}
    </div>
  );
}
