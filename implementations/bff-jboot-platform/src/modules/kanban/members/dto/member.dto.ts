import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { BoardMemberRole } from '../../kanban.types';

const BOARD_MEMBER_ROLES: BoardMemberRole[] = ['board_admin', 'board_member', 'board_viewer'];

export class CreateBoardMemberDto {
  @ApiProperty()
  @IsUUID()
  identityId!: string;

  @ApiProperty({ enum: BOARD_MEMBER_ROLES })
  @IsIn(BOARD_MEMBER_ROLES)
  role!: BoardMemberRole;
}

export class UpdateBoardMemberDto {
  @ApiPropertyOptional({ enum: BOARD_MEMBER_ROLES })
  @IsOptional()
  @IsIn(BOARD_MEMBER_ROLES)
  role?: BoardMemberRole;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class AssignMemberProfileDto {
  @ApiProperty({ type: String, nullable: true, description: 'null unassigns the profile from the member' })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  profileId!: string | null;
}
