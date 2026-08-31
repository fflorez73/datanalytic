import { INDICATOR_SECTIONS, formatIndicatorValue } from '@/lib/financial-indicators';

export function AnalysisDetail({
  title,
  companyName,
  periodStart,
  periodEnd,
  analysisTypeName,
  status,
  results,
}: {
  title: string;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  status: string;
  results: unknown;
}) {
  const resultsObj = (results && typeof results === 'object' ? results : {}) as Record<string, any>;
  const hasIndicators = Boolean(resultsObj.liquidez || resultsObj.endeudamiento || resultsObj.rentabilidad);
  const warnings: string[] = Array.isArray(resultsObj.warnings) ? resultsObj.warnings : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase text-slate-400">Empresa</dt>
            <dd className="mt-0.5 text-slate-700">{companyName}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-400">Período</dt>
            <dd className="mt-0.5 text-slate-700">
              {periodStart} — {periodEnd}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-400">Tipo</dt>
            <dd className="mt-0.5 text-slate-700">{analysisTypeName}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-400">Estado</dt>
            <dd className="mt-0.5">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  status === 'published' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                {status === 'published' ? 'Publicado' : 'Borrador'}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-800">Advertencias</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {hasIndicators ? (
        <div className="grid gap-6 md:grid-cols-3">
          {INDICATOR_SECTIONS.map((section) => (
            <section key={section.key} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-slate-900">{section.title}</h2>
              <dl className="space-y-3">
                {section.items.map((item) => {
                  const value = resultsObj[section.key]?.[item.key] ?? null;
                  return (
                    <div key={item.key} className="flex items-center justify-between text-sm">
                      <dt className="text-slate-500">{item.label}</dt>
                      <dd className={value === null ? 'font-medium text-slate-300' : 'font-medium text-slate-900'}>
                        {formatIndicatorValue(value, item.format)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-slate-500">Este análisis no tiene indicadores calculados.</p>
        </div>
      )}
    </div>
  );
}
