import type { Metadata } from "next";
import { LegalPage, Mail, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Deckwatch Kenya collects, what stays on your device, and your rights under Kenya's Data Protection Act.",
};

// Every claim here describes what the code does today. When a feature starts
// collecting something new (citizen reports, accounts), this page changes in
// the same commit, before it ships.
const SECTIONS: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <p>
        Deckwatch Kenya is an independent, open-source public safety project maintained by Lawrence Maluki in Kenya. For
        this policy, that maintainer is the data controller. You can reach us at <Mail subject="Privacy" />.
      </p>
    ),
  },
  {
    id: "news",
    title: "People named in news reports",
    body: (
      <>
        <p>
          Deckwatch is built from articles that Kenyan media have already published. Each incident keeps the article’s
          headline, a short summary, the outlet’s name and a link to the original. Those reports sometimes name
          people, such as victims, suspects or officials. Deckwatch does not add personal details of its own and does not
          try to identify anyone beyond what the publisher wrote.
        </p>
        <p>
          If you are named in an incident and want it corrected or removed, or if an incident exposes someone to danger,
          email <Mail subject="Removal request" /> or use <strong>Report a problem</strong> on the incident. The{" "}
          <a href="/terms#corrections">Terms of Use</a> describe how those requests are handled.
        </p>
      </>
    ),
  },
  {
    id: "device",
    title: "What stays on your device",
    body: (
      <>
        <p>There are no accounts. We never ask for your name, phone number or email address. Your settings stay in your browser:</p>
        <ul>
          <li>
            <strong>Alert settings and saved routes</strong> are kept in your browser’s local storage. They are not
            sent to us. Clearing this site’s data in your browser deletes them.
          </li>
          <li>
            <strong>Your location</strong> is used only if you turn it on for alerts or Route Watch, and only after your
            browser asks you. It is used on your device to match nearby incidents. We do not store it.
          </li>
          <li>
            <strong>Notifications</strong> are created by your own browser from incidents it has already loaded. We run
            no push service and hold no subscription for you.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "routes",
    title: "Route Watch",
    body: (
      <p>
        To draw a route, the start and end points you choose (which may be your current position) are sent through our
        server to a routing service: openrouteservice, or the public OSRM servers run by the OpenStreetMap community. They
        receive the coordinates but nothing that identifies you. Route results are cached for up to 24 hours so that
        repeat requests are fast. They are not linked to you.
      </p>
    ),
  },
  {
    id: "analytics",
    title: "Analytics and cookies",
    body: (
      <>
        <p>
          The website uses <strong>Google Analytics</strong> to count visits and see which pages are useful. Google
          receives the pages you view, your browser and device type, the referring site, and an approximate location
          derived from your IP address. It sets cookies (named <code>_ga</code>) to recognise a returning browser. We use
          this only as aggregate statistics, and Deckwatch sets no cookies of its own.
        </p>
        <p>
          You can block these cookies in your browser settings, or install Google’s{" "}
          <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">
            Analytics opt-out add-on
          </a>
          . The site works the same either way. Google’s use of the data is covered by the{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Google Privacy Policy
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "hosting",
    title: "Hosting and server logs",
    body: (
      <>
        <p>Deckwatch runs on these services, each of which processes data only to operate its part:</p>
        <ul>
          <li><strong>Vercel</strong> hosts the website and its public API.</li>
          <li><strong>Render</strong> hosts the backend API.</li>
          <li><strong>Supabase</strong> hosts the incident database, which holds news-derived incidents only.</li>
          <li><strong>GitHub</strong> hosts the source code and runs the hourly news ingestion.</li>
        </ul>
        <p>
          Like any web server, they record technical request logs (IP address, browser, time and page requested) for
          security and troubleshooting. We do not use these logs to identify visitors. They are kept for each
          provider’s standard retention period. Some of these providers store data outside Kenya.
        </p>
      </>
    ),
  },
  {
    id: "reports",
    title: "Incident reports from the public",
    body: (
      <p>
        The API has an endpoint for submitting an incident report, but nothing sent to it is stored. It is checked for
        format and then discarded. If Deckwatch starts accepting reports from the public, this policy will be updated
        before that happens, covering what is kept, who can see it and how it is moderated.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep data",
    body: (
      <p>
        Incidents are kept as a historical record, because the monthly safety reports and trend charts depend on them.
        An incident is removed or corrected when a valid request is made (see above). We keep no other personal data.
        Anything in your browser stays until you clear it.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>
          Under Kenya’s <strong>Data Protection Act, 2019</strong>, you have the right to be told how your personal
          data is used, to access it, to object to its processing, and to have false or misleading data corrected or
          deleted. To use any of these rights, email <Mail subject="Data protection request" />. We aim to respond within
          seven days.
        </p>
        <p>
          If you are not satisfied with our response, you can complain to the{" "}
          <a href="https://www.odpc.go.ke" target="_blank" rel="noopener noreferrer">
            Office of the Data Protection Commissioner
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        All traffic to Deckwatch uses HTTPS. Only the maintainer and the services above can access the database, which
        holds no account data. If a breach ever affected personal data, we would notify the Data Protection Commissioner
        within 72 hours, as the Act requires, and anyone affected without undue delay.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        Deckwatch has no accounts and asks for no personal details, so it does not knowingly collect data from children.
        Incidents involving children are reported as the original publisher reported them. We act promptly on requests
        to remove details that identify a child.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        When this policy changes, the date at the top changes too. The full history of the page is public in the
        project’s{" "}
        <a href="https://github.com/lawmaluki/deckwatch" target="_blank" rel="noopener noreferrer">
          GitHub repository
        </a>
        .
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Your data"
      title="Privacy Policy"
      summary={
        <p>
          <strong className="font-medium text-foreground">In short:</strong> Deckwatch has no accounts and doesn’t
          ask who you are. Your alert settings, saved routes and location stay in your browser. The website uses Google
          Analytics for visitor statistics. The incidents themselves come from published news, and anyone named in one
          can ask us to correct or remove it.
        </p>
      }
      sections={SECTIONS}
      other={{ href: "/terms", label: "Terms of Use" }}
    />
  );
}
