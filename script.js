let rawData = [];
let profileCache = JSON.parse(localStorage.getItem('robloxProfileCache')) || {};
let charts = {};
let currentYear = new Date().getFullYear();
let activeExportData = [];

const loadingScreen = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');
const mainApp = document.getElementById('main-app');
const trainerListEl = document.getElementById('trainer-list');
const tzSelect = document.getElementById('tz-select');
const timeframeSelect = document.getElementById('timeframe-select');
const searchInput = document.getElementById('trainer-search');
const selectAllCheckbox = document.getElementById('select-all-trainers');
const statusBar = document.getElementById('status-bar');

function populateTimezones() {
    tzSelect.innerHTML = '<option value="local" selected>Local Browser Time</option><option value="UTC">UTC</option>';
    if (typeof Intl.supportedValuesOf === 'function') {
        Intl.supportedValuesOf('timeZone').forEach(tz => {
            const opt = document.createElement('option');
            opt.value = tz; opt.textContent = tz;
            tzSelect.appendChild(opt);
        });
    }
}

async function fetchRobloxProfile(userId) {
    if (!userId || isNaN(userId) || userId === "Unknown") return "Unknown Trainer";
    if (profileCache[userId]) return profileCache[userId];

    try {
        const response = await fetch(`https://users.roproxy.com/v1/users/${userId}`);
        if (response.ok) {
            const data = await response.json();
            const name = `${data.displayName} (@${data.name})`;
            profileCache[userId] = name;
            return name;
        }
    } catch (e) {}
    
    const fallback = `Guest Trainer (ID: ${userId})`;
    profileCache[userId] = fallback;
    return fallback;
}

async function loadData() {
    try {
        populateTimezones();
        const res = await fetch('data/data.json');
        rawData = await res.json();
        
        const uniqueIds = [...new Set(rawData.map(d => d.trainerId || "Unknown"))];
        
        for (let i = 0; i < uniqueIds.length; i++) {
            loadingStatus.innerText = `Resolving trainer profiles ${i + 1}/${uniqueIds.length}...`;
            await fetchRobloxProfile(uniqueIds[i]);
        }
        
        localStorage.setItem('robloxProfileCache', JSON.stringify(profileCache));

        let maxYear = 0;
        rawData.forEach(d => {
            d.parsedDate = new Date(d.timestamp);
            d.trainerName = profileCache[d.trainerId] || "Unknown Trainer";
            const yr = d.parsedDate.getUTCFullYear();
            if (yr > maxYear) maxYear = yr;
        });

        currentYear = maxYear > 0 ? maxYear : new Date().getFullYear();
        document.getElementById('current-year').innerText = currentYear;

        initUI();
        initCharts();
        updateDashboard();
        
        loadingScreen.style.display = 'none';
        mainApp.style.display = 'flex';
        
    } catch (e) {
        loadingStatus.innerText = `Error loading data: ${e.message}.`;
        loadingStatus.style.color = "#D13438";
    }
}

function initUI() {
    const uniqueTrainers = [...new Set(rawData.map(d => d.trainerName))].sort();
    trainerListEl.innerHTML = '';
    
    uniqueTrainers.forEach(name => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        label.innerHTML = `<input type="checkbox" class="trainer-cb" value="${name}" checked> ${name}`;
        trainerListEl.appendChild(label);
    });

    document.querySelectorAll('.trainer-cb, .day-cb').forEach(cb => cb.addEventListener('change', updateDashboard));
    tzSelect.addEventListener('change', updateDashboard);
    timeframeSelect.addEventListener('change', updateDashboard);
    
    document.getElementById('prev-year').addEventListener('click', () => { currentYear--; document.getElementById('current-year').innerText = currentYear; updateDashboard(); });
    document.getElementById('next-year').addEventListener('click', () => { currentYear++; document.getElementById('current-year').innerText = currentYear; updateDashboard(); });
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.trainer-cb').forEach(cb => {
            cb.parentElement.style.display = cb.value.toLowerCase().includes(query) ? 'flex' : 'none';
        });
    });

    selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll('.trainer-cb').forEach(cb => {
            if (cb.parentElement.style.display !== 'none') cb.checked = isChecked;
        });
        updateDashboard();
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.target).classList.add('active');
        });
    });

    document.getElementById('btn-export-csv').addEventListener('click', exportToCSV);
    document.getElementById('btn-export-png').addEventListener('click', exportToPNG);
}

