/* app-logic.js - Firebase Only Version */

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

var firebaseConfig = {
    apiKey: "AIzaSyCL3hffCHosBceIRGR1it2dYEDb3uxIrJw",
    authDomain: "proglove-scanner.firebaseapp.com",
    databaseURL: "https://proglove-scanner-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "proglove-scanner",
    storageBucket: "proglove-scanner.firebasestorage.app",
    messagingSenderId: "177575768177",
    appId: "1:177575768177:web:0a0acbf222218e0c0b2bd0"
};

// ------------------- MISSING UTILITY FUNCTIONS -------------------
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

// ------------------- FIREBASE INIT (NO FALLBACK) -------------------
function initFirebaseAndStart() {
    console.log("🔥 Initializing Firebase...");
    
    if (typeof firebase === 'undefined') {
        showMessage("❌ FIREBASE ERROR: Firebase SDK not loaded. Check your internet connection and refresh.", "error");
        document.getElementById('systemStatus').innerText = "❌ Firebase SDK Missing";
        return;
    }

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            console.log("✅ Firebase app initialized");
        }

        // Test connection immediately
        var db = firebase.database();
        var connectedRef = db.ref(".info/connected");
        
        connectedRef.on("value", function(snap) {
            if (snap && snap.val() === true) {
                console.log("✅ Firebase connected");
                updateSystemStatus(true);
                loadFromFirebase();
            } else {
                console.log("❌ Firebase disconnected");
                updateSystemStatus(false, "❌ Disconnected - Check Internet");
                showMessage("❌ NO CONNECTION: Cannot connect to Firebase. Check your internet.", "error");
            }
        });

    } catch (e) {
        console.error("Firebase init error:", e);
        showMessage("❌ FIREBASE ERROR: " + e.message, "error");
        document.getElementById('systemStatus').innerText = "❌ Firebase Error";
    }
}

function updateSystemStatus(connected, text) {
    var el = document.getElementById('systemStatus');
    if (!el) return;
    if (connected === true) {
        el.innerText = '✅ Firebase Connected';
        el.style.background = '#064e3b';
    } else {
        el.innerText = text || '❌ Firebase Disconnected';
        el.style.background = '#7f1d1d';
    }
}

function loadFromFirebase() {
    console.log("📥 Loading data from Firebase...");
    
    try {
        var db = firebase.database();
        var ref = db.ref('progloveData');
        
        updateSystemStatus(false, '🔄 Loading from Firebase...');
        
        ref.once('value').then(function(snapshot) {
            if (snapshot && snapshot.exists()) {
                var val = snapshot.val() || {};
                
                // FIX: Ensure arrays are properly formatted
                window.appData.activeBowls = Array.isArray(val.activeBowls) ? val.activeBowls : [];
                window.appData.preparedBowls = Array.isArray(val.preparedBowls) ? val.preparedBowls : [];
                window.appData.returnedBowls = Array.isArray(val.returnedBowls) ? val.returnedBowls : [];
                window.appData.myScans = Array.isArray(val.myScans) ? val.myScans : [];
                window.appData.scanHistory = Array.isArray(val.scanHistory) ? val.scanHistory : [];
                window.appData.customerData = Array.isArray(val.customerData) ? val.customerData : [];
                
                window.appData.lastSync = nowISO();
                updateSystemStatus(true);
                showMessage('✅ Data loaded from Firebase', 'success');
                console.log("✅ Data loaded successfully");
            } else {
                // No data in Firebase - initialize empty
                window.appData.activeBowls = [];
                window.appData.preparedBowls = [];
                window.appData.returnedBowls = [];
                window.appData.myScans = [];
                window.appData.scanHistory = [];
                window.appData.customerData = [];
                updateSystemStatus(true, '✅ Connected (No Data)');
                showMessage('ℹ️ No existing data - starting fresh', 'info');
            }
            initializeUI();
            
        }).catch(function(err){
            console.error("Firebase load error:", err);
            updateSystemStatus(false, '❌ Load Failed');
            showMessage('❌ FAILED TO LOAD: ' + err.message, 'error');
            // Don't initialize UI if load fails
        });
        
    } catch (e) {
        console.error("Load error:", e);
        updateSystemStatus(false, '❌ Firebase Error');
        showMessage('❌ LOAD ERROR: ' + e.message, 'error');
    }
}

function syncToFirebase() {
    console.log("📤 Syncing to Firebase...");
    
    if (typeof firebase === 'undefined') {
        showMessage("❌ CANNOT SYNC: Firebase not available", "error");
        return;
    }

    try {
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
            showMessage('✅ Synced to Firebase', 'success');
        })
        .catch(function(err){
            console.error("Sync error:", err);
            showMessage('❌ SYNC FAILED: ' + err.message, 'error');
        });
        
    } catch(e) { 
        console.error("Sync error:", e);
        showMessage('❌ SYNC ERROR: ' + e.message, 'error');
    }
}

