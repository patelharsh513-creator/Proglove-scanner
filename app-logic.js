/* app-logic.js
  Complete single-file logic for ProGlove Bowl Tracking System
  - Works with Firebase Realtime DB (project: proglove-scanner)
  - Clean scan handling (kitchen + return)
  - Local fallback to localStorage if Firebase not available
*/

// ------------------- GLOBAL STATE -------------------
window.appData = {
mode: null,
user: null,
dishLetter: null,
scanning: false,
myScans: [],
activeBowls: [],
preparedBowls: [],
returnedBowls: [],
scanHistory: [],
customerData: [],
lastActivity: Date.now(),
lastSync: null
};

// Small user list (keeps parity with your source)
const USERS = [
{name: "Hamid", role: "Kitchen"},
{name: "Richa", role: "Kitchen"},
{name: "Jash", role: "Kitchen"},
{name: "Joel", role: "Kitchen"},
{name: "Mary", role: "Kitchen"},
{name: "Rushal", role: "Kitchen"},
{name: "Sreekanth", role: "Kitchen"},
{name: "Sultan", role: "Return"},
{name: "Riyaz", role: "Return"},
{name: "Alan", role: "Return"},
{name: "Adesh", role: "Return"}
];

// Firebase config (keeps your existing project)
var firebaseConfig = {
apiKey: "AIzaSyCL3hffCHosBceIRGR1it2dYEDb3uxIrJw",
authDomain: "proglove-scanner.firebaseapp.com",
databaseURL: "https://proglove-scanner-default-rtdb.europe-west1.firebasedatabase.app",
projectId: "proglove-scanner",
storageBucket: "proglove-scanner.firebasestorage.app",
messagingSenderId: "177575768177",
appId: "1:177575768177:web:0a0acbf222218e0c0b2bd0"
};

// ------------------- UTILITIES -------------------
function showMessage(message, type) {
try {
var container = document.getElementById('messageContainer');
if (!container) return;
var el = document.createElement('div');
el.style.pointerEvents = 'auto';
el.style.background = (type === 'error') ? '#7f1d1d' : (type === 'success') ? '#064e3b' : '#1f2937';
el.style.color = '#fff';
el.style.padding = '10px 14px';
el.style.borderRadius = '8px';
el.style.marginTop = '8px';
el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.6)';
el.innerText = message;
container.appendChild(el);
setTimeout(function() {
try { container.removeChild(el); } catch(e){}
}, 4000);
} catch(e){ console.error("showMessage error:",e) }
}

function nowISO() { return (new Date()).toISOString(); }
function todayDateStr() { return (new Date()).toLocaleDateString('en-GB'); }

// ------------------- STORAGE -------------------
function saveToLocal() {
try {
var toSave = {
activeBowls: window.appData.activeBowls,
preparedBowls: window.appData.preparedBowls,
returnedBowls: window.appData.returnedBowls,
myScans: window.appData.myScans,
scanHistory: window.appData.scanHistory,
customerData: window.appData.customerData,
lastSync: window.appData.lastSync
};
localStorage.setItem('proglove_data_v1', JSON.stringify(toSave));
} catch(e){ console.error("saveToLocal:", e) }
}

function loadFromLocal() {
try {
var raw = localStorage.getItem('proglove_data_v1');
if (!raw) return;
var parsed = JSON.parse(raw);
window.appData.activeBowls = parsed.activeBowls || [];
window.appData.preparedBowls = parsed.preparedBowls || [];
window.appData.returnedBowls = parsed.returnedBowls || [];
window.appData.myScans = parsed.myScans || [];
window.appData.scanHistory = parsed.scanHistory || [];
window.appData.customerData = parsed.customerData || [];
window.appData.lastSync = parsed.lastSync || null;
} catch(e){ console.error("loadFromLocal:", e) }
}

// ------------------- FIREBASE -------------------
function initFirebaseAndStart() {
try {
if (typeof firebase === 'undefined' || !firebase.apps) {
// firebase not available -> fallback to local
updateSystemStatus(false, "Firebase not loaded - using local");
loadFromLocal();
initializeUI();
return;
}

if (!firebase.apps.length) {
firebase.initializeApp(firebaseConfig);
}

// monitor connection
monitorConnection();
// load initial data
loadFromFirebase();
} catch (e) {
console.error("initFirebaseAndStart error:", e);
updateSystemStatus(false, "Firebase init failed - using local");
loadFromLocal();
initializeUI();
}
}

