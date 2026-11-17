import { Injectable } from '@nestjs/common';
import { CustomerJuridicoService } from '../../establishment-customers/customer-juridico.service';
import { CustomersService } from '../../establishment-customers/customers.service';
import { CardsRepository } from '../cards/cards.repository';
import { CustomerValidationRepository, ValidationRunRow } from '../customer-validation/customer-validation.repository';
import { CardCustomersRepository } from '../customers/card-customers.repository';
import { BRAZIL_UFS, BrazilUf } from '../lawyers/lawyer.input';
import { UserLawyersRepository } from '../lawyers/user-lawyers.repository';
import { OfficesRepository } from '../offices/offices.repository';
import { PriorLawsuitsRepository } from '../prior-lawsuits/prior-lawsuits.repository';

export type PetitionPreconditionCode =
  | 'card_without_customer'
  | 'customer_not_validated'
  | 'customer_without_uf'
  | 'prior_lawsuits_missing';

/** Motivo em portugues: vai para o historico do card e para a rotina. */
export const PETITION_PRECONDITION_MESSAGES: Record<PetitionPreconditionCode, string> = {
  card_without_customer: 'O card nao tem cliente vinculado.',
  customer_not_validated: 'O cliente do card ainda nao tem validacao aprovada por uma pessoa.',
  customer_without_uf: 'A ficha do cliente nao tem a UF do endereco; ela define onde as acoes sao ajuizadas.',
  prior_lawsuits_missing:
    'A ficha do cliente nao tem a lista de acoes ja ajuizadas nem a confirmacao "cliente nao tem acoes anteriores".'
};

/** Pendencias do fecho: o dado sai `XXXX` realcado e a pendencia vai para a execucao. */
export type PetitionClosingGap = 'card_without_office' | 'office_without_city' | 'no_assignee_lawyer_for_uf';

export const PETITION_CLOSING_GAP_MESSAGES: Record<PetitionClosingGap, string> = {
  card_without_office: 'O card nao tem escritorio: o local do fecho saiu XXXX.',
  office_without_city: 'O escritorio do card nao tem cidade e UF: o local do fecho saiu XXXX.',
  no_assignee_lawyer_for_uf: 'Nenhum responsavel do card tem OAB na UF da acao: nome e OAB do fecho sairam XXXX.'
};

/** Local, data e assinatura do fecho, resolvidos pelo Flow (ADR 020, emenda de 2026-10-29). */
export interface PetitionClosingContext {
  place: { city: string; uf: BrazilUf } | null;
  signer: { identityId: string; name: string; oabNumber: string; oabUf: BrazilUf } | null;
  gaps: PetitionClosingGap[];
}

export interface PetitionContext {
  customerId: string;
  validation: ValidationRunRow;
  uf: BrazilUf;
  address: {
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: BrazilUf;
    zip: string | null;
  };
  birthDate: string | null;
  priorLawsuits: { status: 'listed' | 'declared_none'; lawsuits: Array<{ bank: string; processNumber: string }> };
  closing: PetitionClosingContext;
}

export type PetitionPreconditions =
  | { ok: true; context: PetitionContext }
  | { ok: false; code: PetitionPreconditionCode; message: string };

function fail(code: PetitionPreconditionCode): PetitionPreconditions {
  return { ok: false, code, message: PETITION_PRECONDITION_MESSAGES[code] };
}

/**
 * Pre-condicoes das peticoes iniciais (ADR 020, decisoes do usuario 7, 8 e 9; S3 de
 * docs/product/flow-initial-petitions-sprints.md), num lugar so para o disparo (worker, sem token) e
 * para a leitura pelo conector. Nao confere visibilidade: quem chama ja resolveu o card.
 * - cliente vinculado ao card com validacao aprovada por uma pessoa;
 * - UF do endereco da ficha (define tribunais e jurisprudencia);
 * - acoes ja ajuizadas listadas ou a confirmacao "sem acoes anteriores".
 * O fecho nao e pre-condicao: local ou advogado ausente sai XXXX com pendencia (`closing.gaps`).
 */
