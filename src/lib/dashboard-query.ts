import { queryOptions } from "@tanstack/react-query";
import { getDashboard } from "./dashboard.functions";
export const dashboardQuery = queryOptions({ queryKey: ["workspace-dashboard"], queryFn: () => getDashboard(), staleTime: 60_000, retry: 1 });