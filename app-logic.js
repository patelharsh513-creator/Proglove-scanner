/* app-logic.js
   Complete, production-ready hybrid offline-first logic for ProGlove Bowl Tracking
*/

/* ============================
   CONFIG & GLOBAL STATE
   ============================ */

var firebaseConfig = {
    apiKey: "AIzaSyCL3hffCHosBceIRGR1it2dYEDb3uxIrJw",
    authDomain: "proglove-scanner.firebaseapp.com",
    databaseURL: "https://proglove-scanner-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "proglove-scanner",
    storageBucket: "proglove-scanner.firebasestorage.app",
    messagingSenderId: "177575768177",
    appId: "1:177575768177:web:0a0acbf222218e0c0b2bd0"
};

// app state (local in-page)
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
    outgoingQueue: {},
    lastSync: null,
    lastActivity: Date.now()
};

/* ============================
   Utilities
   ============================ */

function nowISO() { return (new Date()).toISOString(); }
function todayDateStr() { return (new Date()).toLocaleDateString('en-GB'); }
function safeJSONParse(s, fallback) { try { return JSON.parse(s); } catch(e){ return fallback; } }
function encodeKey(str) { try { return encodeURIComponent(String(str)).replace(/\./g,'%2E'); } catch(e){ return encodeURIComponent(String(str)); } }

function showMessage(message, type) {
    try {
        var container = document.getElementById('messageContainer') || document.getElementById('statusMsg');
        if (!container) return;
        container.innerText = message;
        container.className = type || '';
    } catch(e){ console.warn("showMessage error", e); }
}

function updateSystemStatus(connected, text) {
    try {
        var el = document.getElementById('systemStatus');
        if (!el) return;
        el.innerText = text || (connected ? '✅ Firebase Connected' : '⚠️ Offline');
        el.style.background = connected ? '#064e3b' : '#7f1d1d';
    } catch(e){ }
}

/* ============================
   Local storage: save/load
   ============================ */

const LOCAL_KEY = 'proglove_data_v3';

function saveToLocal() {
    try {
        const toSave = {
            activeBowls: window.appData.activeBowls,
            preparedBowls: window.appData.preparedBowls,
            returnedBowls: window.appData.returnedBowls,
            myScans: window.appData.myScans,
            scanHistory: window.appData.scanHistory,
            customerData: window.appData.customerData,
            outgoingQueue: window.appData.outgoingQueue,
            lastSync: window.appData.lastSync
        };
        localStorage.setItem(LOCAL_KEY, JSON.stringify(toSave));
    } catch(e) {
        console.error("saveToLocal failed:", e);
    }
}

function loadFromLocal() {
    try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (!raw) return;
        const parsed = safeJSONParse(raw, null);
        if (!parsed) return;
        window.appData.activeBowls = parsed.activeBowls || [];
        window.appData.preparedBowls = parsed.preparedBowls || [];
        window.appData.returnedBowls = parsed.returnedBowls || [];
        window.appData.myScans = parsed.myScans || [];
        window.appData.scanHistory = parsed.scanHistory || [];
        window.appData.customerData = parsed.customerData || [];
        window.appData.outgoingQueue = parsed.outgoingQueue || {};
        window.appData.lastSync = parsed.lastSync || null;
    } catch(e) {
        console.error("loadFromLocal failed:", e);
    }
}

/* ============================
   Firebase init & monitor
   ============================ */

function initFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            updateSystemStatus(false, "Firebase SDK missing");
            return false;
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        monitorConnection();
        return true;
    } catch (e) {
        console.error("initFirebase error:", e);
        updateSystemStatus(false, "Firebase init error");
        return false;
    }
}

function monitorConnection() {
    try {
        const db = firebase.database();
        const connectedRef = db.ref(".info/connected");
        connectedRef.on("value", function(snap) {
            if (snap && snap.val() === true) {
                updateSystemStatus(true, '✅ Firebase Connected');
                flushOutgoingQueue();
            } else {
                updateSystemStatus(false, '⚠️ Firebase Disconnected');
            }
        });
    } catch (e) {
        console.warn("monitorConnection failed", e);
        updateSystemStatus(false, "Connection monitor unavailable");
    }
}

