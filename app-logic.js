/*
  ==============================================================================
  CLIENT-SIDE CODE (v12 - Server Counters)
  ==============================================================================
  Aa tamaro 700+ line no original code chhe, jene repair karel chhe.
  Aa file tamari index.html sathe GitHub par j_a_she.
  
  Mukhya Ferfar:
  1.  initializeApp(): Have aa function 50,000 record nathi lavtu.
      E fakt navi jagya (`/stats/` ane `/livePrepReport/`) ne sambhale chhe.
  2.  handleScan(): Have aa function 'return' mode mate server par 1 record shodhe chhe.
      (Tamaro 1-minute wala freeze solve thai gayo chhe).
  3.  exportData(): Have aa function 'on-demand' server par thi data lavi ne export kare chhe.
  ==============================================================================
*/

// --- GLOBAL STATE, CONSTANTS & TYPES ---
const appState = {
    mode: null,
    currentUser: null,
    dishLetter: null,
    isScanning: false,
    systemStatus: 'initializing',
    // ⚠️ appData have khali chhe. E 4-5 minute walo download nahi kare.
    appData: {
        activeBowls: {}, preparedBowls: {}, returnedBowls: {},
        myScans: {}, scanHistory: {}, customerData: [],
        // ⚠️ NAVI VASTU: Server par thi fakta counters j avshe
        stats: { activeCount: 0, preparedTodayCount: 0, returnedTodayCount: 0 },
        // ⚠️ NAVI VASTU: Server par thi fakt report j avshe
        livePrepReport: {} 
    }
};

const USERS = [
    {name: "Hamid", role: "Kitchen"}, {name: "Richa", role: "Kitchen"},
    {name: "Jash", role: "Kitchen"}, {name: "Joel", role: "Kitchen"},
    {name: "Mary", role: "Kitchen"}, {name: "Rushal", role: "Kitchen"},
    {name: "Sreekanth", role: "Kitchen"}, {name: "Sultan", role: "Return"},
    {name: "Riyaz", role: "Return"}, {name: "Alan", role: "Return"},
    {name: "Adesh", role: "Return"}
];

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBOI-U89XFw4-K9lhNq84GSaJwkX3_P2MY",
  authDomain: "quality-check-24.firebaseapp.com",
  databaseURL: "https://quality-check-24-default-rtdb.europe-west1.firebasedabase.app",
  projectId: "quality-check-24",
  storageBucket: "quality-check-24.firebasestorage.app",
  messagingSenderId: "518274605576",
  appId: "1:518274605576:web:c79ac4001fcedfdaf467bd"
};

// --- UTILITIES ---
const todayDateStr = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
const nowTimeStr = () => new Date().toLocaleTimeString();

// Aa utility have fakt nanikda data mate j vaprashe
function objectToArray(obj) {
    if (!obj || typeof obj !== 'object') return [];
    return Object.values(obj).filter(Boolean);
}

// (showMessage function - Koi Ferfar Nathi)
function showMessage(text, type = 'info') {
    try {
        const container = document.getElementById('messageContainer');
        if (!container) { console.log(`${type}: ${text}`); return; }
        const el = document.createElement('div');
        const typeClasses = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-sky-600', warning: 'bg-amber-600', };
        el.className = `p-3 rounded-lg shadow-2xl text-white font-semibold ${typeClasses[type] || typeClasses.info}`;
        el.innerText = text;
        container.appendChild(el);
        setTimeout(() => {
            try { if (container.contains(el)) container.removeChild(el); } catch(e) {}
        }, 4000);
    } catch(e) { console.error("showMessage error:", e); }
}

// --- DATA & FIREBASE SERVICE ---
let firebaseApp = null;
let hasConnectedOnce = false;

// Default app data (have bov nanu chhe)
const createDefaultAppData = () => ({
    activeBowls: {}, preparedBowls: {}, returnedBowls: {},
    myScans: {}, scanHistory: {}, customerData: [],
    stats: { activeCount: 0, preparedTodayCount: 0, returnedTodayCount: 0 },
    livePrepReport: {}
});