function updateSystemStatus(connected, text) {
var el = document.getElementById('systemStatus');
if (!el) return;
if (connected === true) {
el.innerText = '✅ Firebase Connected';
el.style.background = '#064e3b';
} else {
el.innerText = (text || '⚠️ Firebase Disconnected');
el.style.background = '#7f1d1d';
}
}

function monitorConnection() {
try {
var db = firebase.database();
var connectedRef = db.ref(".info/connected");
connectedRef.on("value", function(snap) {
if (snap && snap.val() === true) {
updateSystemStatus(true);
} else {
updateSystemStatus(false, '⚠️ Firebase Disconnected');
}
});
} catch (e) {
console.warn("monitorConnection failed:", e);
updateSystemStatus(false, "Connection monitor unavailable");
}
}

function loadFromFirebase() {
try {
var db = firebase.database();
var ref = db.ref('progloveData');
updateSystemStatus(false, '🔄 Loading cloud...');
ref.once('value').then(function(snapshot) {
if (snapshot && snapshot.exists && snapshot.exists()) {
var val = snapshot.val() || {};
// merge safely: prefer cloud but keep local unmatched
window.appData.activeBowls = val.activeBowls || window.appData.activeBowls || [];
window.appData.preparedBowls = val.preparedBowls || window.appData.preparedBowls || [];
window.appData.returnedBowls = val.returnedBowls || window.appData.returnedBowls || [];
window.appData.myScans = val.myScans || window.appData.myScans || [];
window.appData.scanHistory = val.scanHistory || window.appData.scanHistory || [];
window.appData.customerData = val.customerData || window.appData.customerData || [];
window.appData.lastSync = nowISO();
saveToLocal();
updateSystemStatus(true);
showMessage('✅ Cloud data loaded', 'success');
} else {
// no cloud data
updateSystemStatus(true, '✅ Cloud Connected (no data)');
loadFromLocal();
}
initializeUI();
}).catch(function(err){
console.error("Firebase read failed:", err);
updateSystemStatus(false, '⚠️ Cloud load failed');
loadFromLocal();
initializeUI();
});
} catch (e) {
console.error("loadFromFirebase error:", e);
updateSystemStatus(false, '⚠️ Firebase error');
loadFromLocal();
initializeUI();
}
}

function syncToFirebase() {
try {
if (typeof firebase === 'undefined') {
saveToLocal();
showMessage('⚠️ Offline - saved locally', 'warning');
return;
}
var db = firebase.database();
var payload = {
activeBowls: window.appData.activeBowls || [],
preparedBowls: window.appData.preparedBowls || [],
returnedBowls: window.appData.returnedBowls || [],
myScans: window.appData.myScans || [],
scanHistory: window.appData.scanHistory || [],
customerData: window.appData.customerData || [],
lastSync: nowISO()
};
db.ref('progloveData').set(payload)
.then(function() {
window.appData.lastSync = nowISO();
saveToLocal();
document.getElementById('lastSyncInfo').innerText = 'Last sync: ' + new Date(window.appData.lastSync).toLocaleString();
showMessage('✅ Synced to cloud', 'success');
})
.catch(function(err){
console.error("syncToFirebase error:", err);
showMessage('❌ Cloud sync failed - data saved locally', 'error');
saveToLocal();
});
} catch(e){ console.error("syncToFirebase:", e); saveToLocal(); }
}

// ------------------- SCAN HANDLING (CLEAN) -------------------
// A single entry point for processing scans, no nested if/else mess.
function handleScanInputRaw(rawInput) {
var startTime = Date.now();
var result = { message: '', type: 'error', responseTime: 0 };

try {
var input = (rawInput || '').toString().trim();
if (!input) {
result.message = '❌ Empty scan input';
result.type = 'error';
result.responseTime = Date.now() - startTime;
displayScanResult(result);
return result;
}

// detect/create vytInfo
var vytInfo = detectVytCode(input);
if (!vytInfo) {
result.message = '❌ Invalid VYT code/URL: ' + input;
result.type = 'error';
result.responseTime = Date.now() - startTime;
displayScanResult(result);
return result;
}

// route by mode
var mode = window.appData.mode || '';
if (mode === 'kitchen') {
result = kitchenScanClean(vytInfo, startTime);
} else if (mode === 'return') {
result = returnScanClean(vytInfo, startTime);
} else {
result.message = '❌ Please select operation mode first';
result.type = 'error';
result.responseTime = Date.now() - startTime;
}

// final UI update
displayScanResult(result);
updateDisplay();
updateOvernightStats();
updateLastActivity();
return result;

} catch (e) {
console.error("handleScanInputRaw:", e);
result.message = '❌ Unexpected error: ' + (e && e.message ? e.message : e);
result.type = 'error';
result.responseTime = Date.now() - startTime;
displayScanResult(result);
return result;
}
}

