import type { WcagVersion } from '@a11ied/contracts';

export type DocumentRequestKind = 'understanding' | 'technique';

/** One page to fetch: an Understanding document (by criterion) or a technique body. */
export interface DocumentRequest {
   kind: DocumentRequestKind;
   id: string;
   title: string;
   version: WcagVersion;
   url: string;
   criterionId?: string;
}