/* ============================
   Outgoing upload queue
   ============================ */

const MAX_ATTEMPTS = 6;
const RETRY_BASE_MS = 800;

function enqueueOutgoing(type, bowlData) {
    try {
        const key = encodeKey(bowlData.code || ('bowl_' + Date.now()));
        window.appData.outgoingQueue[key] = window.appData.outgoingQueue[key] || {
            type: type,
            data: bowlData,
            attempts: 0,
            lastTried: null
        };
        saveToLocal();
        attemptUploadKey(key);
    } catch (e) { console.error("enqueueOutgoing:", e); }
}

function attemptUploadKey(key) {
    try {
        const item = window.appData.outgoingQueue[key];
        if (!item) return;

        if (item.attempts >= MAX_ATTEMPTS) return;

        const now = Date.now();
        if (item.lastTried) {
            const wait = Math.pow(2, item.attempts) * RETRY_BASE_MS;
            if (now - item.lastTried < wait) return;
        }

        if (typeof firebase === 'undefined' || !firebase.apps.length) {
            return;
        }

        const db = firebase.database();
        const basePath = (item.type === 'kitchen') ? 'progloveData/preparedBowls' :
                         (item.type === 'return') ? 'progloveData/returnedBowls' :
                         'progloveData/otherScans';

        const refPath = basePath + '/' + key;
        item.attempts += 1;
        item.lastTried = Date.now();
        db.ref(refPath).set(item.data)
          .then(() => {
              delete window.appData.outgoingQueue[key];
              window.appData.lastSync = nowISO();
              saveToLocal();
              updateSystemStatus(true, '✅ Synced');
          })
          .catch(err => {
              console.warn("attemptUploadKey failed for", key, err);
              saveToLocal();
          });
    } catch (e) {
        console.error("attemptUploadKey error:", e);
    }
}

function flushOutgoingQueue() {
    try {
        const keys = Object.keys(window.appData.outgoingQueue || {});
        keys.forEach(k => attemptUploadKey(k));
    } catch (e) { console.error("flushOutgoingQueue:", e); }
}

setInterval(function() {
    try {
        if (!window.appData || !window.appData.outgoingQueue) return;
        const keys = Object.keys(window.appData.outgoingQueue);
        if (!keys.length) return;
        flushOutgoingQueue();
    } catch(e){ console.error("retry loop error:", e); }
}, 1200);

/* ============================
   Summary sync
   ============================ */