function displayScanResult(result) {
try {
var resp = document.getElementById('responseTimeValue');
if (resp) resp.textContent = (result.responseTime || '') + ' ms';
} catch(e){}

showMessage(result.message, result.type);

var inputEl = document.getElementById('scanInput');
if (!inputEl) return;
var className = (result.type === 'error') ? 'error' : 'success';
// simple colored border effect
if (result.type === 'error') {
inputEl.style.borderColor = 'var(--accent-red)';
setTimeout(function(){ inputEl.style.borderColor = ''; }, 1800);
} else {
inputEl.style.borderColor = 'var(--accent-green)';
setTimeout(function(){ inputEl.style.borderColor = ''; }, 600);
}
}

// detect vyt code pattern (safe)
function detectVytCode(input) {
if (!input || typeof input !== 'string') return null;
var cleaned = input.trim();
// common patterns (supports full URL or bare code)
var urlPattern = /(https?:\/\/[^\s]+)/i;
var vytPattern = /(VYT\.TO\/[^\s]+)|(vyt\.to\/[^\s]+)|(VYTAL[^\s]+)|(vytal[^\s]+)/i;
var matchUrl = cleaned.match(urlPattern);
if (matchUrl) {
return { fullUrl: matchUrl[1] };
}
var match = cleaned.match(vytPattern);
if (match) {
// return the whole input as code
return { fullUrl: cleaned };
}
// fallback: if string length looks like a code (>=6)
if (cleaned.length >= 6 && cleaned.length <= 120) return { fullUrl: cleaned };
return null;
}

// Kitchen scan (clean)
function kitchenScanClean(vytInfo, startTime) {
startTime = startTime || Date.now();
var today = todayDateStr();
// check duplicate for this user/dish today
var already = window.appData.preparedBowls.some(function(b){
return b.code === vytInfo.fullUrl && b.date === today && b.user === window.appData.user && b.dish === window.appData.dishLetter;
});
if (already) {
return { message: '❌ Already prepared today: ' + vytInfo.fullUrl, type: 'error', responseTime: Date.now() - startTime };
}

// if active bowl exists remove it (customer data reset)
var idxActive = -1;
for (var i = 0; i < window.appData.activeBowls.length; i++) {
if (window.appData.activeBowls[i].code === vytInfo.fullUrl) { idxActive = i; break; }
}
var hadCustomer = (idxActive !== -1);
if (idxActive !== -1) window.appData.activeBowls.splice(idxActive, 1);

var newPrepared = {
code: vytInfo.fullUrl,
dish: window.appData.dishLetter || 'Unknown',
user: window.appData.user || 'Unknown',
company: 'Unknown',
customer: 'Unknown',
date: today,
time: (new Date()).toLocaleTimeString(),
timestamp: nowISO(),
status: 'PREPARED',
hadPreviousCustomer: hadCustomer
};
window.appData.preparedBowls.push(newPrepared);

window.appData.myScans.push({
type: 'kitchen',
code: vytInfo.fullUrl,
dish: window.appData.dishLetter || 'Unknown',
user: window.appData.user || 'Unknown',
timestamp: nowISO(),
hadPreviousCustomer: hadCustomer
});

window.appData.scanHistory.unshift({ type: 'kitchen', code: vytInfo.fullUrl, user: window.appData.user, timestamp: nowISO(), message: 'Prepared: ' + vytInfo.fullUrl });

// sync
syncToFirebase();

return { message: (hadCustomer ? '✅ Prepared (customer reset): ' : '✅ Prepared: ') + vytInfo.fullUrl, type: 'success', responseTime: Date.now() - startTime };
}

