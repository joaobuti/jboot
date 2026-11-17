import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateOperatorDto {
  @ApiProperty()
  @IsUUID()
  identityId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  displayName!: string;

  @ApiProperty({ enum: ['master', 'manager', 'cashier'] })
  @IsIn(['master', 'manager', 'cashier'])
  role!: string;
}

export class UpdateOperatorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayName?: string;

  @ApiPropertyOptional({ enum: ['master', 'manager', 'cashier'] })
  @IsOptional()
  @IsIn(['master', 'manager', 'cashier'])
  role?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;
}
