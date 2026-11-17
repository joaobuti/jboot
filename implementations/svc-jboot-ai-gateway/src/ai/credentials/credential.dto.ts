import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class UpsertCredentialDto {
  @ApiProperty({ example: 'anthropic' }) @IsString() @Matches(/^[a-z][a-z0-9-]{1,31}$/) provider!: string;
  @ApiProperty({ writeOnly: true, minLength: 8, maxLength: 4096 }) @IsString() @Length(8, 4096) apiKey!: string;
}
