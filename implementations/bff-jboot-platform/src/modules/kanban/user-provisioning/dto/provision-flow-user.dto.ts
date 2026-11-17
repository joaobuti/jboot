import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class ProvisionFlowIdentityDto {
  @ApiProperty({ enum: ['cpf', 'cnpj'] }) @IsIn(['cpf', 'cnpj']) documentType!: 'cpf' | 'cnpj';
  @ApiProperty() @Matches(/^[0-9]{11}$|^[0-9]{14}$/) documentNumber!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) displayName!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(8) @MaxLength(200) password?: string;
}

export class ProvisionFlowUserDto {
  @ApiProperty({ type: ProvisionFlowIdentityDto })
  @ValidateNested()
  @Type(() => ProvisionFlowIdentityDto)
  identity!: ProvisionFlowIdentityDto;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  officeIds?: string[];
}