@Injectable()
export class PetitionPreconditionsService {
  constructor(
    private readonly cardCustomers: CardCustomersRepository,
    private readonly validations: CustomerValidationRepository,
    private readonly customers: CustomersService,
    private readonly juridico: CustomerJuridicoService,
    private readonly priorLawsuits: PriorLawsuitsRepository,
    private readonly cards: CardsRepository,
    private readonly lawyers: UserLawyersRepository,
    private readonly offices: OfficesRepository
  ) {}

  async evaluate(databaseRef: string, clientId: string, cardId: string): Promise<PetitionPreconditions> {
    const link = await this.cardCustomers.findByCard(databaseRef, clientId, cardId);
    if (!link) return fail('card_without_customer');
    const validation = await this.validations.latestConfirmed(databaseRef, clientId, link.customerId);
    if (!validation) return fail('customer_not_validated');
    const [customer, legal, recorded, card] = await Promise.all([
      this.customers.findById(clientId, link.customerId),
      this.juridico.get(clientId, link.customerId),
      this.priorLawsuits.listForCustomer(databaseRef, clientId, link.customerId),
      this.cards.findByIdForClient(databaseRef, clientId, cardId)
    ]);
    const uf = ufOf(customer?.addressState ?? null);
    if (!customer || !uf) return fail('customer_without_uf');
    const lawsuits = recorded.lawsuits.filter((row) => !row.removedAt);
    const declaredNone = recorded.declarations.some((row) => !row.revokedAt);
    if (lawsuits.length === 0 && !declaredNone) return fail('prior_lawsuits_missing');

    const closing = await this.closing(databaseRef, clientId, cardId, card?.officeId ?? null, uf);
    return {
      ok: true,
      context: {
        customerId: link.customerId,
        validation,
        uf,
        address: {
          street: customer.addressStreet,
          number: customer.addressNumber,
          complement: customer.addressComplement,
          neighborhood: customer.addressNeighborhood,
          city: customer.addressCity,
          state: uf,
          zip: customer.addressZip
        },
        birthDate: legal?.dataNascimento ?? null,
        priorLawsuits: {
          status: lawsuits.length > 0 ? 'listed' : 'declared_none',
          lawsuits: lawsuits.map((row) => ({ bank: row.bank, processNumber: row.processNumber }))
        },
        closing
      }
    };
  }

  /**
   * Local (cidade/UF do escritorio do card) e quem assina (responsavel do card com OAB na UF da acao,
   * pela hierarquia de `UserLawyersRepository.signerForCard`).
   */
  async closing(databaseRef: string, clientId: string, cardId: string, officeId: string | null, uf: BrazilUf): Promise<PetitionClosingContext> {
    const [office, signer] = await Promise.all([
      officeId ? this.offices.findById(databaseRef, clientId, officeId) : Promise.resolve(null),
      this.lawyers.signerForCard(databaseRef, clientId, cardId, uf)
    ]);
    const officeUf = ufOf(office?.uf ?? null);
    const place = office?.city && officeUf ? { city: office.city, uf: officeUf } : null;
    const gaps: PetitionClosingGap[] = [];
    if (!officeId) gaps.push('card_without_office');
    else if (!place) gaps.push('office_without_city');
    if (!signer) gaps.push('no_assignee_lawyer_for_uf');
    return {
      place,
      signer: signer ? { identityId: signer.identityId, name: signer.signatureName, oabNumber: signer.oabNumber, oabUf: signer.oabUf } : null,
      gaps
    };
  }
}

/** UF da ficha so vale se for uma das 27 (texto livre antigo nao conta). */
export function ufOf(value: string | null): BrazilUf | null {
  const uf = value?.trim().toUpperCase() ?? '';
  return (BRAZIL_UFS as readonly string[]).includes(uf) ? (uf as BrazilUf) : null;
}
