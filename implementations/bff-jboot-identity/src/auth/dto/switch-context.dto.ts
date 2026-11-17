import { IsOptional, IsString, IsUUID } from 'class-validator';

export class SwitchContextDto {
  @IsUUID()
  clientId!: string;

  @IsUUID()
  applicationId!: string;

  @IsString()
  @IsOptional()
  deviceRef?: string;
}
