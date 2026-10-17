import { Contact, LegalPage } from '../components/legal/LegalPage'
import { AI_NOTICE, PROTOTYPE_NOTICE, site } from '../lib/site'
import { AI_DRAFT_NOTICE } from '../lib/templates'

export function AboutPage() {
  return (
    <LegalPage eyebrow="O projektu" title="O projektu CHRIS">
      <section>
        <p>
          {site.name} ({site.fullName}) pomáhá výzkumníkům sestavit tým z výzkumných skupin NÚVR, najít technologie a vhodné granty a
          připravit podklady pro přihlášku. Vznikl jako prototyp pro {site.event}, autor: {site.team}.
        </p>
      </section>
      <section>
        <h2>Upozornění</h2>
        <ul>
          <li>{PROTOTYPE_NOTICE}</li>
          <li>{AI_NOTICE}</li>
          <li>Exporty přihlášek jsou koncepty. {AI_DRAFT_NOTICE}</li>
          <li>E-maily se nikdy neodesílají automaticky ani hromadně. Odeslat je můžete jen sami ze svého e-mailu.</li>
          <li>V demo režimu jsou skupiny, lidé a výsledky ilustrační a nejde o skutečná data NÚVR.</li>
        </ul>
      </section>
      <section>
        <h2>Autorství a licence</h2>
        <p>
          Autorská práva k prototypu má tým. Pořadatel Rakathonu a partneři výzvy mají nevýhradní licenci k jeho užití podle pravidel
          soutěže.
        </p>
        <p>
          Zdroje dat: veřejné profily skupin na nuvr.cz, OpenAlex (CC0), Europe PMC, ORCID, CEP a CORDIS. U každého doporučení je odkaz
          na konkrétní zdroj. Písma Bricolage Grotesque, Geist a Geist Mono jsou pod licencí SIL Open Font License 1.1.
        </p>
      </section>
      <section>
        <h2>Kontakt</h2>
        <p>
          <Contact />
        </p>
      </section>
    </LegalPage>
  )
}

export function PrivacyPage() {
  return (
    <LegalPage eyebrow="Ochrana osobních údajů" title="Jak zacházíme s vašimi údaji">
      <section>
        <h2>Správce</h2>
        <p>
          Správcem je {site.team} ({site.event}). Kontakt: <Contact />.
        </p>
      </section>
      <section>
        <h2>Jaké údaje zpracováváme a proč</h2>
        <ul>
          <li>
            <strong>Zadání projektu, odpovědi na upřesňující otázky a text přihlášky.</strong> Potřebujeme je, abychom mohli doporučit tým,
            technologie a granty a pomoci s přihláškou (oprávněný zájem, čl. 6 odst. 1 písm. f GDPR).
          </li>
          <li>
            <strong>Údaje o výzkumných skupinách</strong> pocházejí jen z veřejných zdrojů (profily na nuvr.cz, OpenAlex, ORCID). Neveřejná
            data ani data pacientů nezpracováváme.
          </li>
        </ul>
        <p>Do zadání prosím nevkládejte citlivé, neveřejné ani pacientské údaje a nepublikované know-how.</p>
      </section>
      <section>
        <h2>Kde se údaje zpracovávají</h2>
        <ul>
          <li>
            Bez připojeného serveru zůstává vše jen ve vašem prohlížeči (localStorage), aby šlo rozpracované projekty znovu otevřít. Smazat je můžete křížkem v seznamu „Rozpracované projekty“ na úvodní stránce nebo vymazáním dat webu v prohlížeči.
          </li>
          <li>
            S připojeným backendem se zadání odesílá na náš server a k jazykovému modelu v Microsoft Azure v regionu EU. Prohlížeč komunikuje
            pouze s naším serverem, žádné třetí strany data z prohlížeče nedostávají.
          </li>
          <li>Písma se načítají z Google Fonts; Google tak vidí vaši IP adresu a hlavičky prohlížeče.</li>
        </ul>
      </section>
      <section>
        <h2>Cookies a sledování</h2>
        <p>Nepoužíváme cookies, analytiku ani reklamní sledování. Proto nezobrazujeme lištu se souhlasem.</p>
      </section>
      <section>
        <h2>Vaše práva</h2>
        <p>
          Máte právo na přístup k údajům, jejich opravu a výmaz, na omezení zpracování a právo vznést námitku. Můžete také podat stížnost u
          Úřadu pro ochranu osobních údajů (uoou.cz).
        </p>
      </section>
      <section>
        <h2>Umělá inteligence</h2>
        <p>{AI_NOTICE} Výstupy AI jsou v aplikaci označené a nikdy se samy neodesílají ani nepodávají.</p>
      </section>
    </LegalPage>
  )
}

export function AccessibilityPage() {
  return (
    <LegalPage eyebrow="Přístupnost" title="Prohlášení o přístupnosti">
      <section>
        <p>
          Snažíme se, aby {site.name} splňoval WCAG 2.1 na úrovni AA. Aplikaci lze ovládat klávesnicí, respektuje nastavení „omezit pohyb“,
          průběh práce AI oznamuje čtečkám obrazovky a kontrast textu odpovídá AA.
        </p>
      </section>
      <section>
        <h2>Známá omezení</h2>
        <ul>
          <li>Prototyp nebyl testován s uživateli čteček obrazovky.</li>
          <li>Export přihlášky do PDF v demo režimu používá tisk prohlížeče a nemusí být plně přístupný.</li>
        </ul>
      </section>
      <section>
        <h2>Zpětná vazba</h2>
        <p>
          Narazili jste na problém? Napište nám: <Contact />.
        </p>
      </section>
    </LegalPage>
  )
}
