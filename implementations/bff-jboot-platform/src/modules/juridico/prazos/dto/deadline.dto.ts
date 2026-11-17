import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';
export class CalculateDeadlineDto { @IsDateString() startDate!: string; @IsInt() @Min(1) @Max(3650) businessDays!: number; @IsBoolean() includeStart!: boolean; @IsOptional() @IsString() calendarId?: string; }
export class CreateDeadlineCalendarDto { @IsInt() @Min(2020) @Max(2100) year!: number; @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) sourceUrl?: string; @IsOptional() @IsString() sourceReference?: string; }
export class CreateDeadlineEntryDto { @IsDateString() date!: string; @IsString() name!: string; @IsOptional() @IsString() reason?: string; }