let isSyncingSummary = false;
function syncSummaryToFirebase() {
    if (isSyncingSummary) return;
    isSyncingSummary = true;
    try {
        if (typeof firebase === 'undefined' || !firebase.apps.length) {
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
        db.ref('progloveData/summary').update(summary)
          .catch(err => console.warn("syncSummaryToFirebase failed:", err))
          .finally(() => { isSyncingSummary = false; });
    } catch(e) {
        console.error("syncSummaryToFirebase error:", e);
        isSyncingSummary = false;
    }
}
setInterval(syncSummaryToFirebase, 5000);

/* ============================
   Scan handlers
   ============================ */

function handlePreparedScan(vytUrl) {
    try {
        const today = todayDateStr();
        const newPrepared = {
            code: vytUrl,
            dish: window.appData.dishLetter || 'Unknown',
            user: window.appData.user || 'Unknown',
            company: 'Unknown',
            customer: 'Unknown',
            date: today,
            time: (new Date()).toLocaleTimeString(),
            timestamp: nowISO(),
            status: 'PREPARED'
        };
        window.appData.preparedBowls.push(newPrepared);
        window.appData.myScans.push({ type: 'kitchen', code: vytUrl, user: window.appData.user || 'Unknown', timestamp: nowISO() });
        window.appData.scanHistory.unshift({ type: 'kitchen', code: vytUrl, user: window.appData.user || 'Unknown', timestamp: nowISO(), message: 'Prepared: ' + vytUrl });
        saveToLocal();
        enqueueOutgoing('kitchen', newPrepared);
        updateDisplay();
        showMessage('✅ Prepared: ' + vytUrl, 'success');
        return true;
    } catch(e) {
        console.error("handlePreparedScan error:", e);
        showMessage('❌ Error processing scan', 'error');
        return false;
    }
}

function handleReturnScan(vytUrl) {
    try {
        const today = todayDateStr();
        let preparedIndex = -1;
        for (let i = 0; i < (window.appData.preparedBowls || []).length; i++) {
            if (window.appData.preparedBowls[i].code === vytUrl && window.appData.preparedBowls[i].date === today) {
                preparedIndex = i; break;
            }
        }
        if (preparedIndex === -1) {
            showMessage('❌ Bowl not prepared today: ' + vytUrl, 'error');
            return false;
        }
        const preparedBowl = window.appData.preparedBowls.splice(preparedIndex, 1)[0];
        const returnedB = {
            code: vytUrl,
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
        window.appData.myScans.push({ type: 'return', code: vytUrl, user: window.appData.user || 'Unknown', timestamp: nowISO() });
        window.appData.scanHistory.unshift({ type: 'return', code: vytUrl, user: window.appData.user || 'Unknown', timestamp: nowISO(), message: 'Returned: ' + vytUrl });
        saveToLocal();
        enqueueOutgoing('return', returnedB);
        updateDisplay();
        showMessage('✅ Returned: ' + vytUrl, 'success');
        return true;
    } catch(e) {
        console.error("handleReturnScan error:", e);
        showMessage('❌ Error processing return', 'error');
        return false;
    }
}

/* ============================
   Input parsing and bindings
   ============================ */

function detectVytCode(input) {
    if (!input || typeof input !== 'string') return null;
    var cleaned = input.trim();
    var urlPattern = /(https?:\/\/[^\s]+)/i;
    var vytPattern = /(VYT\.TO\/[^\s]+)|(vyt\.to\/[^\s]+)|(VYTAL[^\s]+)|(vytal[^\s]+)/i;
    var matchUrl = cleaned.match(urlPattern);
    if (matchUrl) return matchUrl[1];
    var match = cleaned.match(vytPattern);
    if (match) return cleaned;
    if (cleaned.length >= 6 && cleaned.length <= 120) return cleaned;
    return null;
}

function bindScannerInput() {
    try {
        const inp = document.getElementById('scanInput');
        if (!inp) return;

        let isProcessingScan = false;
        let inputTimer = null;

        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (inputTimer) { clearTimeout(inputTimer); inputTimer = null; }
                if (isProcessingScan) {
                    showMessage('⏳ Processing previous scan...', 'info');
                    inp.value = '';
                    return;
                }
                const val = inp.value.trim();
                if (!val) return;
                if (!window.appData.scanning) { showMessage('❌ Scanning not active', 'error'); return; }
                const detected = detectVytCode(val);
                if (!detected) { showMessage('❌ Invalid code', 'error'); inp.value = ''; return; }
                isProcessingScan = true;
                inp.value = '';
                setTimeout(function() {
                    if (window.appData.mode === 'kitchen') handlePreparedScan(detected);
                    else if (window.appData.mode === 'return') handleReturnScan(detected);
                    else showMessage('❌ Select mode', 'error');
                    isProcessingScan = false;
                    setTimeout(()=> { inp.focus(); }, 50);
                }, 0);
            }
        });

        inp.addEventListener('input', function(e) {
            if (inputTimer) clearTimeout(inputTimer);
            const v = inp.value.trim();
            if (!v) return;
            if (v.length >= 6 && (v.toLowerCase().indexOf('vyt') !== -1 || v.indexOf('/') !== -1)) {
                inputTimer = setTimeout(function() {
                    if (isProcessingScan) { inputTimer = null; return; }
                    const finalVal = inp.value.trim();
                    if (!finalVal || finalVal !== v) { inputTimer = null; return; }
                    if (!window.appData.scanning) { showMessage('❌ Scanning not active', 'error'); inputTimer = null; return; }
                    isProcessingScan = true;
                    inp.value = '';
                    setTimeout(function() {
                        const detected = detectVytCode(finalVal);
                        if (detected) {
                            if (window.appData.mode === 'kitchen') handlePreparedScan(detected);
                            else if (window.appData.mode === 'return') handleReturnScan(detected);
                            else showMessage('❌ Select mode', 'error');
                        } else {
                            showMessage('❌ Invalid code', 'error');
                        }
                        isProcessingScan = false;
                        inputTimer = null;
                        setTimeout(()=> { inp.focus(); }, 50);
                    }, 0);
                }, 60);
            }
        });
    } catch(e) { console.error("bindScannerInput error:", e); }
}

