import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateComandaMesaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  tableNumber!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}

/**
 * `tableNumber` nao entra aqui de proposito: o numero da mesa esta no QR
 * impresso e colado na mesa fisica: renumerar pelo cadastro deixaria o
 * impresso apontando para outro lugar. Numero errado se resolve inativando a
 * mesa e criando a correta.
 */
export class UpdateComandaMesaDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}

export class UpdateComandaMesaStatusDto {
  @IsIn(['active', 'inactive'])
  status!: 'active' | 'inactive';
}
