import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemInputDto {
  @ApiProperty({ example: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', description: 'UUID do produto' })
  @IsUUID('4')
  product_id!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: '11111111-1111-1111-1111-111111111111', description: 'UUID do cliente' })
  @IsUUID('4')
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
