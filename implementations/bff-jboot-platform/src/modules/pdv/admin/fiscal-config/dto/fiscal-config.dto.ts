import { IsIn, IsInt, IsString, Length } from 'class-validator';

export class UpsertFiscalConfigDto {
  @IsString()
  @Length(14, 14)
  cnpj!: string;

  @IsString()
  razaoSocial!: string;

  @IsString()
  @Length(2, 2)
  uf!: string;

  @IsInt()
  @IsIn([1, 2, 3])
  crt!: number;

  @IsString()
  logradouro!: string;

  @IsString()
  numero!: string;

  @IsString()
  bairro!: string;

  @IsString()
  municipio!: string;

  @IsString()
  @Length(2, 2)
  addressUf!: string;

  @IsString()
  @Length(8, 8)
  cep!: string;

  @IsString()
  codigoMunicipio!: string;
}