// Return scan (clean)
function returnScanClean(vytInfo, startTime) {
startTime = startTime || Date.now();
var today = todayDateStr();

var preparedIndex = -1;
for (var i = 0; i < window.appData.preparedBowls.length; i++) {
if (window.appData.preparedBowls[i].code === vytInfo.fullUrl && window.appData.preparedBowls[i].date === today) {
preparedIndex = i; break;
}
}
if (preparedIndex === -1) {
return { message: '❌ Bowl not prepared today: ' + vytInfo.fullUrl, type: 'error', responseTime: Date.now() - startTime };
}

var preparedBowl = window.appData.preparedBowls[preparedIndex];
window.appData.preparedBowls.splice(preparedIndex, 1);

var returnedB = {
code: vytInfo.fullUrl,
dish: preparedBowl.dish,
user: window.appData.user || 'Unknown',
company: preparedBowl.company || 'Unknown',
customer: preparedBowl.customer || 'Unknown',
returnDate: today,
returnTime: (new Date()).toLocaleTimeString(),
returnTimestamp: nowISO(),
status: 'RETURNED'
};
window.appData.returnedBowls.push(returnedB);

window.appData.myScans.push({
type: 'return',
code: vytInfo.fullUrl,
user: window.appData.user || 'Unknown',
timestamp: nowISO()
});

window.appData.scanHistory.unshift({ type: 'return', code: vytInfo.fullUrl, user: window.appData.user, timestamp: nowISO(), message: 'Returned: ' + vytInfo.fullUrl });

syncToFirebase();

return { message: '✅ Returned: ' + vytInfo.fullUrl, type: 'success', responseTime: Date.now() - startTime };
}

// ------------------- UI INITIALIZATION & HANDLERS -------------------
function initializeUsersDropdown() {
try {
var dd = document.getElementById('userSelect');
if (!dd) return;
dd.innerHTML = '<option value="">-- Select User --</option>';
USERS.forEach(function(u){
var opt = document.createElement('option');
opt.value = u.name;
opt.textContent = u.name + (u.role ? ' (' + u.role + ')' : '');
dd.appendChild(opt);
});
} catch(e){ console.error(e) }
}

function loadDishOptions() {
var dd = document.getElementById('dishSelect');
if (!dd) return;
dd.innerHTML = '<option value="">-- Select Dish --</option>';
var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
letters.forEach(function(l){ var o = document.createElement('option'); o.value = l; o.textContent = l; dd.appendChild(o); });
['1','2','3','4'].forEach(function(n){ var o = document.createElement('option'); o.value = n; o.textContent = n; dd.appendChild(o); });
}

// expose UI functions
window.setMode = function(mode) {
window.appData.mode = mode;
window.appData.user = null;
window.appData.dishLetter = null;
window.appData.scanning = false;
// UI changes
var dishWrap = document.getElementById('dishWrapper');
if (dishWrap) {
dishWrap.style.display = (mode === 'kitchen') ? 'block' : 'none';
}
document.getElementById('modeDisplay').innerText = 'Mode: ' + (mode ? mode.toUpperCase() : 'N/A');
initializeUsersDropdown();
loadDishOptions();
updateDisplay();
showMessage('ℹ️ Mode selected: ' + mode.toUpperCase(), 'info');
};

window.selectUser = function() {
var dd = document.getElementById('userSelect');
if (!dd) return;
window.appData.user = dd.value || null;
if (window.appData.user) showMessage('✅ User: ' + window.appData.user, 'success');
updateDisplay();
};

window.selectDishLetter = function() {
var dd = document.getElementById('dishSelect');
if (!dd) return;
window.appData.dishLetter = dd.value || null;
if (window.appData.dishLetter) document.getElementById('myDishLetter').innerText = window.appData.dishLetter;
updateDisplay();
};

window.startScanning = function() {
if (!window.appData.user) { showMessage('❌ Select user first', 'error'); return; }
if (window.appData.mode === 'kitchen' && !window.appData.dishLetter) { showMessage('❌ Select dish first', 'error'); return; }
window.appData.scanning = true;
updateDisplay();
var inp = document.getElementById('scanInput');
if (inp) { inp.disabled = false; inp.focus(); inp.value = ''; }
showMessage('🎯 SCANNING ACTIVE', 'success');
};

window.stopScanning = function() {
window.appData.scanning = false;
updateDisplay();
var inp = document.getElementById('scanInput');
if (inp) inp.disabled = true;
showMessage('⏹ Scanning stopped', 'info');
};

