import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service';
import { UpsertFiscalConfigDto } from './dto/fiscal-config.dto';

export interface FiscalConfigRow {
  id: string;
  clientId: string;
  cnpjEmitente: string;
  razaoSocial: string;
  uf: string;
  crt: number;
  addressLogradouro: string;
  addressNumero: string;
  addressBairro: string;
  addressMunicipio: string;
  addressUf: string;
  addressCep: string;
  addressCodigoMunicipio: string;
}

const CONFIG_COLS = `
  id, client_id AS "clientId",
  cnpj_emitente AS "cnpjEmitente", razao_social AS "razaoSocial",
  uf, crt,
  address_logradouro AS "addressLogradouro",
  address_numero AS "addressNumero",
  address_bairro AS "addressBairro",
  address_municipio AS "addressMunicipio",
  address_uf AS "addressUf",
  address_cep AS "addressCep",
  address_codigo_municipio AS "addressCodigoMunicipio"
`;

@Injectable()
export class FiscalConfigRepository {
  constructor(private readonly database: DatabaseService) {}

  async find(clientId: string): Promise<FiscalConfigRow | null> {
    const result = await this.database.query<FiscalConfigRow>(
      `SELECT ${CONFIG_COLS} FROM pdv_fiscal_config WHERE client_id = $1`,
      [clientId]
    );
    return result.rows[0] ?? null;
  }

  async upsert(clientId: string, dto: UpsertFiscalConfigDto): Promise<FiscalConfigRow> {
    const result = await this.database.query<FiscalConfigRow>(
      `INSERT INTO pdv_fiscal_config (
         client_id, cnpj_emitente, razao_social, uf, crt,
         address_logradouro, address_numero, address_bairro,
         address_municipio, address_uf, address_cep, address_codigo_municipio
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (client_id) DO UPDATE SET
         cnpj_emitente = EXCLUDED.cnpj_emitente,
         razao_social  = EXCLUDED.razao_social,
         uf            = EXCLUDED.uf,
         crt           = EXCLUDED.crt,
         address_logradouro     = EXCLUDED.address_logradouro,
         address_numero         = EXCLUDED.address_numero,
         address_bairro         = EXCLUDED.address_bairro,
         address_municipio      = EXCLUDED.address_municipio,
         address_uf             = EXCLUDED.address_uf,
         address_cep            = EXCLUDED.address_cep,
         address_codigo_municipio = EXCLUDED.address_codigo_municipio,
         updated_at = NOW()
       RETURNING ${CONFIG_COLS}`,
      [
        clientId, dto.cnpj, dto.razaoSocial, dto.uf, dto.crt,
        dto.logradouro, dto.numero, dto.bairro,
        dto.municipio, dto.addressUf, dto.cep, dto.codigoMunicipio
      ]
    );
    return result.rows[0];
  }
}
