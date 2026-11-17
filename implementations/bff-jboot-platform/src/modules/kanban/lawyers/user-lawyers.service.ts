import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { UserLawyerResponseDto, UserLawyersSummaryDto } from './dto/user-lawyer.dto';
import { BrazilUf, normalizeLawyerName, normalizeOabNumber } from './lawyer.input';
import { UserLawyersRepository } from './user-lawyers.repository';

/**
 * Advogado no cadastro do usuario do Flow (ADR 020, emenda de 2026-10-29, decisao 18; S7 de
 * docs/product/flow-initial-petitions-sprints.md): nome para assinatura e uma OAB por UF. Somente
 * `flow:admin` (scope no controller). Auditoria sem nome nem numero da OAB.
 */
@Injectable()
export class UserLawyersService {
  constructor(
    private readonly repository: UserLawyersRepository,
    private readonly audit: KanbanAuditService
  ) {}

  async summary(context: KanbanRequestContext): Promise<UserLawyersSummaryDto> {
    return { data: await this.repository.summary(context.databaseRef, context.clientId) };
  }

  async get(context: KanbanRequestContext, identityId: string): Promise<UserLawyerResponseDto> {
    return this.repository.find(context.databaseRef, context.clientId, identityId);
  }

  async replace(
    context: KanbanRequestContext,
    mutate: MutateContext,
    identityId: string,
    input: { signatureName: string; oabs: Array<{ uf: BrazilUf; number: string }> }
  ): Promise<UserLawyerResponseDto> {
    const valid = validLawyer(input);
    const saved = await this.repository.replace(context.databaseRef, context.clientId, identityId, valid, context.identityId);
    await this.audit.record('kanban_user_lawyer_replaced', mutate, null, { identityId, ufs: saved.oabs.map((oab) => oab.uf) });
    return saved;
  }
}

/** Nome aparado e OABs normalizadas; uma por UF; com OAB, o nome e obrigatorio. */
export function validLawyer(input: { signatureName: string; oabs: Array<{ uf: BrazilUf; number: string }> }) {
  const signatureName = normalizeLawyerName(input.signatureName);
  const seen = new Set<BrazilUf>();
  const oabs = input.oabs.map((oab) => {
    const number = normalizeOabNumber(oab.number);
    if (number === null) {
      throw new UnprocessableEntityException({
        code: 'user_lawyer_oab_invalid',
        message: `OAB/${oab.uf} invalida (ate 7 digitos e, se houver, a letra final).`
      });
    }
    if (seen.has(oab.uf)) {
      throw new UnprocessableEntityException({ code: 'user_lawyer_uf_repeated', message: `Mais de uma OAB na UF ${oab.uf}.` });
    }
    seen.add(oab.uf);
    return { uf: oab.uf, number };
  });
  if (oabs.length > 0 && !signatureName) {
    throw new UnprocessableEntityException({ code: 'user_lawyer_name_required', message: 'Informe o nome para assinatura.' });
  }
  return { signatureName, oabs: oabs.sort((a, b) => a.uf.localeCompare(b.uf)) };
}
