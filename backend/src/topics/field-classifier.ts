// Group the many granular OpenAlex/Semantic Scholar topic names into a handful of
// broad environmental fields, using deterministic keyword rules (most specific first).
// No external calls — works on the topic string we already store on each paper.

export type FieldDef = {
  field: string;
  icon: string;        // lucide icon name (resolved on the client)
  keywords: string[];
};

export const FIELDS: FieldDef[] = [
  { field: 'Pollution & Waste', icon: 'Trash2', keywords: ['plastic', 'microplastic', 'pollution', 'pollutant', 'contamin', 'waste', 'recycl', 'compost', 'landfill', 'sewage', 'effluent', 'heavy metal'] },
  { field: 'Climate & Carbon', icon: 'CloudSun', keywords: ['carbon', 'emission', 'climate', 'greenhouse', 'co2', 'warming', 'sequestrat', 'decarboni', 'ghg', 'net zero', 'methane'] },
  { field: 'Energy', icon: 'Zap', keywords: ['energy', 'solar', 'renewable', 'biofuel', 'biogas', 'fuel cell', 'photovolta', 'hydrogen', 'wind', 'power', 'electric', 'battery', 'grid'] },
  { field: 'Water & Marine', icon: 'Droplets', keywords: ['water', 'marine', 'ocean', 'aquatic', 'wastewater', 'hydrolog', 'river', 'groundwater', 'desalinat', 'coastal', 'seagrass'] },
  { field: 'Biodiversity & Ecosystems', icon: 'Leaf', keywords: ['biodiversity', 'species', 'ecolog', 'ecosystem', 'forest', 'wildlife', 'conservation', 'habitat', 'vegetation', 'microbial', 'microbiom', 'soil'] },
  { field: 'Agriculture & Food', icon: 'Wheat', keywords: ['agricultur', 'crop', 'food', 'farming', 'fertiliz', 'livestock', 'irrigation', 'horticultur', 'vermicompost'] },
  { field: 'Materials & Industry', icon: 'Factory', keywords: ['material', 'concrete', 'cement', 'geopolymer', 'industr', 'manufactur', 'construction', 'chemical', 'polymer', 'nanomaterial', 'catalys'] },
  { field: 'Sustainability & Policy', icon: 'Scale', keywords: ['sustainab', 'policy', 'governance', 'econom', 'circular economy', 'life cycle', 'lca', 'urban', 'environmental impact', 'assessment'] },
];

export const OTHER_FIELD = 'Other Research';

const titleCase = (s: string) =>
  s.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());

export const classifyField = (topic: string | null | undefined): string => {
  const raw = String(topic || '').trim();
  const text = raw.toLowerCase();
  if (!text) return OTHER_FIELD;
  for (const def of FIELDS) {
    if (def.keywords.some((kw) => text.includes(kw))) return def.field;
  }
  // Domain-agnostic fallback: non-green topics (e.g. medical) surface under their own
  // name rather than all collapsing into a single "Other" bucket.
  return titleCase(raw);
};

export const fieldIcon = (field: string): string =>
  FIELDS.find((f) => f.field === field)?.icon ?? 'BookOpen';
