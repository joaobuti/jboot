import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class AccessTokenDto {
  @ApiProperty({ description: 'Token do link recebido por e-mail' })
  @IsString()
  @Length(20, 200)
  token: string;
}

export class SetPasswordDto extends AccessTokenDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ description: 'CPF ou CNPJ usado no login' })
  @IsString()
  @MaxLength(32)
  document: string;
}