// (initFirebase function - Koi Ferfar Nathi)
function initFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            console.error("Firebase SDK not loaded");
            showMessage("Firebase SDK not loaded. Please check your imports.", 'error');
            return false;
        }
        if (!firebase.apps.length) {
            firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
            console.log("✅ Firebase initialized");
        } else {
            firebaseApp = firebase.app();
            console.log("✅ Firebase app already initialized");
        }
        return true;
    } catch (e) {
        console.error("Firebase initialization failed:", e);
        showMessage("Firebase initialization failed!", 'error');
        return false;
    }
}

// (monitorFirebaseConnection function - Koi Ferfar Nathi)
function monitorFirebaseConnection(onConnected, onDisconnected) {
    if (!firebaseApp) return null;
    const connectedRef = firebase.database().ref(".info/connected");
    const callback = (snap) => {
        if (snap.val() === true) { onConnected(); } else { onDisconnected(); }
    };
    connectedRef.on("value", callback);
    return () => connectedRef.off("value", callback);
}

// ⚠️ Aa functions have vaprashe nahi, pan delete nathi karya
async function syncToFirebase(data) {
    console.warn("syncToFirebase is deprecated. Using atomic updates.");
}
async function syncData() {
    console.warn("syncData is deprecated.");
}


// --- EXPORT SERVICE ---
// ⚠️ MUKHYA FERFAR: Have aa function data ne "on-demand" download karshe
async function exportData(type) {
    try {
        if (typeof XLSX === 'undefined') {
            throw new Error("SheetJS library is not loaded.");
        }
        
        const today = todayDateStr();
        const wb = XLSX.utils.book_new();
        
        showMessage('Exporting... Please wait, downloading live data...', 'info');

        if (type === 'active' || type === 'all') {
            // 1. ACTIVE BOWLS (Server par thi on-demand lavo)
            const activeSnapshot = await firebase.database().ref('progloveData/activeBowls').once('value');
            const allActiveBowls = objectToArray(activeSnapshot.val());
            
            if (allActiveBowls.length > 0) {
                const data = allActiveBowls.map(b => ({ 
                    "Bowl Code": b.code, "Dish": b.dish, "Company": b.company, "Customer": b.customer, 
                    "Creation Date": b.creationDate, 
                    "Missing Days": `${Math.ceil((new Date().getTime() - new Date(b.creationDate).getTime()) / 864e5)} days` 
                }));
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, "Active Bowls");
            } else if (type === 'active') {
                throw new Error("No active bowls to export.");
            }
        }
        
        if (type === 'returns' || type === 'all') {
            // 2. RETURNED BOWLS (Server par thi on-demand lavo)
            const returnedSnapshot = await firebase.database().ref('progloveData/returnedBowls').once('value');
            const allReturnedBowls = objectToArray(returnedSnapshot.val());

            if (allReturnedBowls.length > 0) {
                const data = allReturnedBowls.map(b => ({ 
                    "Bowl Code": b.code, "Dish": b.dish, "Company": b.company, "Customer": b.customer, 
                    "Returned By": b.user, "Return Date": b.returnDate, "Return Time": b.returnTime 
                }));
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, "Returned Bowls");
            } else if (type === 'returns') {
                throw new Error("No returned bowls to export.");
            }
        }
        
        if (type === 'all') {
            // 3. PREPARED BOWLS (Server par thi on-demand lavo)
            const preparedSnapshot = await firebase.database().ref('progloveData/preparedBowls').once('value');
            const allPreparedBowls = objectToArray(preparedSnapshot.val());
            if (allPreparedBowls.length > 0) {
                const prepData = allPreparedBowls.map(b => ({
                    "Bowl Code": b.code, "Dish": b.dish, "User": b.user, "Company": b.company,
                    "Customer": b.customer, "Creation Date": b.creationDate, "Timestamp": b.timestamp
                }));
                const ws3 = XLSX.utils.json_to_sheet(prepData);
                XLSX.utils.book_append_sheet(wb, ws3, "Prepared Bowls");
            }

            // 4. SCAN HISTORY (Server par thi on-demand lavo)
            const historySnapshot = await firebase.database().ref('progloveData/scanHistory').once('value');
            const allScanHistory = objectToArray(historySnapshot.val());
            if (allScanHistory.length > 0) {
                const historyData = allScanHistory.map(s => ({
                    "Bowl Code": s.code, "User": s.user, "Mode": s.mode, "Timestamp": s.timestamp
                }));
                const ws4 = XLSX.utils.json_to_sheet(historyData);
                XLSX.utils.book_append_sheet(wb, ws4, "Scan History");
            }
            
            if (wb.SheetNames.length === 0) {
                throw new Error("No data available to export.");
            }

            XLSX.writeFile(wb, `ProGlove_Complete_Data_${today.replace(/\//g, '-')}.xlsx`);
        } else {
             XLSX.writeFile(wb, `${type === 'active' ? 'Active' : 'Returned'}_Bowls.xlsx`);
        }
        
        showMessage(`✅ Exported ${type} data successfully`, 'success');
    } catch (e) {
        showMessage(`❌ Export failed: ${e.message}`, 'error');
        console.error(e);
    }
}

