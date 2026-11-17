import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class OpenCashierDto {
  @IsNumber()
  @Min(0)
  openingBalance!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CloseCashierDto {
  @IsNumber()
  @Min(0)
  countedBalance!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateCashierMovementDto {
  @IsEnum(['sangria', 'suprimento'])
  type!: 'sangria' | 'suprimento';

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(3)
  reason!: string;
}
