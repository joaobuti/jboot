import { IsObject, IsString, IsUUID, Matches } from "class-validator";

export class CreateExecutionDto {
  @IsUUID() clientId!: string;
  @IsUUID() requesterIdentityId!: string;
  @IsString() @Matches(/^[a-z0-9-]{1,80}$/) applicationSlug!: string;
  @IsUUID() agentId!: string;
  @IsString() @Matches(/^[a-z0-9._:-]{1,80}$/) sourceType!: string;
  @IsUUID() sourceId!: string;
  @IsObject() input!: Record<string, unknown>;
}
