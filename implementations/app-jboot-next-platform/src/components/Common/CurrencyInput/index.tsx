"use client";

import React, { useEffect, useRef, useState } from "react";
import { Input, InputGroup, InputGroupText } from "reactstrap";

export interface CurrencyInputProps {
  value: string;
  onChange: (rawDecimal: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  size?: "sm" | "lg";
}

function toCents(raw: string): number {
  const num = parseFloat(raw);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

function formatCents(cents: number): string {
  if (cents === 0) return "";
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function CurrencyInput({ value, onChange, onKeyDown, required, disabled, placeholder = "0,00", size }: CurrencyInputProps) {
  const [display, setDisplay] = useState(() => formatCents(toCents(value)));
  const syncedValueRef = useRef(value);

  // Re-sync when the parent resets the value (modal open/close, startEdit)
  useEffect(() => {
    if (value !== syncedValueRef.current) {
      syncedValueRef.current = value;
      setDisplay(formatCents(toCents(value)));
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "");
    const cents = parseInt(digits || "0", 10);
    const rawDecimal = cents === 0 ? "" : (cents / 100).toFixed(2);
    const newDisplay = formatCents(cents);

    syncedValueRef.current = rawDecimal;
    setDisplay(newDisplay);
    onChange(rawDecimal);
  }

  return (
    <InputGroup size={size}>
      <InputGroupText>R$</InputGroupText>
      <Input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
      />
    </InputGroup>
  );
}
