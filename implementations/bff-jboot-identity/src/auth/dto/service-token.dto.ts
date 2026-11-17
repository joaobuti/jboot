import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class ServiceTokenDto {
  @IsString()
  // A allowlist real de cliente x audience vive em ServiceTokenService.
  // resolveClient; aqui apenas se rejeita cliente desconhecido cedo.
  @IsIn(['platform-api', 'juridico-worker'])
  clientId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  clientSecret!: string;

  @IsString()
  @IsIn(['svc:juridico-data', 'svc:platform-api', 'svc:payments', 'svc:identity-oauth', 'svc:ai-gateway'])
  audience!: string;
}

export interface ServiceTokenResponseDto {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}
