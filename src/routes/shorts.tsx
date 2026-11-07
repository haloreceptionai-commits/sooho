import { createFileRoute } from "@tanstack/react-router";
import { ProjectsView } from "@/components/projects-view";

export const Route = createFileRoute("/shorts")({
  head: () => ({
    meta: [
      { title: "Shorts & Reels — Chronicle Studio" },
      { name: "description", content: "Vertical history fact videos for Shorts, Reels and TikTok." },
      { property: "og:title", content: "Shorts & Reels — Chronicle Studio" },
      { property: "og:description", content: "Vertical history fact videos for Shorts, Reels and TikTok." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <ProjectsView format="short" />,
});
