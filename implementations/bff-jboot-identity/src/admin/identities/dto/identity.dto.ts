import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateIdentityDto {
  @ApiProperty({ enum: ['cpf', 'cnpj'] })
  @IsIn(['cpf', 'cnpj'])
  documentType: string;

  @ApiProperty()
  @Matches(/^[0-9]{11}$|^[0-9]{14}$/)
  documentNumber: string;

  @ApiProperty()
  @IsString()
  displayName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ minLength: 8 })
  @IsOptional()
  @MinLength(8)
  password?: string;
}

export class UpdateIdentityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: ['active', 'blocked', 'pending', 'deleted'] })
  @IsOptional()
  @IsIn(['active', 'blocked', 'pending', 'deleted'])
  status?: string;
}
