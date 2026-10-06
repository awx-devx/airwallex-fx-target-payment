import { z } from 'zod';
import { apiPost, apiRequest } from '@/features/data/http';
import { getDataSource, isApiDataSource } from '@/features/data/source';

const created = z.object({ ids: z.array(z.string()) });

/** DEMO-ONLY: sample invoices become scanned drafts. PROD: only uploaded documents are extracted. */
export async function addSampleBills(count: number): Promise<string[]> {
  if (isApiDataSource()) {
    const result = await apiRequest('/api/demo/samples', created, apiPost('/api/demo/samples', { count }));
    return result.ids;
  }
  return getDataSource().addSamples(count);
}
