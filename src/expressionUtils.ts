import type { ExpressionKind } from './types'

export const DEFAULT_EXPRESSION_KIND: ExpressionKind = 'ObjectIntersectionOf'

/** OWL Manchester syntax keywords — unified labels for inspector and canvas. */
export const EXPRESSION_KIND_OPTIONS: ReadonlyArray<{
  value: ExpressionKind
  label: string
}> = [
  { value: 'ObjectIntersectionOf', label: 'and' },
  { value: 'ObjectUnionOf', label: 'or' },
  { value: 'ObjectComplementOf', label: 'not' },
  { value: 'ObjectSomeValuesFrom', label: 'some' },
  { value: 'ObjectAllValuesFrom', label: 'only' },
  { value: 'ObjectHasValue', label: 'value' },
  { value: 'ObjectHasSelf', label: 'Self' },
  { value: 'ObjectMinCardinality', label: 'min' },
  { value: 'ObjectMaxCardinality', label: 'max' },
  { value: 'ObjectExactCardinality', label: 'exactly' },
  { value: 'ObjectOneOf', label: 'oneOf' },
]

const LABEL_BY_KIND = new Map<ExpressionKind, string>(
  EXPRESSION_KIND_OPTIONS.map((o) => [o.value, o.label]),
)

export function getExpressionKindLabel(kind: ExpressionKind): string {
  return LABEL_BY_KIND.get(kind) ?? kind
}

/** OWL 2 API construct name for the expression (e.g. ObjectIntersectionOf). */
export function getExpressionOwlConstructName(kind: ExpressionKind): string {
  return kind
}
