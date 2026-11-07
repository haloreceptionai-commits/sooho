import { queryOptions } from "@tanstack/react-query";
import { getTopicHistory } from "@/lib/topics.functions";

export const topicHistoryQuery = queryOptions({
  queryKey: ["topic-history"],
  queryFn: () => getTopicHistory(),
  staleTime: 0,
  refetchOnWindowFocus: true,
});