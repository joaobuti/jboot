import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class ClaudeConnectorSettingsWriteDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty()
  @IsBoolean()
  maskPersonalData!: boolean;

  /** Obrigatorio na primeira habilitacao: ciencia do envio de dados a contas Claude pessoais. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptPolicy?: boolean;

  /** Leitura de documentos da ficha do cliente pelo Claude; omitido mantem o atual. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowCustomerDocuments?: boolean;

  /** Obrigatorio na primeira liberacao da leitura de documentos pessoais. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptCustomerDocumentsPolicy?: boolean;
}

export interface ClaudeConnectorSettingsView {
  enabled: boolean;
  maskPersonalData: boolean;
  policyAcceptedAt: string | null;
  allowCustomerDocuments: boolean;
  customerDocumentsAcceptedAt: string | null;
  connectorUrl: string;
  canManage: boolean;
}
