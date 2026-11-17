import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCardTagDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ default: '#6c757d' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class UpdateCardTagDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class AttachCardTagDto {
  @ApiProperty()
  @IsUUID()
  tagId!: string;
}
