/**
 * Seed de desenvolvimento das credenciais do portal PJe.
 *
 * As credenciais NAO vao para o repositorio: sao lidas de variaveis de ambiente
 * (`.env`, que e gitignored). O valor e cifrado com o mesmo esquema do
 * `CryptoService` do BFF — AES-256-GCM com chave derivada por
 * HMAC-SHA256(jwtSecret, clientId) — para que o BFF consiga decifrar.
 *
 * Uso: make juridico-pje-seed-credentials
 */
import { createCipheriv, createHmac, randomBytes } from 'crypto';
import { Client } from 'pg';

const JWT_SECRET =
  process.env.JBOOT_IDENTITY_JWT_SECRET ??
  'dev-only-jboot-identity-secret-change-before-production';

const IDENTITY_DATABASE_URL =
  process.env.JBOOT_IDENTITY_DATABASE_URL ??
  'postgresql://jboot:jboot@postgres:5432/jboot_identity';

const JURIDICO_DATABASE_URL =
  process.env.JBOOT_JURIDICO_DATABASE_URL ??
  'postgresql://jboot:jboot@postgres:5432/jboot_juridico_advocacia_dev';

const CLIENT_DOCUMENT = process.env.JURIDICO_PJE_DEV_CLIENT_CNPJ ?? '63784101000110';
const PORTAL_SLUG = 'pje';

function encrypt(clientId: string, plaintext: string): Buffer {
  const key = createHmac('sha256', JWT_SECRET).update(clientId).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

async function main(): Promise<void> {
  const email = process.env.JURIDICO_PJE_DEV_EMAIL?.trim();
  const password = process.env.JURIDICO_PJE_DEV_PASSWORD;

  if (!email || !password) {
    console.error(
      'Defina JURIDICO_PJE_DEV_EMAIL e JURIDICO_PJE_DEV_PASSWORD no .env antes de rodar o seed.\n' +
        'Veja .env.example para o formato.',
    );
    process.exit(1);
  }

  const identity = new Client({ connectionString: IDENTITY_DATABASE_URL });
  await identity.connect();
  let clientId: string;
  try {
    const result = await identity.query<{ id: string }>(
      `SELECT id FROM clients WHERE document_type = 'cnpj' AND document_number = $1 LIMIT 1`,
      [CLIENT_DOCUMENT],
    );
    if (!result.rows[0]) {
      console.error(`Cliente ${CLIENT_DOCUMENT} nao encontrado no Identity. Rode os seeds de dev primeiro.`);
      process.exit(1);
    }
    clientId = result.rows[0].id;
  } finally {
    await identity.end();
  }

  const juridico = new Client({ connectionString: JURIDICO_DATABASE_URL });
  await juridico.connect();
  try {
    const portal = await juridico.query<{ id: string }>(
      `SELECT id FROM juridico_portals WHERE slug = $1 LIMIT 1`,
      [PORTAL_SLUG],
    );
    if (!portal.rows[0]) {
      console.error(
        `Portal ${PORTAL_SLUG} nao encontrado. Aplique docker/postgres/init/037_juridico_pje_comunicacoes.sql.`,
      );
      process.exit(1);
    }

    await juridico.query(
      `INSERT INTO juridico_portal_credentials
         (client_id, portal_id, encrypted_username, encrypted_password, encryption_key_ref)
       VALUES ($1, $2, $3, $4, 'hmac-v1')
       ON CONFLICT (client_id, portal_id) DO UPDATE SET
         encrypted_username = EXCLUDED.encrypted_username,
         encrypted_password = EXCLUDED.encrypted_password,
         encryption_key_ref = EXCLUDED.encryption_key_ref,
         updated_at = now()`,
      [clientId, portal.rows[0].id, encrypt(clientId, email), encrypt(clientId, password)],
    );

    console.log(`Credenciais PJe gravadas cifradas para o cliente ${clientId} (${email}).`);
  } finally {
    await juridico.end();
  }
}

void main().catch((error: unknown) => {
  console.error('Falha no seed de credenciais PJe:', error);
  process.exit(1);
});
