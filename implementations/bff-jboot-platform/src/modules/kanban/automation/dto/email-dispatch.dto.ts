import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { AutomationDispatchStatus } from '../dispatch-log.repository';
import { ColumnAutomationTriggerType, TRIGGER_TYPES } from './automation-rule.dto';

export type EmailDispatchListFilter = 'failed' | 'pending';

export class ListEmailDispatchesQueryDto {
  @ApiPropertyOptional({ enum: ['failed', 'pending'], description: 'Sem filtro: falhas e pendentes' })
  @IsOptional()
  @IsIn(['failed', 'pending'])
  status?: EmailDispatchListFilter;
}

export class EmailDispatchSummaryDto {
  @ApiProperty() pending!: number;
  @ApiProperty() processing!: number;
  @ApiProperty() failed!: number;
  @ApiProperty({ nullable: true, type: String }) oldestPendingAt!: string | null;
}

export class EmailDispatchItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['pending', 'processing', 'sent', 'skipped', 'failed'] }) status!: AutomationDispatchStatus;
  @ApiProperty() attemptCount!: number;
  @ApiProperty({ nullable: true, type: String }) lastError!: string | null;
  @ApiProperty() nextAttemptAt!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty() boardId!: string;
  @ApiProperty() boardName!: string;
  @ApiProperty() columnName!: string;
  @ApiProperty() cardId!: string;
  @ApiProperty() cardTitle!: string;
  @ApiProperty({ enum: TRIGGER_TYPES }) triggerType!: ColumnAutomationTriggerType;
}

export class EmailDispatchListDto {
  @ApiProperty({ type: EmailDispatchSummaryDto }) summary!: EmailDispatchSummaryDto;
  @ApiProperty({ type: [EmailDispatchItemDto] }) items!: EmailDispatchItemDto[];
  @ApiProperty() maxAttempts!: number;
}

export class EmailDispatchRetryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['pending'] }) status!: 'pending';
}
