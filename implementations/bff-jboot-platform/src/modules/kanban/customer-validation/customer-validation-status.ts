import { CustomerDocumentRequirements, missingCustomerDocumentTypes, sameRequirements } from '../customer-documents/customer-document-catalog';
import { CustomerDocumentRow } from '../customer-documents/customer-documents.repository';
import { ValidationRunRow, ValidationSnapshotItem } from './customer-validation.repository';

/** Situacao da ficha para a tela e para os alertas da listagem (ADR 017). */
export type CustomerValidationStatus =
  | 'documentos_incompletos'
  | 'em_validacao'
  | 'aguardando_confirmacao'
  | 'validado'
  | 'nao_validado';

/** O run vale para a ficha atual se as versoes e o perfil (terceiro, CPF na identidade) nao mudaram. */
export function sameDocuments(
  run: Pick<ValidationRunRow, 'documentsSnapshot' | 'residenceProofThirdParty' | 'cpfOnIdentity'>,
  current: Pick<CustomerDocumentRow, 'id' | 'documentType'>[],
  requirements: CustomerDocumentRequirements
): boolean {
  if (!sameRequirements(run, requirements)) return false;
  const currentIds = new Set(current.map((row) => row.id));
  const snapshot = run.documentsSnapshot as ValidationSnapshotItem[];
  if (!snapshot.every((item) => currentIds.has(item.documentId))) return false;
  const snapshotTypes = new Set(snapshot.map((item) => item.type));
  return missingCustomerDocumentTypes(snapshotTypes, requirements).length === 0;
}

export function deriveStatus(
  documentsComplete: boolean,
  runs: ValidationRunRow[],
  current: Pick<CustomerDocumentRow, 'id' | 'documentType'>[],
  requirements: CustomerDocumentRequirements
): CustomerValidationStatus {
  if (!documentsComplete) return 'documentos_incompletos';
  const latest = runs[0];
  if (latest && (latest.status === 'dispatching' || latest.status === 'dispatched')) return 'em_validacao';
  if (runs.some((run) => run.confirmedAt && sameDocuments(run, current, requirements))) return 'validado';
  if (latest?.status === 'answered' && !latest.confirmedAt && sameDocuments(latest, current, requirements)) {
    return 'aguardando_confirmacao';
  }
  return 'nao_validado';
}