function updateDisplay() {
try {
var startBtn = document.getElementById('startBtn');
var stopBtn = document.getElementById('stopBtn');
var userSel = document.getElementById('userSelect');
var dishSel = document.getElementById('dishSelect');

if (userSel) userSel.disabled = false;
if (dishSel) dishSel.disabled = false;

var canStart = !!(window.appData.user && !window.appData.scanning);
if (window.appData.mode === 'kitchen') canStart = canStart && !!window.appData.dishLetter;

if (startBtn) startBtn.disabled = !canStart;
if (stopBtn) stopBtn.disabled = !window.appData.scanning;

var scanInput = document.getElementById('scanInput');
if (scanInput) {
scanInput.disabled = !window.appData.scanning;
scanInput.placeholder = window.appData.scanning ? 'Scan VYT code...' : 'Select user and press START...';
}

// counts
var activeEl = document.getElementById('activeCount');
if (activeEl) activeEl.innerText = (window.appData.activeBowls.length || 0);

var preparedToday = 0;
var returnedToday = 0;
var today = todayDateStr();

(window.appData.preparedBowls || []).forEach(function(b){
if (b.date === today) preparedToday++;
});
(window.appData.returnedBowls || []).forEach(function(b){
if (b.returnDate === today) returnedToday++;
});

var preparedEl = document.getElementById('preparedTodayCount');
if (preparedEl) preparedEl.innerText = preparedToday;

var returnedEl = document.getElementById('returnedCount');
if (returnedEl) returnedEl.innerText = returnedToday;

var myScans = (window.appData.myScans || []).filter(function(s){
return s.user === window.appData.user && new Date(s.timestamp).toLocaleDateString('en-GB') === today;
}).length;
var myScansEl = document.getElementById('myScansCount');
if (myScansEl) myScansEl.innerText = myScans;

var exportInfo = document.getElementById('lastSyncInfo');
if (exportInfo) exportInfo.innerHTML = 'Active: ' + (window.appData.activeBowls.length || 0) + ' • Prepared today: ' + preparedToday + ' • Returns today: ' + returnedToday;

} catch(e) { console.error("updateDisplay:", e) }
}

function updateOvernightStats() {
try {
var body = document.getElementById('livePrepReportBody');
if (!body) return;
// compute cycle: 10PM yesterday -> 10PM today
var now = new Date();
var end = new Date(now);
end.setHours(22,0,0,0);
var start = new Date(end);
start.setDate(end.getDate() - 1);

var scans = (window.appData.myScans || []).filter(function(s){
var t = new Date(s.timestamp);
return t >= start && t <= end;
});

if (!scans || scans.length === 0) {
body.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#9aa3b2;padding:18px">No kitchen scans recorded during this cycle.</td></tr>';
return;
}

var stats = {};
scans.forEach(function(s){
var key = (s.dish || 'X') + '|' + (s.user || 'Unknown');
if (!stats[key]) stats[key] = { dish: s.dish||'--', user: s.user||'--', count: 0 };
stats[key].count++;
});

var rows = Object.keys(stats).map(function(k){
var it = stats[k];
return '<tr><td>' + (it.dish||'--') + '</td><td>' + (it.user||'--') + '</td><td>' + it.count + '</td></tr>';
});
body.innerHTML = rows.join('');
} catch(e){ console.error("updateOvernightStats:", e) }
}

function updateLastActivity() {
window.appData.lastActivity = Date.now();
}

// keyboard / input handlers for scanner
function bindScannerInput() {
try {
var inp = document.getElementById('scanInput');
if (!inp) return;
inp.addEventListener('keydown', function(e){
if (e.key === 'Enter') {
e.preventDefault();
var val = inp.value.trim();
if (!val) return;
if (!window.appData.scanning) {
showMessage('❌ Scanning not active', 'error');
return;
}
handleScanInputRaw(val);
inp.value = '';
setTimeout(function(){ inp.focus(); }, 50);
}
});
// paste / input
inp.addEventListener('input', function(e){
var v = inp.value.trim();
if (!v) return;
// auto process if looks like VYT
if (v.length >= 6 && (v.toLowerCase().indexOf('vyt') !== -1 || v.indexOf('/') !== -1)) {
if (window.appData.scanning) {
handleScanInputRaw(v);
inp.value = '';
}
}
});
} catch(e){ console.error("bindScannerInput:", e) }
}

// ------------------- EXPORTS (EXCEL FORMAT) -------------------

// Make sure XLSX library is loaded from CDN before this file:
// <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>

