import { createFileRoute } from "@tanstack/react-router";
import { ProjectsView } from "@/components/projects-view";

export const Route = createFileRoute("/long-form")({
  head: () => ({
    meta: [
      { title: "Long-form videos — Chronicle Studio" },
      { name: "description", content: "Manage documentary-style history episodes for YouTube." },
      { property: "og:title", content: "Long-form videos — Chronicle Studio" },
      { property: "og:description", content: "Manage documentary-style history episodes for YouTube." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <ProjectsView format="long" />,
});
