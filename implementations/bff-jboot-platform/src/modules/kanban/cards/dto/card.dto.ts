import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf } from 'class-validator';
import { PageQueryDto } from '../../dto/common.dto';

export class CreateCardDto {
  @ApiProperty()
  @IsUUID()
  boardColumnId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  dueDate?: string | null;

  /**
   * Escritorio do card (Sprint 3.5). So considerado com a visibilidade por
   * escritorio ligada: obrigatorio para `flow:admin` e para quem tem mais de um
   * escritorio ativo; automatico com um so.
   */
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  officeId?: string;
}

export class UpdateCardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ enum: ['active', 'archived'] })
  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: string;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  dueDate?: string | null;
}

export class MoveCardDto {
  @ApiProperty()
  @IsUUID()
  toBoardColumnId!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  toPosition!: number;
}

export class SetCardStatusDto {
  @ApiProperty({ type: String, nullable: true, description: 'null clears the status of the card' })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  cardStatusId!: string | null;
}

export class ListCardsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  boardColumnId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cardStatusId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tagId?: string;
}
