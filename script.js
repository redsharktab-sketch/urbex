/* ==========================================================================
   URBEX DATABASE — Application Logic
   --------------------------------------------------------------------------
   Sections:
     1. Map engine note
     2. Configuration
     3. Level / rating dictionaries (numbers 1–5 -> readable labels)
     4. Waypoint data (add new locations here — see the shape below)
     5. Application state + cached DOM references
     6. Intro sequence (loading readout + particle field)
     7. Map initialization (Leaflet, Europe-locked, dark tiles)
     8. Marker creation & rendering
     9. Sidebar site index
    10. Filtering (rating buttons + search)
    11. Dossier panel (waypoint detail view)
    12. Utilities
    13. Boot
   ========================================================================== */

/* ---------------------------------------------------------------------- */
/* 1. MAP ENGINE NOTE                                                      */
/* ---------------------------------------------------------------------- */
// This build renders the map with Leaflet.js + free dark CARTO tiles instead
// of the Google Maps JS API, because Google's API requires a billing-enabled
// key that can't be generated for you here. The data model, marker system,
// filters, search, and dossier panel are all engine-agnostic — if you later
// want to swap in Google Maps, you'd mainly need to replace section 7
// (map init) and the marker-creation half of section 8 with the
// `google.maps.Map` / `google.maps.Marker` equivalents; everything else
// (waypoint data, filtering, UI) can stay exactly as it is.

/* ---------------------------------------------------------------------- */
/* 2. CONFIGURATION                                                        */
/* ---------------------------------------------------------------------- */
const CONFIG = {
  // Roughly bounds all of mainland + island Europe, west Russia included.
  europeBounds: [
    [33.0, -25.0],   // south-west
    [72.0, 45.0]     // north-east
  ],
  initialCenter: [50.5, 15.0],
  initialZoom: 5,
  minZoom: 4,
  maxZoom: 18,
  // CARTO dark-matter tiles — free, no API key, good contrast for the theme.
  tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  introMinDuration: 3400 // ms, floor for the boot animation before reveal
};

/* ---------------------------------------------------------------------- */
/* 3. LEVEL / RATING DICTIONARIES                                          */
/* ---------------------------------------------------------------------- */
// Numeric 1–5 fields on each waypoint are translated through these tables
// so the data stays terse while the UI stays readable.
const ENTRY_DIFFICULTY = {
  1: { label: 'Very Easy Entry',        color: '#3ddc70' },
  2: { label: 'Easy Entry',             color: '#8bd346' },
  3: { label: 'Moderate Difficulty',    color: '#d9a441' },
  4: { label: 'Difficult Entry',        color: '#e2722c' },
  5: { label: 'Extremely Difficult Entry', color: '#e2222c' }
};

const POLICE_RISK = {
  1: { label: 'Almost No Police Activity', color: '#3ddc70' },
  2: { label: 'Low Chance of Police',       color: '#8bd346' },
  3: { label: 'Moderate Patrols',           color: '#d9a441' },
  4: { label: 'High Patrol Activity',       color: '#e2722c' },
  5: { label: 'Constant Police Presence',   color: '#e2222c' }
};

const HAZARD_LEVEL = {
  1: { label: 'Safe',             color: '#3ddc70' },
  2: { label: 'Minor Hazards',    color: '#8bd346' },
  3: { label: 'Moderate Hazards', color: '#d9a441' },
  4: { label: 'Dangerous',        color: '#e2722c' },
  5: { label: 'Extreme Danger',   color: '#e2222c' }
};

const RATING_META = {
  red:    { label: 'Excellent — Highly Recommended', hex: '#e2222c' },
  yellow: { label: 'Average Location',                hex: '#d9a441' },
  blue:   { label: 'Small Ruins / Low Interest',      hex: '#3d8ab0' }
};

