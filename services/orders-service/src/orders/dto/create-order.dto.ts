import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

// Aceita o formato lógico UUID (8-4-4-4-12 hex) sem exigir a versão na 13ª
// posição. Os seeds usam IDs "mnemônicos" como 11111111-1111-1111-1111-...
// que são strings UUID-shaped mas não passam em @IsUUID() estrito.
const UUID_SHAPED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class OrderItemInputDto {
  @ApiProperty({ example: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', description: 'UUID do produto' })
  @IsString()
  @Matches(UUID_SHAPED, { message: 'product_id deve estar no formato UUID (8-4-4-4-12 hex)' })
  product_id!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: '11111111-1111-1111-1111-111111111111', description: 'UUID do cliente' })
  @IsString()
  @Matches(UUID_SHAPED, { message: 'client_id deve estar no formato UUID (8-4-4-4-12 hex)' })
  client_id!: string;

  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];
}

export class UpdateStatusDto {
  @ApiProperty({ enum: ['pending', 'paid', 'shipped', 'delivered', 'canceled'] })
  @IsString()
  @IsNotEmpty()
  status!: string;
}
