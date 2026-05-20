import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Camiseta Básica Algodão' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 160)
  name!: string;

  @ApiProperty({ required: false, example: 'Algodão 100%, gola redonda' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'vestuario' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 60)
  category!: string;

  @ApiProperty({ example: 49.9, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiProperty({ example: 100, minimum: 0 })
  @IsInt()
  @Min(0)
  stock!: number;

  @ApiProperty({
    required: false,
    description: 'Atributos variáveis por categoria',
    example: { tamanho: 'M', cor: 'azul' },
  })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  @ApiProperty({ required: false, type: [String], example: ['https://example.com/img.jpg'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