/* ---------------------------------------------------------------------- */
/* 4. WAYPOINT DATA                                                        */
/* ---------------------------------------------------------------------- */
// To add a location, just push a new object onto this array — nothing
// else needs to change. Shape:
//
// {
//   name: string,
//   lat: number, lng: number,
//   rating: "red" | "yellow" | "blue",
//   entryDifficulty: 1-5,
//   policeRisk: 1-5,
//   hazardLevel: 1-5,
//   description: string,
//   images: string[]   // URLs; leave empty [] to show the "no visual
//                       // record" empty state in the dossier panel
// }
//
// NOTE: locations below are well-known, publicly documented urbex sites
// included as illustrative sample data. Some abandoned sites are
// demolished, redeveloped, or resecured over time — always verify current
// legal status and safety before treating any entry as current fact.
const WAYPOINTS = [
  {
    name: "Buzludzha Monument",
    lat: 42.7333, lng: 25.4,
    rating: "red",
    entryDifficulty: 3,
    policeRisk: 2,
    hazardLevel: 3,
    description: "A saucer-shaped former Communist Party assembly hall crowning a Bulgarian mountain summit. Its mosaic-lined interior has decayed dramatically since closure, making it one of the most photographed derelict monuments in Europe.",
    images: ["https://picsum.photos/seed/buzludzha1/400/400", "https://picsum.photos/seed/buzludzha2/400/400"]
  },
  {
    name: "Villa De Vecchi",
    lat: 45.9667, lng: 9.2833,
    rating: "red",
    entryDifficulty: 2,
    policeRisk: 1,
    hazardLevel: 3,
    description: "A 19th-century lakeside mansion above Lake Como, nicknamed the 'Ghost Mansion.' Ornate frescoes and a collapsed spiral staircase remain inside a shell reclaimed by the surrounding forest.",
    images: ["https://picsum.photos/seed/villadevecchi1/400/400"]
  },
  {
    name: "Beelitz-Heilstätten Sanatorium",
    lat: 52.2333, lng: 12.9667,
    rating: "red",
    entryDifficulty: 2,
    policeRisk: 3,
    hazardLevel: 3,
    description: "A sprawling former military hospital complex outside Berlin, in use from the German Empire through Soviet occupation. Dozens of pavilion buildings in varying states of collapse, though several have since been redeveloped or secured.",
    images: []
  },
  {
    name: "Craco Ghost Town",
    lat: 40.3833, lng: 16.4333,
    rating: "red",
    entryDifficulty: 3,
    policeRisk: 2,
    hazardLevel: 4,
    description: "A medieval hill town in Basilicata, evacuated after decades of landslides culminated in a final abandonment in 1963. Stone facades and a leaning tower still stand above the ravine, popular with film crews and photographers.",
    images: ["https://picsum.photos/seed/craco1/400/400"]
  },
  {
    name: "Spreepark Berlin",
    lat: 52.4922, lng: 13.4903,
    rating: "yellow",
    entryDifficulty: 2,
    policeRisk: 3,
    hazardLevel: 2,
    description: "A former GDR-era amusement park in the Plänterwald forest. Rusting swan boats and a stalled ferris wheel remain, though guided tours and redevelopment have reduced free access over recent years.",
    images: []
  },
  {
    name: "Consonno Ghost Town",
    lat: 45.83, lng: 9.36,
    rating: "yellow",
    entryDifficulty: 2,
    policeRisk: 2,
    hazardLevel: 2,
    description: "A hilltop village near Lecco rebuilt in the 1960s as a kitsch resort town, then abandoned after a landslide severed the access road. A minaret-topped tower and empty piazza remain amid crumbling arcades.",
    images: []
  },
  {
    name: "Kupari Resort",
    lat: 42.6167, lng: 18.2167,
    rating: "yellow",
    entryDifficulty: 2,
    policeRisk: 2,
    hazardLevel: 3,
    description: "A cluster of hotels on the Adriatic coast near Dubrovnik, built for the Yugoslav military's tourism arm and shelled during the 1990s conflict. Shell-scarred facades face the sea a short walk from a working beach.",
    images: []
  },
  {
    name: "Igman Olympic Bobsled Track",
    lat: 43.7333, lng: 18.2833,
    rating: "yellow",
    entryDifficulty: 1,
    policeRisk: 1,
    hazardLevel: 2,
    description: "The concrete bobsled and luge track built for the 1984 Winter Olympics above Sarajevo, later scarred by the siege of the city. Now a quiet, graffiti-covered forest trail popular with hikers as much as explorers.",
    images: []
  },
  {
    name: "Krampnitz Barracks",
    lat: 52.4667, lng: 13.0833,
    rating: "yellow",
    entryDifficulty: 3,
    policeRisk: 3,
    hazardLevel: 2,
    description: "A former Prussian, then Nazi, then Soviet military academy northwest of Potsdam. Long empty stable blocks and officers' quarters sit inside a large fenced perimeter now slated for residential redevelopment.",
    images: []
  },
  {
    name: "Wünsdorf Garrison Town",
    lat: 52.2833, lng: 13.2833,
    rating: "blue",
    entryDifficulty: 1,
    policeRisk: 1,
    hazardLevel: 1,
    description: "Once the largest Soviet military base outside the USSR, nicknamed 'Little Moscow.' Most buildings are resecured or repurposed today, leaving only scattered minor ruins and overgrown parade grounds of real interest.",
    images: []
  },
  {
    name: "Doel Village Fringe Houses",
    lat: 51.2833, lng: 4.2667,
    rating: "blue",
    entryDifficulty: 1,
    policeRisk: 2,
    hazardLevel: 1,
    description: "A small Flemish village slowly emptied to make way for port expansion. Most houses have been demolished; a handful of shells and overgrown gardens remain on the village's edge among active mural-painting projects.",
    images: []
  },
  {
    name: "Pyramiden Outbuildings",
    lat: 78.6557, lng: 16.3306,
    rating: "blue",
    entryDifficulty: 4,
    policeRisk: 1,
    hazardLevel: 4,
    description: "Peripheral storage sheds and pump stations on the fringe of the abandoned Soviet mining settlement in the Svalbard archipelago. Remote and cold-exposed, with far less remaining structure than the main town.",
    images: []
  },
  {
    name: "Fort de la Chartreuse Annex",
    lat: 50.6497, lng: 5.5797,
    rating: "blue",
    entryDifficulty: 2,
    policeRisk: 2,
    hazardLevel: 2,
    description: "A minor outer casemate of a 19th-century Belgian fortress above Liège. Most of the main fort has been converted for civic use, leaving only a few disused tunnels of interest at the perimeter.",
    images: []
  }
];

