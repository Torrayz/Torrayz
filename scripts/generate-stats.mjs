import fs from 'node:fs';
import path from 'node:path';

const USERNAME = process.env.GITHUB_USERNAME || 'Torrayz';
const TOKEN = process.env.GITHUB_TOKEN || '';

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'torrayz-profile-stats-generator',
};
if (TOKEN) {
  headers.Authorization = `Bearer ${TOKEN}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status} for ${url}`);
  }
  return res.json();
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const LANG_COLORS = {
  TypeScript: '#3178C6',
  JavaScript: '#F1E05A',
  Python: '#3572A5',
  PHP: '#4F5D95',
  HTML: '#E34C26',
  CSS: '#563D7C',
  PowerShell: '#012456',
  Shell: '#89E051',
  'Jupyter Notebook': '#DA5B0B',
  Kotlin: '#A97BFF',
  Go: '#00ADD8',
  Java: '#B07219',
  SCSS: '#C6538C',
};

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? `${str.slice(0, maxLen - 1)}…` : str;
}

async function main() {
  const user = await fetchJson(`https://api.github.com/users/${USERNAME}`);
  const repos = await fetchJson(
    `https://api.github.com/users/${USERNAME}/repos?per_page=100&type=owner&sort=updated`
  );

  const ownRepos = repos.filter((r) => !r.fork);
  const totalStars = ownRepos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);

  // Aggregate language bytes across non-fork owned repos (top 25 most recently updated for speed & API etiquette)
  const langTotals = {};
  const recentOwn = ownRepos;
  const langResults = await Promise.allSettled(
    recentOwn.map((r) => fetchJson(r.languages_url))
  );

  for (const result of langResults) {
    if (result.status !== 'fulfilled') continue;
    for (const [lang, bytes] of Object.entries(result.value)) {
      langTotals[lang] = (langTotals[lang] || 0) + bytes;
    }
  }

  const totalBytes = Object.values(langTotals).reduce((a, b) => a + b, 0) || 1;
  const sortedLangs = Object.entries(langTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bytes]) => ({
      name,
      pct: (bytes / totalBytes) * 100,
      color: LANG_COLORS[name] || '#64748B',
    }));

  const topSum = sortedLangs.reduce((s, l) => s + l.pct, 0);
  const otherPct = Math.max(0, 100 - topSum);
  const barSegments =
    otherPct > 0.8
      ? [...sortedLangs, { name: 'Other', pct: otherPct, color: '#475569' }]
      : sortedLangs;

  const latestRepo = ownRepos[0];
  const updatedDate = new Date().toISOString().slice(0, 10);

  // Build stacked progress bar (width 530px inside right column)
  const barWidth = 530;
  let cursorX = 0;
  const barRects = barSegments
    .map((seg) => {
      const w = (seg.pct / 100) * barWidth;
      const rect = `<rect x="${cursorX.toFixed(2)}" y="0" width="${Math.max(w, 2).toFixed(
        2
      )}" height="10" fill="${seg.color}"/>`;
      cursorX += w;
      return rect;
    })
    .join('\n        ');

  // Language legend (2 columns x 3 rows max)
  const legendItems = barSegments
    .map((seg, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = col * 180;
      const y = row * 26;
      return `
      <g transform="translate(${x}, ${y})">
        <circle cx="5" cy="5" r="4.5" fill="${seg.color}"/>
        <text x="16" y="9" fill="#E2E8F0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="12.5" font-weight="500">${escapeXml(
          truncate(seg.name, 14)
        )}</text>
        <text x="156" y="9" fill="#94A3B8" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="11.5" text-anchor="end">${seg.pct.toFixed(
          1
        )}%</text>
      </g>`;
    })
    .join('');

  const svg = `<svg width="1200" height="204" viewBox="0 0 1200 204" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub Snapshot for ${escapeXml(
    USERNAME
  )}">
  <defs>
    <clipPath id="panelClip">
      <rect width="1200" height="204" rx="14"/>
    </clipPath>
    <clipPath id="barClip">
      <rect width="${barWidth}" height="10" rx="5"/>
    </clipPath>
  </defs>

  <g clip-path="url(#panelClip)">
    <rect width="1200" height="204" fill="#0E1219"/>
    <rect x="0.5" y="0.5" width="1199" height="203" rx="13.5" fill="none" stroke="#222B3A" stroke-width="1"/>

    <!-- Left Column: Account Metrics -->
    <text x="36" y="38" fill="#94A3B8" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="11.5" letter-spacing="1.4" font-weight="600">
      GITHUB SNAPSHOT · @${escapeXml(USERNAME.toUpperCase())}
    </text>

    <!-- Metric 1 -->
    <g transform="translate(36, 62)">
      <rect width="148" height="84" rx="10" fill="#131924" stroke="#232D3E" stroke-width="1"/>
      <text x="18" y="32" fill="#F8FAFC" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="28" font-weight="700">${
        user.public_repos
      }</text>
      <text x="18" y="54" fill="#94A3B8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="12.5">Public Repos</text>
      <text x="18" y="71" fill="#38BDF8" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="10.5">${
        ownRepos.length
      } original</text>
    </g>

    <!-- Metric 2 -->
    <g transform="translate(200, 62)">
      <rect width="148" height="84" rx="10" fill="#131924" stroke="#232D3E" stroke-width="1"/>
      <text x="18" y="32" fill="#F8FAFC" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="28" font-weight="700">${totalStars}</text>
      <text x="18" y="54" fill="#94A3B8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="12.5">Stars Earned</text>
      <text x="18" y="71" fill="#34D399" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="10.5">${
        user.followers
      } followers</text>
    </g>

    <!-- Metric 3 -->
    <g transform="translate(364, 62)">
      <rect width="224" height="84" rx="10" fill="#131924" stroke="#232D3E" stroke-width="1"/>
      <text x="18" y="30" fill="#F8FAFC" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="13.5" font-weight="600">${escapeXml(
        truncate(latestRepo?.name || 'PortoTorray', 22)
      )}</text>
      <text x="18" y="54" fill="#94A3B8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="12.5">Latest Active Repo</text>
      <text x="18" y="71" fill="#818CF8" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="10.5">${escapeXml(
        latestRepo?.language || 'Multi-stack'
      )}</text>
    </g>

    <text x="36" y="178" fill="#64748B" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="11">
      Auto-synced via GitHub Actions · Updated ${updatedDate}
    </text>

    <!-- Vertical Divider -->
    <line x1="616" y1="28" x2="616" y2="176" stroke="#202938" stroke-width="1"/>

    <!-- Right Column: Language Distribution -->
    <text x="642" y="38" fill="#94A3B8" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="11.5" letter-spacing="1.4" font-weight="600">
      CODEBASE DISTRIBUTION (OWNED PUBLIC REPOS)
    </text>

    <g transform="translate(642, 64)">
      <rect width="${barWidth}" height="10" rx="5" fill="#1A2230"/>
      <g clip-path="url(#barClip)">
        ${barRects}
      </g>
    </g>

    <g transform="translate(642, 98)">
      ${legendItems}
    </g>

    <text x="642" y="178" fill="#64748B" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="11">
      Primary focus: TypeScript / Next.js · Python · PostgreSQL · Linux
    </text>
  </g>
</svg>
`;

  const outPath = path.resolve(process.cwd(), 'assets/stats.svg');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg, 'utf8');
  console.log(`Generated ${outPath} (public_repos=${user.public_repos}, stars=${totalStars})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
