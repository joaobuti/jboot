import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateCardAssigneeDto {
  @ApiProperty()
  @IsUUID()
  identityId!: string;
}
