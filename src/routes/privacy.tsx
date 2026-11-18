import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Chronicle Studio" },
      {
        name: "description",
        content:
          "How Chronicle Studio (sooha.io) collects, uses and protects your data, including YouTube and Facebook Page connections.",
      },
      { property: "og:title", content: "Privacy Policy — Chronicle Studio" },
      {
        property: "og:description",
        content:
          "How Chronicle Studio (sooha.io) collects, uses and protects your data, including YouTube and Facebook Page connections.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Chronicle Studio · sooha.io</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 18 November 2026</p>

        <Section title="1. Who we are">
          <p>
            Chronicle Studio ("we", "the app") is a private AI video creation dashboard operated by its owner at
            sooha.io. It helps the owner research topics, write scripts, generate narration and visuals, assemble
            videos, and manage connected YouTube channels and Facebook Pages. The app is not open to the general
            public; access is limited to the owner.
          </p>
        </Section>

        <Section title="2. Information we collect">
          <p>When you sign in and use the app, we store:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Your account email address and sign-in details (handled by our authentication provider).</li>
            <li>Workspaces you create and the videos, scripts and settings you save in them.</li>
            <li>
              Connection tokens for services you choose to link (YouTube channels and Facebook Pages), so the app
              can read stats and post on your behalf.
            </li>
            <li>Generated media files (images, narration audio, finished videos) stored in private cloud storage.</li>
          </ul>
        </Section>

        <Section title="3. How we use your information">
          <ul className="list-disc space-y-1 pl-5">
            <li>To generate scripts, images, narration and videos you request.</li>
            <li>To show analytics for your connected YouTube channels and Facebook Pages.</li>
            <li>To publish videos or reply to comments only when you ask the app to.</li>
            <li>To keep your library available across devices and browsers.</li>
          </ul>
          <p>We do not sell your data, and we do not use it for advertising.</p>
        </Section>

        <Section title="4. YouTube and Facebook connections">
          <p>
            If you connect a YouTube channel, we use the Google/YouTube APIs to read channel and video statistics
            and, when you ask, to upload videos or reply to comments. Use of Google API data follows the{" "}
            <a className="text-primary underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
              Google API Services User Data Policy
            </a>
            .
          </p>
          <p>
            If you connect a Facebook Page, we use the Meta Graph API with the permissions pages_show_list,
            pages_read_engagement and pages_manage_posts to list your Pages, read Page insights (such as followers
            and likes) and, when you ask, publish content to your Page. We only access Pages you explicitly
            authorize. You can disconnect a Page at any time in Settings, which deletes the stored tokens, and you
            can also remove the app's access from your Facebook settings.
          </p>
        </Section>

        <Section title="5. Third-party services that process data">
          <ul className="list-disc space-y-1 pl-5">
            <li>Lovable Cloud (hosting, database, authentication and file storage).</li>
            <li>Azure OpenAI and Lovable AI (script writing, image generation and narration voices).</li>
            <li>Apify and Azure container services (video rendering jobs).</li>
            <li>Google/YouTube and Meta/Facebook (only when you connect those accounts).</li>
          </ul>
          <p>Each provider processes data under its own privacy policy.</p>
        </Section>

        <Section title="6. Visitor analytics on this website">
          <p>
            This site uses Lovable's built-in visitor analytics. It uses no cookies, stores nothing on your device,
            does not keep IP addresses and does not identify visitors. Lovable collects this data for us.{" "}
            <a className="text-primary underline" href="https://lovable.dev/privacy" target="_blank" rel="noreferrer">
              Lovable's privacy policy
            </a>{" "}
            explains how it handles it.
          </p>
          <p>
            For every visitor it records the pages visited, where visitors came from, their country, browser,
            operating system and device type, how long they stay, how fast pages load, errors, and which buttons and
            links are clicked. Detailed data is kept for 90 days and daily summaries for a year.
          </p>
        </Section>

        <Section title="7. Data retention and deletion">
          <p>
            Your videos, scripts and workspaces are kept until you ask for them to be removed. Connection tokens are
            deleted when you disconnect a service. To request deletion of your account data, contact the owner at
            the email below.
          </p>
        </Section>

        <Section title="8. Your rights and local rules">
          <p>
            Privacy rules differ by country and region. Depending on where you live you may have rights to access,
            correct or delete your data; please check with someone who knows the rules where your visitors are, and
            contact us to exercise any right.
          </p>
        </Section>

        <Section title="9. Contact">
          <p>
            Questions about this policy or your data: contact the site owner via sooha.io. This app is operated by an
            individual for personal channel management.
          </p>
        </Section>
      </div>
    </div>
  );
}
