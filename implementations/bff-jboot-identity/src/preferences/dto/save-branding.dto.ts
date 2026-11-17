import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveBrandingDto {
  @IsString()
  @MaxLength(262144)
  logoDataUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}