/* ---------------------------------------------------------------------- */
/* 5. APPLICATION STATE + DOM CACHE                                        */
/* ---------------------------------------------------------------------- */
const state = {
  map: null,
  markers: [],          // { waypoint, leafletMarker }
  activeRatings: new Set(['red', 'yellow', 'blue']),
  searchQuery: '',
  activeWaypointId: null
};

const dom = {}; // populated in init()

function cacheDom() {
  dom.intro = document.getElementById('intro');
  dom.introReadout = document.getElementById('intro-readout');
  dom.introLoadbarFill = document.getElementById('intro-loadbar-fill');
  dom.introParticles = document.getElementById('intro-particles');

  dom.app = document.getElementById('app');
  dom.sidebar = document.getElementById('sidebar');
  dom.sidebarToggle = document.getElementById('sidebar-toggle');
  dom.filters = document.getElementById('filters');
  dom.waypointList = document.getElementById('waypoint-list');

  dom.searchInput = document.getElementById('search-input');
  dom.searchResults = document.getElementById('search-results');

  dom.counterValue = document.getElementById('counter-value');
  dom.counterTotal = document.getElementById('counter-total');

  dom.dossier = document.getElementById('dossier');
  dom.dossierOverlay = document.getElementById('dossier-overlay');
  dom.dossierContent = document.getElementById('dossier-content');
  dom.dossierClose = document.getElementById('dossier-close');
}

/* ---------------------------------------------------------------------- */
/* 6. INTRO SEQUENCE                                                       */
/* ---------------------------------------------------------------------- */
// Fake-but-satisfying boot readout: increments a percentage + progress bar
// with irregular steps so it doesn't feel like a linear CSS transition.
function runIntroReadout() {
  return new Promise((resolve) => {
    let pct = 0;
    dom.intro.classList.add('is-booting');

    const tick = () => {
      pct = Math.min(100, pct + Math.random() * 18 + 6);
      dom.introLoadbarFill.style.width = pct + '%';
      dom.introReadout.textContent =
        (pct < 100 ? 'INITIALIZING' : 'ACCESS GRANTED') +
        ' \u00B7 ' + String(Math.floor(pct)).padStart(2, '0') + '%';

      if (pct < 100) {
        setTimeout(tick, 220 + Math.random() * 180);
      } else {
        setTimeout(resolve, 420);
      }
    };
    setTimeout(tick, 500); // small delay so title/subtitle fade in first
  });
}

