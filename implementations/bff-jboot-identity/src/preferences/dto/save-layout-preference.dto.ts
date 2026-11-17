import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class SaveLayoutPreferenceDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  preference: Record<string, unknown>;
}
