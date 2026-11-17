import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class OAuthDecisionDto {
  @IsBoolean()
  approve!: boolean;
}

export class OAuthIntrospectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  token!: string;
}
