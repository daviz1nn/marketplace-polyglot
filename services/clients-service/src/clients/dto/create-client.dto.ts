import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { AddressDto } from './address.dto';

export class CreateClientDto {
  @ApiProperty({ example: 'Ana Souza' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail()
  @Length(1, 160)
  email!: string;

  @ApiProperty({ example: '12345678901', minLength: 11, maxLength: 11 })
  @IsString()
  @Matches(/^\d{11}$/, { message: 'cpf deve ter 11 dígitos numéricos' })
  cpf!: string;

  @ApiProperty({ required: false, example: '+5511999990001' })
  @IsOptional()
  @IsString()
  @Length(0, 20)
  phone?: string;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;
}
