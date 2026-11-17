import { Equals, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Min } from 'class-validator';

export class ConfigureInfinitePayDto {
  @IsString()
  @Length(2, 64)
  @Matches(/^\$?[A-Za-z0-9._-]+$/)
  publicIdentifier!: string;

  @IsOptional()
  @IsString()
  @Length(3, 256)
  secretRef?: string;

  @IsBoolean()
  @Equals(true)
  validationConfirmed!: boolean;
}

export class RequestRefundDto {
  @IsUUID()
  chargeId!: string;

  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsString()
  @Length(3, 500)
  reason!: string;

  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;
}

export class CompleteRefundDto {
  @IsBoolean()
  succeeded!: boolean;

  @IsString()
  @Length(3, 500)
  resolutionNote!: string;
}
