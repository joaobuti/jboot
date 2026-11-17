import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';
import { PageQueryDto } from '../../dto/common.dto';

export class CreateCardCommentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  textContent!: string;
}

export class ListCardActivitiesQueryDto extends PageQueryDto {
  @Transform(({ value }) => Number(value ?? 50))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
