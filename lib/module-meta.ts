/** Metadata visual compartida por categoría de analysis_types y por familia de módulo (7 slugs, ver getModuleFamily en comparison-indicators.ts). */

export type CategoryMeta = { label: string; badgeClass: string; dotClass: string };

export const CATEGORY_META: Record<string, CategoryMeta> = {
  financiero: { label: 'Financiero', badgeClass: 'bg-blue-50 text-blue-700', dotClass: 'bg-blue-500' },
  comercial: { label: 'Comercial', badgeClass: 'bg-purple-50 text-purple-700', dotClass: 'bg-purple-500' },
  operativo: { label: 'Operativo', badgeClass: 'bg-orange-50 text-orange-700', dotClass: 'bg-orange-500' },
  talento_humano: { label: 'Talento Humano', badgeClass: 'bg-teal-50 text-teal-700', dotClass: 'bg-teal-500' },
};
export const DEFAULT_CATEGORY_META: CategoryMeta = { label: 'Otro', badgeClass: 'bg-slate-100 text-slate-600', dotClass: 'bg-slate-400' };

export type ModuleMeta = { label: string; badgeClass: string; dotClass: string };

/** Distinto del anterior: aquí cada uno de los 7 módulos tiene su propio color, aunque dos compartan categoría (p.ej. financiero_general y costos_rentabilidad son ambos "financiero" en CATEGORY_META, pero distintos módulos aquí). */
export const MODULE_META: Record<string, ModuleMeta> = {
  financiero: { label: 'Financiero', badgeClass: 'bg-blue-50 text-blue-700', dotClass: 'bg-blue-500' },
  clientes: { label: 'Clientes', badgeClass: 'bg-purple-50 text-purple-700', dotClass: 'bg-purple-500' },
  ventas: { label: 'Ventas', badgeClass: 'bg-fuchsia-50 text-fuchsia-700', dotClass: 'bg-fuchsia-500' },
  inventarios: { label: 'Inventarios', badgeClass: 'bg-orange-50 text-orange-700', dotClass: 'bg-orange-500' },
  operativo: { label: 'Operativo', badgeClass: 'bg-amber-50 text-amber-700', dotClass: 'bg-amber-500' },
  nomina_talento: { label: 'Nómina y Talento', badgeClass: 'bg-teal-50 text-teal-700', dotClass: 'bg-teal-500' },
  costos_rentabilidad: { label: 'Costos y Rentabilidad', badgeClass: 'bg-indigo-50 text-indigo-700', dotClass: 'bg-indigo-500' },
};
export const DEFAULT_MODULE_META: ModuleMeta = { label: 'Otro', badgeClass: 'bg-slate-100 text-slate-600', dotClass: 'bg-slate-400' };
