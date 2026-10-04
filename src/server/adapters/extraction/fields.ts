import type { Confidence, ExtractedField, FieldSource } from '@/contracts/extraction';

export function taken(
  value: string,
  source: FieldSource,
  confidence: Confidence = 'high',
  extra?: { reasons?: string[]; evidence?: ExtractedField['evidence'] },
): ExtractedField {
  return {
    value,
    confidence,
    source,
    ...(extra?.reasons && extra.reasons.length > 0 ? { reasons: extra.reasons } : {}),
    ...(extra?.evidence ? { evidence: extra.evidence } : {}),
  };
}

export function missing(source: FieldSource = 'llm'): ExtractedField {
  return { value: null, confidence: 'low', source };
}

export function downgrade(field: ExtractedField, reason: string, confidence: Confidence = 'low'): ExtractedField {
  return {
    ...field,
    confidence,
    reasons: [...(field.reasons ?? []), reason],
  };
}
