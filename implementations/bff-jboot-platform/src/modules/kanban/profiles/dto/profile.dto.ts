import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

export class CreateMemberProfileDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canDeleteArchivedCards?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canManageTags?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canManageStatuses?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Perfil revisor: aceita/rejeita documentos do checklist' })
  @IsOptional()
  @IsBoolean()
  canReviewDocuments?: boolean;
}

export class UpdateMemberProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canDeleteArchivedCards?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canManageTags?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canManageStatuses?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Perfil revisor: aceita/rejeita documentos do checklist' })
  @IsOptional()
  @IsBoolean()
  canReviewDocuments?: boolean;
}

export class MemberProfileTransitionInputDto {
  @ApiProperty()
  @IsUUID()
  fromBoardColumnId!: string;

  @ApiProperty()
  @IsUUID()
  toBoardColumnId!: string;
}

export class ReplaceMemberProfileTransitionsDto {
  @ApiProperty({ type: [MemberProfileTransitionInputDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MemberProfileTransitionInputDto)
  transitions!: MemberProfileTransitionInputDto[];
}

export class BoardColumnPermissionInputDto {
  @ApiProperty()
  @IsUUID()
  boardColumnId!: string;

  @ApiProperty()
  @IsBoolean()
  canView!: boolean;

  @ApiProperty()
  @IsBoolean()
  canEdit!: boolean;
}

export class ReplaceBoardColumnPermissionsDto {
  @ApiProperty({ type: [BoardColumnPermissionInputDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BoardColumnPermissionInputDto)
  permissions!: BoardColumnPermissionInputDto[];
}
