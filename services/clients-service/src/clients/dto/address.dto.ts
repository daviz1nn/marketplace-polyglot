import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class AddressDto {
  @ApiProperty({ example: 'Rua das Flores' })
  @IsString()
  @Length(1, 120)
  street!: string;

  @ApiProperty({ example: '100' })
  @IsString()
  @Length(1, 20)
  number!: string;

  @ApiProperty({ required: false, example: 'Apto 42' })
  @IsOptional()
  @IsString()
  @Length(0, 60)
  complement?: string;

  @ApiProperty({ example: 'São Paulo' })
  @IsString()
  @Length(1, 80)
  city!: string;

  @ApiProperty({ example: 'SP', minLength: 2, maxLength: 2 })
  @IsString()
  @Length(2, 2)
  state!: string;

  @ApiProperty({ example: '01000-000' })
  @IsString()
  @Length(8, 10)
  zip!: string;
}