// (exportAllDataWrapper function - Koi Ferfar Nathi)
async function exportAllDataWrapper() {
    exportData('all');
}


// --- DOM ELEMENTS CACHE ---
// (cacheDOMElements function - Koi Ferfar Nathi)
const dom = {};
function cacheDOMElements() {
    const elements = {
        'systemStatus': 'systemStatus', 'kitchenModeBtn': 'kitchenBtn', 'returnModeBtn': 'returnBtn', 
        'modeStatus': 'modeDisplay', 'userSelect': 'userSelect', 'dishSelectorContainer': 'dishWrapper',
        'dishSelect': 'dishSelect', 'startScanBtn': 'startBtn', 'stopScanBtn': 'stopBtn',
        'scanInput': 'scanInput', 'myScansDish': 'myDishLetter', 'myScansCount': 'myScansCount',
        'preparedTodayCount': 'preparedTodayCount', 'activeCount': 'activeCount',
        'returnedTodayCount': 'returnedTodayCount', 'livePrepReportBody': 'livePrepReportBody',
        'lastSyncInfo': 'lastSyncInfo', 'jsonInput': 'jsonData', 'patchResultContainer': 'patchResults',
        'patchSummary': 'patchSummary', 'failedMatches': 'failedMatches'
    };
    for (const [jsVar, htmlId] of Object.entries(elements)) {
        const el = document.getElementById(htmlId);
        if (el) {
            dom[jsVar] = el;
        } else {
            console.warn(`❌ Element with id '${htmlId}' not found for ${jsVar}`);
        }
    }
    console.log("✅ DOM elements cached");
}