// Lightweight ember/dust particle field on a canvas behind the intro title.
function startIntroParticles() {
  const canvas = dom.introParticles;
  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let particles = [];
  let rafId = null;
  let running = true;

  function resize() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }

  function makeParticle() {
    return {
      x: Math.random() * window.innerWidth,
      y: window.innerHeight + Math.random() * 100,
      r: Math.random() * 1.8 + 0.4,
      speed: Math.random() * 0.6 + 0.15,
      drift: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.15
    };
  }

  resize();
  const count = Math.min(90, Math.floor(window.innerWidth / 14));
  particles = Array.from({ length: count }, makeParticle);

  function draw() {
    if (!running) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = '#e2222c';
    for (const p of particles) {
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.y -= p.speed;
      p.x += p.drift;
      if (p.y < -10) Object.assign(p, makeParticle(), { y: window.innerHeight + 10 });
    }
    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(draw);
  }

  if (!reducedMotion) {
    draw();
    window.addEventListener('resize', resize);
  }

  // Return a stop function so we can free resources once the intro is gone.
  return () => {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
  };
}

async function playIntro() {
  const stopParticles = startIntroParticles();
  const started = performance.now();

  await runIntroReadout();

  // Respect a minimum scene length even if the readout finished fast,
  // so the animation never feels abrupt.
  const elapsed = performance.now() - started;
  const remaining = Math.max(0, CONFIG.introMinDuration - elapsed);
  await new Promise((r) => setTimeout(r, remaining));

  dom.intro.classList.add('is-hidden');
  stopParticles();
  // Fully remove from the a11y/interaction tree after the fade-out finishes.
  setTimeout(() => { dom.intro.style.display = 'none'; }, 1200);
}

/* ---------------------------------------------------------------------- */
/* 7. MAP INITIALIZATION                                                   */
/* ---------------------------------------------------------------------- */
function initMap() {
  const bounds = L.latLngBounds(CONFIG.europeBounds);

  state.map = L.map('map', {
    center: CONFIG.initialCenter,
    zoom: CONFIG.initialZoom,
    minZoom: CONFIG.minZoom,
    maxZoom: CONFIG.maxZoom,
    maxBounds: bounds,          // hard-stops panning outside Europe
    maxBoundsViscosity: 1.0,    // fully "solid" edge, no rubber-banding away
    zoomControl: true,
    attributionControl: true
  });

  L.tileLayer(CONFIG.tileUrl, {
    attribution: CONFIG.tileAttribution,
    subdomains: 'abcd',
    minZoom: CONFIG.minZoom,
    maxZoom: CONFIG.maxZoom,
    noWrap: true
  }).addTo(state.map);

  state.map.fitBounds(bounds.pad(-0.15));
}

