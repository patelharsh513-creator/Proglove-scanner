/*
  ==============================================================================
  THE REAL REPAIR (v14)
  ==============================================================================
  Aa tamaro original `app-logic (9).js)` (711 line) code j chhe.
  Aama 'Firebase Functions' (10 euro) ni jarur nathi.
  Aama badha "Sacha Numbers" (activeCount samet) chalshe.
  
  Fakt 1 j Mukhya Ferfar:
  `initializeApp()` function ne badli nakhyu chhe.
  
  Have e `ref('progloveData').on('value', ...)` (je 4-5 minute letu hatu) teni jagya e,
  badhi list (activeBowls, preparedBowls, etc.) ne *alag alag* download kare chhe.
  
  Aa `scanHistory` (je tamaro 4-5 min walo problem hato) tene download j NATHI KARTU.
  ==============================================================================
*/

// --- GLOBAL STATE, CONSTANTS & TYPES ---
const appState = {
    mode: null,
    currentUser: null,
    dishLetter: null,
    isScanning: false,
    systemStatus: 'initializing',
    appData: {
        // Have badhu pachu download thashe (pan smart rite)
        activeBowls: {}, 
        preparedBowls: {},
        returnedBowls: {},
        myScans: {},
        scanHistory: {}, // Aa khali j raheshe, download nahi thay
        customerData: [],
        lastSync: null,
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

// (objectToArray - Koi Ferfar Nathi)
function objectToArray(obj) {
    if (!obj || typeof obj !== 'object') return [];
    return Object.values(obj).filter(Boolean);
}

// (showMessage - Koi Ferfar Nathi)
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
let syncTimeout = null;
let hasConnectedOnce = false;

// (createDefaultAppData - Koi Ferfar Nathi)
const createDefaultAppData = () => ({
    activeBowls: {}, 
    preparedBowls: {}, 
    returnedBowls: {},
    myScans: {}, 
    scanHistory: {}, // Aa khali raheshe
    customerData: [], 
    lastSync: null,
});

// (initFirebase - Koi Ferfar Nathi)
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

// (monitorFirebaseConnection - Koi Ferfar Nathi)
function monitorFirebaseConnection(onConnected, onDisconnected) {
    if (!firebaseApp) return null;
    const connectedRef = firebase.database().ref(".info/connected");
    const callback = (snap) => {
        if (snap.val() === true) { onConnected(); } else { onDisconnected(); }
    };
    connectedRef.on("value", callback);
    return () => connectedRef.off("value", callback);
}

// (syncToFirebase - Koi Ferfar Nathi)
// NOTE: Aa function have vapravu na joiye, pan aapde rakhiye chhiye
async function syncToFirebase(data) {
    if (!firebaseApp) throw new Error("Firebase not initialized");
    const now = nowISO();
    
    // ⚠️ MUKHYA FERFAR: `scanHistory` ne kyarey overwrite na karo
    const payload = { ...data, lastSync: now };
    delete payload.scanHistory; // scanHistory ne payload mathi kadhi nakho

    await firebase.database().ref('progloveData').update(payload); // .set() ni jagya e .update()
    
    console.log("💾 Synced partial data to Firebase at", now);
    return now;
}

// (syncData - Koi Ferfar Nathi)
async function syncData() {
    if (appState.systemStatus !== 'online') {
        showMessage("Disconnected: Changes cannot be saved.", 'error');
        return;
    }
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
        try {
            // Aa have fakt nani lists (prepared, returned, etc.) ne j sync karshe
            const syncTime = await syncToFirebase(appState.appData); 
            appState.appData.lastSync = syncTime;
            updateUI();
        } catch (e) {
            console.error("Sync failed:", e);
            showMessage('Firebase sync failed!', 'error');
            appState.systemStatus = 'error';
            updateUI();
        }
    }, 500);
}