function initCharts() {
    Chart.defaults.color = '#ffffff';
    Chart.defaults.borderColor = '#444444';

    charts.weekly = new Chart(document.getElementById('weeklyChart').getContext('2d'), {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Total Trainings', data: [], backgroundColor: '#0078D4' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'Frequency by Day' } }, animation: { duration: 0 } }
    });

    charts.hourly = new Chart(document.getElementById('hourlyChart').getContext('2d'), {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Total Trainings', data: [], backgroundColor: '#D13438' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'Hourly Distribution' } }, animation: { duration: 0 } }
    });

    charts.yearly = new Chart(document.getElementById('yearlyChart').getContext('2d'), {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Total Trainings', data: [], backgroundColor: '#107C10', borderColor: '#107C10', fill: true, tension: 0.1 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'Yearly Timeline' } }, animation: { duration: 0 } }
    });
}

function updateDashboard() {
    const selectedTrainers = Array.from(document.querySelectorAll('.trainer-cb:checked')).map(cb => cb.value);
    const selectedDays = Array.from(document.querySelectorAll('.day-cb:checked')).map(cb => cb.value);
    const tz = tzSelect.value;
    const timeframe = timeframeSelect.value;

    const now = new Date();
    let cutoff = new Date(0);

    if (timeframe.includes("7")) cutoff = new Date(now.setDate(now.getDate() - 7));
    else if (timeframe.includes("30")) cutoff = new Date(now.setDate(now.getDate() - 30));
    else if (timeframe.includes("90")) cutoff = new Date(now.setDate(now.getDate() - 90));
    else if (timeframe.includes("180")) cutoff = new Date(now.setDate(now.getDate() - 180));

    let baseFiltered = rawData.filter(d => selectedTrainers.includes(d.trainerName) && d.parsedDate >= cutoff);
    const tzOption = tz === 'local' ? undefined : tz;

    const dayCounts = { "Monday":0, "Tuesday":0, "Wednesday":0, "Thursday":0, "Friday":0, "Saturday":0, "Sunday":0 };
    const hourCounts = new Array(24).fill(0);
    const yearlyCounts = {};
    const trainerLeaderboard = {};
    let dayFilteredCount = 0;

    activeExportData = [];

    baseFiltered.forEach(d => {
        const dayStr = d.parsedDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: tzOption });
        
        if (dayCounts[dayStr] !== undefined) dayCounts[dayStr]++;

        if (selectedDays.includes(dayStr)) {
            dayFilteredCount++;
            activeExportData.push(d);

            const hour = parseInt(d.parsedDate.toLocaleTimeString('en-GB', { hour: '2-digit', timeZone: tzOption }));
            if (!isNaN(hour)) hourCounts[hour]++;

            const yearStr = d.parsedDate.toLocaleDateString('en-US', { year: 'numeric', timeZone: tzOption });
            if (parseInt(yearStr) === currentYear) {
                const formattedDate = d.parsedDate.toLocaleDateString('sv-SE', { timeZone: tzOption });
                yearlyCounts[formattedDate] = (yearlyCounts[formattedDate] || 0) + 1;
            }
            trainerLeaderboard[d.trainerName] = (trainerLeaderboard[d.trainerName] || 0) + 1;
        }
    });

    charts.weekly.data.labels = Object.keys(dayCounts);
    charts.weekly.data.datasets[0].data = Object.values(dayCounts);
    charts.weekly.update();

    charts.hourly.data.labels = hourCounts.map((_, i) => `${i.toString().padStart(2, '0')}:00`);
    charts.hourly.data.datasets[0].data = hourCounts;
    charts.hourly.options.plugins.title.text = `Hourly Distribution (${selectedDays.length === 7 ? 'All Days' : selectedDays.join(', ')})`;
    charts.hourly.update();

    const sortedDates = Object.keys(yearlyCounts).sort();
    charts.yearly.data.labels = sortedDates;
    charts.yearly.data.datasets[0].data = sortedDates.map(d => yearlyCounts[d]);
    charts.yearly.options.plugins.title.text = `Yearly Training Timeline (${currentYear})`;
    charts.yearly.update();

    updateStats(dayFilteredCount, baseFiltered.length, hourCounts, dayCounts, trainerLeaderboard);
    
    statusBar.innerText = `Active Scope: ${dayFilteredCount} trainings matching filters | ${selectedTrainers.length} total trainers | Timezone: ${tz} | Year: ${currentYear}`;
}