// ------------------- SCAN HANDLING (FIREBASE ONLY) -------------------
function handleScanInputRaw(rawInput) {
    var startTime = Date.now();
    var result = { message: '', type: 'error', responseTime: 0 };

    // Check Firebase connection first
    if (typeof firebase === 'undefined') {
        result.message = '❌ FIREBASE OFFLINE: Cannot scan without connection';
        displayScanResult(result);
        return result;
    }

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
        return result;

    } catch (e) {
        console.error("Scan error:", e);
        result.message = '❌ SCAN ERROR: ' + (e && e.message ? e.message : e);
        result.type = 'error';
        result.responseTime = Date.now() - startTime;
        displayScanResult(result);
        return result;
    }
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

// FIXED: Safe updateDisplay function with array validation
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

        // FIXED: Safe array access with validation
        var activeEl = document.getElementById('activeCount');
        if (activeEl) activeEl.innerText = (Array.isArray(window.appData.activeBowls) ? window.appData.activeBowls.length : 0);

        var preparedToday = 0;
        var returnedToday = 0;
        var today = todayDateStr();

        // FIXED: Safe array access with validation
        var preparedBowlsArray = Array.isArray(window.appData.preparedBowls) ? window.appData.preparedBowls : [];
        var returnedBowlsArray = Array.isArray(window.appData.returnedBowls) ? window.appData.returnedBowls : [];

        preparedBowlsArray.forEach(function(b){
            if (b.date === today) preparedToday++;
        });
        returnedBowlsArray.forEach(function(b){
            if (b.returnDate === today) returnedToday++;
        });

        var preparedEl = document.getElementById('preparedTodayCount');
        if (preparedEl) preparedEl.innerText = preparedToday;

        var returnedEl = document.getElementById('returnedCount');
        if (returnedEl) returnedEl.innerText = returnedToday;

        var myScansArray = Array.isArray(window.appData.myScans) ? window.appData.myScans : [];
        var myScans = myScansArray.filter(function(s){
            return s.user === window.appData.user && new Date(s.timestamp).toLocaleDateString('en-GB') === today;
        }).length;
        var myScansEl = document.getElementById('myScansCount');
        if (myScansEl) myScansEl.innerText = myScans;

        var exportInfo = document.getElementById('lastSyncInfo');
        if (exportInfo) exportInfo.innerHTML = 'Active: ' + (Array.isArray(window.appData.activeBowls) ? window.appData.activeBowls.length : 0) + ' • Prepared today: ' + preparedToday + ' • Returns today: ' + returnedToday;

        // Update returned bowls display
        updateReturnedBowlsDisplay();

    } catch(e) { 
        console.error("updateDisplay error:", e);
        // Emergency fallback: ensure all data arrays exist
        validateDataArrays();
    }
}

