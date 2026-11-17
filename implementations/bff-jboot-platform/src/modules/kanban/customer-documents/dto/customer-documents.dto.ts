import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** Campo ausente preserva o valor atual; ao menos um e exigido (422 no servico). */
export class UpdateCustomerDocumentProfileDto {
  @ApiPropertyOptional({ description: 'Comprovante de residencia em nome de terceiro: exige a declaracao assinada para validar.' })
  @IsOptional()
  @IsBoolean()
  residenceProofThirdParty?: boolean;

  @ApiPropertyOptional({ description: 'RG novo ou CNH ja trazem o CPF: dispensa o documento CPF; a IA confere o numero na identidade.' })
  @IsOptional()
  @IsBoolean()
  cpfOnIdentity?: boolean;
}
