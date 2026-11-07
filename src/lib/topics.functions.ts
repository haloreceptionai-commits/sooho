import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Video } from "@/lib/store";
import type { TopicUse } from "@/lib/topics";

/** Durable usage comes from the owner's cloud records, never a browser-only list. */
export const getTopicHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TopicUse[]> => {
    const history: TopicUse[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await context.supabase.from("videos").select("id, data").order("id").range(offset, offset + 499);
      if (error) throw new Error("Could not check your saved topics. Please try again.");
      for (const row of data ?? []) {
        const video = row.data as unknown as Video;
        if (video.input?.topic) history.push({ topic: video.input.topic, topicId: video.input.topicId, status: video.status });
      }
      if (!data || data.length < 500) break;
    }
    return history;
  });