function updateReturnedBowlsDisplay() {
    try {
        var container = document.getElementById('returnedBowlsContainer');
        if (!container) return;

        // Clear current display
        container.innerHTML = '';

        // Safe array access
        var returnedBowlsArray = Array.isArray(window.appData.returnedBowls) ? window.appData.returnedBowls : [];
        var today = todayDateStr();

        // Filter today's returned bowls
        var todayReturns = returnedBowlsArray.filter(function(bowl) {
            return bowl.returnDate === today;
        });

        if (todayReturns.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #6b7280; padding: 20px; font-style: italic;">No bowls returned today</div>';
            return;
        }

        // Sort by return time (newest first)
        todayReturns.sort(function(a, b) {
            return new Date(b.returnTimestamp || b.returnTime) - new Date(a.returnTimestamp || a.returnTime);
        });

        // Create display elements
        todayReturns.forEach(function(bowl, index) {
            var bowlElement = document.createElement('div');
            bowlElement.className = 'returned-bowl-item';
            bowlElement.style.cssText = `
                background: #1f2937;
                border: 1px solid #374151;
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 8px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: all 0.2s ease;
            `;

            bowlElement.innerHTML = `
                <div style="flex: 1;">
                    <div style="font-weight: bold; color: #10b981; margin-bottom: 4px;">${bowl.code || 'Unknown Code'}</div>
                    <div style="font-size: 0.875rem; color: #9ca3af;">
                        Dish: ${bowl.dish || 'Unknown'} | 
                        User: ${bowl.user || 'Unknown'} | 
                        Time: ${bowl.returnTime || 'Unknown'}
                    </div>
                </div>
                <div style="background: #065f46; color: #10b981; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">
                    RETURNED
                </div>
            `;

            container.appendChild(bowlElement);
        });

    } catch(e) {
        console.error("updateReturnedBowlsDisplay error:", e);
    }
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

// ------------------- EXPORT FUNCTIONS (FIXED) -------------------
function downloadCSV(csv, filename) {
    try {
        var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch(e) {
        console.error("downloadCSV error:", e);
        throw e;
    }
}

function convertToCSV(arr, fields) {
    var rows = [];
    rows.push(fields.join(','));
    arr.forEach(function(item){
        var row = [];
        for (var i=0;i<fields.length;i++){
            var f = fields[i];
            var cell = item[f] !== undefined ? (''+item[f]).replace(/"/g,'""') : '';
            row.push('"' + cell + '"');
        }
        rows.push(row.join(','));
    });
    return rows.join('\n');
}

// FIXED: Export functions with proper array validation
window.exportActiveBowls = function() {
    try {
        var data = Array.isArray(window.appData.activeBowls) ? window.appData.activeBowls : [];
        if (data.length === 0) {
            showMessage('❌ No active bowls to export', 'error');
            return;
        }

        var csv = convertToCSV(data, ['code','dish','company','customer','creationDate','daysActive']);
        downloadCSV(csv, 'active_bowls.csv');
        showMessage('✅ Active bowls exported', 'success');
    } catch(e){ 
        console.error(e); 
        showMessage('❌ Export failed', 'error'); 
    }
};

window.exportReturnData = function() {
    try {
        var today = todayDateStr();
        var data = (Array.isArray(window.appData.returnedBowls) ? window.appData.returnedBowls : []).filter(function(b){ 
            return b.returnDate === today; 
        });
        if (!data || data.length === 0) { 
            showMessage('❌ No returns today', 'error'); 
            return; 
        }
        var csv = convertToCSV(data, ['code','dish','company','customer','returnedBy','returnDate','returnTime']);
        downloadCSV(csv, 'returns_today.csv');
        showMessage('✅ Returns exported', 'success');
    } catch(e){ 
        console.error(e); 
        showMessage('❌ Export failed', 'error'); 
    }
};

window.exportAllData = function() {
    try {
        var payload = {
            activeBowls: Array.isArray(window.appData.activeBowls) ? window.appData.activeBowls : [],
            preparedBowls: Array.isArray(window.appData.preparedBowls) ? window.appData.preparedBowls : [],
            returnedBowls: Array.isArray(window.appData.returnedBowls) ? window.appData.returnedBowls : [],
            myScans: Array.isArray(window.appData.myScans) ? window.appData.myScans : [],
            scanHistory: Array.isArray(window.appData.scanHistory) ? window.appData.scanHistory : [],
            customerData: Array.isArray(window.appData.customerData) ? window.appData.customerData : [],
            exportTime: nowISO()
        };
        var text = JSON.stringify(payload, null, 2);
        var blob = new Blob([text], {type:'application/json'});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; 
        a.download = 'proglove_all_data.json'; 
        a.click();
        URL.revokeObjectURL(url);
        showMessage('✅ All data exported (JSON)', 'success');
    } catch(e){ 
        console.error(e); 
        showMessage('❌ Export failed', 'error'); 
    }
};

// ------------------- JSON PATCH PROCESSING -------------------
window.processJSONData = function() {
    try {
        var raw = document.getElementById('jsonData').value || '';
        if (!raw) { showMessage('❌ Paste JSON first', 'error'); return; }
        var parsed = JSON.parse(raw);
        // simplified: accept array or object shaped like your previous code
        var items = Array.isArray(parsed) ? parsed : (parsed.companies || parsed.boxes || []);
        var added = 0, updated = 0;
        items.forEach(function(comp){
            // sample deep traverse - this keeps original approach flexible
            if (comp.boxes && Array.isArray(comp.boxes)) {
                comp.boxes.forEach(function(box){
                    if (box.dishes && Array.isArray(box.dishes)) {
                        box.dishes.forEach(function(dish){
                            if (dish.bowlCodes && Array.isArray(dish.bowlCodes)) {
                                dish.bowlCodes.forEach(function(code){
                                    var found = false;
                                    for (var i=0;i<window.appData.activeBowls.length;i++){
                                        if (window.appData.activeBowls[i].code === code) {
                                            // update
                                            window.appData.activeBowls[i].company = comp.name || window.appData.activeBowls[i].company || 'Unknown';
                                            window.appData.activeBowls[i].customer = (dish.users && dish.users.length>0) ? dish.users.map(u=>u.username).join(', ') : window.appData.activeBowls[i].customer || 'Unknown';
                                            updated++; found = true; break;
                                        }
                                    }
                                    if (!found) {
                                        window.appData.activeBowls.push({
                                            code: code,
                                            dish: dish.label || '',
                                            company: comp.name || 'Unknown',
                                            customer: (dish.users && dish.users.length>0) ? dish.users.map(u=>u.username).join(', ') : 'Unknown',
                                            date: todayDateStr(),
                                            timestamp: nowISO()
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
        document.getElementById('patchResults').style.display = 'block';
        document.getElementById('patchSummary').textContent = 'Updated: ' + updated + ' • Created: ' + added;
        document.getElementById('failedMatches').innerHTML = '<em>Processing finished.</em>';
        showMessage('✅ JSON patched: ' + (updated+added) + ' items', 'success');
    } catch(e){ console.error("processJSONData:",e); showMessage('❌ JSON parse/patch error', 'error') }
};

// ------------------- STARTUP -------------------
document.addEventListener('DOMContentLoaded', function(){
    console.log("🚀 Starting ProGlove Scanner (Firebase Only)");
    initFirebaseAndStart();
});

