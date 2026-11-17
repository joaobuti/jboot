import { IsBoolean, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

export class DriveConnectDto {
  @IsUrl({ require_tld: false }) @MaxLength(300) redirectUri!: string;
}

export class DriveConnectCompleteDto extends DriveConnectDto {
  @IsString() @MaxLength(2048) code!: string;
  @IsString() @MaxLength(1024) state!: string;
}

export class DriveConfigurationWriteDto {
  @IsOptional() @IsString() @MaxLength(255) @Matches(/^[A-Za-z0-9_-]+$/) rootFolderId?: string;
  @IsBoolean() enabled!: boolean;
}
