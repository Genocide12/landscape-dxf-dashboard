// Классификация слоёв DXF по ландшафтным зонам (RU + EN ключевые слова).

export type ZoneId =
  | 'building'
  | 'patio'
  | 'water'
  | 'paving'
  | 'lawn'
  | 'planting'
  | 'garden'
  | 'fence'
  | 'annotation'
  | 'other';

export interface ZoneDef {
  id: ZoneId;
  label: string;
  stroke: string;
  fill: string | null;
  dash: string | null;
  /** включать ли зону в долю озеленения */
  green?: boolean;
}

export const ZONES: ZoneDef[] = [
  { id: 'building', label: 'Дом и постройки', stroke: '#3f3f46', fill: '#d4d4d8', dash: null },
  { id: 'patio', label: 'Террасы и patio', stroke: '#b45309', fill: '#fed7aa', dash: null },
  { id: 'water', label: 'Вода', stroke: '#0369a1', fill: '#bae6fd', dash: null },
  { id: 'paving', label: 'Дорожки и покрытия', stroke: '#52525b', fill: '#e4e4e7', dash: null },
  { id: 'lawn', label: 'Газон', stroke: '#15803d', fill: '#bbf7d0', dash: null, green: true },
  { id: 'planting', label: 'Деревья и растения', stroke: '#4d7c0f', fill: '#d9f99d', dash: null, green: true },
  { id: 'garden', label: 'Огород и сад', stroke: '#ca8a04', fill: '#fde68a', dash: null, green: true },
  { id: 'fence', label: 'Забор и границы', stroke: '#18181b', fill: null, dash: '7 4' },
  { id: 'annotation', label: 'Аннотации', stroke: '#71717a', fill: null, dash: null },
  { id: 'other', label: 'Прочее', stroke: '#78716c', fill: '#f5f5f4', dash: null },
];

export const ZONE_MAP: Record<ZoneId, ZoneDef> = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<ZoneId, ZoneDef>;

interface ZoneRule {
  id: ZoneId;
  keywords: string[];
}

// Порядок важен: более специфичные зоны — раньше.
const RULES: ZoneRule[] = [
  {
    id: 'annotation',
    keywords: ['аннот', 'текст', 'text', 'размер', 'dimension', 'dim.', 'подпис', 'легенд', 'штамп', 'титул'],
  },
  {
    id: 'fence',
    keywords: ['забор', 'fence', 'огражд', 'границ', 'boundary', 'изгород', 'wall', 'стен'],
  },
  {
    id: 'building',
    keywords: ['дом', 'house', 'building', 'сооруж', 'постро', 'строен', 'беседк', 'гараж', 'garage', 'теплиц', 'навес', 'пергол'],
  },
  {
    id: 'water',
    keywords: ['вода', 'water', 'пруд', 'pond', 'озер', 'бассейн', 'pool', 'ручь', 'фонтан', 'fount', 'речк', 'swamp'],
  },
  {
    id: 'paving',
    keywords: ['дорожк', 'path', 'walk', 'мощен', 'покрыт', 'площадк', 'парковк', 'parking', 'driveway', 'заезд', 'асфальт', 'бетон', 'asphalt', 'тротуар', 'road', 'дорог'],
  },
  {
    id: 'patio',
    keywords: ['террас', 'веранд', 'patio', 'deck', 'подиум'],
  },
  {
    id: 'planting',
    keywords: ['дерев', 'tree', 'куст', 'shrub', 'растен', 'plant', 'цветник', 'клумб', 'flower', 'живая', 'hedge', 'хвойн', 'хвой'],
  },
  {
    id: 'lawn',
    keywords: ['газон', 'lawn', 'grass', 'луг', 'meadow', 'трав'],
  },
  {
    id: 'garden',
    keywords: ['огород', 'garden', 'грядк', 'овощ', 'плод', 'orchard', 'сад', 'ягодн', 'виноград'],
  },
];

const cache = new Map<string, ZoneId>();

export function classifyLayer(layerName: string): ZoneId {
  const key = layerName.toLowerCase().trim();
  const cached = cache.get(key);
  if (cached) return cached;
  let result: ZoneId = 'other';
  for (const rule of RULES) {
    if (rule.keywords.some((k) => key.includes(k))) {
      result = rule.id;
      break;
    }
  }
  cache.set(key, result);
  return result;
}