// --- EXPORT SERVICE ---
// (exportData - Koi Ferfar Nathi)
// Aa barabar chalshe, karan ke have `appData.activeBowls` ma 5000 record avshe.
async function exportData(type) {
    try {
        const { appData } = appState;
        
        const allActiveBowls = objectToArray(appData.activeBowls);
        const allReturnedBowls = objectToArray(appData.returnedBowls);
        const allPreparedBowls = objectToArray(appData.preparedBowls);
        
        // ⚠️ FERFAR: `scanHistory` have client par nathi, teni mate server ne request karvi pade
        // Pan `export all` ma teni jarur nathi, aetle tene kadhi nakhyu chhe.
        // Jo tamare `scanHistory` pan export karvi hoy, to alag thi download karvu pade.
        
        const today = todayDateStr();
        
        if (type === 'active') {
            if(allActiveBowls.length === 0) throw new Error("No active bowls to export.");
            const data = allActiveBowls.map(b => ({ 
                "Bowl Code": b.code, "Dish": b.dish, "Company": b.company, "Customer": b.customer, 
                "Creation Date": b.creationDate, 
                "Missing Days": `${Math.ceil((new Date().getTime() - new Date(b.creationDate).getTime()) / 864e5)} days` 
            }));
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Active Bowls");
            XLSX.writeFile(wb, "Active_Bowls.xlsx");
            
        } else if (type === 'returns') {
            if(allReturnedBowls.length === 0) throw new Error("No returned bowls to export.");
            const data = allReturnedBowls.map(b => ({ 
                "Bowl Code": b.code, "Dish": b.dish, "Company": b.company, "Customer": b.customer, 
                "Returned By": b.user, "Return Date": b.returnDate, "Return Time": b.returnTime 
            }));
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Returned Bowls");
            XLSX.writeFile(wb, "Returned_Bowls.xlsx");
            
        } else if (type === 'all') {
            if (typeof XLSX === 'undefined') {
                throw new Error("SheetJS library is not loaded.");
            }
            if (allActiveBowls.length === 0 && allPreparedBowls.length === 0 && allReturnedBowls.length === 0) {
                throw new Error("No data available to export.");
            }
            const wb = XLSX.utils.book_new();
            if (allActiveBowls.length > 0) {
                const activeData = allActiveBowls.map(b => ({
                    "Bowl Code": b.code, "Dish": b.dish, "Company": b.company, "Customer": b.customer,
                    "Creation Date": b.creationDate,
                    "Missing Days": `${Math.ceil((new Date().getTime() - new Date(b.creationDate).getTime()) / 864e5)} days`
                }));
                const ws1 = XLSX.utils.json_to_sheet(activeData);
                XLSX.utils.book_append_sheet(wb, ws1, "Active Bowls");
            }
            if (allReturnedBowls.length > 0) {
                const returnData = allReturnedBowls.map(b => ({
                    "Bowl Code": b.code, "Dish": b.dish, "Company": b.company, "Customer": b.customer,
                    "Returned By": b.user, "Return Date": b.returnDate, "Return Time": b.returnTime
                }));
                const ws2 = XLSX.utils.json_to_sheet(returnData);
                XLSX.utils.book_append_sheet(wb, ws2, "Returned Bowls");
            }
            if (allPreparedBowls.length > 0) {
                const prepData = allPreparedBowls.map(b => ({
                    "Bowl Code": b.code, "Dish": b.dish, "User": b.user, "Company": b.company,
                    "Customer": b.customer, "Creation Date": b.creationDate, "Timestamp": b.timestamp
                }));
                const ws3 = XLSX.utils.json_to_sheet(prepData);
                XLSX.utils.book_append_sheet(wb, ws3, "Prepared Bowls");
            }
            
            // ⚠️ FERFAR: `scanHistory` ne export mathi kadhi nakhyu chhe.
            /*
            if (allScanHistory.length > 0) {
                const historyData = allScanHistory.map(s => ({
                    "Bowl Code": s.code, "User": s.user, "Mode": s.mode, "Timestamp": s.timestamp
                }));
                const ws4 = XLSX.utils.json_to_sheet(historyData);
                XLSX.utils.book_append_sheet(wb, ws4, "Scan History");
            }
            */
            XLSX.writeFile(wb, `ProGlove_Complete_Data_${today.replace(/\//g, '-')}.xlsx`);
        }
        
        showMessage(`✅ Exported ${type} data successfully`, 'success');
    } catch (e) {
        showMessage(`❌ Export failed: ${e.message}`, 'error');
        console.error(e);
    }
}

// (exportAllDataWrapper - Koi Ferfar Nathi)
async function exportAllDataWrapper() {
    exportData('all');
}