/* ============================
   UI helpers & workflow controls
   ============================ */

function initializeUsersDropdown() {
    try {
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
        const dd = document.getElementById('userSelect');
        if (!dd) {
            setTimeout(initializeUsersDropdown, 100);
            return;
        }
        dd.innerHTML = '<option value="">-- Select User --</option>';
        USERS.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.name;
            opt.textContent = u.name + (u.role ? ' (' + u.role + ')' : '');
            dd.appendChild(opt);
        });
        dd.addEventListener('change', function(){ window.appData.user = this.value || null; updateDisplay(); });
    } catch(e){ console.warn("initializeUsersDropdown", e); }
}

function loadDishOptions() {
    const dd = document.getElementById('dishSelect');
    if (!dd) {
        setTimeout(loadDishOptions, 100);
        return;
    }
    dd.innerHTML = '<option value="">-- Select Dish --</option>';
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    letters.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; dd.appendChild(o); });
    ['1','2','3','4'].forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; dd.appendChild(o); });
    dd.addEventListener('change', function(){ window.appData.dishLetter = this.value || null; updateDisplay(); });
}

window.setMode = function(mode) {
    window.appData.mode = mode;
    window.appData.scanning = false;
    const dishWrap = document.getElementById('dishWrapper');
    if (dishWrap) dishWrap.style.display = (mode === 'kitchen') ? 'block' : 'none';
    const md = document.getElementById('modeDisplay');
    if (md) md.innerText = 'Mode: ' + (mode || 'N/A');
    initializeUsersDropdown();
    loadDishOptions();
    updateDisplay();
    showMessage('ℹ️ Mode selected: ' + mode, 'info');
};

window.startScanning = function() {
    if (!window.appData.user) { showMessage('❌ Select user first', 'error'); return; }
    if (window.appData.mode === 'kitchen' && !window.appData.dishLetter) { showMessage('❌ Select dish first', 'error'); return; }
    window.appData.scanning = true;
    const inp = document.getElementById('scanInput');
    if (inp) { inp.disabled = false; inp.focus(); inp.value = ''; }
    updateDisplay();
    showMessage('🎯 Scanning active', 'success');
};

window.stopScanning = function() {
    window.appData.scanning = false;
    const inp = document.getElementById('scanInput');
    if (inp) inp.disabled = true;
    saveToLocal();
    flushOutgoingQueue();
    updateDisplay();
    showMessage('⏹ Scanning stopped', 'info');
};

function updateDisplay() {
    try {
        const today = todayDateStr();
        const activeEl = document.getElementById('activeCount');
        if (activeEl) activeEl.innerText = (window.appData.activeBowls || []).length;
        
        const preparedEl = document.getElementById('preparedTodayCount');
        if (preparedEl) {
            const preparedToday = (window.appData.preparedBowls || []).filter(b => {
                const bowlDate = b.date || (b.timestamp ? new Date(b.timestamp).toLocaleDateString('en-GB') : null);
                return bowlDate === today;
            });
            preparedEl.innerText = preparedToday.length;
        }
        
        const returnedEl = document.getElementById('returnedCount');
        if (returnedEl) {
            const returnedToday = (window.appData.returnedBowls || []).filter(b => {
                const returnDate = b.returnDate || (b.returnTimestamp ? new Date(b.returnTimestamp).toLocaleDateString('en-GB') : null);
                return returnDate === today;
            });
            returnedEl.innerText = returnedToday.length;
        }
        
        const myScansEl = document.getElementById('myScansCount');
        if (myScansEl) {
            const myCount = (window.appData.myScans || []).filter(s => {
                const scanDate = s.timestamp ? new Date(s.timestamp).toLocaleDateString('en-GB') : null;
                return s.user === window.appData.user && scanDate === today;
            }).length;
            myScansEl.innerText = myCount;
        }
        
        const lastSyncInfo = document.getElementById('lastSyncInfo');
        if (lastSyncInfo) lastSyncInfo.innerText = 'Last sync: ' + (window.appData.lastSync ? new Date(window.appData.lastSync).toLocaleTimeString() : 'never');
    } catch(e) { console.warn("updateDisplay err", e); }
}

