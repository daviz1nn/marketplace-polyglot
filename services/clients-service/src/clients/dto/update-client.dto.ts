import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateClientDto } from './create-client.dto';

// Atualização não permite mudar email/cpf (chaves naturais imutáveis)
export class UpdateClientDto extends PartialType(
  OmitType(CreateClientDto, ['email', 'cpf'] as const),
) {}
