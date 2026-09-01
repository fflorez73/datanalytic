import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAnalysisHistory } from '@/lib/analysis-history';
import { AnalysisDetail } from '@/components/analysis-detail';
import { CustomerAnalysisDetail } from '@/components/customer-analysis-detail';
import { SalesAnalysisDetail } from '@/components/sales-analysis-detail';
import { InventoryAnalysisDetail } from '@/components/inventory-analysis-detail';
import { OperationsAnalysisDetail } from '@/components/operations-analysis-detail';
import { HrAnalysisDetail } from '@/components/hr-analysis-detail';
import { CostProfitabilityAnalysisDetail } from '@/components/cost-profitability-analysis-detail';
import { CUSTOMER_ANALYSIS_TYPE_CODES } from '@/lib/customer-analytics';
import { SALES_ANALYSIS_TYPE_CODES } from '@/lib/sales-analytics';
import { INVENTORY_ANALYSIS_TYPE_CODES } from '@/lib/inventory-analytics';
import { OPERATIONS_ANALYSIS_TYPE_CODES } from '@/lib/operations-analytics';
import { HR_ANALYSIS_TYPE_CODES } from '@/lib/hr-analytics';
import { COST_PROFITABILITY_ANALYSIS_TYPE_CODES } from '@/lib/cost-profitability-analytics';

export default async function AdminAnalysisDetailPage({ params }: { params: { id: string } }) {
  const admin = createAdminClient();

  const { data: analysis } = await admin
    .from('analyses')
    .select(
      'id, title, status, period_start, period_end, results, narrative, company_id, analysis_type_id, companies(name), analysis_types(name, code)'
    )
    .eq('id', params.id)
    .is('deleted_at', null)
    .single();

  if (!analysis) notFound();

  const companyName = (analysis as any).companies?.name || '—';
  const analysisTypeName = (analysis as any).analysis_types?.name || '—';
  const analysisTypeCode = (analysis as any).analysis_types?.code || '';
  const isCustomerAnalysis = (CUSTOMER_ANALYSIS_TYPE_CODES as readonly string[]).includes(analysisTypeCode);
  const isSalesAnalysis = (SALES_ANALYSIS_TYPE_CODES as readonly string[]).includes(analysisTypeCode);
  const isInventoryAnalysis = (INVENTORY_ANALYSIS_TYPE_CODES as readonly string[]).includes(analysisTypeCode);
  const isOperationsAnalysis = (OPERATIONS_ANALYSIS_TYPE_CODES as readonly string[]).includes(analysisTypeCode);
  const isHrAnalysis = (HR_ANALYSIS_TYPE_CODES as readonly string[]).includes(analysisTypeCode);
  const isCostProfitabilityAnalysis = (COST_PROFITABILITY_ANALYSIS_TYPE_CODES as readonly string[]).includes(analysisTypeCode);

  const others = await fetchAnalysisHistory(admin, {
    companyId: analysis.company_id,
    analysisTypeId: analysis.analysis_type_id,
    excludeId: analysis.id,
  });

  const history =
    others.length > 0
      ? [...others, { periodLabel: analysis.period_end, results: analysis.results }].sort((a, b) =>
          a.periodLabel < b.periodLabel ? -1 : 1
        )
      : undefined;

  return (
    <div className="space-y-6">
      <Link href="/admin/dashboard/analyses" className="text-xs text-slate-400 hover:underline">
        ← Volver a análisis
      </Link>

      {isCustomerAnalysis ? (
        <CustomerAnalysisDetail
          id={analysis.id}
          title={analysis.title}
          companyName={companyName}
          periodStart={analysis.period_start}
          periodEnd={analysis.period_end}
          analysisTypeName={analysisTypeName}
          status={analysis.status}
          results={analysis.results}
          narrative={analysis.narrative}
        />
      ) : isSalesAnalysis ? (
        <SalesAnalysisDetail
          id={analysis.id}
          title={analysis.title}
          companyName={companyName}
          periodStart={analysis.period_start}
          periodEnd={analysis.period_end}
          analysisTypeName={analysisTypeName}
          status={analysis.status}
          results={analysis.results}
          narrative={analysis.narrative}
        />
      ) : isInventoryAnalysis ? (
        <InventoryAnalysisDetail
          id={analysis.id}
          title={analysis.title}
          companyName={companyName}
          periodStart={analysis.period_start}
          periodEnd={analysis.period_end}
          analysisTypeName={analysisTypeName}
          status={analysis.status}
          results={analysis.results}
          narrative={analysis.narrative}
        />
      ) : isOperationsAnalysis ? (
        <OperationsAnalysisDetail
          id={analysis.id}
          title={analysis.title}
          companyName={companyName}
          periodStart={analysis.period_start}
          periodEnd={analysis.period_end}
          analysisTypeName={analysisTypeName}
          status={analysis.status}
          results={analysis.results}
          narrative={analysis.narrative}
        />
      ) : isHrAnalysis ? (
        <HrAnalysisDetail
          id={analysis.id}
          title={analysis.title}
          companyName={companyName}
          periodStart={analysis.period_start}
          periodEnd={analysis.period_end}
          analysisTypeName={analysisTypeName}
          status={analysis.status}
          results={analysis.results}
          narrative={analysis.narrative}
        />
      ) : isCostProfitabilityAnalysis ? (
        <CostProfitabilityAnalysisDetail
          id={analysis.id}
          title={analysis.title}
          companyName={companyName}
          periodStart={analysis.period_start}
          periodEnd={analysis.period_end}
          analysisTypeName={analysisTypeName}
          status={analysis.status}
          results={analysis.results}
          narrative={analysis.narrative}
        />
      ) : (
        <AnalysisDetail
          id={analysis.id}
          title={analysis.title}
          companyName={companyName}
          periodStart={analysis.period_start}
          periodEnd={analysis.period_end}
          analysisTypeName={analysisTypeName}
          status={analysis.status}
          results={analysis.results}
          narrative={analysis.narrative}
          history={history}
        />
      )}
    </div>
  );
}