function updateStats(totalDayFiltered, totalBaseFiltered, hourCounts, dayCounts, leaderboardCounts) {
    document.getElementById('stat-total-filtered').innerText = `${totalDayFiltered} logs matching day filters (${totalBaseFiltered} in scope, ${rawData.length} total all-time)`;

    if (totalDayFiltered === 0) {
        document.getElementById('stat-peak-time').innerText = "No activity";
        document.getElementById('stat-drought-time').innerText = "--";
        document.getElementById('stat-busiest-day').innerText = "--";
        document.getElementById('stat-weekly-avg').innerText = "0.0";
        document.getElementById('stat-leaderboard').innerHTML = "No activity";
        return;
    }

    let max2h = 0, maxIdx = 0, minHour = 0, minCount = Infinity;
    for (let i = 0; i < 24; i++) {
        const twoHourSum = hourCounts[i] + hourCounts[(i + 1) % 24];
        if (twoHourSum > max2h) { max2h = twoHourSum; maxIdx = i; }
        if (hourCounts[i] < minCount) { minCount = hourCounts[i]; minHour = i; }
    }

    const peakPct = ((max2h / totalDayFiltered) * 100).toFixed(1);
    document.getElementById('stat-peak-time').innerText = `${maxIdx.toString().padStart(2,'0')}:00 – ${((maxIdx+2)%24).toString().padStart(2,'0')}:00\n[${max2h} trainings, ${peakPct}%]`;
    document.getElementById('stat-drought-time').innerText = `${minHour.toString().padStart(2,'0')}:00 – ${((minHour+1)%24).toString().padStart(2,'0')}:00\n[${minCount} trainings]`;

    let busiestDay = "", busiestCount = -1;
    for (const [day, count] of Object.entries(dayCounts)) {
        if (count > busiestCount) { busiestCount = count; busiestDay = day; }
    }
    document.getElementById('stat-busiest-day').innerText = `${busiestDay} (${busiestCount} trainings)`;
    document.getElementById('stat-weekly-avg').innerText = `${(totalDayFiltered / 4).toFixed(1)} trainings / week`;

    const sortedLeaderboard = Object.entries(leaderboardCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const medals = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    
    let lbHTML = sortedLeaderboard.map((item, index) => {
        const pct = ((item[1] / totalDayFiltered) * 100).toFixed(1);
        return `<p><strong>${medals[index] || (index+1)}.</strong> ${item[0]}<i>: ${item[1]} trainings (${pct}%)</i></p>`;
    }).join("");
    document.getElementById('stat-leaderboard').innerHTML = lbHTML || "No activity";
}

function exportToCSV() {
    if (activeExportData.length === 0) return alert("No data to export!");
    
    const tzOption = tzSelect.value === 'local' ? undefined : tzSelect.value;
    let csvContent = "Trainer Name,Roblox User ID,Timestamp (" + tzSelect.value + ")\n";
    
    activeExportData.forEach(row => {
        const ts = row.parsedDate.toLocaleString('en-US', { timeZone: tzOption }).replace(/,/g, '');
        csvContent += `"${row.trainerName}","${row.trainerId}","${ts}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "filtered_training_data.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportToPNG() {
    const c1 = document.getElementById('weeklyChart');
    const c2 = document.getElementById('hourlyChart');
    const c3 = document.getElementById('yearlyChart');

    const merged = document.createElement('canvas');
    merged.width = Math.max(c1.width + c2.width + 30, c3.width) + 40;
    merged.height = Math.max(c1.height, c2.height) + c3.height + 60;
    
    const ctx = merged.getContext('2d');
    
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(0, 0, merged.width, merged.height);

    ctx.drawImage(c1, 20, 20);
    ctx.drawImage(c2, c1.width + 40, 20);
    ctx.drawImage(c3, 20, Math.max(c1.height, c2.height) + 40);

    const link = document.createElement("a");
    link.href = merged.toDataURL("image/png");
    link.download = "dashboard_charts.png";
    link.click();
}

window.onload = loadData;
