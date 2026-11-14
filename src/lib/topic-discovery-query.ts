import { queryOptions } from '@tanstack/react-query';
import { getDiscoveries } from './topic-discovery.functions';
export const discoveryQuery = queryOptions({ queryKey: ['topic-discoveries'], queryFn: () => getDiscoveries(), staleTime: 0 });