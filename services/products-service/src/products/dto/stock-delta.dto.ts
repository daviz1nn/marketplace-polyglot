import { ApiProperty } from '@nestjs/swagger';
import { IsInt, NotEquals } from 'class-validator';

export class StockDeltaDto {
  @ApiProperty({
    description:
      'Delta a aplicar no estoque. Negativo reserva (pedido), positivo devolve (estorno).',
    example: -3,
  })
  @IsInt()
  @NotEquals(0)
  delta!: number;
}
