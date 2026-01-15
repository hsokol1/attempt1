//setup
const map = L.map('map', {doubleClickZoom: false}).setView([39.8, -98.6], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', 
    {attribution: '© OpenStreetMap contributors'}).addTo(map);

let usStatesLayer = null;
let usCountiesData = null;
let activeCountyLayer = null;
let selectedStateFP = null;
const countyPopulation = {};
const statePopulation = {};

fetch('/api/county-scores') //THIS IS THE NEW PART, REPLACED YOUR COUNTYSCORES PLACEHOLDER
  .then(res => res.json())
  .then(data => {
    countyScores = data;               
    console.log('Data', countyScores);

    // refresh colors after scores arrive
    if (usStatesLayer) usStatesLayer.setStyle(stateStyle);
    if (activeCountyLayer) activeCountyLayer.setStyle(countyStyle);
  })
  .catch(err => console.error('county-scores error:', err));

//colors for score scales
function getColor(score) {
  return score > 80 ? '#003049':
         score > 60 ? '#669BBC':
         score > 40 ? '#FDF0D5':
         score > 20 ? '#C1121F':
                       '#780000';
}

//data helpers
function getCountyScore(geoid) {return countyScores[geoid]?.score ?? null;}

function getCountyPopulation(geoid) {
  return countyPopulation[geoid] ?? null;
}

function getStatePopulation(stateFP) {
  return statePopulation[stateFP] ?? null;
}

function getStateAverageScore(stateFP) {
  let total = 0;
  let count = 0;

  usCountiesData.features.forEach(f => {
    if (f.properties.STATEFP === stateFP) {
      const score = getCountyScore(f.properties.GEOID);
      if (score !== null) {
        total += score;
        count++;
      }
    }
  });
  return count > 0 ? Math.round(total / count) : null;
}

async function loadCountyPopulation() {
  const url =
    'https://api.census.gov/data/2020/dec/pl?get=P1_001N,STATE,COUNTY&for=county:*';

  const response = await fetch(url);
  const data = await response.json();

  data.slice(1).forEach(row => {
    const population = parseInt(row[0], 10);
    const stateFP = row[1];
    const countyFP = row[2];

    const geoid = stateFP + countyFP;
    countyPopulation[geoid] = population;
  });
}

/*loading states and counties from census data maps - had to convert them into json because 
geojson was not supported and showing as null on chrome*/
Promise.all([
  fetch('data/us_states.json').then(r => r.json()),
  fetch('data/us_counties.json').then(r => r.json()),
  loadCountyPopulation()
]).then(([statesData, countiesData]) => {
  usCountiesData = countiesData;

  usStatesLayer = L.geoJSON(statesData, {
    style: stateStyle,
    onEachFeature: onEachState
  }).addTo(map);

  showUSSidebar();
}).catch(err => console.error(err));

//additional styles stuff for state/county color coding
function stateStyle(feature) {
  const avg = getStateAverageScore(feature.properties.STATEFP); //need to add additional information
  return {
    fillColor: avg ? getColor(avg) : '#ccc',
    weight: 1,
    color: '#003049',
    fillOpacity: 0.7};
}

function countyStyle(feature) {
  const score = getCountyScore(feature.properties.GEOID); //need to add additional values and data
  return {
    fillColor: score ? getColor(score) : '#eee',
    weight: 1,
    color: '#003049',
    fillOpacity: 0.7};
}

//interactions for states
function onEachState(feature, layer) {
  const avg = getStateAverageScore(feature.properties.STATEFP);

  layer.bindTooltip(
    `<strong>${feature.properties.NAME}</strong><br/>
     Avg Score: ${avg ?? 'N/A'}`,
    {
      sticky: true,
      direction: 'top',
      className: 'hover-tooltip'
    }
  );

  layer.on({
    click: () => handleStateClick(feature, layer),
    mouseover: e => e.target.setStyle({ fillOpacity: 0.9 }),
    mouseout: e => usStatesLayer.resetStyle(e.target)
  });
}

function handleStateClick(feature, layer) {
  selectedStateFP = feature.properties.STATEFP;

  map.fitBounds(layer.getBounds(), { padding: [20, 20] });
  map.removeLayer(usStatesLayer);

  showCountiesForState(selectedStateFP);
  showStateSidebar(feature.properties.NAME);
}

//interactions for counties 
function showCountiesForState(stateFP) {
  if (activeCountyLayer) map.removeLayer(activeCountyLayer);
  const filtered = {
    type: 'FeatureCollection',
    features: usCountiesData.features.filter(
      f => f.properties.STATEFP === stateFP
    )
  };

  activeCountyLayer = L.geoJSON(filtered, {
    style: countyStyle,
    onEachFeature: onEachCounty
  }).addTo(map);
}

function onEachCounty(feature, layer) {
  const score = getCountyScore(feature.properties.GEOID);

  layer.bindTooltip(
    `<strong>${feature.properties.NAME} County</strong><br/>
     Score: ${score ?? 'N/A'}`,
    {
      sticky: true,
      direction: 'top',
      className: 'hover-tooltip'
    }
  );

  layer.on({
    click: () => showCountySidebar(feature),
    mouseover: e => e.target.setStyle({ fillOpacity: 0.9 }),
    mouseout: e => activeCountyLayer.resetStyle(e.target)
  });
}

//sidebar view
function showUSSidebar() {
  document.getElementById('sidebar').innerHTML = `
    <h2>United States</h2>
    <p>Select a state to view details.</p>
  `;
}

function showStateSidebar(stateName) {
  const avg = getStateAverageScore(selectedStateFP);

  let countyList = '';
  usCountiesData.features.forEach(f => {
    if (f.properties.STATEFP === selectedStateFP) {
      const score = getCountyScore(f.properties.GEOID);
      if (score !== null) {
        countyList += `
          <li>
            ${f.properties.NAME}: <strong>${score}</strong>
          </li>`;
      }
    }
  });

  document.getElementById('sidebar').innerHTML = `
    <button onclick="resetToUS()" class="sidebar-button">Back to US</button>
    <h2>${stateName}</h2>
    <p><strong>Overall Score:</strong> ${avg ?? 'N/A'}</p>
    <h3>Counties</h3>
    <ul>${countyList}</ul>
  `;
}

function showCountySidebar(feature) {
  const geoid = feature.properties.GEOID;
  const score = getCountyScore(geoid);
  const population = getCountyPopulation(geoid);

  document.getElementById('sidebar').innerHTML = `
    <button onclick="resetToState()" class="sidebar-button">Back to State</button>
    <h2>${feature.properties.NAME} County</h2>

    <p><strong>Score:</strong> ${score ?? 'N/A'}</p>
    <p><strong>Population:</strong> ${
      population ? population.toLocaleString() : 'N/A'
    }</p>
  `;
}

//navigation
function resetToUS() {
  if (activeCountyLayer) map.removeLayer(activeCountyLayer);
  map.addLayer(usStatesLayer);
  map.setView([39.8, -98.6], 4);
  showUSSidebar();
}

function resetToState() {
  if (activeCountyLayer) {
    map.fitBounds(activeCountyLayer.getBounds(), { padding: [20, 20] });
  }
  showStateSidebar(
    usStatesLayer
      .getLayers()
      .find(l => l.feature.properties.STATEFP === selectedStateFP)
      .feature.properties.NAME
  );
}