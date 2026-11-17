import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const DATAJUD_MONITOR_CADENCES = ['daily', 'weekly', 'biweekly', 'monthly'] as const;
export type DataJudMonitorCadence = (typeof DATAJUD_MONITOR_CADENCES)[number];

export class CreateDataJudMonitorDto {
  @IsString()
  @MinLength(20)
  @MaxLength(25)
  processNumber!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9-]{2,16}$/)
  tribunal?: string;

  @IsIn(DATAJUD_MONITOR_CADENCES)
  cadence!: DataJudMonitorCadence;
}

export class UpdateDataJudMonitorDto {
  @IsOptional()
  @IsIn(DATAJUD_MONITOR_CADENCES)
  cadence?: DataJudMonitorCadence;

  @IsOptional()
  @IsIn(['active', 'paused'])
  state?: 'active' | 'paused';
}