/* ============================
   JSON processing
   ============================ */

window.processJSONData = function() {
    try {
        const raw = document.getElementById('jsonData')?.value?.trim();
        if (!raw) { showMessage('❌ Paste JSON first', 'error'); return; }
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed) ? parsed : (parsed.companies || parsed.boxes || [parsed]);
        let activeBowls = window.appData.activeBowls.slice();
        let added = 0, updated = 0;
        items.forEach(function(comp) {
            if (comp.boxes && Array.isArray(comp.boxes)) {
                comp.boxes.forEach(function(box) {
                    let deliveryDate = "";
                    if (box.uniqueIdentifier) {
                        const dateMatch = (box.uniqueIdentifier || "").match(/\d{4}-\d{2}-\d{2}/);
                        if (dateMatch) deliveryDate = dateMatch[0];
                    }
                    if (box.dishes && Array.isArray(box.dishes)) {
                        box.dishes.forEach(function(dish) {
                            if (dish.bowlCodes && Array.isArray(dish.bowlCodes)) {
                                dish.bowlCodes.forEach(function(code) {
                                    let existing = activeBowls.find(b => b.code === code);
                                    const customers = (dish.users && dish.users.length) ? dish.users.map(u => u.username).join(", ") : "Unknown";
                                    if (existing) {
                                        existing.company = comp.name || existing.company || "Unknown";
                                        existing.customer = customers || existing.customer || "Unknown";
                                        existing.creationDate = deliveryDate || existing.creationDate || todayDateStr();
                                        updated++;
                                    } else {
                                        activeBowls.push({
                                            code: code,
                                            dish: dish.label || "",
                                            company: comp.name || "Unknown",
                                            customer: customers,
                                            creationDate: deliveryDate || todayDateStr(),
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
        window.appData.activeBowls = activeBowls;
        saveToLocal();
        showMessage('✅ JSON processed: ' + (added + updated) + ' items', 'success');
        updateDisplay();
    } catch(e) {
        console.error("processJSONData:", e);
        showMessage('❌ JSON parse error', 'error');
    }
};

/* ============================
   Exports
   ============================ */

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
        showMessage("✅ Exported " + filename, "success");
    } catch(e) {
        console.error("exportToExcel failed", e);
        showMessage("❌ Export failed", "error");
    }
}

window.exportActiveBowls = function() {
    try {
        const bowls = window.appData.activeBowls || [];
        if (!bowls.length) { showMessage("❌ No active bowls", "error"); return; }
        const today = new Date();
        const data = bowls.map(b => {
            const d = new Date(b.creationDate || today);
            const missing = Math.ceil((today - d) / (1000 * 3600 * 24));
            return { "Bowl Code": b.code, "Dish": b.dish, "Company": b.company || "", "Customer": b.customer || "", "Creation Date": b.creationDate || "", "Missing Days": missing + " days" };
        });
        exportToExcel("Active Bowls", data, "Active_Bowls.xlsx");
    } catch(e){ console.error(e); showMessage("❌ Export failed", "error"); }
};

/* ============================
   Boot / Initialization
   ============================ */

function initializeUI() {
    try {
        loadFromLocal();
        initializeUsersDropdown();
        loadDishOptions();
        bindScannerInput();
        updateDisplay();
        initFirebase();
        setTimeout(flushOutgoingQueue, 500);
        showMessage('✅ Ready', 'success');
        setInterval(updateDisplay, 2000);
    } catch (e) {
        console.error("initializeUI error:", e);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    try {
        initializeUI();
    } catch (e) {
        console.error("startup error:", e);
        loadFromLocal();
        bindScannerInput();
        updateDisplay();
    }
});

/* ============================
   Debug functions
   ============================ */

window._proglove_flushQueueNow = function() { flushOutgoingQueue(); };
window._proglove_showQueue = function() { return JSON.parse(JSON.stringify(window.appData.outgoingQueue || {})); };
window._proglove_saveNow = function() { saveToLocal(); };
window._proglove_loadNow = function() { loadFromLocal(); updateDisplay(); };
