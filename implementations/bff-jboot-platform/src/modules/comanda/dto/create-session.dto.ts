import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateComandaSessionDto {
  @ApiProperty({ description: 'Token do QR de mesa, assinado com JBOOT_COMANDA_QR_SECRET' })
  @IsString()
  qrToken!: string;

  @ApiPropertyOptional({ description: 'Ao menos um de phone/documentNumber e obrigatorio' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ description: 'Ao menos um de phone/documentNumber e obrigatorio' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  documentNumber?: string;
}
