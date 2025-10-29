/* app-logic.js
  Complete single-file logic for ProGlove Bowl Tracking System
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

// Small user list
const USERS = [
    {name: "Hamid", role: "Kitchen"},
    {name: "Richa", role: "Kitchen"},
    {name: "Jash", role: "Kitchen"},
    {name: "Joes", role: "Kitchen"},
    {name: "Mary", role: "Kitchen"},
    {name: "Rushal", role: "Kitchen"},
    {name: "Sreekanth", role: "Kitchen"},
    {name: "Sultan", role: "Return"},
    {name: "Riyaz", role: "Return"},
    {name: "Alan", role: "Return"},
    {name: "Adesh", role: "Return"}
];

// Firebase config
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
            activeBowls: window.appData.activeBowls || [],
            preparedBowls: window.appData.preparedBowls || [],
            returnedBowls: window.appData.returnedBowls || [],
            myScans: window.appData.myScans || [],
            scanHistory: window.appData.scanHistory || [],
            customerData: window.appData.customerData || [],
            lastSync: window.appData.lastSync
        };
        localStorage.setItem('proglove_data_v1', JSON.stringify(toSave));
    } catch(e) {
        console.error("saveToLocal:", e);
    }
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
    } catch(e) { 
        console.error("loadFromLocal:", e);
    }
}

// ------------------- FIREBASE -------------------
function initFirebaseAndStart() {
    try {
        if (typeof firebase === 'undefined' || !firebase.apps) {
            updateSystemStatus(false, "Firebase not loaded - using local");
            loadFromLocal();
            initializeUI();
            return;
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        monitorConnection();
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
                
                // MERGE data instead of replacing
                var cloudPrepared = val.preparedBowls || [];
                var localPrepared = window.appData.preparedBowls || [];
                var combinedPrepared = [...localPrepared];
                cloudPrepared.forEach(cloudBowl => {
                    if (!combinedPrepared.some(localBowl => localBowl.code === cloudBowl.code && localBowl.date === cloudBowl.date)) {
                        combinedPrepared.push(cloudBowl);
                    }
                });
                
                window.appData.preparedBowls = combinedPrepared;
                window.appData.activeBowls = val.activeBowls || window.appData.activeBowls || [];
                window.appData.returnedBowls = val.returnedBowls || window.appData.returnedBowls || [];
                window.appData.myScans = val.myScans || window.appData.myScans || [];
                window.appData.scanHistory = val.scanHistory || window.appData.scanHistory || [];
                window.appData.customerData = val.customerData || window.appData.customerData || [];
                window.appData.lastSync = nowISO();
                saveToLocal();
                updateSystemStatus(true);
                showMessage('✅ Cloud data loaded', 'success');
            } else {
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
            return;
        }
        
        var db = firebase.database();
        
        // SYNC ONLY NEW DATA - don't overwrite entire dataset
        var newPreparedBowls = window.appData.preparedBowls || [];
        
        // Push each new bowl individually to Firebase
        newPreparedBowls.forEach(function(bowl) {
            var bowlKey = encodeURIComponent(bowl.code);
            db.ref('progloveData/preparedBowls/' + bowlKey).set(bowl);
        });
        
        // Update sync time
        db.ref('progloveData/lastSync').set(nowISO());
        
        window.appData.lastSync = nowISO();
        saveToLocal();
        
    } catch(e){ 
        console.error("syncToFirebase:", e); 
        saveToLocal();
    }
}

// ------------------- SCAN HANDLING -------------------
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
        var vytInfo = detectVytCode(input);
        if (!vytInfo) {
            result.message = '❌ Invalid VYT code/URL: ' + input;
            result.type = 'error';
            result.responseTime = Date.now() - startTime;
            displayScanResult(result);
            return result;
        }
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
    if (result.type === 'error') {
        inputEl.style.borderColor = 'var(--accent-red)';
        setTimeout(function(){ inputEl.style.borderColor = ''; }, 1800);
    } else {
        inputEl.style.borderColor = 'var(--accent-green)';
        setTimeout(function(){ inputEl.style.borderColor = ''; }, 600);
    }
}

function detectVytCode(input) {
    if (!input || typeof input !== 'string') return null;
    var cleaned = input.trim();
    var urlPattern = /(https?:\/\/[^\s]+)/i;
    var vytPattern = /(VYT\.TO\/[^\s]+)|(vyt\.to\/[^\s]+)|(VYTAL[^\s]+)|(vytal[^\s]+)/i;
    var matchUrl = cleaned.match(urlPattern);
    if (matchUrl) return { fullUrl: matchUrl[1] };
    var match = cleaned.match(vytPattern);
    if (match) return { fullUrl: cleaned };
    if (cleaned.length >= 6 && cleaned.length <= 120) return { fullUrl: cleaned };
    return null;
}

function kitchenScanClean(vytInfo, startTime) {
    startTime = startTime || Date.now();
    var today = todayDateStr();
    var already = (window.appData.preparedBowls || []).some(function(b){
        return b.code === vytInfo.fullUrl && b.date === today;
    });
    if (already) {
        return { message: '❌ Already prepared today: ' + vytInfo.fullUrl, type: 'error', responseTime: Date.now() - startTime };
    }
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
    // Immediate local save and display
    saveToLocal();
    updateDisplay();

    // Firebase sync in background (don't wait for it)
    setTimeout(syncToFirebase, 0);  
    window.appData.myScans.push({
        type: 'kitchen',
        code: vytInfo.fullUrl,
        dish: window.appData.dishLetter || 'Unknown',
        user: window.appData.user || 'Unknown',
        timestamp: nowISO(),
        hadPreviousCustomer: hadCustomer
    });
    window.appData.scanHistory.unshift({ type: 'kitchen', code: vytInfo.fullUrl, user: window.appData.user, timestamp: nowISO(), message: 'Prepared: ' + vytInfo.fullUrl });
    setTimeout(syncToFirebase, 100);
    return { message: (hadCustomer ? '✅ Prepared (customer reset): ' : '✅ Prepared: ') + vytInfo.fullUrl, type: 'success', responseTime: Date.now() - startTime };
}

function returnScanClean(vytInfo, startTime) {
    startTime = startTime || Date.now();
    var today = todayDateStr();
    var preparedIndex = -1;
    var preparedBowlsArray = Array.isArray(window.appData.preparedBowls) ? window.appData.preparedBowls : [];
    for (var i = 0; i < preparedBowlsArray.length; i++) {
        if (preparedBowlsArray[i].code === vytInfo.fullUrl && preparedBowlsArray[i].date === today) {
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

// ------------------- UI INITIALIZATION -------------------
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

window.setMode = function(mode) {
    window.appData.mode = mode;
    window.appData.user = null;
    window.appData.dishLetter = null;
    window.appData.scanning = false;
    var dishWrap = document.getElementById('dishWrapper');
    if (dishWrap) dishWrap.style.display = (mode === 'kitchen') ? 'block' : 'none';
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
        inp.addEventListener('input', function(e){
            var v = inp.value.trim();
            if (!v) return;
            if (v.length >= 6 && (v.toLowerCase().indexOf('vyt') !== -1 || v.indexOf('/') !== -1)) {
                if (window.appData.scanning) {
                    handleScanInputRaw(v);
                    inp.value = '';
                }
            }
        });
    } catch(e){ console.error("bindScannerInput:", e) }
}

function initializeUI() {
    try {
        initializeUsersDropdown();
        loadDishOptions();
        bindScannerInput();
        updateDisplay();
        updateOvernightStats();
        document.addEventListener('keydown', function(e){
            if (!window.appData.scanning) return;
            var input = document.getElementById('scanInput');
            if (input && document.activeElement !== input && /[a-z0-9]/i.test(e.key)) {
                input.focus();
            }
        });
    } catch(e){ console.error("initializeUI:", e) }
}

document.addEventListener('DOMContentLoaded', function(){
    try {
        initFirebaseAndStart();
    } catch(e){
        console.error("startup error:", e);
        loadFromLocal();
        initializeUI();
    }
});

