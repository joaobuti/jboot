import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class RegisterPetitionProtocolDto {
  /** 20 digitos ou mascara oficial (NNNNNNN-DD.AAAA.J.TR.OOOO); digito verificador conferido no servico. */
  @ApiProperty({ example: '0000000-00.0000.0.00.0000', maxLength: 25 })
  @IsString()
  @MaxLength(25)
  processNumber!: string;
}
