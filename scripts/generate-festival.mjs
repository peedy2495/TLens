import { writeFileSync } from "node:fs";

// All names, inventory and schedules are fictional demo data.
const person = (id, name, role) => ({ PersonID: id, Name: name, Rolle: role });
const logistics = [
  person("LOG-01", "Mara Feld", "Logistikleitung"),
  person("LOG-02", "Jonas Berg", "LKW-Fahrer"),
  person("LOG-03", "Kim Adler", "Staplerfahrerin"),
  person("LOG-04", "Alex Wolf", "Lager und Material"),
  person("LOG-05", "Sam Neumann", "Transport und Runner"),
  person("LOG-06", "Toni Bach", "Gelände und Infrastruktur"),
];
const tech = [
  person("TEC-01", "Robin Stein", "Technische Leitung"),
  person("TEC-02", "Lena Kurz", "FOH Ton Stage 1"),
  person("TEC-03", "Noah Winter", "Monitor Ton Stage 1"),
  person("TEC-04", "Ella Frank", "Licht Stage 1"),
  person("TEC-05", "Finn Roth", "Ton Stage 2"),
  person("TEC-06", "Jule Brandt", "Licht Stage 2"),
  person("TEC-07", "Nico Sommer", "Elektrofachkraft"),
  person("TEC-08", "Max Reim", "Bühnenbau"),
  person("TEC-09", "Liv Koch", "Rigging"),
  person("TEC-10", "Kai Grün", "Backline"),
];
const gear = (id, name, quantity, unit, owner, contents = []) => ({
  EquipmentID: id,
  Name: name,
  Anzahl: quantity,
  Einheit: unit,
  Eigentümer: owner,
  Bestandteile: contents,
});
const logGear = [
  gear("EQ-L01", "Transport-LKW", 2, "Fahrzeuge", "Logistik"),
  gear("EQ-L02", "Gabelstapler", 1, "Fahrzeug", "Logistik"),
  gear("EQ-L03", "Handhubwagen", 2, "Stück", "Logistik"),
  gear("EQ-L04", "Rollwagen", 8, "Stück", "Logistik"),
  gear("EQ-L05", "Ladungssicherung", 2, "Sets", "Logistik", [
    { Name: "Zurrgurte", Anzahl: 20 },
    { Name: "Antirutschmatten", Anzahl: 20 },
  ]),
  gear("EQ-L06", "Funkgeräte mit Ladestationen", 16, "Stück", "Logistik"),
  gear("EQ-L07", "Bauzaun mit Füßen", 100, "Elemente", "Logistik"),
  gear("EQ-L08", "Backstage-Zelt", 2, "Stück", "Logistik", [
    { Name: "Tische", Anzahl: 6 },
    { Name: "Stühle", Anzahl: 24 },
  ]),
  gear("EQ-L09", "Abfallstation", 12, "Stück", "Logistik"),
  gear("EQ-L10", "Arbeitsausrüstung", 16, "Sets", "Logistik", [
    { Name: "Handschuhe", Anzahl: 1 },
    { Name: "Warnweste", Anzahl: 1 },
    { Name: "Helm", Anzahl: 1 },
  ]),
];
const power = gear("EQ-T00", "Stromversorgung", 1, "System", "Technik", [
  { Name: "Netzanschluss", Anzahl: 1 },
  { Name: "Hauptverteilung", Anzahl: 1 },
  { Name: "Unterverteilungen", Anzahl: 4 },
  { Name: "CEE-Kabel", Anzahl: 20 },
  { Name: "Kabelbrücken", Anzahl: 40 },
  { Name: "Messgerät", Anzahl: 1 },
]);
const stageGear = (n) => [
  gear(`EQ-T${n}1`, `Bühne ${n}`, 1, "System", "Technik", [
    { Name: "Podeste", Anzahl: 24 },
    { Name: "Treppen", Anzahl: 2 },
    { Name: "Geländer", Anzahl: 12 },
    { Name: "Dach", Anzahl: 1 },
    { Name: "Ballast", Anzahl: 16 },
  ]),
  gear(`EQ-T${n}2`, `PA Stage ${n}`, 1, "System", "Technik", [
    { Name: "Topteile", Anzahl: 8 },
    { Name: "Subwoofer", Anzahl: 4 },
    { Name: "Verstärker-Rack", Anzahl: 2 },
    { Name: "Signalkabel", Anzahl: 20 },
  ]),
  gear(`EQ-T${n}3`, `Tonregie Stage ${n}`, 1, "System", "Technik", [
    { Name: "Digitalmischpult", Anzahl: 1 },
    { Name: "Stagebox", Anzahl: 2 },
    { Name: "Netzwerkkabel", Anzahl: 4 },
    { Name: "Monitore", Anzahl: 6 },
    { Name: "Mikrofone", Anzahl: 18 },
    { Name: "Mikrofonstative", Anzahl: 18 },
    { Name: "DI-Boxen", Anzahl: 8 },
    { Name: "XLR-Kabel", Anzahl: 40 },
  ]),
  gear(`EQ-T${n}4`, `Licht Stage ${n}`, 1, "System", "Technik", [
    { Name: "Lichtpult", Anzahl: 1 },
    { Name: "LED-Wash", Anzahl: 16 },
    { Name: "Moving Heads", Anzahl: 8 },
    { Name: "DMX-Splitter", Anzahl: 2 },
    { Name: "DMX-Kabel", Anzahl: 28 },
    { Name: "Sicherungsseile", Anzahl: 24 },
  ]),
  gear(`EQ-T${n}5`, `Rigging Stage ${n}`, 1, "System", "Technik", [
    { Name: "Traversen", Anzahl: 12 },
    { Name: "Kettenzüge", Anzahl: 4 },
    { Name: "Anschlagmittel", Anzahl: 16 },
  ]),
  gear(`EQ-T${n}6`, `Service Stage ${n}`, 1, "Set", "Technik", [
    { Name: "Werkzeugkoffer", Anzahl: 2 },
    { Name: "Kabeltester", Anzahl: 1 },
    { Name: "Gaffa-Rollen", Anzahl: 12 },
    { Name: "Ersatzkabel", Anzahl: 20 },
  ]),
];
const stages = [stageGear(1), stageGear(2)];
const names = [
  "Nordlicht",
  "Velvet Echo",
  "Wald & Wellen",
  "Neon Harbor",
  "Sonnenstaub",
  "Paper Satellites",
  "Kieselgold",
  "Midnight Fern",
];
const bands = names.map((Name, i) => {
  const id = `ART-${String(i + 1).padStart(2, "0")}`;
  return {
    ArtistID: id,
    Name,
    Genre: ["Indie Rock", "Synth Pop", "Folk", "Alternative"][i % 4],
    Musiker: [
      person(`${id}-01`, `${Name} – Stimme`, "Gesang und Gitarre"),
      person(`${id}-02`, `${Name} – Bass`, "Bass"),
      person(`${id}-03`, `${Name} – Keys`, "Keyboard"),
      person(`${id}-04`, `${Name} – Drums`, "Schlagzeug"),
    ],
    Equipment: [
      gear(`${id}-EQ1`, "Gitarren-Setup", 1, "Set", Name, [
        { Name: "E-Gitarre", Anzahl: 2 },
        { Name: "Verstärker", Anzahl: 1 },
        { Name: "Pedalboard mit Netzteil", Anzahl: 1 },
        { Name: "Instrumentenkabel", Anzahl: 4 },
        { Name: "Ständer", Anzahl: 2 },
        { Name: "Transportcases", Anzahl: 3 },
      ]),
      gear(`${id}-EQ2`, "Bass-Setup", 1, "Set", Name, [
        { Name: "Bass", Anzahl: 2 },
        { Name: "Bassverstärker", Anzahl: 1 },
        { Name: "Box", Anzahl: 1 },
        { Name: "Instrumentenkabel", Anzahl: 3 },
        { Name: "Ständer", Anzahl: 1 },
        { Name: "Transportcases", Anzahl: 3 },
      ]),
      gear(`${id}-EQ3`, "Keyboard-Setup", 1, "Set", Name, [
        { Name: "Keyboard", Anzahl: 1 },
        { Name: "Stativ", Anzahl: 1 },
        { Name: "Sustain-Pedal", Anzahl: 1 },
        { Name: "Netzteil", Anzahl: 1 },
        { Name: "Audiokabel", Anzahl: 2 },
        { Name: "Transportcase", Anzahl: 1 },
      ]),
      gear(`${id}-EQ4`, "Schlagzeug-Setup", 1, "Set", Name, [
        { Name: "Bassdrum", Anzahl: 1 },
        { Name: "Snare", Anzahl: 1 },
        { Name: "Toms", Anzahl: 3 },
        { Name: "Becken", Anzahl: 4 },
        { Name: "Hardware-Koffer", Anzahl: 1 },
        { Name: "Hocker", Anzahl: 1 },
        { Name: "Teppich", Anzahl: 1 },
        { Name: "Stick-Paare", Anzahl: 6 },
        { Name: "Transportcases", Anzahl: 7 },
      ]),
      gear(`${id}-EQ5`, "Persönliches Monitoring", 4, "Sets", Name, [
        { Name: "In-Ear-Hörer", Anzahl: 1 },
        { Name: "Bodypack", Anzahl: 1 },
        { Name: "Ersatzbatterien", Anzahl: 4 },
      ]),
    ],
    Rider: {
      Inputkanäle: 24,
      Monitorwege: 6,
      Strom: "4 × 230 V an ausgewiesenen Bühnenanschlüssen",
      Kontakt: `${id} über Artist-Liaison`,
      Hinweise:
        "Backline vollständig mitgebracht; PA, Mikrofone, DI-Boxen und Licht vom Festival.",
    },
  };
});
const work = (
  id,
  title,
  team,
  equipment,
  tasks,
  date,
  start,
  end,
  area,
  dependencies = [],
  extra = {},
) => ({
  EventID: id,
  Date: date,
  Start: start,
  End: end,
  Area: area,
  Description: title,
  Typ: "Arbeit",
  Status: "Geplant",
  Verantwortlich: team[0],
  Personal: team,
  Equipment: equipment,
  Arbeiten: tasks.map((Beschreibung, i) => ({
    ArbeitsID: `${id}-W${i + 1}`,
    Beschreibung,
    Status: "Offen",
  })),
  Abhängigkeiten: dependencies,
  ...extra,
});
const setupDate = "2027-06-16";
const setup = [
  work(
    "SET-001",
    "Anlieferung und Materialannahme",
    logistics,
    logGear.slice(0, 6),
    [
      "Anlieferungen am Tor koordinieren",
      "Ladeflächen entladen",
      "Bestand und Transportschäden erfassen",
      "Material nach Stage 1 und Stage 2 verteilen",
    ],
    setupDate,
    "06:00",
    "08:00",
    "Anlieferung",
  ),
  work(
    "SET-002",
    "Gelände und Backstage einrichten",
    logistics,
    logGear.filter((_, i) => i >= 5),
    [
      "Bauzaun nach Geländeplan stellen",
      "Backstage-Zelte und Möbel aufbauen",
      "Wege markieren und Abfallstationen verteilen",
    ],
    setupDate,
    "08:00",
    "10:00",
    "Gelände",
    ["SET-001"],
  ),
  work(
    "SET-003",
    "Stromverteilung aufbauen",
    [tech[6]],
    [power, logGear[9]],
    [
      "Verteilungen positionieren",
      "Leitungen verlegen und Kabelbrücken setzen",
      "Prüfung und Freigabe dokumentieren",
    ],
    setupDate,
    "08:00",
    "10:00",
    "Gelände",
    ["SET-001"],
  ),
];
for (let n = 1; n <= 2; n++) {
  const g = stages[n - 1],
    base = n === 1 ? 4 : 8,
    id = (k) => `SET-${String(base + k).padStart(3, "0")}`;
  setup.push(
    work(
      id(0),
      "Bühne und Rigging aufbauen",
      [tech[7], tech[8]],
      [g[0], g[4], g[5], logGear[9]],
      [
        "Podeste, Treppen und Geländer montieren",
        "Dach und Traversensystem errichten",
        "Abnahme dokumentieren",
      ],
      setupDate,
      n === 1 ? "08:00" : "11:00",
      n === 1 ? "11:00" : "14:00",
      `Stage ${n}`,
      n === 1 ? ["SET-001"] : ["SET-004"],
    ),
  );
  setup.push(
    work(
      id(1),
      "Ton und Licht installieren",
      n === 1 ? [tech[1], tech[2], tech[3]] : [tech[4], tech[5]],
      g.slice(1, 4),
      [
        "PA und Monitore positionieren",
        "FOH und Stagebox verkabeln",
        "Mikrofone und DI-Boxen vorbereiten",
        "Licht installieren und patchen",
      ],
      setupDate,
      n === 1 ? "11:00" : "14:00",
      n === 1 ? "14:00" : "17:00",
      `Stage ${n}`,
      [id(0), "SET-003"],
    ),
  );
  setup.push(
    work(
      id(2),
      "Systemcheck und Einmessen",
      n === 1 ? [tech[1], tech[2], tech[3]] : [tech[4], tech[5]],
      g.slice(1),
      [
        "Audiowege testen und PA einmessen",
        "Lichtszenen prüfen",
        "Ersatzmaterial am Serviceplatz hinterlegen",
      ],
      setupDate,
      n === 1 ? "14:00" : "17:00",
      n === 1 ? "16:00" : "19:00",
      `Stage ${n}`,
      [id(1)],
    ),
  );
  setup.push(
    work(
      id(3),
      "Technische Bühnenfreigabe",
      [tech[0]],
      g,
      [
        "Prüfprotokolle kontrollieren",
        "Bühnenwege und Kommunikation prüfen",
        "Freigabe an Produktionsleitung übergeben",
      ],
      setupDate,
      n === 1 ? "16:00" : "19:00",
      n === 1 ? "16:30" : "19:30",
      `Stage ${n}`,
      [id(2)],
    ),
  );
}
const days = {};
for (let d = 0; d < 4; d++) {
  const date = `2027-06-${17 + d}`,
    prefix = `D${d + 1}`;
  const events = [
    work(
      `${prefix}-OPS`,
      "Tagesversorgung und Materialrunde",
      logistics,
      [logGear[3], logGear[5], logGear[8]],
      [
        "Materialbedarf der Bühnen aufnehmen",
        "Verbrauchsmaterial verteilen",
        "Backstage vorbereiten",
        "Abfallstationen leeren",
      ],
      date,
      "09:00",
      "11:00",
      "Gelände",
      ["SET-002"],
    ),
  ];
  for (let n = 1; n <= 2; n++) {
    const band = bands[d * 2 + n - 1],
      g = stages[n - 1],
      prefixStage = `${prefix}-S${n}`,
      team = n === 1 ? [tech[1], tech[2], tech[3]] : [tech[4], tech[5]];
    const arrive = n === 1 ? ["11:00", "12:00"] : ["12:00", "13:00"];
    const change = n === 1 ? ["12:00", "13:00"] : ["13:00", "14:00"];
    const check = n === 1 ? ["13:00", "14:00"] : ["14:00", "15:00"];
    const show = n === 1 ? ["18:00", "19:30"] : ["20:00", "21:30"];
    const out = n === 1 ? ["19:30", "20:30"] : ["21:30", "22:30"];
    events.push(
      work(
        `${prefixStage}-IN`,
        `${band.Name}: Ankunft und Entladen`,
        [logistics[4], logistics[3], ...band.Musiker],
        [logGear[3], ...band.Equipment],
        [
          "Artist-Anmeldung und Einweisung",
          "Instrumente und Cases entladen",
          "Inventar mit Rider abgleichen",
        ],
        date,
        ...arrive,
        "Backstage",
        ["SET-002"],
        { Künstler: band },
      ),
    );
    events.push(
      work(
        `${prefixStage}-BUILD`,
        `${band.Name}: Backline aufbauen`,
        [tech[9], ...band.Musiker],
        band.Equipment,
        [
          "Instrumente positionieren und montieren",
          "Signalwege und Strom anschließen",
          "Leere Cases im Backstage lagern",
        ],
        date,
        ...change,
        `Stage ${n}`,
        [`${prefixStage}-IN`, n === 1 ? "SET-007" : "SET-011"],
        { Künstler: band },
      ),
    );
    events.push(
      work(
        `${prefixStage}-CHECK`,
        `${band.Name}: Soundcheck`,
        [...team, ...band.Musiker],
        [...g.slice(1, 4), ...band.Equipment],
        [
          "Inputliste prüfen",
          "Monitormixe einstellen",
          "Licht-Cues abstimmen",
          "Pultszene speichern",
        ],
        date,
        ...check,
        `Stage ${n}`,
        [`${prefixStage}-BUILD`],
        { Künstler: band },
      ),
    );
    events.push(
      work(
        `${prefixStage}-LIVE`,
        `${band.Name}: Live`,
        [...band.Musiker, ...team],
        [...g, ...band.Equipment],
        [
          "Bühne an Künstler übergeben",
          "Auftritt durchführen",
          "Ton und Licht fahren",
          "Bühnenübergabe dokumentieren",
        ],
        date,
        ...show,
        `Stage ${n}`,
        [`${prefixStage}-CHECK`],
        {
          Typ: "Auftritt",
          Künstler: band,
          Setlist: [
            "Ankommen",
            "Zwischen den Zeilen",
            "Weite Wege",
            "Lichtermeer",
            "Zugabe",
          ],
          DauerMinuten: 90,
        },
      ),
    );
    events.push(
      work(
        `${prefixStage}-OUT`,
        `${band.Name}: Backline abbauen und verladen`,
        [tech[9], logistics[4], ...band.Musiker],
        [logGear[3], ...band.Equipment],
        [
          "Instrumente abstecken und abbauen",
          "Equipment in Cases verpacken",
          "Vollständigkeit prüfen",
          "Cases verladen und Künstler verabschieden",
        ],
        date,
        ...out,
        `Stage ${n}`,
        [`${prefixStage}-LIVE`],
        { Künstler: band },
      ),
    );
  }
  events.push(
    work(
      `${prefix}-CLOSE`,
      "Tagesabschluss und Anlagenkontrolle",
      [tech[0], tech[6], logistics[0]],
      [power, logGear[5]],
      [
        "Bühnen kontrollieren",
        "Verbrauch und Defekte dokumentieren",
        "Anlagen nach Betriebsplan herunterfahren",
        "Gelände an Nachtaufsicht übergeben",
      ],
      date,
      "22:30",
      "23:00",
      "Gelände",
      [`${prefix}-S1-OUT`, `${prefix}-S2-OUT`],
    ),
  );
  days[`Tag ${d + 1} · ${date}`] = events;
}
const teardownDate = "2027-06-21";
const teardown = [];
for (let n = 1; n <= 2; n++) {
  const g = stages[n - 1],
    prefix = `STR-S${n}`,
    team = n === 1 ? [tech[1], tech[2], tech[3]] : [tech[4], tech[5]];
  teardown.push(
    work(
      `${prefix}-AV`,
      "Ton und Licht abbauen",
      team,
      g.slice(1, 4),
      [
        "Anlagen abschalten",
        "Ton- und Lichttechnik demontieren",
        "Kabel sortieren und zählen",
        "Cases packen und Schäden erfassen",
      ],
      teardownDate,
      "08:00",
      "11:00",
      `Stage ${n}`,
      ["D4-CLOSE"],
    ),
  );
  teardown.push(
    work(
      `${prefix}-STAGE`,
      "Bühne und Rigging abbauen",
      [tech[7], tech[8]],
      [g[0], g[4], g[5], logGear[9]],
      [
        "Rigging demontieren",
        "Dach, Geländer und Podeste zurückbauen",
        "Material auf Transportpaletten sichern",
      ],
      teardownDate,
      n === 1 ? "11:00" : "14:00",
      n === 1 ? "14:00" : "17:00",
      `Stage ${n}`,
      [`${prefix}-AV`, ...(n === 2 ? ["STR-S1-STAGE"] : [])],
    ),
  );
}
teardown.push(
  work(
    "STR-POWER",
    "Stromversorgung zurückbauen",
    [tech[6]],
    [power],
    [
      "Verteilungen nach Freigabe trennen",
      "Leitungen und Kabelbrücken aufnehmen",
      "Bestand und Prüfdokumentation abschließen",
    ],
    teardownDate,
    "17:00",
    "18:00",
    "Gelände",
    ["STR-S1-STAGE", "STR-S2-STAGE"],
  ),
);
teardown.push(
  work(
    "STR-SITE",
    "Gelände und Backstage zurückbauen",
    logistics.slice(3),
    logGear.slice(6),
    [
      "Zelte und Möbel abbauen",
      "Abfallstationen leeren",
      "Bauzaun aufnehmen",
      "Flächen reinigen",
    ],
    teardownDate,
    "11:00",
    "17:00",
    "Gelände",
    ["D4-CLOSE"],
  ),
);
teardown.push(
  work(
    "STR-LOAD",
    "Rücktransport und Inventur",
    logistics,
    logGear.slice(0, 6),
    [
      "Alle Materiallisten abgleichen",
      "LKW nach Ladeplan beladen",
      "Ladung sichern",
      "Rücktransporte abfertigen",
    ],
    teardownDate,
    "18:00",
    "20:00",
    "Anlieferung",
    ["STR-POWER", "STR-SITE", "STR-S1-STAGE", "STR-S2-STAGE"],
  ),
);
teardown.push(
  work(
    "STR-HANDOVER",
    "Geländeübergabe",
    [logistics[0], tech[0]],
    [],
    [
      "Restmaterial und Schäden erfassen",
      "Übergabeprotokoll erstellen",
      "Festivalproduktion abschließen",
    ],
    teardownDate,
    "20:00",
    "20:30",
    "Gelände",
    ["STR-LOAD"],
  ),
);
const data = {
  Festival: {
    Information: [
      {
        FestivalID: "FEST-2027-WEITKLANG",
        Name: "Weitklang Festival 2027",
        Ort: "Fiktive Uferwiese",
        Aufbau: setupDate,
        Beginn: "2027-06-17",
        Ende: "2027-06-20",
        Abbau: teardownDate,
        Festivaltage: 4,
        Bühnen: 2,
        Hinweis:
          "Fiktiver Planungsdatensatz; Mengen sind vollständiges Demo-Inventar, keine technische Ausführungsplanung.",
      },
    ],
    Events: { Aufbau: setup, Festivaltage: days, Abbau: teardown },
    Beteiligte: { Logistik: logistics, Technik: tech, Musiker: bands },
    Inventar: {
      Logistik: logGear,
      Technik: [power, ...stages.flat()],
      Musiker: bands.flatMap((band) => band.Equipment),
    },
  },
};
writeFileSync(
  new URL("../public/demo/weitklang-festival-2027.json", import.meta.url),
  JSON.stringify(data, null, 2) + "\n",
);
console.log(
  `${setup.length + Object.values(days).flat().length + teardown.length} events written.`,
);
