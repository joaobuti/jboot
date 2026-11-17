import { randomUUID } from 'node:crypto';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { DocumentSyncPort } from './document-sync.port';
import { GoogleDriveOAuthService } from './google-drive-oauth.service';

@Injectable()
export class GoogleDriveDocumentSyncAdapter implements DocumentSyncPort {
  constructor(private readonly oauth: GoogleDriveOAuthService) {}

  async upload(input: { refreshToken: string; rootFolderId: string; pathSegments: string[]; fileName: string; contentType: string; body: Buffer; checksum: string; idempotencyKey: string; remoteFileId: string | null }) {
    const token = (await this.oauth.accessToken(input.refreshToken)).accessToken;
    let parent = input.rootFolderId;
    for (const segment of input.pathSegments) parent = await this.ensureFolder(token, parent, segment);
    // Arquivo conhecido que ainda esta na pasta; senao, o de mesmo nome na pasta (substitui); senao, cria.
    const known = input.remoteFileId && (await this.isInFolder(token, input.remoteFileId, parent)) ? input.remoteFileId : null;
    const existingId = known ?? (await this.findFileByName(token, parent, input.fileName));
    const metadata = {
      name: input.fileName,
      parents: existingId ? undefined : [parent],
      appProperties: { jbootChecksum: input.checksum, jbootSyncId: input.idempotencyKey }
    };
    const boundary = `jboot-${randomUUID()}`;
    const multipart=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${input.contentType}\r\n\r\n`),input.body,Buffer.from(`\r\n--${boundary}--`)]);
    const url = existingId ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=multipart&fields=id,version` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,version';
    const response=await fetch(url,{method:existingId?'PATCH':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':`multipart/related; boundary=${boundary}`},body:multipart,signal:AbortSignal.timeout(30_000)});
    if(!response.ok) throw this.invalid('drive_upload_failed');
    const result=await response.json() as {id?:string;version?:string}; if(!result.id) throw this.invalid('drive_upload_invalid_response');
    return {remoteFileId:result.id,remoteVersion:result.version??null};
  }

  async inspect(input: { refreshToken: string; remoteFileId: string }): Promise<{ checksum: string | null } | null> {
    const token = (await this.oauth.accessToken(input.refreshToken)).accessToken;
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.remoteFileId)}?fields=id,trashed,appProperties`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
    );
    if (response.status === 404) return null;
    if (!response.ok) throw this.invalid('drive_reconciliation_failed');
    const file = await response.json() as { trashed?: boolean; appProperties?: { jbootChecksum?: string } };
    if (file.trashed) return null;
    return { checksum: file.appProperties?.jbootChecksum ?? null };
  }

  async trash(input: { refreshToken: string; remoteFileId: string }): Promise<'trashed' | 'missing'> {
    const token = (await this.oauth.accessToken(input.refreshToken)).accessToken;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.remoteFileId)}?fields=id`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
      signal: AbortSignal.timeout(10_000)
    });
    if (response.status === 404) return 'missing';
    if (response.status === 403) throw this.invalid('drive_delete_forbidden');
    if (!response.ok) throw this.invalid('drive_delete_failed');
    return 'trashed';
  }

  /** Arquivo ainda existe, fora da lixeira, e continua na pasta de destino. */
  private async isInFolder(token: string, fileId: string, parent: string): Promise<boolean> {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,trashed,parents`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000)
    });
    if (response.status === 404) return false;
    if (!response.ok) throw this.invalid('drive_file_lookup_failed');
    const file = await response.json() as { trashed?: boolean; parents?: string[] };
    return !file.trashed && (file.parents ?? []).includes(parent);
  }

  /** Arquivo (nao pasta) com o nome exato na pasta; havendo mais de um, o mais antigo. */
  private async findFileByName(token: string, parent: string, name: string): Promise<string | null> {
    const query = encodeURIComponent(
      `name='${driveQueryValue(name)}' and '${parent}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`
    );
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&orderBy=createdTime&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw this.invalid('drive_file_lookup_failed');
    const result = await response.json() as { files?: Array<{ id: string }> };
    return result.files?.[0]?.id ?? null;
  }

  /** Pasta com o nome exato no pai (a mais antiga, se ja houver duplicada); sem nenhuma, cria. */
  private async ensureFolder(token:string,parent:string,name:string):Promise<string>{
    const query=encodeURIComponent(`name='${driveQueryValue(name)}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const found=await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&orderBy=createdTime&pageSize=1`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10_000)});
    if(!found.ok) throw this.invalid('drive_folder_lookup_failed'); const list=await found.json() as {files?:Array<{id:string}>}; if(list.files?.[0]) return list.files[0].id;
    const created=await fetch('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parent]}),signal:AbortSignal.timeout(10_000)});
    if(!created.ok) throw this.invalid('drive_folder_create_failed'); const result=await created.json() as {id?:string}; if(!result.id) throw this.invalid('drive_folder_create_failed'); return result.id;
  }

  private invalid(code: string) { return new UnprocessableEntityException({ code, message: 'Google Drive configuration is invalid' }); }
}

/** Valor entre aspas simples na consulta do Drive: escapa barra invertida e aspa (o nome continua exato). */
export function driveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
