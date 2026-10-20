# AdsimoBuy – die smarte Einkaufsliste

AdsimoBuy ist eine installierbare Web-App (PWA) für Smartphone und Desktop. Du kannst Einkaufszettel abfotografieren,
Barcodes scannen und Kassenbons erfassen. Gekaufte Produkte landen mit allen Nährwerten in einer lokalen Datenbank,
und die Liste wird nach dem Laufweg deines Marktes sortiert.

## Funktionen

| Bereich | Was die App macht |
| --- | --- |
| **Liste** | Artikel eintippen (`2x Milch`, `500 g Hackfleisch`, `Eier 10`), mit Autovervollständigung aus deiner Produkt-DB. Mehrere Listen, Notizen, Mengen. Schnell entfernen: Eintrag nach links wischen, im Auswahlmodus mehrere Einträge auf einmal oder alle über das Listenmenü – jeweils mit Rückgängig. |
| **Foto → Liste** | Einkaufszettel, Notiz oder Screenshot fotografieren. Die Artikel werden erkannt, automatisch einsortiert und vor dem Übernehmen zur Prüfung angezeigt. Alternativ Text einfügen (z. B. aus WhatsApp). |
| **Gericht → Einkauf** | Ein Gericht, eine Rezeptseite oder einen Rezept-Screenshot fotografieren (oder nur den Namen eintippen). Die KI liefert die Zutaten mit Mengen. Über den Portionsregler werden die Mengen einkaufsfreundlich umgerechnet (z. B. 1,5 Zwiebeln → 2 Stück, 375 g → 380 g). Vorräte wie Salz und Öl sind vorab abgewählt. Erkannte Gerichte werden gespeichert und lassen sich ohne neuen KI-Aufruf wieder verwenden. |
| **Barcode-Scanner** | Live-Kamera mit nativem `BarcodeDetector` (Android/Chrome) bzw. ZXing (iOS/Safari). Produktdaten, Nährwerte, Nutri-Score, NOVA, Zutaten und Allergene kommen von [Open Food Facts](https://world.openfoodfacts.org). Fallbacks: Code eintippen oder aus einem Foto lesen. |
| **Im Laden: scannen & abhaken** | Artikel in den Wagen legen, Barcode scannen und abhaken. Die App ordnet das Produkt dem passenden Listeneintrag zu (z. B. „Milch“ ↔ „Vollmilch 3,5 %“) oder du scannst gezielt für einen Eintrag. Angezeigt werden dein letzter Preis in genau diesem Markt und Community-Preise derselben Kette aus [Open Prices](https://prices.openfoodfacts.org). Den Preis am Regal bestätigst du mit einem Tipp. Er landet im Preisverlauf je Markt und in der Preisschätzung der Liste. |
| **Produkt-Datenbank** | Jedes abgehakte, gescannte oder auf einem Bon gekaufte Produkt wird gespeichert, mit allen Nährstoffen je 100 g (inkl. Vitamine und Mineralstoffe), Kaufhistorie, Bon-Bezeichnungen und Preisverlauf. Nährwerte lassen sich auch nachträglich per Open-Food-Facts-Suche zuordnen. |
| **Marktauswahl & Laufweg** | Vorlagen für Lidl, Aldi Süd/Nord, REWE, EDEKA, Kaufland, Penny, Netto, dm und Rossmann. Bei Lidl kommen z. B. zuerst Obst & Gemüse und Convenience, dann Backstation, Kühlregal … Die Reihenfolge ist pro Filiale anpassbar (ziehen oder Pfeile). |
| **Lernender Laufweg** | Die App merkt sich, in welcher Reihenfolge du im Markt abhakst. Nach zwei Einkäufen schlägt sie die tatsächliche Reihenfolge deiner Filiale vor. |
| **Kassenbons & Ausgaben** | Bon fotografieren: Positionen, Mengen-, Gewichts- und Rabattzeilen, Pfand, Summe, Datum und Markt werden erkannt. Jede Position wird einem gespeicherten Produkt zugeordnet (automatisch per Bon-Alias bzw. unscharfem Abgleich, jederzeit änderbar) oder als neues Produkt angelegt. Eine Summenprüfung zeigt Erkennungsfehler an. |
| **Auswertungen** | Monatsausgaben mit 6-Monats-Verlauf, Aufteilung nach Kategorie und Markt, Nutri-Score-Verteilung der Einkäufe und ein Preis-Radar für Preisänderungen. Pro Produkt gibt es Preisverlauf, Durchschnitt, Spanne und den günstigsten Markt. |
| **Smarte Extras** | „Wird bald fällig“-Vorschläge aus deinen Kaufintervallen und eine geschätzte Summe der Liste aus den zuletzt bezahlten Preisen. |
| **Offline & privat** | Alle Daten liegen lokal im Browser (IndexedDB). Sicherung und Wiederherstellung laufen über eine JSON-Datei. |

### Texterkennung: offline oder per KI

- **Offline (Standard):** [Tesseract.js](https://tesseract.projectnaptha.com/) mit deutschem Sprachmodell läuft direkt auf dem Gerät.
  Gedruckte Bons und getippte Zettel funktionieren gut, Handschrift nur eingeschränkt. Beim ersten Mal werden ca. 10 MB
  Sprachdaten geladen und danach gecacht.
- **KI (optional):** Wenn du unter *Mehr → Texterkennung* einen Anthropic-API-Schlüssel hinterlegst, liest Claude
  (`claude-opus-5-5`) auch Handschrift. Bon-Positionen werden dabei gleich deinen bekannten Produkten zugeordnet.
  Die Funktion „Gericht → Einkauf“ gibt es nur mit KI; bereits gespeicherte Gerichte funktionieren auch ohne Schlüssel.
  Das Foto (bei Bons zusätzlich die Liste deiner Produktnamen) geht dann direkt an die Anthropic-API. Die Kosten laufen
  über dein Anthropic-Konto. Der Schlüssel bleibt auf dem Gerät und ist nicht Teil der Sicherung.

## Entwicklung

Voraussetzung: Node.js ≥ 20.19 (empfohlen: 22).

```bash
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173
npm test           # Unit- und Datenbanktests (Vitest)
npm run typecheck  # TypeScript
npm run build      # Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
```

Für Kamera und Barcode-Scanner auf dem Handy braucht die App **HTTPS** (oder `localhost`).

### Projektstruktur

```
src/
  domain/      reine Fachlogik (getestet): Kategorien & Klassifizierung, Markt-Layouts,
               Zettel- und Bon-Parser, Produktabgleich, Preisstatistik, Nachkauf-Vorschläge,
               Laufweg-Lernen
  db/          Dexie/IndexedDB-Schema und alle Schreibvorgänge (repo.ts)
  services/    Open Food Facts, Tesseract-OCR, Claude-Vision, Barcode-Scanner, Bildaufbereitung
  components/  Scanner, Foto-Import, Diagramme, gemeinsame UI-Bausteine
  screens/     Liste, Produkte, Produktdetail/-formular, Ausgaben, Bon-Erfassung/-Detail,
               Einstellungen, Markt-Editor
```

## Veröffentlichen (GitHub Pages)

Der Workflow `.github/workflows/deploy.yml` testet und baut bei jedem Pull Request. Bei Pushes auf `main` veröffentlicht er
die App zusätzlich auf GitHub Pages. Einmalig nötig: im Repository unter **Settings → Pages → Source** „GitHub Actions“
auswählen. Danach läuft die App unter `https://<user>.github.io/<repo>/` und lässt sich über „Zum Startbildschirm
hinzufügen“ installieren.

## Hinweise

- Die Standard-Laufwege sind typische Anordnungen. Filialen unterscheiden sich, also einmal anpassen oder die App lernen lassen.
- Produkt- und Nährwertdaten stammen von Open Food Facts (Lizenz ODbL) und können unvollständig sein.
- Die Daten liegen nur im Browser des jeweiligen Geräts. Für einen Gerätewechsel unter *Mehr → Daten* sichern und wiederherstellen.
