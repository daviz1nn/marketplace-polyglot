import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateStatusDto } from './dto/create-order.dto';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Cria um pedido (idempotente)',
    description:
      'Valida cliente e produtos via HTTP nos respectivos serviços, ' +
      'reserva estoque atomicamente, e persiste via LOGGED BATCH no Cassandra ' +
      '(orders + orders_by_client + orders_by_idem_key).',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'UUID gerado pelo cliente. Repetir a mesma chave retorna o pedido existente.',
    required: true,
  })
  create(
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idemKey: string,
    @Req() req: Request,
  ) {
    const correlationId = (req.headers['x-correlation-id'] as string) ?? '';
    return this.orders.create(dto, idemKey, correlationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um pedido por order_id (TIMEUUID)' })
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }

  @Get('by-client/:clientId')
  @ApiOperation({
    summary: 'Histórico de pedidos de um cliente (query estrela do Cassandra)',
    description:
      'Lê uma única partição da tabela orders_by_client, ordenada cronologicamente ' +
      'via CLUSTERING ORDER BY (order_id DESC).',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findByClient(
    @Param('clientId') clientId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.orders.findByClient(clientId, limit);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Atualiza status do pedido (BATCH nas 2 tabelas)',
  })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.orders.updateStatus(id, dto.status);
  }
}
