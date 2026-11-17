export type PlatformFileUsage = 'product_image';

export interface PlatformFileOrigin {
  clientId: string;
  sourceModule: string;
  sourceEntityType: string;
  sourceEntityId: string;
  usage: PlatformFileUsage;
  uploadedByIdentityId?: string;
}

export interface PlatformUploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface PlatformFileRecord {
  id: string;
  clientId: string;
  sourceModule: string;
  sourceEntityType: string;
  sourceEntityId: string;
  usage: PlatformFileUsage;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageBucket: string;
  storageKey: string;
  uploadedByIdentityId: string | null;
  createdAt: string;
}

export interface SignedFileUrl {
  url: string;
  expiresAt: string;
}
