// Server-only: drafts warm, soft replies and posts them to unanswered YouTube comments.
import { azureJson } from "./pipeline-operations.server";
import { recentComments, postReply, refreshAccess } from "./youtube.server";

const SYSTEM = `You reply to YouTube comments on behalf of a friendly history & facts channel.
Tone: soft, warm, kind, grateful, human. 1-2 short sentences, max 220 characters. Reply in the commenter's language.
Thank them sincerely, respond to what they actually said, and if they asked something answer briefly and honestly.
If the comment is rude, stay calm and gracious. Never argue, never use hashtags or links, at most one emoji.
If the comment is spam, a scam or contains links, set skip to true.`;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["replies"],
  properties: { replies: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "reply", "skip"],
    properties: { id: { type: "string" }, reply: { type: "string" }, skip: { type: "boolean" } } } } },
};

/** Replies to up to `limit` unanswered comments; each comment is answered at most once (DB primary key). */
export async function replyToPending(userId: string, refreshToken: string, channelId: string, limit = 20, workspaceId: string | null = null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const access = await refreshAccess(refreshToken);
  const all = await recentComments(access, channelId);
  const ids = all.map((c) => c.id);
  const { data: done } = ids.length ? await supabaseAdmin.from("youtube_replies").select("comment_id").in("comment_id", ids) : { data: [] };
  const seen = new Set((done ?? []).map((d) => d.comment_id));
  const pending = all.filter((c) => !c.replied && !seen.has(c.id)).slice(0, limit);
  if (!pending.length) return { replied: 0, skipped: 0 };

  const out = await azureJson<{ replies: { id: string; reply: string; skip: boolean }[] }>("gpt-5", SYSTEM,
    JSON.stringify(pending.map((c) => ({ id: c.id, author: c.author, comment: c.text.slice(0, 800) }))), "replies", SCHEMA, "Comment replies");
  let replied = 0, skipped = 0;
  for (const c of pending) {
    const r = out.replies.find((x) => x.id === c.id);
    const text = r?.reply.trim().slice(0, 500) ?? "";
    // Claim first so a parallel run can never double-post.
    const { error } = await supabaseAdmin.from("youtube_replies").insert({ comment_id: c.id, user_id: userId, workspace_id: workspaceId, video_id: c.videoId, author: c.author, comment: c.text.slice(0, 2000), reply: r?.skip || !text ? "(skipped)" : text });
    if (error) continue;
    if (r?.skip || !text) { skipped++; continue; }
    try { await postReply(access, c.id, text); replied++; }
    catch (e) { await supabaseAdmin.from("youtube_replies").delete().eq("comment_id", c.id); console.error(e); }
  }
  return { replied, skipped };
}
