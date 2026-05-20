import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Put,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@ApiTags('clients')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um cliente' })
  create(@Body() dto: CreateClientDto) {
    return this.clients.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista clientes (paginado)' })
  @ApiQuery({ name: 'email', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('email') email?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.clients.findAll({ email, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um cliente por id' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.clients.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza nome/phone/address de um cliente' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um cliente' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.clients.remove(id);
  }
}