// --- UI UPDATE LOGIC ---
// ⚠️ MUKHYA FERFAR: Aa function have 50,000 record process nathi kartu.
// E fakt server mathi aavela `stats` ane `livePrepReport` ne j batave chhe.
function updateUI() {
    if (!dom.systemStatus) return;
    
    // Have `appData` mathi `stats` ane `livePrepReport` vaprashe
    const { mode, currentUser, dishLetter, isScanning, systemStatus, appData } = appState;
    const { stats, livePrepReport, myScans } = appData;

    // MyScans ni gantari (aa pehla jevi j chhe, karan ke myScans nani list chhe)
    const allMyScans = objectToArray(myScans);
    const myScansForUser = allMyScans.filter(s => s && s.user === currentUser);
    const myScansForDish = myScansForUser.filter(s => s.dish === dishLetter);


    // (System status ane mode buttons no code - Koi Ferfar Nathi)
    const statusMap = { 'initializing': { text: 'CONNECTING...', class: 'bg-gray-600' }, 'online': { text: 'ONLINE', class: 'bg-emerald-500' }, 'offline': { text: 'DISCONNECTED', class: 'bg-amber-500' }, 'error': { text: 'CONNECTION ERROR', class: 'bg-red-600' }, };
    const statusInfo = statusMap[systemStatus] || statusMap.offline;
    dom.systemStatus.textContent = statusInfo.text;
    dom.systemStatus.className = `absolute right-4 top-4 px-3 py-1 rounded-full text-xs font-bold text-white ${statusInfo.class}`;
    if (dom.kitchenModeBtn) dom.kitchenModeBtn.style.background = mode === 'kitchen' ? '#ff6e96' : '#37475a';
    if (dom.returnModeBtn) dom.returnModeBtn.style.background = mode === 'return' ? '#ff6e96' : '#37475a';
    if (dom.modeStatus) dom.modeStatus.textContent = mode ? `Status: ${mode.toUpperCase()} mode selected` : 'Status: Please select a mode';
    if (dom.userSelect) dom.userSelect.disabled = !mode;
    if (dom.dishSelectorContainer) dom.dishSelectorContainer.style.display = (mode === 'kitchen') ? 'block' : 'none';
    if (dom.dishSelect) dom.dishSelect.disabled = !(mode === 'kitchen' && !!currentUser);
    const isOnline = systemStatus === 'online';
    const canStartScan = (mode === 'kitchen' && !!currentUser && !!dishLetter) || (mode === 'return' && !!currentUser);
    if (dom.startScanBtn) dom.startScanBtn.disabled = !canStartScan || isScanning || !isOnline;
    if (dom.stopScanBtn) dom.stopScanBtn.disabled = !isScanning;
    if (dom.scanInput) {
        dom.scanInput.disabled = !isScanning;
        dom.scanInput.placeholder = isScanning ? "Awaiting scan..." : (canStartScan ? "Ready to scan" : "Select user/dish first...");
    }
    
    // ⚠️ COUNTERS HAVE `stats` MATHI AAVSHE
    if (dom.myScansCount) dom.myScansCount.textContent = (mode === 'kitchen' && dishLetter) ? myScansForDish.length : myScansForUser.length;
    if (dom.myScansDish) dom.myScansDish.textContent = (mode === 'kitchen' && dishLetter) ? dishLetter : '--';
    
    // Aa chhe "SACHA NUMBERS" je server par thi aavi rahya chhe
    if (dom.preparedTodayCount) dom.preparedTodayCount.textContent = stats.preparedTodayCount || 0;
    if (dom.activeCount) dom.activeCount.textContent = stats.activeCount || 0;
    if (dom.returnedTodayCount) dom.returnedTodayCount.textContent = stats.returnedTodayCount || 0;
    
    // ⚠️ LIVE REPORT HAVE `livePrepReport` MATHI AAVSHE
    if (dom.livePrepReportBody) {
        // Have data pehle thi j server par 'reduce' thayelo chhe
        const sortedReport = objectToArray(livePrepReport).sort((a,b) => a.dish.localeCompare(b.dish) || a.user.localeCompare(b.user));
        
        dom.livePrepReportBody.innerHTML = sortedReport.length > 0 ? 
            sortedReport.map(row => `
                <tr class="border-b border-slate-700 hover:bg-slate-700/50">
                    <td class="p-2 font-bold">${row.dish}</td>
                    <td class="p-2">${row.user}</td>
                    <td class="p-2 text-lg font-mono text-pink-400">${row.count}</td>
                </tr>
            `).join('') : 
            `<tr><td colspan="3" style="text-align:center;color:#9aa3b2;padding:18px">No kitchen scans recorded during this cycle.</td></tr>`;
    }

    // ⚠️ Last Sync have alag rite batave chhe
    if (dom.lastSyncInfo) {
        dom.lastSyncInfo.textContent = (systemStatus === 'online') ? 'Status: Live Sync Enabled' : 'Status: Disconnected';
    }
}