function showMessage(msg, type) {
const el = document.getElementById('messageContainer');
if (!el) return;
const m = document.createElement('div');
m.textContent = msg;
m.style.padding = '10px';
m.style.borderRadius = '6px';
m.style.marginTop = '8px';
m.style.color = '#fff';
m.style.background =
type === 'success' ? '#065f46' :
type === 'error'   ? '#7f1d1d' :
type === 'warning' ? '#92400e' : '#1f2937';
el.appendChild(m);
setTimeout(() => m.remove(), 4000);
}

// ---------- Universal Excel Export Helper ----------
function exportToExcel(sheetName, dataArray, filename) {
if (!dataArray || dataArray.length === 0) {
showMessage("❌ No data to export.", "error");
return;
}

try {
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(dataArray);
XLSX.utils.book_append_sheet(wb, ws, sheetName);
XLSX.writeFile(wb, filename);
showMessage(`✅ Exported ${filename} successfully.`, "success");
} catch (error) {
console.error("Excel export failed:", error);
showMessage("❌ Excel export failed.", "error");
}
}

// ---------- Export Active Bowls ----------
window.exportActiveBowls = function () {
try {
const bowls = window.appData.activeBowls || [];
if (bowls.length === 0) {
showMessage("❌ No active bowls to export", "error");
return;
}

const today = new Date();
const data = bowls.map((b) => {
const d = new Date(b.creationDate || today);
const missing = Math.ceil((today - d) / (1000 * 3600 * 24));
return {
"Bowl Code": b.code,
"Dish": b.dish,
"Company": b.company || "",
"Customer": b.customer || "",
"Creation Date": b.creationDate || "",
"Missing Days": missing + " days",
};
});

exportToExcel("Active Bowls", data, "Active_Bowls.xlsx");
} catch (e) {
console.error(e);
showMessage("❌ Export failed", "error");
}
};

// ---------- Export Returned Bowls ----------
window.exportReturnData = function () {
try {
const bowls = window.appData.returnedBowls || [];
if (bowls.length === 0) {
showMessage("❌ No returned bowls to export", "error");
return;
}

const today = new Date();
const data = bowls.map((b) => {
const d = new Date(b.returnDate || today);
const missing = Math.ceil((today - d) / (1000 * 3600 * 24));
return {
"Bowl Code": b.code,
"Dish": b.dish,
"Company": b.company || "",
"Customer": b.customer || "",
"Returned By": b.returnedBy || "",
"Return Date": b.returnDate || "",
"Return Time": b.returnTime || "",
"Missing Days": missing + " days",
};
});

exportToExcel("Returned Bowls", data, "Returned_Bowls.xlsx");
} catch (e) {
console.error(e);
showMessage("❌ Export failed", "error");
}
};

