// --- GLOBAL STATE, CONSTANTS & TYPES ---
const appState = {
    mode: null,
    currentUser: null,
    dishLetter: null,
    isScanning: false,
    systemStatus: 'initializing',
    appData: {
        activeBowls: [],
        preparedBowls: [],
        returnedBowls: [],
        myScans: [],
        scanHistory: [],
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
    apiKey: "AIzaSyDya1dDRSeQmuKnpraSoSoTjauLlJ_J94I",
    authDomain: "proglove-bowl-tracker.firebaseapp.com",
    databaseURL: "https://proglove-bowl-tracker-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "proglove-bowl-tracker",
    storageBucket: "proglove-bowl-tracker.appspot.com",
    messagingSenderId: "280001054969",
    appId: "1:280001054969:web:a0792a228ea2f1c5c9ba28"
};

// --- UTILITIES ---
const todayDateStr = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
const nowTimeStr = () => new Date().toLocaleTimeString();

function showMessage(text, type = 'info') {
    try {
        const container = document.getElementById('messageContainer');
        if (!container) {
            console.log(`${type}: ${text}`);
            return;
        }
        
        const el = document.createElement('div');
        const typeClasses = {
            success: 'bg-emerald-600',
            error: 'bg-red-600',
            info: 'bg-sky-600',
            warning: 'bg-amber-600',
        };
        
        el.className = `p-3 rounded-lg shadow-2xl text-white font-semibold ${typeClasses[type] || typeClasses.info}`;
        el.innerText = text;
        container.appendChild(el);
        
        setTimeout(() => {
            try { 
                if (container.contains(el)) {
                    container.removeChild(el); 
                }
            } catch(e) {}
        }, 4000);
    } catch(e) { 
        console.error("showMessage error:", e);
        console.log(`${type}: ${text}`);
    }
}

// --- DATA & FIREBASE SERVICE ---
let firebaseApp = null;
let syncTimeout = null;
let hasConnectedOnce = false;

const createDefaultAppData = () => ({
    activeBowls: [], 
    preparedBowls: [], 
    returnedBowls: [],
    myScans: [], 
    scanHistory: [], 
    customerData: [], 
    lastSync: null,
});

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

function monitorFirebaseConnection(onConnected, onDisconnected) {
    if (!firebaseApp) return null;
    
    const connectedRef = firebase.database().ref(".info/connected");
    const callback = (snap) => {
        if (snap.val() === true) { 
            onConnected(); 
        } else { 
            onDisconnected(); 
        }
    };
    
    connectedRef.on("value", callback);
    return () => connectedRef.off("value", callback);
}

async function loadFromFirebase() {
    if (!firebaseApp) throw new Error("Firebase not initialized");
    
    const snapshot = await firebase.database().ref('progloveData').once('value');
    if (snapshot.exists()) {
        const firebaseData = snapshot.val();
        console.log("📥 Loaded data from Firebase:", firebaseData);
        return { ...createDefaultAppData(), ...firebaseData };
    }
    return null;
}

async function syncToFirebase(data) {
    if (!firebaseApp) throw new Error("Firebase not initialized");
    
    const now = nowISO();
    const payload = { ...data, lastSync: now };
    await firebase.database().ref('progloveData').set(payload);
    console.log("💾 Synced data to Firebase at", now);
    return now;
}

async function syncData() {
    if (appState.systemStatus !== 'online') {
        showMessage("Disconnected: Changes cannot be saved.", 'error');
        return;
    }
    
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
        try {
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
async function exportData(type) {
    try {
        const { appData } = appState;
        
        if (type === 'active') {
            const activeBowls = (appData.activeBowls || []).filter(Boolean);
            if(activeBowls.length === 0) throw new Error("No active bowls to export.");
            
            const data = activeBowls.map(b => ({ 
                "Bowl Code": b.code, 
                "Dish": b.dish, 
                "Company": b.company, 
                "Customer": b.customer, 
                "Creation Date": b.creationDate, 
                "Missing Days": `${Math.ceil((new Date().getTime() - new Date(b.creationDate).getTime()) / 864e5)} days` 
            }));
            
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Active Bowls");
            XLSX.writeFile(wb, "Active_Bowls.xlsx");
            
        } else if (type === 'returns') {
            const returnedBowls = (appData.returnedBowls || []).filter(Boolean);
            if(returnedBowls.length === 0) throw new Error("No returned bowls to export.");
            
            const data = returnedBowls.map(b => ({ 
                "Bowl Code": b.code, 
                "Dish": b.dish, 
                "Company": b.company, 
                "Customer": b.customer, 
                "Returned By": b.user, 
                "Return Date": b.returnDate, 
                "Return Time": b.returnTime 
            }));
            
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Returned Bowls");
            XLSX.writeFile(wb, "Returned_Bowls.xlsx");
            
        } else if (type === 'all') {
            await exportAllData(appData);
        }
        
        showMessage(`✅ Exported ${type} data successfully`, 'success');
    } catch (e) {
        showMessage(`❌ Export failed: ${e.message}`, 'error');
        console.error(e);
    }
}

async function exportAllData(appData) {
    if (typeof XLSX === 'undefined') {
        throw new Error("SheetJS library is not loaded.");
    }
    
    const activeBowls = (appData.activeBowls || []).filter(Boolean);
    const preparedBowls = (appData.preparedBowls || []).filter(Boolean);
    const returnedBowls = (appData.returnedBowls || []).filter(Boolean);
    
    if (activeBowls.length === 0 && preparedBowls.length === 0 && returnedBowls.length === 0) {
        throw new Error("No data available to export.");
    }

    const wb = XLSX.utils.book_new();
    const today = todayDateStr();

    if (activeBowls.length > 0) {
        const activeData = activeBowls.map(b => ({
            "Bowl Code": b.code,
            "Dish": b.dish,
            "Company": b.company,
            "Customer": b.customer,
            "Creation Date": b.creationDate,
            "Missing Days": `${Math.ceil((new Date().getTime() - new Date(b.creationDate).getTime()) / 864e5)} days`
        }));
        const ws1 = XLSX.utils.json_to_sheet(activeData);
        XLSX.utils.book_append_sheet(wb, ws1, "Active Bowls");
    }

    const returnedToday = returnedBowls.filter(b => b.returnDate === today);
    if (returnedToday.length > 0) {
        const returnData = returnedToday.map(b => ({
            "Bowl Code": b.code,
            "Dish": b.dish,
            "Company": b.company,
            "Customer": b.customer,
            "Returned By": b.user,
            "Return Date": b.returnDate,
            "Return Time": b.returnTime
        }));
        const ws2 = XLSX.utils.json_to_sheet(returnData);
        XLSX.utils.book_append_sheet(wb, ws2, "Returned Today");
    }

    const preparedToday = preparedBowls.filter(b => b.creationDate === today);
    if (preparedToday.length > 0) {
        const prepData = preparedToday.map(b => ({
            "Bowl Code": b.code,
            "Dish": b.dish,
            "User": b.user,
            "Timestamp": b.timestamp
        }));
        const ws3 = XLSX.utils.json_to_sheet(prepData);
        XLSX.utils.book_append_sheet(wb, ws3, "Prepared Today");
    }

    XLSX.writeFile(wb, `ProGlove_All_Data_${today.replace(/\//g, '-')}.xlsx`);
}

// --- DOM ELEMENTS CACHE ---
const dom = {};
function cacheDOMElements() {
    // Direct mapping to your actual HTML element IDs
    const elements = {
        // System
        'systemStatus': 'systemStatus',
        
        // Mode section
        'kitchenModeBtn': 'kitchenBtn',
        'returnModeBtn': 'returnBtn', 
        'modeStatus': 'modeDisplay',
        
        // User & Dish section
        'userSelect': 'userSelect',
        'dishSelectorContainer': 'dishWrapper',
        'dishSelect': 'dishSelect',
        
        // Scanner section
        'startScanBtn': 'startBtn',
        'stopScanBtn': 'stopBtn',
        'scanInput': 'scanInput',
        'myScansDish': 'myDishLetter',
        'myScansCount': 'myScansCount',
        'preparedTodayCount': 'preparedTodayCount',
        'activeCount': 'activeCount',
        'returnedTodayCount': 'returnedCount',
        
        // Live report
        'livePrepReportBody': 'livePrepReportBody',
        
        // Data management
        'lastSyncInfo': 'lastSyncInfo',
        'jsonInput': 'jsonData',
        'patchResultContainer': 'patchResults',
        'patchSummary': 'patchSummary',
        'failedMatches': 'failedMatches'
    };

    for (const [jsVar, htmlId] of Object.entries(elements)) {
        const el = document.getElementById(htmlId);
        if (el) {
            dom[jsVar] = el;
            console.log(`✅ Cached: ${htmlId} -> ${jsVar}`);
        } else {
            console.warn(`❌ Element with id '${htmlId}' not found for ${jsVar}`);
        }
    }
}

// --- UI UPDATE LOGIC ---
function updateUI() {
    if (!dom.systemStatus) return;
    
    const { mode, currentUser, dishLetter, isScanning, systemStatus, appData } = appState;
    
    // Update system status
    const statusMap = {
        'initializing': { text: 'CONNECTING...', class: 'bg-gray-600' },
        'online': { text: 'ONLINE', class: 'bg-emerald-500' },
        'offline': { text: 'DISCONNECTED', class: 'bg-amber-500' },
        'error': { text: 'CONNECTION ERROR', class: 'bg-red-600' },
    };
    
    const statusInfo = statusMap[systemStatus] || statusMap.offline;
    dom.systemStatus.textContent = statusInfo.text;
    dom.systemStatus.className = `absolute right-4 top-4 px-3 py-1 rounded-full text-xs font-bold text-white ${statusInfo.class}`;
    
    // Update mode buttons - FIXED: Use your HTML button styling
    if (dom.kitchenModeBtn && dom.returnModeBtn) {
        dom.kitchenModeBtn.style.background = mode === 'kitchen' ? '#ff6e96' : '#37475a';
        dom.returnModeBtn.style.background = mode === 'return' ? '#ff6e96' : '#37475a';
    }
    
    if (dom.modeStatus) {
        dom.modeStatus.textContent = mode ? `Status: ${mode.toUpperCase()} mode selected` : 'Status: Please select a mode';
    }
    
    // Update user and dish selectors
    if (dom.userSelect) dom.userSelect.disabled = !mode;
    if (dom.dishSelectorContainer) dom.dishSelectorContainer.style.display = (mode === 'kitchen') ? 'block' : 'none';
    if (dom.dishSelect) dom.dishSelect.disabled = !(mode === 'kitchen' && !!currentUser);

    // Update scan controls
    const isOnline = systemStatus === 'online';
    const canStartScan = (mode === 'kitchen' && !!currentUser && !!dishLetter) || (mode === 'return' && !!currentUser);
    
    if (dom.startScanBtn) dom.startScanBtn.disabled = !canStartScan || isScanning || !isOnline;
    if (dom.stopScanBtn) dom.stopScanBtn.disabled = !isScanning;

    // Update scan input
    if (dom.scanInput) {
        dom.scanInput.disabled = !isScanning;
        dom.scanInput.placeholder = isScanning ? "Awaiting scan..." : (canStartScan ? "Ready to scan" : "Select user/dish first...");
    }
    
    // Update counters
    const todayStr = todayDateStr();
    const preparedToday = (appData.preparedBowls || []).filter(b => b && b.creationDate === todayStr);
    const returnedToday = (appData.returnedBowls || []).filter(b => b && b.returnDate === todayStr);
    const myScansForUser = (appData.myScans || []).filter(s => s && s.user === currentUser);
    const myScansForDish = myScansForUser.filter(s => s.dish === dishLetter);
    
    if (dom.myScansCount) dom.myScansCount.textContent = (mode === 'kitchen' && dishLetter) ? myScansForDish.length : myScansForUser.length;
    if (dom.myScansDish) dom.myScansDish.textContent = (mode === 'kitchen' && dishLetter) ? dishLetter : '--';
    if (dom.preparedTodayCount) dom.preparedTodayCount.textContent = preparedToday.length;
    if (dom.activeCount) dom.activeCount.textContent = (appData.activeBowls || []).filter(Boolean).length;
    if (dom.returnedTodayCount) dom.returnedTodayCount.textContent = returnedToday.length;
    
    // Update preparation report
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

    // Update last sync info
    if (dom.lastSyncInfo) {
        dom.lastSyncInfo.textContent = appData.lastSync ? `Last sync: ${new Date(appData.lastSync).toLocaleString()}` : 'Awaiting sync...';
    }
}

// --- CORE LOGIC ---
async function handleScan(code) {
    if (!code) return;
    
    const { mode, currentUser, dishLetter, appData } = appState;
    
    // Disable input briefly to prevent double scans
    if (dom.scanInput) dom.scanInput.disabled = true;
    setTimeout(() => { 
        if (appState.isScanning && dom.scanInput) { 
            dom.scanInput.disabled = false; 
            dom.scanInput.focus(); 
        } 
    }, 500);
    
    const scanHistoryEntry = { code, user: currentUser, mode, timestamp: nowISO() };

    if (mode === 'kitchen') {
        // Remove from active bowls if exists
        const activeBowlIndex = appData.activeBowls.findIndex(b => b && b.code === code);
        if (activeBowlIndex !== -1) {
            appState.appData.activeBowls.splice(activeBowlIndex, 1);
        }

        // Remove from today's prepared bowls if exists
        const preparedBowlIndex = appData.preparedBowls.findIndex(b => b && b.code === code && b.creationDate === todayDateStr());
        if (preparedBowlIndex !== -1) {
            appData.preparedBowls.splice(preparedBowlIndex, 1);
        }
        
        // Find customer data or use defaults
        const customer = appData.customerData.find(c => c.bowl_id === code) || {};
        const newBowl = {
            code, 
            dish: dishLetter, 
            user: currentUser,
            company: customer.company || 'N/A', 
            customer: customer.customer_name || 'N/A',
            creationDate: todayDateStr(), 
            timestamp: nowISO()
        };
        
        // Add to both active and prepared bowls
        appData.activeBowls.push(newBowl);
        appData.preparedBowls.push(newBowl);
        appData.myScans.push({ user: currentUser, dish: dishLetter, code });

        if (activeBowlIndex !== -1) {
            showMessage(`✅ Bowl ${code} re-prepared for Dish ${dishLetter}.`, 'success');
        } else {
            showMessage(`✅ Prep scan OK: ${code} for Dish ${dishLetter}`, 'success');
        }
        
    } else if (mode === 'return') {
        const bowlIndex = appData.activeBowls.findIndex(b => b && b.code === code);
        if (bowlIndex === -1) {
            showMessage(`Bowl ${code} not found in active list`, 'error');
        } else {
            const [returnedBowl] = appData.activeBowls.splice(bowlIndex, 1);
            const updatedBowl = {
                ...returnedBowl, 
                returnDate: todayDateStr(), 
                returnTime: nowTimeStr(), 
                user: currentUser 
            };
            appData.returnedBowls.push(updatedBowl);
            appData.myScans.push({ user: currentUser, code });
            showMessage(`🔄 Return scan OK: ${code}`, 'success');
        }
    }

    // Add to scan history and sync
    appData.scanHistory.push(scanHistoryEntry);
    await syncData();
    updateUI();
    if (dom.scanInput) dom.scanInput.value = '';
}

function populateDropdowns() {
    const { mode } = appState;
    
    // Filter users based on mode
    const userRoleFilter = (user) => !mode ? false : 
        (mode === 'kitchen' && user.role === 'Kitchen') || 
        (mode === 'return' && user.role === 'Return');
    
    if (dom.userSelect) {
        dom.userSelect.innerHTML = '<option value="">-- Select User --</option>' + 
            USERS.filter(userRoleFilter).map(u => 
                `<option value="${u.name}">${u.name}</option>`
            ).join('');
    }
    
    // Populate dish letters
    if (dom.dishSelect) {
        const dishes = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'1234'];
        dom.dishSelect.innerHTML = '<option value="">-- Select Dish --</option>' + 
            dishes.map(d => `<option value="${d}">${d}</option>`).join('');
    }
}

// --- GLOBAL FUNCTIONS FOR HTML ONCLICK HANDLERS ---
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
    showMessage('Scanning started. Ready for barcode input.', 'info');
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

// --- EVENT LISTENER SETUP ---
function initEventListeners() {
    // Use inline onclick handlers from HTML instead of addEventListener
    console.log("✅ Using inline event handlers from HTML");
    
    // Only add listeners for elements that don't have inline handlers
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

async function processJsonPatch() {
    if (!dom.jsonInput) return;
    
    const jsonText = dom.jsonInput.value.trim();
    if (!jsonText) {
        showMessage('JSON input is empty.', 'warning');
        return;
    }

    const showResult = (message, type) => {
        if (dom.patchResultContainer && dom.patchSummary) {
            const classMap = {
                error: 'bg-red-800/50 text-red-300',
                success: 'bg-emerald-800/50 text-emerald-300',
            };
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

    let createdCount = 0;
    let updatedCount = 0;
    const today = todayDateStr();

    companiesData.forEach(company => {
        if (!company || typeof company !== 'object' || !Array.isArray(company.boxes)) {
            return;
        }

        const companyName = company.name || 'N/A';

        company.boxes.forEach(box => {
            if (!box || !Array.isArray(box.dishes)) {
                return;
            }

            let deliveryDate = today;
            if (box.uniqueIdentifier) {
                const dateMatch = box.uniqueIdentifier.match(/\d{4}-\d{2}-\d{2}/);
                if (dateMatch) {
                    deliveryDate = dateMatch[0];
                }
            }

            box.dishes.forEach(dish => {
                if (!dish || !Array.isArray(dish.bowlCodes)) {
                    return;
                }

                const customers = (dish.users && dish.users.length > 0) ?
                    dish.users.map(u => u.username).join(', ') : 'N/A';

                dish.bowlCodes.forEach(code => {
                    if (!code) return;

                    const existingBowl = appState.appData.activeBowls.find(b => b && b.code === code);

                    if (existingBowl) {
                        existingBowl.company = companyName;
                        existingBowl.customer = customers;
                        existingBowl.creationDate = deliveryDate;
                        updatedCount++;
                    } else {
                        const newBowl = {
                            code: code,
                            dish: dish.label || 'N/A',
                            company: companyName,
                            customer: customers,
                            creationDate: deliveryDate,
                            timestamp: nowISO(),
                        };
                        appState.appData.activeBowls.push(newBowl);
                        createdCount++;
                    }
                });
            });
        });
    });

    if (createdCount === 0 && updatedCount === 0) {
        showResult("⚠️ Warning: No valid bowl codes were found in the provided JSON data. Please check the data structure.", 'error');
        return;
    }

    await syncData();

    let resultMessage = `✅ JSON processed successfully.<br>`;
    resultMessage += `✨ Created <strong>${createdCount}</strong> new bowl record(s).<br>`;
    resultMessage += `🔄 Updated <strong>${updatedCount}</strong> existing bowl record(s).`;
    
    showResult(resultMessage, 'success');
    if (dom.jsonInput) dom.jsonInput.value = '';
    showMessage('Customer data applied successfully!', 'success');
    updateUI();
}

async function resetPrepared() {
    if (confirm("Are you sure you want to reset ALL prepared bowls and scan counts for TODAY? This cannot be undone.")) {
        const todayStr = todayDateStr();
        appState.appData.preparedBowls = appState.appData.preparedBowls.filter(b => b.creationDate !== todayStr);
        appState.appData.myScans = [];
        await syncData();
        updateUI();
        showMessage('Prepared data for today has been reset.', 'info');
    }
}

// --- INITIALIZATION ---
async function initializeApp() {
    console.log("🚀 Starting ProGlove Scanner App...");
    
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
                        try {
                            const firebaseData = await loadFromFirebase();
                            if (firebaseData) {
                                appState.appData = firebaseData;
                                showMessage('Data loaded from Firebase.', 'success');
                            } else {
                                appState.appData = createDefaultAppData();
                                showMessage('Firebase is empty. Starting fresh.', 'info');
                            }
                        } catch (e) {
                            console.error("Failed to load from Firebase:", e);
                            appState.systemStatus = 'error';
                            showMessage('Failed to load data from Firebase.', 'error');
                        }
                    } else {
                        appState.systemStatus = 'online';
                        showMessage('Reconnected to Firebase.', 'success');
                    }
                    updateUI();
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
            showMessage('Could not connect to Firebase. App is in read-only mode.', 'error');
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
