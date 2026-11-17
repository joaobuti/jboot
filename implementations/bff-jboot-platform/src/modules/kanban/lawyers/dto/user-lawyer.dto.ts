import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';
import { BRAZIL_UFS, BrazilUf } from '../lawyer.input';

export class UserOabDto {
  @ApiProperty({ enum: BRAZIL_UFS, description: 'UF da inscricao; define em quais acoes o advogado assina' })
  @IsIn(BRAZIL_UFS)
  uf!: BrazilUf;

  @ApiProperty({ maxLength: 20, description: 'Numero da OAB (ate 7 digitos; letra final na suplementar)' })
  @IsString()
  @MaxLength(20)
  number!: string;
}

/** Cadastro completo do advogado (substitui o atual); `oabs` vazio remove o cadastro. */
export class ReplaceUserLawyerDto {
  @ApiProperty({ maxLength: 200, description: 'Nome como sai na assinatura da peticao' })
  @IsString()
  @MaxLength(200)
  signatureName!: string;

  @ApiProperty({ type: [UserOabDto], maxItems: 27 })
  @IsArray()
  @ArrayMaxSize(27)
  @ValidateNested({ each: true })
  @Type(() => UserOabDto)
  oabs!: UserOabDto[];
}

export class UserLawyerResponseDto {
  @ApiProperty({ format: 'uuid' }) identityId!: string;
  @ApiProperty({ type: String, nullable: true }) signatureName!: string | null;
  @ApiProperty({ type: [UserOabDto] }) oabs!: UserOabDto[];
}

export class UserLawyerSummaryDto {
  @ApiProperty({ format: 'uuid' }) identityId!: string;
  @ApiProperty({ enum: BRAZIL_UFS, isArray: true }) ufs!: BrazilUf[];
}

export class UserLawyersSummaryDto {
  @ApiProperty({ type: [UserLawyerSummaryDto] }) data!: UserLawyerSummaryDto[];
}