// --- CORE LOGIC (SACHO RASTO) ---
// ⚠️ MUKHYA FERFAR: Aa function have 1-minute FREEZE nahi thay
async function handleScan(code) {
    if (!code) return;
    
    const { mode, currentUser, dishLetter, appData } = appState;
    const now = nowISO();

    // Input ne disable karo (Aa barabar hatu)
    if (dom.scanInput) dom.scanInput.disabled = true;
    setTimeout(() => { 
        if (appState.isScanning && dom.scanInput) { 
            dom.scanInput.disabled = false; dom.scanInput.focus(); 
        } 
    }, 500);

    if (appState.systemStatus !== 'online') {
        showMessage('Cannot scan: App is disconnected.', 'error');
        if (dom.scanInput) dom.scanInput.value = '';
        return;
    }

    // Atomic updates object banavo (Aa barabar hatu)
    const firebaseUpdates = {};
    const scanHistoryKey = `${now}-${code}`;
    firebaseUpdates[`scanHistory/${scanHistoryKey}`] = { code, user: currentUser, mode, timestamp: now };

    try {
        if (mode === 'kitchen') {
            // ⚠️ MUKHYA FERFAR: Customer data ne 'find' karva client par j upyog karo
            // (Aapde customerData pehle thi load kari chhe)
            const customer = objectToArray(appData.customerData).find(c => c.bowl_id === code) || {};
            
            const newBowl = {
                code, 
                dish: dishLetter, 
                user: currentUser,
                company: customer.company || 'N/A', 
                customer: customer.customer_name || 'N/A',
                creationDate: todayDateStr(), 
                timestamp: now
            };
            
            // Have aa data ne server par mokhlo
            firebaseUpdates[`activeBowls/${code}`] = newBowl;
            firebaseUpdates[`preparedBowls/${now}-${code}`] = newBowl;
            firebaseUpdates[`myScans/${now}-${code}-${currentUser}`] = { user: currentUser, dish: dishLetter, code };

            showMessage(`✅ Prep scan OK: ${code} for Dish ${dishLetter}`, 'success');
            
        } else if (mode === 'return') {
            // ⚠️ MUKHYA FERFAR: 'activeBowls' mathi 1 record shodho
            // Aa 1-minute wala freeze ne 100% solve kare chhe.
            const activeBowlSnap = await firebase.database().ref(`progloveData/activeBowls/${code}`).once('value');
            const activeBowl = activeBowlSnap.val();
            
            if (!activeBowl) {
                // Jo bowl na male to error aapo
                throw new Error(`Bowl ${code} not found in active list`);
            }

            // Jo male, to updates banavo
            firebaseUpdates[`activeBowls/${code}`] = null; // Active mathi delete
            firebaseUpdates[`returnedBowls/${now}-${code}`] = {
                ...activeBowl, 
                returnDate: todayDateStr(), 
                returnTime: nowTimeStr(), 
                user: currentUser 
            };
            firebaseUpdates[`myScans/${now}-${code}-${currentUser}`] = { user: currentUser, code };

            showMessage(`🔄 Return scan OK: ${code}`, 'success');
        }

        // 3. Badha updates server ne 1 sathe mokhlo
        // Aa function Cloud Function ne trigger karshe (je counters update karshe)
        await firebase.database().ref('progloveData').update(firebaseUpdates);
        
        // UI automatic update thashe (karan ke aapde /stats/ ne sambhdi rahya chhiye)
        
    } catch (e) {
        console.error("Firebase update failed:", e);
        // "Could not save" error have ahi j pakdashe
        showMessage(`Error: ${e.message}`, 'error');
    }

    if (dom.scanInput) dom.scanInput.value = '';
}

// (populateDropdowns function - Koi Ferfar Nathi)
function populateDropdowns() {
    const { mode } = appState;
    const userRoleFilter = (user) => !mode ? false : (mode === 'kitchen' && user.role === 'Kitchen') || (mode === 'return' && user.role === 'Return');
    if (dom.userSelect) {
        dom.userSelect.innerHTML = '<option value="">-- Select User --</option>' + USERS.filter(userRoleFilter).map(u => `<option value="${u.name}">${u.name}</option>`).join('');
    }
    if (dom.dishSelect) {
        const dishes = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'1234'];
        dom.dishSelect.innerHTML = '<option value="">-- Select Dish --</option>' + dishes.map(d => `<option value="${d}">${d}</option>`).join('');
    }
}