// ------------------- EXPORT ALL DATA TO EXCEL -------------------
window.exportAllData = async function () {
try {
if (!window.appData.activeBowls || window.appData.activeBowls.length === 0) {
showMessage("❌ No data to export.", "error");
return;
}

// Prepare a combined dataset
const allData = window.appData.activeBowls.map(b => {
const missingDays = b.creationDate
? Math.ceil((Date.now() - new Date(b.creationDate)) / 86400000)
: "";
return {
Code: b.code,
Dish: b.dish || "",
Company: b.company || "",
Customer: b.customer || "",
CreationDate: b.creationDate || "",
MissingDays: missingDays,
};
});

// Use ExcelJS (lightweight Excel library)
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("All Bowls Data");

// Define columns
sheet.columns = [
{ header: "Code", key: "Code", width: 25 },
{ header: "Dish", key: "Dish", width: 15 },
{ header: "Company", key: "Company", width: 25 },
{ header: "Customer", key: "Customer", width: 25 },
{ header: "Creation Date", key: "CreationDate", width: 20 },
{ header: "Missing Days", key: "MissingDays", width: 15 },
];

// Add rows
allData.forEach(item => {
const row = sheet.addRow(item);
const missingDays = parseInt(item.MissingDays, 10);

// Apply red background for > 7 days missing
if (!isNaN(missingDays) && missingDays > 7) {
row.getCell("MissingDays").fill = {
type: "pattern",
pattern: "solid",
fgColor: { argb: "FFFF4C4C" }, // bright red
};
row.getCell("MissingDays").font = { color: { argb: "FFFFFFFF" }, bold: true };
}
});

// Add header style
sheet.getRow(1).font = { bold: true, color: { argb: "FF00E0B3" } };
sheet.getRow(1).alignment = { horizontal: "center" };

// Export Excel file
const buffer = await workbook.xlsx.writeBuffer();
const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = `ProGlove_All_Data_${new Date().toISOString().split("T")[0]}.xlsx`;
a.click();
URL.revokeObjectURL(url);

showMessage("✅ Excel file exported successfully!", "success");
} catch (err) {
console.error("❌ Excel export failed:", err);
showMessage("❌ Excel export failed. Check console for details.", "error");
}
};
// ------------------- JSON PATCH PROCESSING (UPDATED) -------------------
window.processJSONData = function () {
try {
const raw = document.getElementById("jsonData").value?.trim();
if (!raw) {
showMessage("❌ Paste JSON first", "error");
return;
}

const parsed = JSON.parse(raw);
const items = Array.isArray(parsed)
? parsed
: parsed.companies || parsed.boxes || [parsed];

let added = 0,
updated = 0;

items.forEach(function (comp) {
if (comp.boxes && Array.isArray(comp.boxes)) {
comp.boxes.forEach(function (box) {
// ✅ Extract date from uniqueIdentifier (format: cm-1-Name-YYYY-MM-DD)
let deliveryDate = "";
if (box.uniqueIdentifier) {
const dateMatch = box.uniqueIdentifier.match(
/\d{4}-\d{2}-\d{2}/
);
if (dateMatch) {
deliveryDate = dateMatch[0];
}
}

if (box.dishes && Array.isArray(box.dishes)) {
box.dishes.forEach(function (dish) {
if (dish.bowlCodes && Array.isArray(dish.bowlCodes)) {
dish.bowlCodes.forEach(function (code) {
let existing = window.appData.activeBowls.find(
(b) => b.code === code
);

// 🧠 Extract users (customer names)
const customers =
dish.users && dish.users.length > 0
? dish.users
.map((u) => u.username)
.join(", ")
: "Unknown";

if (existing) {
// ✅ Update existing bowl data
existing.company =
comp.name ||
existing.company ||
"Unknown";
existing.customer =
customers ||
existing.customer ||
"Unknown";
existing.creationDate =
deliveryDate ||
existing.creationDate ||
todayDateStr();
updated++;
} else {
// ✅ Add new bowl
window.appData.activeBowls.push({
code: code,
dish: dish.label || "",
company: comp.name || "Unknown",
customer: customers,
creationDate:
deliveryDate || todayDateStr(),
timestamp: nowISO(),
});
added++;
}
});
}
});
}
});
}
});

saveToLocal();
syncToFirebase();

// Update UI feedback
const patchResultsEl = document.getElementById("patchResults");
const patchSummaryEl = document.getElementById("patchSummary");
const failedEl = document.getElementById("failedMatches");

if (patchResultsEl) patchResultsEl.style.display = "block";
if (patchSummaryEl)
patchSummaryEl.textContent =
"Updated: " + updated + " • Created: " + added;
if (failedEl)
failedEl.innerHTML = "<em>Processing finished successfully.</em>";

showMessage(
"✅ JSON processed successfully: " + (updated + added) + " bowls",
"success"
);
} catch (e) {
console.error("processJSONData:", e);
showMessage("❌ JSON parse or import error", "error");
}
};

// reset placeholder
window.resetTodaysPreparedBowls = function() {
// keep simple: remove today's prepared bowls (confirmation skipped for brevity)
var today = todayDateStr();
window.appData.preparedBowls = (window.appData.preparedBowls || []).filter(function(b){ return b.date !== today; });
syncToFirebase();
updateDisplay();
showMessage('✅ Today\'s prepared bowls cleared', 'success');
};

// ------------------- BOOTSTRAP -------------------
function initializeUI() {
try {
initializeUsersDropdown();
loadDishOptions();
bindScannerInput();
updateDisplay();
updateOvernightStats();

// subtle auto-focus on input when scanning active
document.addEventListener('keydown', function(e){
if (!window.appData.scanning) return;
var input = document.getElementById('scanInput');
if (input && document.activeElement !== input && /[a-z0-9]/i.test(e.key)) {
input.focus();
}
});
} catch(e){ console.error("initializeUI:", e) }
}

// ------------------- STARTUP -------------------
document.addEventListener('DOMContentLoaded', function(){
try {
// Begin trying to initialize Firebase and load data
initFirebaseAndStart();
} catch(e){
console.error("startup error:", e);
loadFromLocal();
initializeUI();
}
});


