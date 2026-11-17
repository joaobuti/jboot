import { ApiProperty } from '@nestjs/swagger';

export class ServiceContractVersionSummaryDto {
  @ApiProperty() version!: number;
  @ApiProperty({ enum: ['html', 'docx'], description: 'html = editor Quill (Sprint 1, so historico); docx = modelo do escritorio' })
  format!: 'html' | 'docx';
  @ApiProperty({ nullable: true, type: String }) fileName!: string | null;
  @ApiProperty({ nullable: true, type: Number }) sizeBytes!: number | null;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty() createdAt!: string;
  @ApiProperty({ nullable: true, type: String }) createdByName!: string | null;
}

export class KitMarkDto {
  @ApiProperty({ example: 'portador(a)' }) mark!: string;
  @ApiProperty() count!: number;
}

export class KitMarksDto {
  @ApiProperty({ type: [KitMarkDto], description: 'Marcas de genero reconhecidas, ex.: portador(a), o(a)' }) gender!: KitMarkDto[];
  @ApiProperty({ type: [KitMarkDto], description: 'Marcas de plural reconhecidas, ex.: da(s), instituicao(oes)' }) plural!: KitMarkDto[];
  @ApiProperty({ type: [KitMarkDto], description: 'Marcas que o Flow nao resolve: ficam com o texto original no kit' })
  unrecognized!: KitMarkDto[];
}

export class KitWarningDto {
  @ApiProperty() code!: string;
  @ApiProperty({ required: false }) detail?: string;
}

export class ServiceContractVersionDto extends ServiceContractVersionSummaryDto {
  @ApiProperty({ nullable: true, type: String, description: 'So nas versoes html (historico)' }) contentHtml!: string | null;
  @ApiProperty({ type: [String], description: 'Texto entre [[ ]] fora do formato de tag' }) invalidTags!: string[];
  @ApiProperty({ type: [String], description: 'Blocos [[SE_X]] encontrados (JEC, JEF)' }) blocks!: string[];
  @ApiProperty({ type: [String], description: 'Tags _1 da linha-molde dos contratos' }) loanRowTags!: string[];
  @ApiProperty({ type: KitMarksDto, nullable: true }) marks!: KitMarksDto | null;
  @ApiProperty({ type: [KitWarningDto] }) warnings!: KitWarningDto[];
}

export class ServiceContractDto {
  @ApiProperty() officeId!: string;
  @ApiProperty() officeName!: string;
  @ApiProperty({ type: ServiceContractVersionDto, nullable: true }) current!: ServiceContractVersionDto | null;
  @ApiProperty({ type: [ServiceContractVersionSummaryDto] }) versions!: ServiceContractVersionSummaryDto[];
}

export class UploadServiceContractResponseDto extends ServiceContractDto {
  @ApiProperty({ description: 'false quando o arquivo era igual ao da versao atual' }) created!: boolean;
}

export class ServiceContractDownloadDto {
  @ApiProperty() url!: string;
  @ApiProperty() expiresAt!: string;
}