// (GLOBAL FUNCTIONS FOR HTML ONCLICK HANDLERS - Koi Ferfar Nathi)
function setMode(mode) {
    stopScanning();
    appState.mode = mode;
    appState.currentUser = null;
    appState.dishLetter = null;
    populateDropdowns();
    if (dom.userSelect) dom.userSelect.value = '';
    if (dom.dishSelect) dom.dishSelect.value = '';
    updateUI();
}
function startScanning() {
    appState.isScanning = true;
    updateUI();
    if (dom.scanInput) dom.scanInput.focus();
    showMessage('Scanning started.', 'info');
}
function stopScanning() {
    appState.isScanning = false;
    if (dom.scanInput) dom.scanInput.value = '';
    updateUI();
    showMessage('Scanning stopped.', 'info');
}
function exportActiveBowls() { exportData('active'); }
function exportReturnData() { exportData('returns'); }
function exportAllData() { exportData('all'); } // Use the wrapper
function processJSONData() { processJsonPatch(); }
function resetTodaysPreparedBowls() { resetPrepared(); }
function selectUser() {
    if (dom.userSelect) {
        appState.currentUser = dom.userSelect.value;
        updateUI();
    }
}
function selectDishLetter() {
    if (dom.dishSelect) {
        appState.dishLetter = dom.dishSelect.value;
        updateUI();
    }
}

// (EVENT LISTENER SETUP - Koi Ferfar Nathi)
function initEventListeners() {
    console.log("✅ Using inline event handlers from HTML");
    if (dom.userSelect) {
        dom.userSelect.addEventListener('change', selectUser);
    }
    if (dom.dishSelect) {
        dom.dishSelect.addEventListener('change', selectDishLetter);
    }
    if (dom.scanInput) {
        dom.scanInput.addEventListener('change', (e) => handleScan(e.target.value.trim()));
    }
}

// (processJsonPatch function - Koi Ferfar Nathi)
// Aa function server par Cloud Function ne trigger kari deshe.
async function processJsonPatch() {
    if (!dom.jsonInput) return;
    
    const jsonText = dom.jsonInput.value.trim();
    if (!jsonText) {
        showMessage('JSON input is empty.', 'warning');
        return;
    }

    const showResult = (message, type) => {
        if (dom.patchResultContainer && dom.patchSummary) {
            const classMap = { error: 'bg-red-800/50 text-red-300', success: 'bg-emerald-800/50 text-emerald-300', };
            dom.patchResultContainer.style.display = 'block';
            dom.patchResultContainer.className = `mt-4 p-3 rounded-lg text-sm ${classMap[type] || classMap.error}`;
            dom.patchSummary.innerHTML = message;
        }
    };

    let companiesData;
    try {
        const parsed = JSON.parse(jsonText);
        companiesData = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
        showResult('❌ Error: Could not parse JSON. Please check for syntax errors.', 'error');
        return;
    }

    let updatedCount = 0;
    const today = todayDateStr();
    const updates = {};

    companiesData.forEach(company => {
        if (!company || typeof company !== 'object' || !Array.isArray(company.boxes)) return;
        const companyName = company.name || 'N/A';
        company.boxes.forEach(box => {
            if (!box || !Array.isArray(box.dishes)) return;
            let deliveryDate = today;
            if (box.uniqueIdentifier) {
                const dateMatch = box.uniqueIdentifier.match(/\d{4}-\d{2}-\d{2}/);
                if (dateMatch) deliveryDate = dateMatch[0];
            }
            box.dishes.forEach(dish => {
                if (!dish || !Array.isArray(dish.bowlCodes)) return;
                const customers = (dish.users && dish.users.length > 0) ? dish.users.map(u => u.username).join(', ') : 'N/A';
                dish.bowlCodes.forEach(code => {
                    if (!code) return;
                    const newBowl = { code: code, dish: dish.label || 'N/A', company: companyName, customer: customers, creationDate: deliveryDate, timestamp: nowISO() };
                    updates[`activeBowls/${code}`] = newBowl;
                    updatedCount++; // Fakt 'updated' j ganavo
                });
            });
        });
    });
    
    if (Object.keys(updates).length === 0) {
        showResult("⚠️ Warning: No valid bowl codes were found...", 'error');
        return;
    }
    
    // Server ne update mokhlo
    await firebase.database().ref('progloveData').update(updates);

    let resultMessage = `✅ JSON processed successfully.<br>`;
    resultMessage += `🔄 <strong>${updatedCount}</strong> records created/updated. Counters will update shortly.`;
    
    showResult(resultMessage, 'success');
    if (dom.jsonInput) dom.jsonInput.value = '';
    showMessage('Customer data applied! All devices will update.', 'success');
}

