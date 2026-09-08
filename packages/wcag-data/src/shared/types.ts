import type {
   ActRuleIndexArtifact,
   AxeRuleIndexArtifact,
   CoverageArtifact,
   CoverageState,
   CoverageSummaryArtifact,
   PreferredEvidenceMode,
   StrategyArtifact,
   WcagVersion,
} from '@a11ied/contracts';

export type SourceFormat = 'json' | 'yaml' | 'derived-json';
export type JsonRecord = Record<string, unknown>;
export type TechniqueKind = 'sufficient' | 'advisory' | 'failure';

type RemoteSourceId = 'wcag22' | 'wcag21' | 'act-mapping' | 'quickref-tags';
type LocalSourceId = 'axe-rules';
type RawSourceId = RemoteSourceId | LocalSourceId;

export type FetchLike = typeof fetch;

export interface WcagDataDirectories {
   packageRoot: string;
   raw: string;
   generated: string;
   scripts: string;
   test: string;
}

export interface RawSourceDefinition {
   id: RawSourceId;
   fileName: string;
   format: SourceFormat;
   primaryUrl: string;
   fallbackUrls?: string[];
   upstreamVersion?: string;
   validate: (payload: unknown) => void;
}

export interface CriterionPayload {
   id: string;
   num: string;
   alt_id?: string[];
   content: string;
   handle: string;
   title: string;
   versions: string[];
   level: 'A' | 'AA' | 'AAA';
   details?: unknown[];
   techniques?: {
      sufficient?: TechniqueOrGroupPayload[];
      advisory?: TechniqueOrGroupPayload[];
      failure?: TechniquePayload[];
   };
}

interface GuidelinePayload {
   id: string;
   num: string;
   handle: string;
   title: string;
   successcriteria: CriterionPayload[];
}

interface PrinciplePayload {
   id: string;
   num: string;
   handle: string;
   title: string;
   guidelines: GuidelinePayload[];
}

export interface TechniqueGroupPayload {
   title?: string;
   note?: string;
   techniques?: TechniquePayload[];
}

export interface TechniquePayload {
   id?: string;
   title: string;
   technology?: string;
   suffix?: string;
   using?: TechniquePayload[];
   and?: TechniquePayload[];
}

/**
 * A `sufficient`/`advisory` entry is either a `{title, techniques}` "Situation" group, or
 * a technique node placed directly at the top level (a real technique, or a synthetic
 * OR/AND wrapper with `using`/`and` children and no `techniques` list of its own).
 */
export type TechniqueOrGroupPayload = TechniqueGroupPayload | TechniquePayload;

export type QuickrefTagsPayload = Record<string, Record<string, string>>;

export interface WcagPayload {
   principles: PrinciplePayload[];
   terms: unknown;
}

interface ActAccessibilityRequirementPayload {
   secondary?: string;
}

// Fallow-ignore-next-line unused-type
export interface ActRulePayload {
   title: string;
   permalink?: string;
   successCriteria?: string[];
   wcagTechniques?: string[];
   deprecated?: boolean;
   proposed?: boolean;
   frontmatter?: {
      id?: string;
      accessibility_requirements?: Record<string, ActAccessibilityRequirementPayload>;
   };
}

export interface ActMappingPayload {
   'act-rules': ActRulePayload[];
}

export interface RawSourceProvenance {
   sourceId: RawSourceId;
   sourceUrl: string;
   resolvedUrl: string;
   syncedAt: string;
   upstreamVersion?: string;
   sha256: string;
   contentType: SourceFormat;
   etag?: string;
   lastModified?: string;
   fallbackUsed: boolean;
}

export interface RawArtifactWriteResult {
   sourceId: RawSourceId;
   fileName: string;
   filePath: string;
   provenancePath: string;
   provenance: RawSourceProvenance;
}

export interface SyncRawSourcesResult {
   fetchList: string[];
   artifacts: RawArtifactWriteResult[];
   axeRuleCount: number;
}

export interface PendingArtifact {
   sourceId: RawSourceId;
   fileName: string;
   body: string;
   provenance: RawSourceProvenance;
}

export interface GeneratedArtifactWriteResult {
   fileName: string;
   filePath: string;
}

export interface NormalizedArtifactsResult {
   generatedArtifacts: GeneratedArtifactWriteResult[];
   criteriaCountByVersion: Record<WcagVersion, number>;
   coverageCountsByVersion: Record<WcagVersion, Record<CoverageState, number>>;
}

export interface GeneratedArtifactProvenance {
   fileName: string;
   sha256: string;
   wcagVersion?: WcagVersion;
   sourceFileNames: string[];
   sourceUrls: string[];
}

export interface GeneratedProvenanceManifest {
   generatedAt: string;
   rawSources: Array<RawSourceProvenance & { fileName: string }>;
   artifacts: GeneratedArtifactProvenance[];
}

export interface DerivedAxeRule {
   ruleId: string;
   description: string;
   help: string;
   helpUrl: string;
   tags: string[];
   actIds: string[];
}

// Fallow-ignore-next-line unused-type
export interface StrategySeed {
   preferredEvidenceMode: PreferredEvidenceMode;
   procedureIds: string[];
   requiresRealTarget: boolean;
   notes: string[];
}

// Fallow-ignore-next-line unused-type
export interface GeneratedCoverageArtifacts {
   coverageArtifact: CoverageArtifact;
   strategyArtifact: StrategyArtifact;
   coverageSummaryArtifact: CoverageSummaryArtifact;
   axeRuleIndexArtifact: AxeRuleIndexArtifact;
   actRuleIndexArtifact: ActRuleIndexArtifact;
}

const SYNC_ERROR_EXIT_CODE = 3;

/** Raised when raw or generated WCAG data fails local validation. */
export class SyncValidationError extends Error {
   // Fallow-ignore-next-line unused-class-member
   readonly exitCode = SYNC_ERROR_EXIT_CODE;
   readonly sourceId: RawSourceId;
   readonly sourceUrl: string;

   constructor(sourceId: RawSourceId, sourceUrl: string, message: string) {
      super(message);
      this.name = 'SyncValidationError';
      this.sourceId = sourceId;
      this.sourceUrl = sourceUrl;
   }
}
