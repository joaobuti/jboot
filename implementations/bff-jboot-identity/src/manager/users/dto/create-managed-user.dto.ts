import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';

export class CreateManagedUserDto {
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

  @ApiPropertyOptional({ description: 'ID da loja/local (PDV). Se omitido, herda do criador.' })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
