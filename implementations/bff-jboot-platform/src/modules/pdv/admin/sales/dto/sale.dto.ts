import { IsEnum, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../dto/common.dto';

export class CreateSaleDto {
  @IsOptional()
  @IsUUID()
  cashierId?: string;
}

export class AddSaleItemDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @IsOptional()
  @IsString()
  cfop?: string;

  @IsOptional()
  @IsString()
  ncm?: string;

  @IsOptional()
  @IsString()
  cstIcms?: string;

  @IsOptional()
  @IsString()
  cstPis?: string;

  @IsOptional()
  @IsString()
  cstCofins?: string;

  @IsOptional()
  @IsNumber()
  aliqIcms?: number;

  @IsOptional()
  @IsNumber()
  aliqPis?: number;

  @IsOptional()
  @IsNumber()
  aliqCofins?: number;
}

export type PaymentMethod = 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'pix' | 'outro';

export class AddSalePaymentDto {
  @IsEnum(['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'outro'])
  paymentMethod!: PaymentMethod;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class InitiatePixPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class CompleteSaleDto {
  @IsOptional()
  @IsString()
  cnpjEmitente?: string;

  @IsOptional()
  emitente?: {
    cnpj: string;
    razaoSocial: string;
    uf: string;
    crt: number;
    endereco: {
      logradouro: string;
      numero: string;
      bairro: string;
      municipio: string;
      uf: string;
      cep: string;
      codigoMunicipio: string;
    };
  };
}

export class NfEnderecoDestinatarioDto {
  @IsString() logradouro!: string;
  @IsString() numero!: string;
  @IsString() bairro!: string;
  @IsString() municipio!: string;
  @IsString() @Length(2, 2) uf!: string;
  @IsString() @Length(8, 8) cep!: string;
  @IsString() codigoMunicipio!: string;
}

export class NfDestinatarioDto {
  @IsOptional() @IsString() @Length(14, 14) cnpj?: string;
  @IsOptional() @IsString() @Length(11, 11) cpf?: string;
  @IsString() razaoSocial!: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => NfEnderecoDestinatarioDto)
  endereco?: NfEnderecoDestinatarioDto;
}

export class EmitNfDto {
  @IsEnum(['nfce', 'nfe'])
  nfType!: 'nfce' | 'nfe';

  @IsOptional() @IsString() @Length(11, 11)
  cpfConsumidor?: string;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => NfDestinatarioDto)
  destinatario?: NfDestinatarioDto;
}

export class CancelSaleDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateSaleItemDto {
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class ApplyDiscountDto {
  @IsEnum(['value', 'percent'])
  discountType!: 'value' | 'percent';

  @IsNumber()
  @Min(0)
  amount!: number;
}

export class SaleListQueryDto extends PaginationQueryDto {
  /** Status operacional da venda (open/paid/cancelled/...), nao o active/inactive de cadastro. */
  @IsOptional()
  @IsString()
  status?: string;
}
