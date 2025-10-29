// ===============================
// app-logic.js — Clean Hybrid Firebase Version
// ===============================

// ---- GLOBAL APP DATA ----
window.appData = {
    activeBowls: [],
    preparedBowls: [],
    returnedBowls: [],
    myScans: [],
    scanHistory: [],
    customerData: [],
    lastSync: null
};

// ---- BASIC UTILITIES ----
function nowISO() {
    return new Date().toISOString();
}

function updateSystemStatus(ok, msg) {
    const el = document.getElementById('systemStatus');
    if (el) el.innerText = msg || (ok ? "✅ Connected" : "⚠️ Offline");
}

function showMessage(msg, type) {
    const el = document.getElementById('statusMsg');
    if (el) {
        el.innerText = msg;
        el.className = type || '';
    }
}

// ---- LOCAL SAVE & LOAD ----
function saveToLocal() {
    try {
        localStorage.setItem('progloveAppData', JSON.stringify(window.appData));
    } catch (e) {
        console.error("saveToLocal failed:", e);
    }
}

function loadFromLocal() {
    try {
        const raw = localStorage.getItem('progloveAppData');
        if (raw) window.appData = JSON.parse(raw);
    } catch (e) {
        console.error("loadFromLocal failed:", e);
    }
}

// ---- FIREBASE UPLOAD (PER SCAN) ----
function uploadSingleScanToFirebase(scanType, bowlData) {
    try {
        if (!window.firebase || !firebase.apps.length) {
            updateSystemStatus(false, "⚠️ Firebase not ready");
            saveToLocal();
            return;
        }

        const db = firebase.database();
        const basePath =
            scanType === 'kitchen'
                ? 'progloveData/preparedBowls'
                : scanType === 'return'
                ? 'progloveData/returnedBowls'
                : 'progloveData/otherScans';

        const bowlKey = encodeURIComponent(bowlData.code || ('bowl_' + Date.now()));
        const refPath = `${basePath}/${bowlKey}`;

        // async upload (parallel safe)
        db.ref(refPath).set(bowlData)
            .then(() => {
                window.appData.lastSync = nowISO();
                saveToLocal();
                updateSystemStatus(true, "✅ Synced");
            })
            .catch(err => {
                console.error("Firebase upload failed:", err);
                saveToLocal();
                updateSystemStatus(false, "⚠️ Upload failed - saved local");
            });

    } catch (err) {
        console.error("uploadSingleScanToFirebase:", err);
        saveToLocal();
    }
}

// ---- PERIODIC SUMMARY SYNC ----
let isSyncingSummary = false;
function syncSummaryToFirebase() {
    if (isSyncingSummary) return;
    isSyncingSummary = true;

    try {
        if (!window.firebase || !firebase.apps.length) {
            saveToLocal();
            isSyncingSummary = false;
            return;
        }

        const db = firebase.database();
        const summary = {
            lastSync: nowISO(),
            preparedCount: (window.appData.preparedBowls || []).length,
            returnedCount: (window.appData.returnedBowls || []).length,
            activeCount: (window.appData.activeBowls || []).length
        };

        db.ref('progloveData/summary')
          .update(summary)
          .finally(() => { isSyncingSummary = false; });
    } catch (e) {
        console.error("syncSummaryToFirebase:", e);
        isSyncingSummary = false;
    }
}

// ---- SCANNING FUNCTIONS ----
function kitchenScanClean(code) {
    const newPrepared = {
        code: code,
        time: nowISO(),
        status: "prepared"
    };
    window.appData.preparedBowls.push(newPrepared);
    saveToLocal();
    uploadSingleScanToFirebase('kitchen', newPrepared);
    showMessage("✅ Bowl scanned (Kitchen): " + code, "success");
}

function returnScanClean(code) {
    const returnedB = {
        code: code,
        time: nowISO(),
        status: "returned"
    };
    window.appData.returnedBowls.push(returnedB);
    saveToLocal();
    uploadSingleScanToFirebase('return', returnedB);
    showMessage("♻️ Bowl returned: " + code, "info");
}

// ---- START / STOP SCANNING ----
window.startScanning = function () {
    window.appData.scanning = true;
    const inp = document.getElementById('scanInput');
    if (inp) {
        inp.disabled = false;
        inp.focus();
    }
    showMessage('🔵 Scanning started', 'info');
};

window.stopScanning = function () {
    window.appData.scanning = false;
    const inp = document.getElementById('scanInput');
    if (inp) inp.disabled = true;
    showMessage('⏹ Scanning stopped', 'info');
    saveToLocal();
};

// ---- INPUT HANDLER ----
function handleScanInput(e) {
    if (e.key === 'Enter' && window.appData.scanning) {
        const code = e.target.value.trim();
        if (!code) return;
        if (document.getElementById('scanMode').value === 'kitchen')
            kitchenScanClean(code);
        else
            returnScanClean(code);
        e.target.value = '';
    }
}

// ---- DISPLAY UPDATE ----
function updateDisplay() {
    const preparedCount = (window.appData.preparedBowls || []).length;
    const returnedCount = (window.appData.returnedBowls || []).length;
    const active = document.getElementById('preparedCount');
    const returned = document.getElementById('returnedCount');
    if (active) active.innerText = preparedCount;
    if (returned) returned.innerText = returnedCount;
}

// ---- INIT ----
function initializeUI() {
    loadFromLocal();
    updateDisplay();

    const input = document.getElementById('scanInput');
    if (input) input.addEventListener('keydown', handleScanInput);

    // Background summary sync every 5 seconds
    setInterval(syncSummaryToFirebase, 5000);

    showMessage('✅ Ready to scan', 'success');
    updateSystemStatus(true, "Connected");
}

// ---- AUTO INIT AFTER PAGE LOAD ----
window.addEventListener('load', initializeUI);
