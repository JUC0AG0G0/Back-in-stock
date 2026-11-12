import { useQuery } from '@tanstack/react-query';
import type { PluginTestResult } from '@/lib/plugin-tests-api';
import { previewProduct } from './api';

/** Live read of a product page, shared by the preview card and the form (one request). */
export function useProductPreview(url: string, sourceId: string | undefined) {
  return useQuery({
    queryKey: ['watches', 'preview', sourceId, url],
    queryFn: () => previewProduct(sourceId ?? '', url),
    enabled: sourceId !== undefined,
    retry: false,
    staleTime: 60_000,
  });
}

/** Product read by the preview, when the page could be read. */
export function previewedProduct(result: PluginTestResult | undefined) {
  return result?.output?.type === 'product' ? result.output.product : undefined;
}
