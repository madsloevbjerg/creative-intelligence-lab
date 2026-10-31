import { mkdirSync, writeFileSync } from "node:fs";

const dir = new URL("../public/demo/", import.meta.url);
mkdirSync(dir, { recursive: true });

function svg(parts) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
${parts}
</svg>
`;
}

function wordmark(fill) {
  return `<text x="48" y="78" fill="${fill}" font-family="Georgia, 'Times New Roman', serif" font-size="22">Danish Coffee Lab</text>`;
}

function bag(x, y, w, body, band) {
  const h = Math.round(w * 1.28);
  return `
    <rect x="${x}" y="${y + Math.round(h * 0.12)}" width="${w}" height="${Math.round(h * 0.88)}" rx="16" fill="${body}"/>
    <rect x="${x + Math.round(w * 0.14)}" y="${y}" width="${Math.round(w * 0.72)}" height="${Math.round(h * 0.16)}" rx="8" fill="${band}"/>
    <rect x="${x + Math.round(w * 0.16)}" y="${y + Math.round(h * 0.46)}" width="${Math.round(w * 0.68)}" height="${Math.round(h * 0.26)}" rx="6" fill="#f4efe4"/>
  `;
}

const ads = {
  "dcl-01.svg": svg(`
    <rect width="800" height="1000" fill="#f3ecdf"/>
    ${wordmark("#3c2415")}
    <text x="48" y="280" fill="#8a5a32" font-family="Georgia, serif" font-size="28" letter-spacing="3">WEEKLY BAG</text>
    <text x="48" y="430" fill="#3c2415" font-family="Georgia, serif" font-size="132" font-weight="700">49 kr</text>
    <text x="48" y="500" fill="#3c2415" font-family="Georgia, serif" font-size="42">a week</text>
    ${bag(470, 620, 220, "#6b3a22", "#3d2416")}
    <text x="48" y="900" fill="#6d5344" font-family="Georgia, serif" font-size="28">Specialty coffee, delivered.</text>
  `),
  "dcl-02.svg": svg(`
    <rect width="800" height="1000" fill="#2c2118"/>
    ${wordmark("#f3ecdf")}
    <text x="48" y="280" fill="#e2c48a" font-family="Georgia, serif" font-size="28" letter-spacing="3">STAY THREE MONTHS</text>
    <text x="48" y="420" fill="#f6f1e8" font-family="Georgia, serif" font-size="92">3rd bag</text>
    <text x="48" y="530" fill="#f6f1e8" font-family="Georgia, serif" font-size="92">free</text>
    ${bag(500, 680, 200, "#8a5a38", "#e2c48a")}
  `),
  "dcl-03.svg": svg(`
    <rect width="800" height="1000" fill="#efe6d6"/>
    ${wordmark("#3c2415")}
    <text x="48" y="160" fill="#8a5a32" font-family="Georgia, serif" font-size="26" letter-spacing="3">SWIPE</text>
    <rect x="48" y="220" width="220" height="620" rx="18" fill="#e7d3b0"/>
    <rect x="290" y="220" width="220" height="620" rx="18" fill="#d7b98a"/>
    <rect x="532" y="220" width="220" height="620" rx="18" fill="#c4a06a"/>
    <text x="78" y="300" fill="#3c2415" font-family="Georgia, serif" font-size="28">Home</text>
    <text x="320" y="300" fill="#3c2415" font-family="Georgia, serif" font-size="28">Office</text>
    <text x="562" y="300" fill="#3c2415" font-family="Georgia, serif" font-size="28">Gift</text>
    <text x="78" y="390" fill="#3c2415" font-family="Georgia, serif" font-size="48">79</text>
    <text x="320" y="390" fill="#3c2415" font-family="Georgia, serif" font-size="48">69</text>
    <text x="562" y="390" fill="#3c2415" font-family="Georgia, serif" font-size="48">89</text>
    ${bag(95, 520, 120, "#6b3a22", "#3d2416")}
    ${bag(338, 520, 120, "#6b3a22", "#3d2416")}
    ${bag(580, 520, 120, "#6b3a22", "#3d2416")}
    <text x="48" y="920" fill="#6d5344" font-family="Georgia, serif" font-size="26">Three prices. One subscription.</text>
  `),
  "dcl-04.svg": svg(`
    <rect width="800" height="1000" fill="#d7e6ee"/>
    ${wordmark("#1d3a4a")}
    <text x="48" y="240" fill="#1d3a4a" font-family="Georgia, serif" font-size="72">Every</text>
    <text x="48" y="330" fill="#1d3a4a" font-family="Georgia, serif" font-size="72">Monday</text>
    <rect x="180" y="430" width="440" height="390" rx="8" fill="#f7f4ef"/>
    <rect x="210" y="460" width="380" height="300" rx="4" fill="#c5d5df"/>
    <rect x="150" y="800" width="500" height="28" rx="4" fill="#8aa0ae"/>
    ${bag(330, 640, 150, "#6b3a22", "#3d2416")}
    <text x="48" y="920" fill="#1d3a4a" font-family="Georgia, serif" font-size="28">On the mat. You boil the water.</text>
  `),
  "dcl-05.svg": svg(`
    <rect width="800" height="1000" fill="#f6f1e8"/>
    ${wordmark("#3c2415")}
    <text x="48" y="200" fill="#3c2415" font-family="Georgia, serif" font-size="64">Bag to cup</text>
    <text x="48" y="260" fill="#8a5a32" font-family="Georgia, serif" font-size="28">Four steps. No shop run.</text>
    ${[0, 1, 2, 3]
      .map((index) => {
        const x = 70 + index * 180;
        const labels = ["Open", "Grind", "Pour", "Drink"];
        return `
          <circle cx="${x + 50}" cy="460" r="54" fill="#3c2415"/>
          <text x="${x + 50}" y="474" text-anchor="middle" fill="#f6f1e8" font-family="Georgia, serif" font-size="36">${index + 1}</text>
          <text x="${x + 50}" y="560" text-anchor="middle" fill="#3c2415" font-family="Georgia, serif" font-size="28">${labels[index]}</text>
        `;
      })
      .join("")}
    ${bag(300, 640, 200, "#6b3a22", "#3d2416")}
  `),
  "dcl-06.svg": svg(`
    <rect width="800" height="1000" fill="#171513"/>
    ${wordmark("#f3ecdf")}
    <circle cx="400" cy="430" r="110" fill="none" stroke="#f3ecdf" stroke-width="8"/>
    <polygon points="370,370 370,490 470,430" fill="#f3ecdf"/>
    <text x="400" y="620" text-anchor="middle" fill="#f3ecdf" font-family="Georgia, serif" font-size="72">10s</text>
    <text x="400" y="700" text-anchor="middle" fill="#e2c48a" font-family="Georgia, serif" font-size="32">Already handled</text>
    <rect x="80" y="800" width="640" height="8" fill="#3a332c"/>
    ${bag(330, 760, 140, "#8a5a38", "#e2c48a")}
  `),
  "dcl-07.svg": svg(`
    <rect width="800" height="1000" fill="#e7c9a4"/>
    ${wordmark("#3c2415")}
    <rect x="160" y="180" width="480" height="360" rx="8" fill="#f7f1e6"/>
    <rect x="190" y="210" width="420" height="250" fill="#b7c9d4"/>
    <rect x="188" y="430" width="424" height="22" fill="#c4a06a"/>
    <ellipse cx="400" cy="700" rx="90" ry="22" fill="#3c2415"/>
    <path d="M320 520 h160 v120 a80 70 0 0 1 -160 0 z" fill="#f7f1e6" stroke="#3c2415" stroke-width="8"/>
    <path d="M480 560 h36 a36 40 0 0 1 0 70 h-36" fill="none" stroke="#3c2415" stroke-width="8"/>
    <rect x="620" y="250" width="18" height="220" fill="#3f6b45"/>
    <ellipse cx="629" cy="240" rx="46" ry="28" fill="#2f6a3a"/>
    <text x="48" y="860" fill="#3c2415" font-family="Georgia, serif" font-size="64">This week</text>
    <text x="48" y="930" fill="#3c2415" font-family="Georgia, serif" font-size="40">Aarhus</text>
  `),
  "dcl-08.svg": svg(`
    <rect width="800" height="1000" fill="#f7f4ef"/>
    ${wordmark("#3c2415")}
    <text x="48" y="240" fill="#3c2415" font-family="Georgia, serif" font-size="78">One origin</text>
    <text x="48" y="320" fill="#3f6b45" font-family="Georgia, serif" font-size="36">Nothing blended away</text>
    ${bag(250, 400, 300, "#6b3a22", "#3d2416")}
    <rect x="300" y="620" width="200" height="70" rx="6" fill="#3f6b45"/>
    <text x="400" y="662" text-anchor="middle" fill="#f7f4ef" font-family="Georgia, serif" font-size="22">Single origin</text>
    <text x="48" y="920" fill="#6d5344" font-family="Georgia, serif" font-size="28">Roast date on the bag.</text>
  `),
};

for (const [name, contents] of Object.entries(ads)) {
  writeFileSync(new URL(name, dir), contents);
  console.log(name);
}
