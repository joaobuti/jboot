"use client";

import React, { useEffect, useRef, useState } from "react";
import { Input, Spinner } from "reactstrap";

export interface CepAddress {
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
}

interface ViaCepResponse {
  erro?: boolean;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
}

export interface CepInputProps {
  value: string;
  onChange: (maskedValue: string) => void;
  onAddressFound?: (address: CepAddress) => void;
  disabled?: boolean;
  required?: boolean;
}

function applyCepMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function CepInput({ value, onChange, onAddressFound, disabled, required }: CepInputProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onAddressFoundRef = useRef(onAddressFound);
  onAddressFoundRef.current = onAddressFound;

  const digits = value.replace(/\D/g, "");

  useEffect(() => {
    if (digits.length !== 8) {
      setError(null);
      return;
    }

    const abort = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: abort.signal })
      .then((res) => res.json() as Promise<ViaCepResponse>)
      .then((data) => {
        if (data.erro) {
          setError("CEP não encontrado");
          return;
        }
        onAddressFoundRef.current?.({
          logradouro: data.logradouro ?? "",
          complemento: data.complemento ?? "",
          bairro: data.bairro ?? "",
          localidade: data.localidade ?? "",
          uf: data.uf ?? "",
          ibge: data.ibge ?? ""
        });
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError("Erro ao consultar CEP");
      })
      .finally(() => setLoading(false));

    return () => abort.abort();
  }, [digits]);

  return (
    <div className="position-relative">
      <Input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(applyCepMask(e.target.value))}
        disabled={disabled || loading}
        required={required}
        placeholder="00000-000"
        maxLength={9}
        invalid={!!error}
        style={{ paddingRight: loading ? "2rem" : undefined }}
      />
      {loading && (
        <span
          className="position-absolute top-50 end-0 translate-middle-y pe-2"
          style={{ pointerEvents: "none" }}
        >
          <Spinner size="sm" color="primary" />
        </span>
      )}
      {error && (
        <div className="text-danger" style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
          {error}
        </div>
      )}
    </div>
  );
}
