import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface CapabilityRow {
  slug: string;
  label: string;
  description: string | null;
  serviceName: string | null;
  applicationSlug: string | null;
  /** Sem application, mas contratada por cliente na tela (ex.: DataJud, DJEN). */
  clientContractable: boolean;
  /** Capability que precisa estar ligada antes desta (ex.: DJEN exige DataJud). */
  requiresCapability: string | null;
  active: boolean;
}

export interface ClientCapabilityRow extends CapabilityRow {
  enabled: boolean;
  enabledAt: string | null;
}

const CATALOG_COLS = `
  cr.slug, cr.label, cr.description,
  cr.service_name AS "serviceName",
  cr.application_slug AS "applicationSlug",
  cr.client_contractable AS "clientContractable",
  cr.requires_capability AS "requiresCapability",
  cr.active
`;

@Injectable()
export class CapabilitiesRepository {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Catalogo global de capabilities. `applicationSlug` agrupa a capability sob
   * a application que a oferece como sub-modulo; NULL significa capability s2s
   * pura, que nao pertence a nenhuma application (ver ADR 008).
   */
  listCatalog(applicationSlug?: string) {
    return this.database.query<CapabilityRow>(
      `SELECT ${CATALOG_COLS}
       FROM capability_registry cr
       WHERE cr.active = true
         AND ($1::text IS NULL OR cr.application_slug = $1)
       ORDER BY cr.application_slug NULLS FIRST, cr.label`,
      [applicationSlug ?? null]
    );
  }

  /**
   * Catalogo completo com o estado do cliente sobreposto. LEFT JOIN de
   * proposito: capability nunca tocada para este cliente aparece como
   * `enabled=false`, nao some da lista -- a tela precisa listar o que existe
   * para poder ligar.
   */
  listForClient(clientId: string) {
    return this.database.query<ClientCapabilityRow>(
      `SELECT ${CATALOG_COLS},
              COALESCE(cc.enabled, false) AS enabled,
              cc.enabled_at AS "enabledAt"
       FROM capability_registry cr
       LEFT JOIN client_capabilities cc
              ON cc.capability = cr.slug
             AND cc.client_id = $1::uuid
       WHERE cr.active = true
       ORDER BY cr.application_slug NULLS FIRST, cr.label`,
      [clientId]
    );
  }

  /**
   * Upsert em lote numa unica ida ao banco: a tela salva o estado inteiro dos
   * sub-modulos de uma vez, entao aplicar item a item abriria janela de estado
   * parcial se uma das linhas falhasse.
   */
  setForClient(
    clientId: string,
    entries: Array<{ slug: string; enabled: boolean }>,
    actorIdentityId: string
  ) {
    return this.database.query(
      `INSERT INTO client_capabilities (client_id, capability, enabled, enabled_by, enabled_at)
       SELECT $1::uuid,
              entry.slug,
              entry.enabled,
              $4::uuid,
              CASE WHEN entry.enabled THEN now() ELSE NULL END
       FROM unnest($2::text[], $3::boolean[]) AS entry(slug, enabled)
       ON CONFLICT (client_id, capability) DO UPDATE
       SET enabled    = EXCLUDED.enabled,
           enabled_by = EXCLUDED.enabled_by,
           enabled_at = EXCLUDED.enabled_at`,
      [
        clientId,
        entries.map((entry) => entry.slug),
        entries.map((entry) => entry.enabled),
        actorIdentityId
      ]
    );
  }
}
