import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export type ComandaFilaQueueType = 'cozinha' | 'bar';

export class ComandaFilaQueryDto {
  @IsIn(['cozinha', 'bar'])
  queueType!: ComandaFilaQueueType;
}

export class CancelComandaItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}

export type ComandaPaymentMethod = 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'pix' | 'outro';

export class FecharComandaDto {
  @IsIn(['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'outro'])
  paymentMethod!: ComandaPaymentMethod;
}

/**
 * Recebimento parcial ou final (Sprint 9). Sempre valor absoluto: divisao em
 * partes iguais e resolvida na tela, que materializa o valor antes de enviar.
 * Percentual nunca chega ao backend — quem pagou pagou um valor fixo, e o
 * total da comanda pode subir depois.
 */
export class RegistrarPagamentoComandaDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsIn(['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'outro'])
  paymentMethod!: ComandaPaymentMethod;
}