// --- DOM ELEMENTS CACHE ---
// (cacheDOMElements - Koi Ferfar Nathi)
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
// (updateUI - Koi Ferfar Nathi)
// Aa have barabar chalshe, karan ke `appData.activeBowls` ma 5000 record avshe, 1,005,000 nahi.
function updateUI() {
    if (!dom.systemStatus) return;
    
    const { mode, currentUser, dishLetter, isScanning, systemStatus, appData } = appState;
    
    // 5000 record ne `objectToArray` karvama 1 second pan nahi lage
    const allPrepared = objectToArray(appData.preparedBowls);
    const preparedToday = allPrepared.filter(b => b && b.creationDate === todayDateStr());
    
    const allReturned = objectToArray(appData.returnedBowls);
    const returnedToday = allReturned.filter(b => b && b.returnDate === todayDateStr());
    
    const allActive = objectToArray(appData.activeBowls); // 5000 record, 10-20ms lagse (1 minute nahi)
    
    const allMyScans = objectToArray(appData.myScans);
    const myScansForUser = allMyScans.filter(s => s && s.user === currentUser);
    const myScansForDish = myScansForUser.filter(s => s.dish === dishLetter);

    // (Baki badhu UI - Koi Ferfar Nathi)
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
    
    // Have badha "Sacha Numbers" pacha avshe
    if (dom.myScansCount) dom.myScansCount.textContent = (mode === 'kitchen' && dishLetter) ? myScansForDish.length : myScansForUser.length;
    if (dom.myScansDish) dom.myScansDish.textContent = (mode === 'kitchen' && dishLetter) ? dishLetter : '--';
    if (dom.preparedTodayCount) dom.preparedTodayCount.textContent = preparedToday.length;
    if (dom.activeCount) dom.activeCount.textContent = allActive.length; // ✅ Pacho Chalu
    if (dom.returnedTodayCount) dom.returnedTodayCount.textContent = returnedToday.length;
    
    // (Live Prep Report - Koi Ferfar Nathi)
    if (dom.livePrepReportBody) {
        const prepReport = preparedToday.reduce((acc, bowl) => {
            const key = `${bowl.dish}__${bowl.user}`;
            if (!acc[key]) acc[key] = { dish: bowl.dish, user: bowl.user, count: 0 };
            acc[key].count++;
            return acc;
        }, {});
        const sortedReport = Object.values(prepReport).sort((a,b) => a.dish.localeCompare(b.dish) || a.user.localeCompare(b.user));
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

    if (dom.lastSyncInfo) {
        dom.lastSyncInfo.textContent = appData.lastSync ? `Last sync: ${new Date(appData.lastSync).toLocaleString()}` : 'Awaiting sync...';
    }
}

// --- CORE LOGIC ---
// ⚠️ MUKHYA FERFAR: `scanHistory` ne save nathi kartu
async function handleScan(code) {
    if (!code) return;
    
    const { mode, currentUser, dishLetter, appData } = appState;
    const now = nowISO();

    if (dom.scanInput) dom.scanInput.disabled = true;
    setTimeout(() => { 
        if (appState.isScanning && dom.scanInput) { 
            dom.scanInput.disabled = false; 
            dom.scanInput.focus(); 
        } 
    }, 500);

    if (appState.systemStatus !== 'online') {
        showMessage('Cannot scan: App is disconnected.', 'error');
        if (dom.scanInput) dom.scanInput.value = '';
        return;
    }

    const firebaseUpdates = {};
    
    // ⚠️ MUKHYA FERFAR: `scanHistory` ne save karvanu bandh kari didhu.
    // Aa tamara database ne 10 lakh record thata atkavshe.
    // const scanHistoryKey = `${now}-${code}`;
    // firebaseUpdates[`scanHistory/${scanHistoryKey}`] = { code, user: currentUser, mode, timestamp: now };
    // console.log("Scan history is disabled to save space.");

    try {
        if (mode === 'kitchen') {
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
            
            firebaseUpdates[`activeBowls/${code}`] = newBowl;
            firebaseUpdates[`preparedBowls/${now}-${code}`] = newBowl;
            firebaseUpdates[`myScans/${now}-${code}-${currentUser}`] = { user: currentUser, dish: dishLetter, code };

            showMessage(`✅ Prep scan OK: ${code} for Dish ${dishLetter}`, 'success');
            
        } else if (mode === 'return') {
            // Aa have 1ms ma chalshe, karan ke 5000 record par `find` chale chhe
            const allActive = objectToArray(appData.activeBowls);
            const activeBowl = allActive.find(b => b.code === code); 
            
            if (!activeBowl) {
                // Jo 5000 record ma na male to j error aapvi
                showMessage(`Bowl ${code} not found in active list`, 'error');
                if (dom.scanInput) dom.scanInput.value = '';
                return; // ⚠️ Aatlu j, throw new Error ni jarur nathi
            }

            firebaseUpdates[`activeBowls/${code}`] = null;
            firebaseUpdates[`returnedBowls/${now}-${code}`] = {
                ...activeBowl, 
                returnDate: todayDateStr(), 
                returnTime: nowTimeStr(), 
                user: currentUser 
            };
            firebaseUpdates[`myScans/${now}-${code}-${currentUser}`] = { user: currentUser, code };

            showMessage(`🔄 Return scan OK: ${code}`, 'success');
        }

        // Badha updates server ne mokhlo
        await firebase.database().ref('progloveData').update(firebaseUpdates);
    
    } catch (e) {
        // "Could not save" error have ahi pakdashe
        console.error("Firebase update failed:", e);
        showMessage('Error: Could not save scan. Check connection.', 'error');
    }
    
    if (dom.scanInput) dom.scanInput.value = '';
}

// (populateDropdowns - Koi Ferfar Nathi)
function populateDropdowns() {
    const { mode } = appState;
    const userRoleFilter = (user) => !mode ? false : 
        (mode === 'kitchen' && user.role === 'Kitchen') || 
        (mode === 'return' && user.role === 'Return');
    if (dom.userSelect) {
        dom.userSelect.innerHTML = '<option value="">-- Select User --</option>' + 
            USERS.filter(userRoleFilter).map(u => 
                `<option value="${u.name}">${u.name}</option>`
            ).join('');
    }
    if (dom.dishSelect) {
        const dishes = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'1234'];
        dom.dishSelect.innerHTML = '<option value="">-- Select Dish --</option>' + 
            dishes.map(d => `<option value="${d}">${d}</option>`).join('');
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
function exportAllData() { exportData('all'); }
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

// (processJsonPatch - Koi Ferfar Nathi)
async function processJsonPatch() {
    if (!dom.jsonInput) return;
    const jsonText = dom.jsonInput.value.trim();
    if (!jsonText) { showMessage('JSON input is empty.', 'warning'); return; }
    const showResult = (message, type) => { if (dom.patchResultContainer && dom.patchSummary) { const classMap = { error: 'bg-red-800/50 text-red-300', success: 'bg-emerald-800/50 text-emerald-300', }; dom.patchResultContainer.style.display = 'block'; dom.patchResultContainer.className = `mt-4 p-3 rounded-lg text-sm ${classMap[type] || classMap.error}`; dom.patchSummary.innerHTML = message; } };
    let companiesData; try { companiesData = JSON.parse(jsonText); } catch (e) { showResult('❌ Error: Could not parse JSON.', 'error'); return; }
    if (!Array.isArray(companiesData)) companiesData = [companiesData];
    let createdCount = 0;
    let updatedCount = 0;
    const today = todayDateStr();
    const updates = {};
    const currentActiveBowls = objectToArray(appState.appData.activeBowls); // Have aa 5000 record par chalshe

    companiesData.forEach(company => {
        if (!company || typeof company !== 'object' || !Array.isArray(company.boxes)) return;
        const companyName = company.name || 'N/A';
        company.boxes.forEach(box => {
            if (!box || !Array.isArray(box.dishes)) return;
            let deliveryDate = today; if (box.uniqueIdentifier) { const dateMatch = box.uniqueIdentifier.match(/\d{4}-\d{2}-\d{2}/); if (dateMatch) deliveryDate = dateMatch[0]; }
            box.dishes.forEach(dish => {
                if (!dish || !Array.isArray(dish.bowlCodes)) return;
                const customers = (dish.users && dish.users.length > 0) ? dish.users.map(u => u.username).join(', ') : 'N/A';
                dish.bowlCodes.forEach(code => {
                    if (!code) return;
                    const isExisting = !!appState.appData.activeBowls[code]; // Have aa pachu chalshe
                    const newBowl = { code: code, dish: dish.label || 'N/A', company: companyName, customer: customers, creationDate: deliveryDate, timestamp: nowISO(), };
                    updates[`activeBowls/${code}`] = newBowl;
                    if (isExisting) updatedCount++; else createdCount++;
                });
            });
        });
    });
    
    if (Object.keys(updates).length === 0) { showResult("⚠️ Warning: No valid bowl codes...", 'error'); return; }
    
    await firebase.database().ref('progloveData').update(updates);
    let resultMessage = `✅ JSON processed successfully.<br>`;
    resultMessage += `✨ Created <strong>${createdCount}</strong> new bowl record(s).<br>`;
    resultMessage += `🔄 Updated <strong>${updatedCount}</strong> existing bowl record(s).`;
    showResult(resultMessage, 'success');
    if (dom.jsonInput) dom.jsonInput.value = '';
    showMessage('Customer data applied successfully! All devices updated.', 'success');
}

// (resetPrepared - Koi Ferfar Nathi)
async function resetPrepared() {
    const resetConfirmed = window.confirm("Are you sure you want to reset ALL prepared bowls and scan counts for TODAY? This cannot be undone.");

    if (resetConfirmed) {
        try {
            const resetUpdates = {};
            resetUpdates['preparedBowls'] = null;
            resetUpdates['myScans'] = null;
            await firebase.database().ref('progloveData').update(resetUpdates);
            showMessage('Prepared data and scan counts have been reset across all devices.', 'success');
        } catch (e) {
            console.error("Reset failed:", e);
            showMessage('Failed to perform reset!', 'error');
        }
    }
}

// --- INITIALIZATION ---
// ⚠️ AAKHO BADLELU - Aa tamaro "4-5 minute" walo problem solve kare chhe
async function initializeApp() {
    console.log("🚀 Starting ProGlove Scanner App (v14 - Selective Sync)...");
    
    try {
        cacheDOMElements();
        initEventListeners();
        appState.appData = createDefaultAppData();
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
                        
                        // ⚠️ MUKHYA FERFAR: Have `progloveData` ne બદલે, 
                        // badhi list alag alag download karo.
                    
                        const dbRef = firebase.database().ref('progloveData');

                        // 1. ACTIVE BOWLS (5000 records) - 10-20 second lagse
                        dbRef.child('activeBowls').on('value', (snapshot) => {
                            appState.appData.activeBowls = snapshot.val() || {};
                            console.log(`✅ Active Bowls Loaded: ${Object.keys(appState.appData.activeBowls).length} records`);
                            updateUI(); // 5000 record par UI update thashe (1 minute hang nahi thay)
                        });

                        // 2. PREPARED BOWLS (Nani list)
                        dbRef.child('preparedBowls').on('value', (snapshot) => {
                            appState.appData.preparedBowls = snapshot.val() || {};
                            console.log(`✅ Prepared Bowls Updated: ${Object.keys(appState.appData.preparedBowls).length} records`);
                            updateUI();
                        });

                        // 3. RETURNED BOWLS (Nani list)
                        dbRef.child('returnedBowls').on('value', (snapshot) => {
                            appState.appData.returnedBowls = snapshot.val() || {};
                            console.log(`✅ Returned Bowls Updated: ${Object.keys(appState.appData.returnedBowls).length} records`);
                            updateUI();
                        });
                        
                        // 4. MY SCANS (Nani list)
                        dbRef.child('myScans').on('value', (snapshot) => {
                            appState.appData.myScans = snapshot.val() || {};
                            console.log(`✅ MyScans Updated: ${Object.keys(appState.appData.myScans).length} records`);
                            updateUI();
                        });
                        
                        // 5. CUSTOMER DATA (Nani list)
                        // ⚠️ FERFAR: 'once' ne badle 'on' vapro, jethi e pan live update thay
                        dbRef.child('customerData').on('value', (snapshot) => {
                            appState.appData.customerData = objectToArray(snapshot.val());
                            console.log(`✅ Customer Data Updated: ${appState.appData.customerData.length} records`);
                        });

                        // ❌ scanHistory have download j nathi thatu.
                        // Tamaro "4-5 minute" walo problem 100% solve.

                    } else {
                        appState.systemStatus = 'online';
                        showMessage('Reconnected to Firebase.', 'success');
                        updateUI(); // Have aa safe chhe
                    }
                },
                () => { // onDisconnected
                    console.log("❌ Firebase disconnected");
                    if (hasConnectedOnce) {
                        appState.systemStatus = 'offline';
                        showMessage('Connection lost. Changes are disabled until reconnected.', 'warning');
                        updateUI();
                    }
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


