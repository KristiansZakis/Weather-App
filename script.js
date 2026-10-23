const API_KEY = '0f29acec20b221801b8c86633fc6f730';

const WEATHER_IMAGES = {
    sunny: 'images/clear-sky.avif',
    cloudy: 'images/cloudy-sky.jpg',
    greyClouds: 'images/grey-clouds.webp',
    raining: 'images/raining.jpg',
    storm: 'images/storm.jpg',
    snow: 'images/snowy.avif',
    default: 'images/bg-2.avif'
};

const dateTime = new Date();

function updateClock() {
    document.getElementById('dateTime').textContent =
        new Date().toLocaleString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
}

updateClock();
setInterval(updateClock, 1000);

function renderImage(data) {
    const id = data.weather?.[0]?.id;
    let key = 'default';

    if (id >= 200 && id < 300) key = 'storm';
    else if (id >= 300 && id < 600) key = 'raining';
    else if (id >= 600 && id < 700) key = 'snow';
    else if (id === 800) key = 'sunny';
    else if (id === 801 || id === 802) key = 'cloudy';
    else if (id === 803 || id === 804) key = 'greyClouds';
    else if (id >= 700 && id < 800) key = 'greyClouds';

    els.clouds.style.backgroundImage = `url('${WEATHER_IMAGES[key]}')`;
}

const map = L.map('map').setView([57.5381, 25.4231], 13);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const owmLayer = (name) =>
    L.tileLayer(`https://tile.openweathermap.org/map/${name}/{z}/{x}/{y}.png?appid=${API_KEY}`, {
        maxZoom: 19,
        opacity: 0.7
    });

const overlays = {
    'Clouds': owmLayer('clouds_new'),
    'Precipitation': owmLayer('precipitation_new'),
    'Temperature': owmLayer('temp_new'),
    'Wind': owmLayer('wind_new'),
    'Pressure': owmLayer('pressure_new')
};

L.control.layers(null, overlays).addTo(map);

const els = {
    clouds: document.getElementById('head'),
    precipitation: document.getElementById('precipitation'),
    temperature: document.getElementById('temperature'),
    wind: document.getElementById('wind'),
    pressure: document.getElementById('pressure')
};

function setAll(html) {
    Object.values(els).forEach(el => (el.innerHTML = html));
}

function degToCompass(deg) {
    if (deg === undefined || deg === null) return '–';
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
        'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
}


function renderWeather(data) {
    renderImage(data);
    const rain = data.rain?.['1h'] ?? 0;
    const snow = data.snow?.['1h'] ?? 0;
    const place = data.name || 'Unknown place';

    els.clouds.innerHTML = `
    <div class="current">
        <img src="https://openweathermap.org/img/wn/${data.weather[0].icon}@4x.png" alt="">
        <div class="current-text">
            <div class="place">${place}</div>
            <div class="temp">${Math.round(data.main.temp)}°C</div>
            <div class="desc">${data.weather[0].description}</div>
        </div>
    </div>`;

    els.precipitation.innerHTML = `
        <strong>Clouds</strong><br>
        Rain: ${rain} mm/h<br>
        Snow: ${snow} mm/h<br>
        Clouds: ${data.clouds.all}%`;

    els.temperature.innerHTML = `
        <strong>Temperature</strong><br>
        ${Math.round(data.main.temp)} °C<br>
        Feels like: ${Math.round(data.main.feels_like)} °C<br>
        Humidity: ${data.main.humidity}%`;

    els.wind.innerHTML = `
        <strong>Wind</strong><br>
        ${data.wind.speed} m/s ${degToCompass(data.wind.deg)}<br>
        Direction: ${data.wind.deg ?? '–'}°<br>
        ${data.wind.gust ? `Gusts: ${data.wind.gust} m/s` : ''}`;

    els.pressure.innerHTML = `
        <strong>Pressure</strong><br>
        ${data.main.pressure} hPa<br>
        Visibility: ${data.visibility !== undefined ? (data.visibility / 1000).toFixed(1) + ' km' : '–'}`;
}

let marker = null;

map.on('click', async (e) => {
    const { lat, lng } = e.latlng;

    if (marker) marker.setLatLng(e.latlng);
    else marker = L.marker(e.latlng).addTo(map);

    setAll('Loading...');

    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        renderWeather(data);
    } catch (err) {
        setAll('Could not load weather: ' + err.message);
    }
});

setAll('Click the map to see weather');