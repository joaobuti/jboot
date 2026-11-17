export type SupportedAuthType = 'user_pass' | 'token';

export interface CredencialStatusDto {
  portalSlug: string;
  authType: SupportedAuthType;
  configured: boolean;
  updatedAt: string | null;
}

import { IsOptional, IsString } from 'class-validator';

export class SetCredencialBodyDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  token?: string;
}
