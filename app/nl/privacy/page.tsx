import type { Metadata } from "next";
import Link from "next/link";
import { CyberBackground } from "@/components/common";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Privacy- en cookiebeleid",
  description:
    "Hoe Bitwise Security omgaat met contactgegevens, websiteanalytics, cookies en privacyrechten.",
  path: "/privacy",
  locale: "nl",
});

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-2xl border border-cyber-blue/25 bg-cyber-darkBlue/80 p-6 backdrop-blur-md sm:p-8">
    <h2 className="mb-4 text-2xl font-bold text-cyber-blue">{title}</h2>
    <div className="space-y-4 leading-7 text-gray-300">{children}</div>
  </section>
);

const ExternalLink = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="text-cyber-blue underline decoration-cyber-blue/40 underline-offset-4 transition-colors hover:text-cyan-300"
  >
    {children}
  </a>
);

export default function DutchPrivacyPage() {
  return (
    <main className="relative min-h-screen pb-16 pt-24">
      <CyberBackground />
      <div className="relative z-10 mx-auto max-w-4xl px-6">
        <header className="mb-12 text-center">
          <p className="mb-3 font-mono text-sm tracking-[0.25em] text-cyber-orange">
            [ PROTOCOL VOOR GEGEVENSVERWERKING ]
          </p>
          <h1 className="mb-4 text-4xl font-bold sm:text-5xl">
            <span className="text-white">PRIVACY- EN </span>
            <span className="text-cyber-blue text-glow">COOKIEBELEID</span>
          </h1>
          <div className="mx-auto h-1 w-32 bg-gradient-to-r from-cyber-blue to-cyber-orange" />
          <p className="mt-5 text-sm text-gray-400">
            Laatst bijgewerkt: 11 augustus 2026
          </p>
        </header>

        <div className="space-y-6">
          <Section title="1. Wie verantwoordelijk is">
            <p>
              Bitwise Security is verantwoordelijk voor de persoonsgegevens die
              in dit beleid worden beschreven en is gevestigd in Nederland.
              Vragen en privacyverzoeken kunnen worden verzonden naar{" "}
              <a href="mailto:info@bitwise-security.nl" className="text-cyber-blue underline underline-offset-4">
                info@bitwise-security.nl
              </a>
              .
            </p>
          </Section>

          <Section title="2. Welke informatie wij verwerken">
            <ul className="list-disc space-y-3 pl-5 marker:text-cyber-orange">
              <li><strong className="text-white">Contactaanvragen:</strong> naam, e-mailadres, eventuele bedrijfsnaam, gekozen dienst, bericht en bijbehorende e-mailmetadata.</li>
              <li><strong className="text-white">Websitegebruik:</strong> wanneer u analytics- en advertentiecookies accepteert, kan Google Analytics pagina-interacties, sessiegegevens, globale locatie en browser- of apparaatgegevens verzamelen.</li>
              <li><strong className="text-white">Technische en beveiligingsgegevens:</strong> hosting- en beveiligingsdiensten kunnen IP-adressen, requestheaders, tijdstippen en vergelijkbare logs verwerken om de website te leveren en te beveiligen.</li>
            </ul>
            <p>
              Vermeld geen wachtwoorden, toegangstokens, bewijs van kwetsbaarheden
              of ander zeer gevoelig materiaal in het openbare contactformulier.
              Indien nodig spreken wij een passend beveiligd kanaal af.
            </p>
          </Section>

          <Section title="3. Waarom wij deze informatie gebruiken">
            <ul className="list-disc space-y-3 pl-5 marker:text-cyber-orange">
              <li>Om vragen te beantwoorden, een mogelijke opdracht te bespreken en een offerte of overeenkomst voor te bereiden.</li>
              <li>Om de website te beheren, beveiligen, storingen te onderzoeken en misbruik te voorkomen.</li>
              <li>Met uw toestemming, om websitegebruik en advertentieprestaties te meten.</li>
              <li>Om te voldoen aan toepasselijke wettelijke en administratieve verplichtingen.</li>
            </ul>
            <p>
              Afhankelijk van de situatie is de grondslag een verzoek voorafgaand
              aan een overeenkomst, uitvoering van een overeenkomst, ons
              gerechtvaardigd belang bij een veilige bedrijfswebsite, een
              wettelijke verplichting of uw toestemming. U kunt
              cookietoestemming altijd intrekken.
            </p>
            <p>
              Wij verkopen of verhuren gegevens uit het contactformulier niet en
              gebruiken deze niet voor geautomatiseerde besluitvorming.
            </p>
          </Section>

          <Section title="4. Cookies en toestemming">
            <p>
              Analytics- en advertentieopslag staat standaard uit. De Google-tag
              gebruikt Consent Mode en past het gedrag aan nadat u optionele
              categorieën accepteert of weigert. Bij weigering leest of schrijft
              Google Analytics geen analytics- of advertentiecookies; beperkte
              cookieloze toestemmings- en meetsignalen kunnen nog wel worden
              verzonden.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                <caption className="sr-only">Opslag door Bitwise Security en Google Analytics</caption>
                <thead>
                  <tr className="border-b border-cyber-blue/30 text-white">
                    <th className="px-3 py-3">Opslag</th>
                    <th className="px-3 py-3">Doel</th>
                    <th className="px-3 py-3">Duur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyber-blue/15">
                  <tr>
                    <td className="px-3 py-3 font-mono text-cyber-orange">bitwise-google-consent</td>
                    <td className="px-3 py-3">Onthoudt of u optionele analytics- en advertentieopslag hebt geaccepteerd.</td>
                    <td className="px-3 py-3">Totdat u de keuze wijzigt of websitegegevens wist</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-3 font-mono text-cyber-orange">_ga, _ga_*</td>
                    <td className="px-3 py-3">Onderscheidt gebruikers en bewaart sessiestatus in Google Analytics, uitsluitend na toestemming.</td>
                    <td className="px-3 py-3">Standaard maximaal 2 jaar</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Gebruik <strong className="text-white">Cookie-instellingen</strong> onderaan een pagina om uw keuze te wijzigen. Het weigeren van optionele cookies verhindert het gebruik van de website of het contactformulier niet.
            </p>
          </Section>

          <Section title="5. Dienstverleners en doorgifte">
            <p>Wij gebruiken een beperkt aantal leveranciers:</p>
            <ul className="list-disc space-y-3 pl-5 marker:text-cyber-orange">
              <li><ExternalLink href="https://www.cloudflare.com/privacypolicy/">Cloudflare</ExternalLink> voor hosting, levering en beveiliging.</li>
              <li><ExternalLink href="https://resend.com/legal/privacy-policy">Resend</ExternalLink> voor het verzenden van contactformulier-e-mail.</li>
              <li><ExternalLink href="https://policies.google.com/privacy">Google</ExternalLink> voor Analytics en advertentiemeting volgens uw toestemmingskeuze.</li>
            </ul>
            <p>
              Deze leveranciers kunnen informatie buiten de Europese Economische
              Ruimte verwerken. Waar vereist worden passende contractuele en
              wettelijke waarborgen gebruikt, waaronder verwerkersvoorwaarden en
              standaardcontractbepalingen.
            </p>
          </Section>

          <Section title="6. Bewaartermijnen en beveiliging">
            <p>
              Contactaanvragen worden alleen bewaard zolang dat redelijkerwijs
              nodig is om te reageren, een mogelijke opdracht te beoordelen,
              bedrijfsadministratie te voeren en wettelijke verplichtingen na te
              komen. Wanneer geen opdracht volgt, worden aanvraaggegevens
              doorgaans binnen 24 maanden na het laatste inhoudelijke contact
              verwijderd of geanonimiseerd.
            </p>
            <p>
              Analyticsgegevens worden bewaard volgens de instellingen van de
              Google Analytics-property. Beveiligingslogs worden bewaard volgens
              de dienstconfiguratie en legitieme beveiligingsbehoefte. Wij nemen
              passende technische en organisatorische maatregelen, maar geen
              internettransmissie is volledig zonder risico.
            </p>
          </Section>

          <Section title="7. Uw privacyrechten">
            <p>
              Voor zover de wet dit toestaat, kunt u inzage, correctie,
              verwijdering, beperking of een kopie van uw persoonsgegevens vragen
              en bezwaar maken tegen bepaalde verwerkingen. Toestemming kan altijd
              worden ingetrokken.
            </p>
            <p>
              Stuur verzoeken naar <a href="mailto:info@bitwise-security.nl" className="text-cyber-blue underline underline-offset-4">info@bitwise-security.nl</a>. U kunt ook een klacht indienen bij de{" "}
              <ExternalLink href="https://autoriteitpersoonsgegevens.nl/">Autoriteit Persoonsgegevens</ExternalLink>.
            </p>
          </Section>

          <Section title="8. Wijzigingen en contact">
            <p>
              Wij kunnen dit beleid aanpassen wanneer de website, leveranciers of
              wettelijke vereisten veranderen. De huidige versie en datum blijven
              op deze pagina beschikbaar.
            </p>
            <p>
              Mail voor privacyvragen naar <a href="mailto:info@bitwise-security.nl" className="text-cyber-blue underline underline-offset-4">info@bitwise-security.nl</a> of ga terug naar de{" "}
              <Link href="/nl/contact" className="text-cyber-blue underline underline-offset-4">contactpagina</Link>.
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}