/* ---------------------------------------------------------------------- */
/* 8. MARKER CREATION & RENDERING                                          */
/* ---------------------------------------------------------------------- */
// Builds a small glowing "radar blip" divIcon colored by rating, instead of
// the default Google/Leaflet pin — see .urbex-marker* rules in style.css.
function createMarkerIcon(rating) {
  return L.divIcon({
    className: '', // avoid leaflet's default icon styling
    html: `
      <div class="urbex-marker urbex-marker--${rating}">
        <span class="urbex-marker__pulse"></span>
        <span class="urbex-marker__core"></span>
      </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

function renderMarkers() {
  WAYPOINTS.forEach((waypoint, index) => {
    waypoint._id = index; // stable internal id for lookups
    const marker = L.marker([waypoint.lat, waypoint.lng], {
      icon: createMarkerIcon(waypoint.rating),
      keyboard: true,
      title: waypoint.name
    });
    marker.on('click', () => openDossier(waypoint));
    marker.addTo(state.map);
    state.markers.push({ waypoint, leafletMarker: marker });
  });
}

/* ---------------------------------------------------------------------- */
/* 9. SIDEBAR SITE INDEX                                                   */
/* ---------------------------------------------------------------------- */
function renderWaypointList(visibleWaypoints) {
  dom.waypointList.innerHTML = '';

  if (visibleWaypoints.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'waypoint-list__empty';
    empty.textContent = 'NO RECORDS MATCH CURRENT FILTERS';
    dom.waypointList.appendChild(empty);
    return;
  }

  visibleWaypoints.forEach((waypoint) => {
    const item = document.createElement('button');
    item.className = 'waypoint-item';
    item.innerHTML = `
      <span class="waypoint-item__dot" style="background:${RATING_META[waypoint.rating].hex}; color:${RATING_META[waypoint.rating].hex}"></span>
      <span class="waypoint-item__name">${escapeHtml(waypoint.name)}</span>
      <span class="waypoint-item__arrow">&rarr;</span>
    `;
    item.addEventListener('click', () => focusWaypoint(waypoint));
    dom.waypointList.appendChild(item);
  });
}

/* ---------------------------------------------------------------------- */
/* 10. FILTERING (rating buttons + search)                                 */
/* ---------------------------------------------------------------------- */
function getFilteredWaypoints() {
  const q = state.searchQuery.trim().toLowerCase();
  return WAYPOINTS.filter((w) => {
    const ratingOk = state.activeRatings.has(w.rating);
    const searchOk = q === '' || w.name.toLowerCase().includes(q);
    return ratingOk && searchOk;
  });
}

function applyFilters() {
  const visible = getFilteredWaypoints();
  const visibleIds = new Set(visible.map((w) => w._id));

  // Show/hide markers on the map to match the active filter set.
  state.markers.forEach(({ waypoint, leafletMarker }) => {
    const shouldShow = visibleIds.has(waypoint._id);
    const isShown = state.map.hasLayer(leafletMarker);
    if (shouldShow && !isShown) leafletMarker.addTo(state.map);
    if (!shouldShow && isShown) state.map.removeLayer(leafletMarker);
  });

  renderWaypointList(visible);
  updateCounter(visible.length, WAYPOINTS.length);
}

function updateCounter(visibleCount, total) {
  dom.counterValue.textContent = visibleCount;
  dom.counterTotal.textContent = total;
}

function initFilterButtons() {
  dom.filters.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rating = btn.dataset.rating;
      if (state.activeRatings.has(rating)) {
        state.activeRatings.delete(rating);
        btn.classList.remove('is-active');
      } else {
        state.activeRatings.add(rating);
        btn.classList.add('is-active');
      }
      applyFilters();
    });
  });
}

function initSearch() {
  dom.searchInput.addEventListener('input', debounce((e) => {
    state.searchQuery = e.target.value;
    applyFilters();
    renderSearchDropdown(state.searchQuery);
  }, 120));

  dom.searchInput.addEventListener('focus', () => {
    if (state.searchQuery.trim() !== '') renderSearchDropdown(state.searchQuery);
  });

  document.addEventListener('click', (e) => {
    if (!dom.searchResults.contains(e.target) && e.target !== dom.searchInput) {
      dom.searchResults.classList.remove('is-open');
    }
  });
}

function renderSearchDropdown(query) {
  const q = query.trim().toLowerCase();
  dom.searchResults.innerHTML = '';

  if (q === '') {
    dom.searchResults.classList.remove('is-open');
    return;
  }

  const matches = WAYPOINTS.filter((w) => w.name.toLowerCase().includes(q));

  if (matches.length === 0) {
    dom.searchResults.innerHTML = '<div class="search-results__empty">NO MATCHING RECORDS FOUND</div>';
  } else {
    matches.slice(0, 8).forEach((w) => {
      const row = document.createElement('div');
      row.className = 'search-result';
      row.innerHTML = `
        <span class="waypoint-item__dot" style="background:${RATING_META[w.rating].hex}; color:${RATING_META[w.rating].hex}"></span>
        <span class="search-result__name">${escapeHtml(w.name)}</span>
        <span class="search-result__meta">${w.rating.toUpperCase()}</span>
      `;
      row.addEventListener('click', () => {
        focusWaypoint(w);
        dom.searchResults.classList.remove('is-open');
        dom.searchInput.value = w.name;
        state.searchQuery = w.name;
        applyFilters();
      });
      dom.searchResults.appendChild(row);
    });
  }

  dom.searchResults.classList.add('is-open');
}

// Pans/zooms the map to a waypoint and opens its dossier — shared by the
// sidebar list and the search dropdown.
function focusWaypoint(waypoint) {
  state.map.flyTo([waypoint.lat, waypoint.lng], Math.max(state.map.getZoom(), 9), {
    duration: 0.9
  });
  openDossier(waypoint);
  if (window.innerWidth <= 860) dom.sidebar.classList.add('is-collapsed');
}

/* ---------------------------------------------------------------------- */
/* 11. DOSSIER PANEL                                                       */
/* ---------------------------------------------------------------------- */
function createStatRow(label, value, dictionary) {
  const info = dictionary[value] || dictionary[3];
  const row = document.createElement('div');
  row.className = 'stat-row';

  const segments = Array.from({ length: 5 }, (_, i) => {
    const filled = i < value;
    return `<span class="stat-bar__seg ${filled ? 'is-filled' : ''}" style="${filled ? `background:${info.color}; color:${info.color}` : ''}"></span>`;
  }).join('');

  row.innerHTML = `
    <div class="stat-row__top">
      <span class="stat-row__label">${label}</span>
      <span class="stat-row__value" style="color:${info.color}">${info.label}</span>
    </div>
    <div class="stat-bar">${segments}</div>
  `;
  return row;
}

function createGallery(images) {
  if (!images || images.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'dossier-empty-state';
    empty.innerHTML = `
      <span class="dossier-empty-state__icon">&#9711;</span>
      <span>NO VISUAL RECORD AVAILABLE</span>
    `;
    return empty;
  }

  const grid = document.createElement('div');
  grid.className = 'dossier-gallery';
  images.forEach((src) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Field photo';
    img.loading = 'lazy';
    grid.appendChild(img);
  });
  return grid;
}

function openDossier(waypoint) {
  state.activeWaypointId = waypoint._id;
  const rating = RATING_META[waypoint.rating];

  dom.dossierContent.innerHTML = ''; // clear previous entry

  const stamp = document.createElement('div');
  stamp.className = `dossier-stamp dossier-stamp--${waypoint.rating}`;
  stamp.textContent = rating.label;
  dom.dossierContent.appendChild(stamp);

  const title = document.createElement('h2');
  title.className = 'dossier-title';
  title.textContent = waypoint.name;
  dom.dossierContent.appendChild(title);

  const coords = document.createElement('div');
  coords.className = 'dossier-coords';
  coords.textContent = `LAT ${waypoint.lat.toFixed(4)}  //  LNG ${waypoint.lng.toFixed(4)}`;
  dom.dossierContent.appendChild(coords);

  const descLabel = document.createElement('div');
  descLabel.className = 'dossier-section-label';
  descLabel.textContent = 'Field Notes';
  dom.dossierContent.appendChild(descLabel);

  const desc = document.createElement('p');
  desc.className = 'dossier-description';
  desc.textContent = waypoint.description;
  dom.dossierContent.appendChild(desc);

  const statsLabel = document.createElement('div');
  statsLabel.className = 'dossier-section-label';
  statsLabel.textContent = 'Risk Assessment';
  dom.dossierContent.appendChild(statsLabel);

  dom.dossierContent.appendChild(createStatRow('Entry Difficulty', waypoint.entryDifficulty, ENTRY_DIFFICULTY));
  dom.dossierContent.appendChild(createStatRow('Police Risk', waypoint.policeRisk, POLICE_RISK));
  dom.dossierContent.appendChild(createStatRow('Hazard Level', waypoint.hazardLevel, HAZARD_LEVEL));

  const galleryLabel = document.createElement('div');
  galleryLabel.className = 'dossier-section-label';
  galleryLabel.textContent = 'Visual Record';
  dom.dossierContent.appendChild(galleryLabel);
  dom.dossierContent.appendChild(createGallery(waypoint.images));

  dom.dossier.classList.add('is-open');
  dom.dossierOverlay.classList.add('is-visible');
}

function closeDossier() {
  dom.dossier.classList.remove('is-open');
  dom.dossierOverlay.classList.remove('is-visible');
  state.activeWaypointId = null;
}

function initDossierControls() {
  dom.dossierClose.addEventListener('click', closeDossier);
  dom.dossierOverlay.addEventListener('click', closeDossier);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDossier();
  });
}

/* ---------------------------------------------------------------------- */
/* 12. UTILITIES                                                           */
/* ---------------------------------------------------------------------- */
function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function initSidebarToggle() {
  dom.sidebarToggle.addEventListener('click', () => {
    dom.sidebar.classList.toggle('is-collapsed');
    dom.sidebar.classList.toggle('is-visible');
  });
}

/* ---------------------------------------------------------------------- */
/* 13. BOOT                                                                 */
/* ---------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  cacheDom();

  // Map initializes immediately (behind the intro) so it's fully ready
  // the moment the boot animation fades out — no jarring pop-in.
  initMap();
  renderMarkers();
  applyFilters(); // sets initial counter + sidebar list

  initFilterButtons();
  initSearch();
  initDossierControls();
  initSidebarToggle();

  playIntro();
});
