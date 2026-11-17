"use client";

import React, { useState } from "react";
import { Alert, Button, Form, FormGroup, Input, Label, Spinner } from "reactstrap";
import styles from "./ComandaPublic.module.css";

export interface IdentifyFormProps {
  onSubmit: (identity: { phone?: string; documentNumber?: string }) => Promise<void>;
  tableNumber: number | null;
}

type IdentifyMode = "phone" | "document";

export default function IdentifyForm({ onSubmit, tableNumber }: IdentifyFormProps) {
  const [mode, setMode] = useState<IdentifyMode>("phone");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Informe seu telefone ou CPF para continuar.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(mode === "phone" ? { phone: trimmed } : { documentNumber: trimmed });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel identificar a comanda.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.identifyShell}>
      <div className={styles.identifyPanel}>
        <div className={styles.identifyHeader}>
          <div className="d-flex align-items-start justify-content-between gap-3">
            <div>
              <div className={styles.brandRow}>
                <img src="/brand/jboot/logo-white.png" alt="JBoot" className={styles.brandLogo} />
              </div>
              <h1 className="h4 mt-4 mb-1">Comanda digital</h1>
              <div className="text-white-50">Identifique-se para continuar.</div>
            </div>
            {tableNumber !== null && <span className={styles.brandBadge}>Mesa {tableNumber}</span>}
          </div>
        </div>

        <div className={styles.identifyBody}>
          <div className={styles.modeToggle}>
          <Button
            type="button"
            className={mode === "phone" ? styles.modeButtonActive : styles.modeButton}
            onClick={() => {
              setMode("phone");
              setValue("");
              setError(null);
            }}
          >
            Telefone
          </Button>
          <Button
            type="button"
            className={mode === "document" ? styles.modeButtonActive : styles.modeButton}
            onClick={() => {
              setMode("document");
              setValue("");
              setError(null);
            }}
          >
            CPF
          </Button>
          </div>

        <Form onSubmit={handleSubmit}>
          <FormGroup>
            <Label for="comanda-identity">{mode === "phone" ? "Telefone" : "CPF"}</Label>
            <Input
              id="comanda-identity"
              type={mode === "phone" ? "tel" : "text"}
              inputMode={mode === "phone" ? "tel" : "numeric"}
              placeholder={mode === "phone" ? "(11) 91234-5678" : "000.000.000-00"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              disabled={submitting}
            />
          </FormGroup>

          {error && <Alert color="danger">{error}</Alert>}

          <Button type="submit" className={`w-100 ${styles.primaryButton}`} disabled={submitting}>
            {submitting ? <Spinner size="sm" /> : "Entrar na comanda"}
          </Button>
        </Form>
        </div>
      </div>
    </div>
  );
}
