import type { Metadata } from "next";
import { LegalPage, Mail, type LegalSection } from "@/components/legal/LegalPage";
import { CORRECTION_RESPONSE_HOURS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms for using Deckwatch Kenya and its public API, and how corrections and takedowns are handled.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "service",
    title: "What Deckwatch is",
    body: (
      <p>
        Deckwatch Kenya is a free, independent, open-source service that gathers public safety incidents from Kenyan
        news reports and shows them on a map, in dashboards, in monthly reports and through a public API. Using the site
        or the API means you accept these terms. If you don’t accept them, please don’t use Deckwatch.
      </p>
    ),
  },
  {
    id: "emergency",
    title: "Not an emergency service",
    body: (
      <p>
        Deckwatch is not connected to the police or any emergency service, and it does not report incidents to them. It
        can be hours behind events, or miss them entirely. <strong>In an emergency, call 999, 112 or 911</strong>, and
        always follow instructions from official authorities over anything you read here.
      </p>
    ),
  },
  {
    id: "accuracy",
    title: "How reliable the information is",
    body: (
      <>
        <p>
          Incidents are collected and processed automatically. Software decides whether an article describes an incident,
          and assigns its category, severity and location. Some of this is AI-assisted. Any of these steps can be wrong:
        </p>
        <ul>
          <li>
            <strong>Verification measures corroboration, not truth.</strong> “Verified” means several
            independent outlets reported the incident. It does not mean Deckwatch or any authority has confirmed it.
          </li>
          <li>
            <strong>Most incidents come from a single outlet</strong> and are marked unconfirmed.
          </li>
          <li>
            <strong>Locations are often approximate.</strong> An incident whose article names only a county is placed at
            the county’s centre.
          </li>
          <li>
            <strong>Coverage follows newsrooms.</strong> A county with more incidents may simply have more reporters.
          </li>
        </ul>
        <p>
          Check the linked sources before acting on any one report. Deckwatch is provided “as is”, without
          any guarantee that it is accurate, complete or available.
        </p>
      </>
    ),
  },
  {
    id: "sources",
    title: "News content and copyright",
    body: (
      <p>
        Each incident shows a publisher’s headline, a short summary and a link to the full article on the
        publisher’s own site. Deckwatch does not copy full articles or host publishers’ photos or video.
        Copyright in that material stays with the publisher. A publisher who wants its material removed or presented
        differently can email <Mail subject="Publisher request" />.
      </p>
    ),
  },
  {
    id: "corrections",
    title: "Corrections and takedowns",
    body: (
      <>
        <p>
          Anyone can ask for an incident to be corrected or removed. Use <strong>Report a problem</strong> at the bottom
          of any incident, which opens an email with the incident already identified. Or email{" "}
          <Mail subject="Correction request" /> with a link to the incident or its headline. We act on reports that an
          incident:
        </p>
        <ul>
          <li>gets facts wrong, such as the place, date, category or number of people hurt;</li>
          <li>is not a real incident, or duplicates another one;</li>
          <li>exposes someone to danger, such as a witness, a victim or a child, or reveals where someone at risk lives;</li>
          <li>contains false accusations, hate speech or other unlawful content.</li>
        </ul>
        <p>
          The maintainer reviews every request by hand and replies within <strong>{CORRECTION_RESPONSE_HOURS} hours</strong>.
          A report that someone is at risk is dealt with first, and the incident is hidden while it is reviewed. The
          outcome is one of three: the incident is corrected, removed, or kept, with an explanation of why. Monthly reports
          that included it are corrected too.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <>
        <p>You may use Deckwatch for any lawful purpose. Please don’t:</p>
        <ul>
          <li>use it to harass, threaten or target anyone named or located in a report;</li>
          <li>present Deckwatch data as an official police, government or emergency-service record;</li>
          <li>try to break into, overload or disrupt the site, the API or the services behind them.</li>
        </ul>
      </>
    ),
  },
  {
    id: "api",
    title: "The public API",
    body: (
      <p>
        The <a href="/api-docs">API</a> is free and needs no key. Credit “Deckwatch Kenya”, link to the
        original articles when you show an incident, cache responses on your side, and keep request volumes reasonable.
        For heavy or bulk access, email <Mail subject="API access" />. Traffic that harms the service may be blocked. The
        API can change, and no uptime is guaranteed.
      </p>
    ),
  },
  {
    id: "code",
    title: "Open-source code",
    body: (
      <p>
        Deckwatch’s source code is published under the{" "}
        <a href="https://github.com/lawmaluki/deckwatch/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">
          MIT License
        </a>
        . You can use, change and redistribute it under that licence’s terms. The MIT licence covers the code only,
        not the publishers’ news content that the code processes.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Liability",
    body: (
      <p>
        To the extent the law allows, Deckwatch and its maintainer are not liable for any loss or harm that results from
        relying on the information here, or from the site or API being unavailable. Decisions about your safety and
        travel are yours to make.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law and changes",
    body: (
      <p>
        These terms are governed by the laws of Kenya. When they change, the date at the top changes too, and continuing
        to use Deckwatch means you accept the updated terms. Questions go to <Mail subject="Terms of Use" />.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Using Deckwatch"
      title="Terms of Use"
      summary={
        <p>
          <strong className="font-medium text-foreground">In short:</strong> Deckwatch is a free, automated summary of
          Kenyan news reports, not an emergency service, and it can be wrong. Check the sources before acting on any
          report. If an incident is wrong or puts someone at risk, tell us and we’ll respond within{" "}
          {CORRECTION_RESPONSE_HOURS} hours.
        </p>
      }
      sections={SECTIONS}
      other={{ href: "/privacy", label: "Privacy Policy" }}
    />
  );
}
