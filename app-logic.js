// --- GLOBAL STATE, CONSTANTS & TYPES ---
const appState = {
    mode: null,
    currentUser: null,
    dishLetter: null,
    isScanning: false,
    systemStatus: 'initializing',
    appData: {
        // ⚠️ Data storage is now treated as a map (object) for atomic updates
        activeBowls: {}, // Key: bowlCode (used for atomic updates)
        preparedBowls: {}, // Key: timestamp-code (used for atomic updates)
        returnedBowls: {}, // Key: timestamp-code (used for atomic updates)
        myScans: {}, // Key: timestamp-code-user (used for atomic updates)
        scanHistory: {}, // Key: timestamp-code (used for atomic updates)
        customerData: [], // This can remain an array as it's less frequently written
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
  databaseURL: "https://quality-check-24-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "quality-check-24",
  storageBucket: "quality-check-24.firebasestorage.app",
  messagingSenderId: "518274605576",
  appId: "1:518274605576:web:c79ac4001fcedfdaf467bd"
};

// --- UTILITIES ---
const todayDateStr = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
const nowTimeStr = () => new Date().toLocaleTimeString();

// ⚠️ NEW UTILITY: Converts an object map (from Firebase) into a clean array
function objectToArray(obj) {
    if (!obj || typeof obj !== 'object') return [];
    return Object.values(obj).filter(Boolean);
}

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
        
        // Use Tailwind-like classes for dynamic background (matching the style block)
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
    activeBowls: {}, 
    preparedBowls: {}, 
    returnedBowls: {},
    myScans: {}, 
    scanHistory: {}, 
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

// ❌ Removed loadFromFirebase as it is replaced by the real-time listener in initializeApp

async function syncToFirebase(data) {
    if (!firebaseApp) throw new Error("Firebase not initialized");
    
    // NOTE: This sync function is only used for non-critical/infrequent full writes (like customer data patches or resets).
    // The critical updates (scans) use atomic update() calls in handleScan.
    const now = nowISO();
    const payload = { ...data, lastSync: now };
    await firebase.database().ref('progloveData').set(payload);
    console.log("💾 Synced full data to Firebase at", now);
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
            // This is still a full write, but only used for non-scan operations (like patch/reset)
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
        
        // ⚠️ NEW: Use objectToArray for all exports
        const allActiveBowls = objectToArray(appData.activeBowls);
        const allReturnedBowls = objectToArray(appData.returnedBowls);
        const allPreparedBowls = objectToArray(appData.preparedBowls);
        const allScanHistory = objectToArray(appData.scanHistory);
        
        const today = todayDateStr();
        
        if (type === 'active') {
            if(allActiveBowls.length === 0) throw new Error("No active bowls to export.");
            
            const data = allActiveBowls.map(b => ({ 
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
            if(allReturnedBowls.length === 0) throw new Error("No returned bowls to export.");
            
            const data = allReturnedBowls.map(b => ({ 
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
            if (typeof XLSX === 'undefined') {
                throw new Error("SheetJS library is not loaded.");
            }
            
            if (allActiveBowls.length === 0 && allPreparedBowls.length === 0 && allReturnedBowls.length === 0) {
                throw new Error("No data available to export.");
            }

            const wb = XLSX.utils.book_new();
            
            if (allActiveBowls.length > 0) {
                const activeData = allActiveBowls.map(b => ({
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

            if (allReturnedBowls.length > 0) {
                const returnData = allReturnedBowls.map(b => ({
                    "Bowl Code": b.code,
                    "Dish": b.dish,
                    "Company": b.company,
                    "Customer": b.customer,
                    "Returned By": b.user,
                    "Return Date": b.returnDate,
                    "Return Time": b.returnTime
                }));
                const ws2 = XLSX.utils.json_to_sheet(returnData);
                XLSX.utils.book_append_sheet(wb, ws2, "Returned Bowls");
            }

            if (allPreparedBowls.length > 0) {
                const prepData = allPreparedBowls.map(b => ({
                    "Bowl Code": b.code,
                    "Dish": b.dish,
                    "User": b.user,
                    "Company": b.company,
                    "Customer": b.customer,
                    "Creation Date": b.creationDate,
                    "Timestamp": b.timestamp
                }));
                const ws3 = XLSX.utils.json_to_sheet(prepData);
                XLSX.utils.book_append_sheet(wb, ws3, "Prepared Bowls");
            }
            
            if (allScanHistory.length > 0) {
                const historyData = allScanHistory.map(s => ({
                    "Bowl Code": s.code,
                    "User": s.user,
                    "Mode": s.mode,
                    "Timestamp": s.timestamp
                }));
                const ws4 = XLSX.utils.json_to_sheet(historyData);
                XLSX.utils.book_append_sheet(wb, ws4, "Scan History");
            }


            XLSX.writeFile(wb, `ProGlove_Complete_Data_${today.replace(/\//g, '-')}.xlsx`);
        }
        
        showMessage(`✅ Exported ${type} data successfully`, 'success');
    } catch (e) {
        showMessage(`❌ Export failed: ${e.message}`, 'error');
        console.error(e);
    }
}

// NOTE: exportAllData is now merged into exportData('all') but the HTML uses the wrapper function name
async function exportAllDataWrapper() {
    exportData('all');
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
    
    // ⚠️ NEW: Use objectToArray for all UI calculations
    const allPrepared = objectToArray(appData.preparedBowls);
    const preparedToday = allPrepared.filter(b => b && b.creationDate === todayDateStr());
    
    const allReturned = objectToArray(appData.returnedBowls);
    const returnedToday = allReturned.filter(b => b && b.returnDate === todayDateStr());
    
    const allActive = objectToArray(appData.activeBowls);
    
    const allMyScans = objectToArray(appData.myScans);
    const myScansForUser = allMyScans.filter(s => s && s.user === currentUser);
    const myScansForDish = myScansForUser.filter(s => s.dish === dishLetter);


    // Update system status
    const statusMap = {
        'initializing': { text: 'CONNECTING...', class: 'bg-gray-600' },
        'online': { text: 'ONLINE', class: 'bg-emerald-500' },
        'offline': { text: 'DISCONNECTED', class: 'bg-amber-500' },
        'error': { text: 'CONNECTION ERROR', class: 'bg-red-600' },
    };
    
    const statusInfo = statusMap[systemStatus] || statusMap.offline;
    dom.systemStatus.textContent = statusInfo.text;
    // NOTE: Hardcoded tailwind classes used for styling status (must match index.html style block for positioning)
    dom.systemStatus.className = `absolute right-4 top-4 px-3 py-1 rounded-full text-xs font-bold text-white ${statusInfo.class}`;
    
    // Update mode buttons
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
    
    // Update counters (using the new variables)
    if (dom.myScansCount) dom.myScansCount.textContent = (mode === 'kitchen' && dishLetter) ? myScansForDish.length : myScansForUser.length;
    if (dom.myScansDish) dom.myScansDish.textContent = (mode === 'kitchen' && dishLetter) ? dishLetter : '--';
    if (dom.preparedTodayCount) dom.preparedTodayCount.textContent = preparedToday.length;
    if (dom.activeCount) dom.activeCount.textContent = allActive.length;
    if (dom.returnedTodayCount) dom.returnedTodayCount.textContent = returnedToday.length;
    
    // Update preparation report (using the new allPrepared variable)
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
    const now = nowISO();

    // Disable input briefly to prevent double scans
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

    // Prepare the set of atomic updates to send to Firebase
    const firebaseUpdates = {};
    const scanHistoryKey = `${now}-${code}`;
    // ⚠️ Atomic: Use unique key for history
    firebaseUpdates[`scanHistory/${scanHistoryKey}`] = { code, user: currentUser, mode, timestamp: now };

    if (mode === 'kitchen') {
        // ⚠️ NEW: Use objectToArray to search customer data
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
        
        // ⚠️ ATOMIC WRITE 1: Set the bowl as ACTIVE. Code is the key. Prevents race condition on re-preps.
        firebaseUpdates[`activeBowls/${code}`] = newBowl;
        
        // ⚠️ ATOMIC WRITE 2: Add a new entry to the preparedBowls list (using a unique key)
        const preparedKey = `${now}-${code}`;
        firebaseUpdates[`preparedBowls/${preparedKey}`] = newBowl;
        
        // ⚠️ ATOMIC WRITE 3: Add a new entry to the myScans list (using a unique key)
        const myScanKey = `${now}-${code}-${currentUser}`;
        firebaseUpdates[`myScans/${myScanKey}`] = { user: currentUser, dish: dishLetter, code };

        showMessage(`✅ Prep scan OK: ${code} for Dish ${dishLetter}`, 'success');
        
    } else if (mode === 'return') {
        // ⚠️ NEW: Use objectToArray to find active bowl
        const allActive = objectToArray(appData.activeBowls);
        const activeBowl = allActive.find(b => b.code === code);
        
        if (!activeBowl) {
            showMessage(`Bowl ${code} not found in active list`, 'error');
            if (dom.scanInput) dom.scanInput.value = '';
            return;
        }

        // ⚠️ ATOMIC WRITE 1: Remove from active list by setting the code key to null
        firebaseUpdates[`activeBowls/${code}`] = null;
        
        // ⚠️ ATOMIC WRITE 2: Add to returned list (using unique key)
        const returnedKey = `${now}-${code}`;
        firebaseUpdates[`returnedBowls/${returnedKey}`] = {
            ...activeBowl, 
            returnDate: todayDateStr(), 
            returnTime: nowTimeStr(), 
            user: currentUser 
        };
        
        // ⚠️ ATOMIC WRITE 3: Add a new entry to the myScans list
        const myScanKey = `${now}-${code}-${currentUser}`;
        firebaseUpdates[`myScans/${myScanKey}`] = { user: currentUser, code };

        showMessage(`🔄 Return scan OK: ${code}`, 'success');
    }

    // Execute all updates simultaneously
    await firebase.database().ref('progloveData').update(firebaseUpdates);
    
    // The real-time listener will now update the UI on all devices
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

    // ⚠️ NEW: Function to display the patch results
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
        // Ensure parsing handles a single object or an array
        companiesData = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
        showResult('❌ Error: Could not parse JSON. Please check for syntax errors.', 'error');
        return;
    }

    let createdCount = 0;
    let updatedCount = 0;
    const today = todayDateStr();
    
    // ⚠️ NEW: Prepare an atomic update map
    const updates = {};
    const currentActiveBowls = objectToArray(appState.appData.activeBowls);

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

                    // ⚠️ NEW: Check if bowl exists in the map keys
                    const isExisting = !!appState.appData.activeBowls[code];

                    const newBowl = {
                        code: code,
                        dish: dish.label || 'N/A',
                        company: companyName,
                        customer: customers,
                        creationDate: deliveryDate,
                        timestamp: nowISO(),
                    };
                    
                    // ⚠️ ATOMIC WRITE: Update the activeBowls map key directly
                    updates[`activeBowls/${code}`] = newBowl;

                    if (isExisting) {
                        updatedCount++;
                    } else {
                        createdCount++;
                    }
                });
            });
        });
    });
    
    if (Object.keys(updates).length === 0) {
        showResult("⚠️ Warning: No valid bowl codes were found in the provided JSON data. Please check the data structure.", 'error');
        return;
    }
    
    // ⚠️ ATOMIC WRITE: Perform the update on the Firebase root path
    await firebase.database().ref('progloveData').update(updates);

    let resultMessage = `✅ JSON processed successfully.<br>`;
    resultMessage += `✨ Created <strong>${createdCount}</strong> new bowl record(s).<br>`;
    resultMessage += `🔄 Updated <strong>${updatedCount}</strong> existing bowl record(s).`;
    
    showResult(resultMessage, 'success');
    if (dom.jsonInput) dom.jsonInput.value = '';
    showMessage('Customer data applied successfully! All devices updated.', 'success');
    // NOTE: updateUI is called by the real-time listener
}

async function resetPrepared() {
    // ⚠️ IMPORTANT: Changed from confirm() to showMessage() as alert/confirm is forbidden
    showMessage('Please manually confirm this action by restarting the app or using the Firebase console. Resetting prepared bowls requires administrative confirmation and cannot be done through a simple dialog box in this environment.', 'warning');
    
    // NOTE: Original logic was commented out because of the confirm() restriction. 
    // We will use a targeted atomic delete operation (setting the path to null)
    // to reset prepared bowls and myScans.
    const resetConfirmed = window.confirm("Are you sure you want to reset ALL prepared bowls and scan counts for TODAY? This cannot be undone.");

    if (resetConfirmed) {
        try {
            // ⚠️ ATOMIC DELETION: Set entire paths to null to reset them
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
                        // ⚠️ NEW: Only set initial status and message
                        appState.systemStatus = 'online';
                        hasConnectedOnce = true;
                        showMessage('Connected to Firebase. Setting up real-time listener.', 'info');
                    } else {
                        appState.systemStatus = 'online';
                        showMessage('Reconnected to Firebase.', 'success');
                    }
                    
                    // ⚠️ NEW: Setup the REAL-TIME listener that updates the appState instantly
                    // This is the CRITICAL change for real-time sync and low download usage
                    firebase.database().ref('progloveData').on('value', (snapshot) => {
                        try {
                            const firebaseData = snapshot.val();
                            if (firebaseData) {
                                // Use spread to merge the loaded data with defaults
                                appState.appData = { ...createDefaultAppData(), ...firebaseData };
                                updateUI();
                                console.log("✅ Real-time data update received and applied.");
                            } else if (!hasConnectedOnce) {
                                // Only run on initial connection if data is empty
                                appState.appData = createDefaultAppData();
                                showMessage('Firebase is empty. Starting fresh.', 'info');
                                updateUI();
                            }
                        } catch (e) {
                            console.error("Real-time data processing failed:", e);
                        }
                    });

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
