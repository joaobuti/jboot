export const DOCUMENT_SYNC_PORT = Symbol('DOCUMENT_SYNC_PORT');

/**
 * Envio ao Drive por nome exato (correcao de 2026-10-30, pedido do usuario): cada pasta do caminho e
 * reaproveitada quando ja existe uma com o mesmo nome no pai (senao e criada) e o arquivo com o mesmo
 * nome na pasta final e substituido (senao e criado). Quem chama serializa os envios do cliente.
 */
export interface DocumentSyncPort {
  upload(input: {
    refreshToken: string;
    rootFolderId: string;
    pathSegments: string[];
    fileName: string;
    contentType: string;
    body: Buffer;
    checksum: string;
    idempotencyKey: string;
    remoteFileId: string | null;
  }): Promise<{ remoteFileId: string; remoteVersion: string | null }>;
  inspect(input: { refreshToken: string; remoteFileId: string }): Promise<{ checksum: string | null } | null>;
  /**
   * Manda o arquivo para a lixeira do Drive (reversivel la). `missing`: ja nao existe ou ja esta na
   * lixeira. Sem permissao sobre o arquivo: erro `drive_delete_forbidden`.
   */
  trash(input: { refreshToken: string; remoteFileId: string }): Promise<'trashed' | 'missing'>;
}