// (resetPrepared function - Koi Ferfar Nathi)
// Aa function server par Cloud Function ne trigger kari deshe.
async function resetPrepared() {
    const resetConfirmed = window.confirm("Are you sure you want to reset ALL prepared bowls and scan counts for TODAY? This cannot be undone.");

    if (resetConfirmed) {
        try {
            const resetUpdates = {};
            resetUpdates['preparedBowls'] = null;
            resetUpdates['myScans'] = null;
            // ⚠️ NAVI VAT: Have 'livePrepReport' ne pan reset karvu padshe
            resetUpdates['livePrepReport'] = null; 
            
            await firebase.database().ref('progloveData').update(resetUpdates);
            
            showMessage('Prepared data and scan counts have been reset across all devices.', 'success');
            // Cloud Function automatic counters ne 0 kari deshe.
        } catch (e) {
            console.error("Reset failed:", e);
            showMessage('Failed to perform reset!', 'error');
        }
    }
}

// --- INITIALIZATION ---
// ⚠️ AAKHU BADLELU - Aa tamaro "4-5 minute" walo problem solve kare chhe
async function initializeApp() {
    console.log("🚀 Starting ProGlove Scanner App (v12 - Server Counters)...");
    
    try {
        cacheDOMElements();
        initEventListeners();
        appState.appData = createDefaultAppData(); // Khali state thi sharu karo
        updateUI();

        if (initFirebase()) {
            monitorFirebaseConnection(
                async () => { // onConnected
                    console.log("✅ Firebase connected");
                    if (!hasConnectedOnce) {
                        appState.systemStatus = 'online';
                        hasConnectedOnce = true;
                        showMessage('Connected. Listening for live data...', 'success');
                        updateUI();
                        
                        // ⚠️ MUKHYA FERFAR: Have aapde fakt nanikda data-points ne j sambhdishu
                    
                        // 1. STATS / COUNTERS NE SAMBHALO
                        firebase.database().ref('progloveData/stats').on('value', (snapshot) => {
                            const stats = snapshot.val();
                            if (stats) {
                                appState.appData.stats = stats;
                                console.log("📊 Live Stats Updated:", stats);
                                updateUI(); // UI ma counters update karo
                            }
                        });

                        // 2. LIVE PREP REPORT NE SAMBHALO
                        firebase.database().ref('progloveData/livePrepReport').on('value', (snapshot) => {
                            appState.appData.livePrepReport = snapshot.val() || {};
                            console.log("📈 Live Report Updated");
                            updateUI(); // UI ma table update karo
                        });
                        
                        // 3. FAKT MARA SCANS NE SAMBHALO
                        firebase.database().ref('progloveData/myScans').on('value', (snapshot) => {
                            appState.appData.myScans = snapshot.val() || {};
                            console.log("🧾 MyScans Updated");
                            updateUI(); // UI ma 'My Scans' count update karo
                        });
                        
                        // 4. CUSTOMER DATA (Nani file chhe, load karo)
                        firebase.database().ref('progloveData/customerData').once('value', (snapshot) => {
                            // ⚠️ Ferfar: Aane object mathi array banavo
                            appState.appData.customerData = objectToArray(snapshot.val());
                            console.log(`🙍‍♂️ Customer Data Loaded (${appState.appData.customerData.length} records)`);
                        });

                    } else {
                        appState.systemStatus = 'online';
                        showMessage('Reconnected to Firebase.', 'success');
                        updateUI();
                    }
                },
                () => { // onDisconnected
                    console.log("❌ Firebase disconnected");
                    appState.systemStatus = 'offline';
                    showMessage('Connection lost. Changes are disabled.', 'warning');
                    updateUI();
                }
            );
        } else {
            appState.systemStatus = 'offline';
            showMessage('Could not connect to Firebase.', 'error');
            updateUI();
        }
    } catch (error) {
        console.error("App initialization failed:", error);
        showMessage('App initialization failed!', 'error');
    }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}


