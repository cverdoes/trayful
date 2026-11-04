/**
 * The site's stylesheet and its one script: search over every page and symbol, and
 * opening a module's source when a link points at one of its lines. Kept as strings so
 * the site needs no build step and opens from `file://`.
 */

export const SITE_CSS = `:root {
  --bg: #fbfaf7; --panel: #f1efe8; --text: #22231f; --quiet: #6a6b63; --line: #dcd9cf;
  --accent: #2f6b4f; --code: #efece3; --mark: #f6e7b4;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; line-height: 1.5;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #1b1c19; --panel: #23241f; --text: #e8e6de; --quiet: #a3a297; --line: #3a3b34;
    --accent: #8cc7a6; --code: #2c2d27; --mark: #5a4d1f; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); display: grid;
  grid-template-columns: 17rem minmax(0, 1fr); min-height: 100vh; }
nav { background: var(--panel); border-right: 1px solid var(--line); padding: 1rem;
  position: sticky; top: 0; height: 100vh; overflow-y: auto; font-size: 0.9rem; }
nav h2 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--quiet); margin: 1.2rem 0 0.3rem; }
nav ul, nav ol { list-style: none; margin: 0; padding: 0; }
nav li { margin: 0.15rem 0; }
.brand { font-weight: 700; margin: 0 0 0.8rem; }
#search { width: 100%; padding: 0.4rem 0.5rem; border: 1px solid var(--line); border-radius: 6px;
  background: var(--bg); color: var(--text); font: inherit; }
#results { margin-top: 0.5rem; }
#results li { padding: 0.15rem 0; }
#results small { color: var(--quiet); margin-left: 0.3rem; }
main { padding: 1.5rem 2.5rem 3rem; max-width: 68rem; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
h1 { margin: 0.2rem 0 0.8rem; font-size: 1.7rem; }
h2 { margin-top: 2rem; font-size: 1.25rem; border-bottom: 1px solid var(--line); padding-bottom: 0.2rem; }
h3 { margin: 1.4rem 0 0.4rem; font-size: 1.05rem; }
code { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 0.88em;
  background: var(--code); padding: 0.05rem 0.25rem; border-radius: 4px; }
pre { background: var(--code); padding: 0.8rem; border-radius: 6px; overflow-x: auto; }
pre code { padding: 0; background: none; }
table { border-collapse: collapse; width: 100%; margin: 0.6rem 0 1rem; font-size: 0.92rem; }
th, td { text-align: left; vertical-align: top; padding: 0.35rem 0.6rem; border-bottom: 1px solid var(--line); }
th { color: var(--quiet); font-weight: 600; }
.module-table { table-layout: fixed; }
.module-table th:first-child { width: 14rem; }
.module-table th:last-child { width: 4rem; }
.crumbs, .quiet { color: var(--quiet); font-size: 0.9rem; }
.lead { font-size: 1.1rem; }
.case { border-top: 1px solid var(--line); }
.case:target, tr:target { background: var(--mark); }
.source pre { font-size: 0.82rem; line-height: 1.45; }
.source .line { display: block; }
.source .line:target { background: var(--mark); }
.source .ln { display: inline-block; width: 3.2rem; color: var(--quiet); user-select: none; }
.explains { margin-top: 2.5rem; color: var(--quiet); font-size: 0.9rem; }
.layers { width: 100%; max-width: 44rem; height: auto; display: block; margin: 0.5rem 0 1rem; }
.layers rect { fill: var(--panel); stroke: var(--accent); stroke-width: 1.5; }
.layers a:hover rect { fill: var(--code); }
.layers .name { text-anchor: middle; font-weight: 600; font-size: 15px; fill: var(--text); }
.layers .note { text-anchor: middle; font-size: 12px; fill: var(--quiet); }
.layers .edge { fill: none; stroke: var(--quiet); stroke-width: 1.25; }
.layers .arrowhead { fill: var(--quiet); }
.layers .edge-label { font-size: 12px; fill: var(--quiet); }
footer { margin-top: 3rem; color: var(--quiet); font-size: 0.8rem; }
@media (max-width: 760px) {
  body { display: block; }
  nav { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  main { padding: 1rem; }
}
`;

export const SITE_JS = `(function () {
  var root = document.body.dataset.root || '';
  var index = window.TRAYFUL_INDEX || [];
  var input = document.getElementById('search');
  var results = document.getElementById('results');

  function show(query) {
    var words = query.toLowerCase().split(/\\s+/).filter(Boolean);
    results.innerHTML = '';
    results.hidden = words.length === 0;
    if (words.length === 0) return;
    var hits = index.filter(function (entry) {
      var text = (entry.t + ' ' + entry.k + ' ' + entry.s).toLowerCase();
      return words.every(function (w) { return text.indexOf(w) >= 0; });
    });
    hits.sort(function (a, b) {
      var at = a.t.toLowerCase().indexOf(words[0]) === 0 ? 0 : 1;
      var bt = b.t.toLowerCase().indexOf(words[0]) === 0 ? 0 : 1;
      return at - bt || a.t.length - b.t.length;
    });
    hits.slice(0, 30).forEach(function (entry) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = root + entry.u;
      a.textContent = entry.t;
      var kind = document.createElement('small');
      kind.textContent = entry.k;
      li.appendChild(a);
      li.appendChild(kind);
      results.appendChild(li);
    });
    if (hits.length === 0) results.innerHTML = '<li>No matches</li>';
  }

  if (input) {
    input.addEventListener('input', function () { show(input.value); });
    input.addEventListener('keydown', function (event) {
      var first = results.querySelector('a');
      if (event.key === 'Enter' && first) first.click();
    });
  }

  function openSource() {
    var target = location.hash && document.getElementById(location.hash.slice(1));
    var details = target && target.closest('details');
    if (details) {
      details.open = true;
      target.scrollIntoView({ block: 'center' });
    }
  }
  window.addEventListener('hashchange', openSource);
  openSource();
})();
`;
