import { IsObject, IsUUID } from 'class-validator';

export class CreateInteractionDto {
  @IsUUID()
  agentId!: string;

  @IsUUID()
  requestId!: string;

  @IsObject()
  input!: Record<string, unknown>;
}
