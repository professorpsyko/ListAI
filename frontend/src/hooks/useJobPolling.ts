import { useQuery } from '@tanstack/react-query';
import { getJobStatus } from '../lib/api';
import { useListingStore } from '../store/listingStore';

export function useJobPolling(listingId: string | null) {
  const setImageJobStatus = useListingStore((s) => s.setImageJobStatus);
  const setProcessedPhotos = useListingStore((s) => s.setProcessedPhotos);
  const setPricingJobStatus = useListingStore((s) => s.setPricingJobStatus);
  const setPricingResearch = useListingStore((s) => s.setPricingResearch);
  const setShippingSuggestion = useListingStore((s) => s.setShippingSuggestion);
  const setShippingSuggestionStatus = useListingStore((s) => s.setShippingSuggestionStatus);
  const shippingSuggestionStatus = useListingStore((s) => s.shippingSuggestionStatus);

  return useQuery({
    queryKey: ['job-status', listingId],
    queryFn: async () => {
      if (!listingId) return null;
      const data = await getJobStatus(listingId);

      // Sync image job status
      if (data.imageJobStatus) {
        setImageJobStatus(data.imageJobStatus);
      }
      if (data.processedImageUrls?.length) {
        setProcessedPhotos(data.processedImageUrls);
      }

      // Sync pricing job status
      if (data.pricingJobStatus) {
        setPricingJobStatus(data.pricingJobStatus);
      }
      if (data.pricingResearch) {
        setPricingResearch(data.pricingResearch);
      }

      // Sync shipping suggestion
      if (data.shippingSuggestion) {
        setShippingSuggestion(data.shippingSuggestion);
        setShippingSuggestionStatus('COMPLETE');
      }

      return data;
    },
    enabled: !!listingId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      const imagesDone = ['COMPLETE', 'FAILED'].includes(data.imageJobStatus);
      const pricingDone = ['COMPLETE', 'FAILED'].includes(data.pricingJobStatus);
      // Keep polling while shipping suggestion is still loading
      const shippingDone = shippingSuggestionStatus === 'COMPLETE' || shippingSuggestionStatus === 'FAILED' || !!data.shippingSuggestion;
      return imagesDone && pricingDone && shippingDone ? false : 2000;
    },
  });
}
