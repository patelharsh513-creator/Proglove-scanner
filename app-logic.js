// --- GLOBAL STATE, CONSTANTS & TYPES ---
const appState = {
    mode: null,
    currentUser: null,
    dishLetter: null,
    isScanning: false,
    systemStatus: 'initializing',
    appData: {
        // ⚠️ LARGE DATA MAPS REMOVED: activeBowls, preparedBowls, returnedBowls are NOT fully synced locally.
        
        // KEEP: Minimal required local data
        myScans: {}, // For local user's scan count
        scanHistory: {}, // For debugging/tracking history (still relatively small)
        customerData: [], // For JSON patch data (small array, changes infrequently)
        lastSync: null,
        
        // 🚀 NEW FOCUSED LOCAL CACHE: Only bowls prepared *today* for the Live Prep Report
        preparedTodayCache: {}, 
        
        // 🚀 NEW LOCAL COUNTS (Maintained by targeted Firebase listeners: Count, Don't Download)
        activeCount: 0,
        preparedTodayCount: 0,
        returnedTodayCount: 0,
    }
};

// --- GLOBAL DOM REFERENCES ---
const dom = {}; // Global object to hold all cached DOM elements

// --- DOM CACHE ---
function cacheDOMElements() {
    // Status and UI controls
    dom.systemStatus = document.getElementById('systemStatus');
    dom.kitchenBtn = document.getElementById('kitchenBtn');
    dom.returnBtn = document.getElementById('returnBtn');
    dom.modeDisplay = document.getElementById('modeDisplay');
    dom.userSelect = document.getElementById('userSelect');
    dom.dishSelect = document.getElementById('dishSelect');
    dom.dishWrapper = document.getElementById('dishWrapper');
    dom.startBtn = document.getElementById('startBtn');
    dom.stopBtn = document.getElementById('stopBtn');
    dom.scanInput = document.getElementById('scanInput');
    dom.prepLabel = document.getElementById('prepLabel');

    // Counters
    dom.myScansCount = document.getElementById('myScansCount');
    dom.myScansDish = document.getElementById('myDishLetter');
    dom.preparedTodayCount = document.getElementById('preparedTodayCount');
    dom.activeCount = document.getElementById('activeCount');
    dom.returnedTodayCount = document.getElementById('returnedCount');
    
    // Report
    dom.livePrepReportBody = document.getElementById('livePrepReportBody');
    
    // Data Management
    dom.lastSyncInfo = document.getElementById('lastSyncInfo');
    dom.jsonInput = document.getElementById('jsonData');
    dom.patchResultContainer = document.getElementById('patchResults');
    dom.patchSummary = document.getElementById('patchSummary');
    dom.messageContainer = document.getElementById('messageContainer'); // For showMessage fallback

    console.log("✅ DOM elements cached.");
}


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

// Converts an object map (from Firebase) into a clean array
function objectToArray(obj) {
    if (!obj || typeof obj !== 'object') return [];
    return Object.values(obj).filter(Boolean);
}

/**
 * Encodes a string to be safely used as a Firebase Realtime Database key.
 * FIX: Switched from encodeURIComponent (which yields forbidden % characters) 
 * to a custom substitution method that is Firebase-safe.
 * @param {string} key - The string to encode (e.g., bowl code/URL).
 * @returns {string} The Firebase-safe string.
 */
function encodeFirebaseKey(key) {
    if (!key) return '';
    // Replace all forbidden characters and URL-specific characters with underscores
    // Forbidden: ., #, $, /, [, ], %
    // URL-specific: : (colon), ? (query), = (equals), & (ampersand)
    return key
        .replace(/[.#$/[\]%?:&=]/g, '_')
        // Replace spaces with underscores
        .replace(/\s/g, '_');
}

function showMessage(text, type = 'info') {
    try {
        // Use cached element
        const container = dom.messageContainer; 
        if (!container) {
            console.log(`${type}: ${text}`);
            return;
        }
        
        const el = document.createElement('div');
        const bgMap = {
            success: 'background:var(--accent-green);',
            error: 'background:var(--accent-red);',
            info: 'background:#7986cb;', // Indigo-like
            warning: 'background:#ffc107; color:#333'
        };

        // Simplified class/style mapping to match the HTML's internal style block
        el.style.cssText = `position:relative;margin-bottom:10px;padding:12px 18px;border-radius:8px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.2);font-weight:600;color:var(--text);${bgMap[type] || bgMap.info}`;
        el.innerText = text;
        container.appendChild(el);
        
        setTimeout(() => {
            try { 
                if (container.contains(el)) {
                    container.removeChild(el); 
                }
            } catch (e) {}
        }, 4000);
    } catch (e) { 
        console.error("showMessage error:", e);
        console.log(`${type}: ${text}`);
    }
}


// --- DATA & FIREBASE SERVICE ---
let firebaseApp = null;
let syncTimeout = null;

const createDefaultAppData = () => ({
    myScans: {}, 
    scanHistory: {}, 
    customerData: [], 
    preparedTodayCache: {}, // New Cache
    activeCount: 0, // New Count
    preparedTodayCount: 0, // New Count
    returnedTodayCount: 0, // New Count
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

// ⚠️ syncToFirebase is only used for non-scan, full-data writes (Patch/Reset)
async function syncToFirebase(data) {
    if (!firebaseApp) throw new Error("Firebase not initialized");
    
    // NOTE: We only sync the non-count data points.
    const now = nowISO();
    const payload = { 
        customerData: data.customerData,
        lastSync: now 
    };
    await firebase.database().ref('progloveData').update(payload); // Use update for less data overwrite
    console.log("💾 Synced partial data to Firebase at", now);
    return now;
}

/**
 * Forces a manual count of activeBowls directly from the database to correct 
 * any discrepancies caused by mass updates triggering unreliable child_added/removed events.
 * This is the fix for the counter corruption issue after a large JSON patch.
 */
async function refreshActiveCount() {
    if (!firebaseApp) return;

    try {
        // Force a one-time read of all active bowls just to get the *count*
        const snapshot = await firebase.database().ref('progloveData/activeBowls').once('value');
        const count = snapshot.numChildren();
        
        // Overwrite the potentially corrupted local counter
        appState.appData.activeCount = count;
        updateUI();
        console.log(`✅ Active Count forced refresh: ${count}`);
    } catch (e) {
        console.error("Failed to refresh active count:", e);
    }
}

async function exportData(type) {
    try {
        const dbRef = firebase.database().ref('progloveData');
        let data, sheetName, fileName;
        const today = todayDateStr();
        const wb = XLSX.utils.book_new();

        if (type === 'active') {
            // 🎯 TARGETED READ: Read all active bowls directly from the server for export
            const snapshot = await dbRef.child('activeBowls').once('value');
            const allActiveBowls = objectToArray(snapshot.val());
            if(allActiveBowls.length === 0) throw new Error("No active bowls to export.");
            
            data = allActiveBowls.map(b => ({ 
                // NOTE: Display original code for export/display purposes
                "Bowl Code": b.code, 
                "Dish": b.dish, 
                "Company": b.company, 
                "Customer": b.customer, 
                "Creation Date": b.creationDate, 
                "Missing Days": `${Math.ceil((new Date().getTime() - new Date(b.creationDate).getTime()) / 864e5)} days` 
            }));
            sheetName = "Active Bowls";
            fileName = "Active_Bowls.xlsx";

        } else if (type === 'returns') {
             // 🎯 TARGETED READ: Read all returned bowls directly from the server for export
            const snapshot = await dbRef.child('returnedBowls').once('value');
            const allReturnedBowls = objectToArray(snapshot.val());
            if(allReturnedBowls.length === 0) throw new Error("No returned bowls to export.");
            
            data = allReturnedBowls.map(b => ({ 
                // NOTE: Display original code for export/display purposes
                "Bowl Code": b.code, 
                "Dish": b.dish, 
                "Company": b.company, 
                "Customer": b.customer, 
                "Returned By": b.user, 
                "Return Date": b.returnDate, 
                "Return Time": b.returnTime 
            }));
            sheetName = "Returned Bowls";
            fileName = "Returned_Bowls.xlsx";

        } else if (type === 'all') {
            if (typeof XLSX === 'undefined') {
                throw new Error("SheetJS library is not loaded.");
            }
            
            // 🎯 TARGETED READS for ALL lists
            const [activeSnap, returnedSnap, preparedSnap, historySnap] = await Promise.all([
                dbRef.child('activeBowls').once('value'),
                dbRef.child('returnedBowls').once('value'),
                dbRef.child('preparedBowls').once('value'),
                dbRef.child('scanHistory').once('value'),
            ]);
            
            const allActiveBowls = objectToArray(activeSnap.val());
            const allReturnedBowls = objectToArray(returnedSnap.val());
            const allPreparedBowls = objectToArray(preparedSnap.val());
            const allScanHistory = objectToArray(historySnap.val());
            
            if (allActiveBowls.length === 0 && allPreparedBowls.length === 0 && allReturnedBowls.length === 0) {
                throw new Error("No data available to export.");
            }
            
            if (allActiveBowls.length > 0) {
                const activeData = allActiveBowls.map(/* ... mapping logic ... */ b => ({
                    "Bowl Code": b.code,
                    "Dish": b.dish,
                    "Company": b.company,
                    "Customer": b.customer,
                    "Creation Date": b.creationDate,
                    "Missing Days": `${Math.ceil((new Date().getTime() - new Date(b.creationDate).getTime()) / 864e5)} days`
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activeData), "Active Bowls");
            }

            if (allReturnedBowls.length > 0) {
                const returnData = allReturnedBowls.map(/* ... mapping logic ... */ b => ({
                    "Bowl Code": b.code,
                    "Dish": b.dish,
                    "Company": b.company,
                    "Customer": b.customer,
                    "Returned By": b.user,
                    "Return Date": b.returnDate,
                    "Return Time": b.returnTime
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(returnData), "Returned Bowls");
            }

            if (allPreparedBowls.length > 0) {
                const prepData = allPreparedBowls.map(b => ({
                    "Bowl Code": b.code,
                    "Dish": b.dish,
                    // REMOVED USER, COMPANY, CUSTOMER, CREATION DATE, TIMESTAMP from export 
                    // as they are no longer stored in the simplified preparedBowls object
                }));
                // ⚠️ NOTE: The export mapping for Prepared Bowls is now simplified to reflect the new minimal data structure.
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prepData), "Prepared Bowls");
            }
            
            if (allScanHistory.length > 0) {
                const historyData = allScanHistory.map(/* ... mapping logic ... */ s => ({
                    "Bowl Code": s.code,
                    "User": s.user,
                    "Mode": s.mode,
                    "Timestamp": s.timestamp
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(historyData), "Scan History");
            }

            XLSX.writeFile(wb, `ProGlove_Complete_Data_${today.replace(/\//g, '-')}.xlsx`);
            showMessage(`✅ Exported ALL data successfully`, 'success');
            return; // Exit early since we handle write
        }
        
        // General export for 'active' and 'returns'
        if(data && data.length > 0) {
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            XLSX.writeFile(wb, fileName);
            showMessage(`✅ Exported ${type} data successfully`, 'success');
        } else {
            throw new Error(`No ${type} data available.`);
        }
    } catch (e) {
        showMessage(`❌ Export failed: ${e.message}`, 'error');
        console.error(e);
    }
}
async function exportAllData() { exportData('all'); }
async function exportActiveBowls() { exportData('active'); }
async function exportReturnData() { exportData('returns'); }


// --- UI UPDATE LOGIC ---
function updateUI() {
    if (!dom.systemStatus) return; // Check required because this is called before DOM cache is done

    const { mode, currentUser, dishLetter, isScanning, systemStatus, appData } = appState;
    
    // ⚠️ Counters now read directly from the fast-updating local count variables
    const activeCount = appData.activeCount;
    // 🚀 FIX: Calculate preparedTodayCount directly from the unique keys in the cache
    const preparedTodayCount = Object.keys(appData.preparedTodayCache).length;
    const returnedTodayCount = appData.returnedTodayCount;
    
    // The following two are still filtered from the small local caches:
    const allMyScans = objectToArray(appData.myScans);
    const myScansForUser = allMyScans.filter(s => s && s.user === currentUser);
    const myScansForDish = myScansForUser.filter(s => s.dish === dishLetter);

    // Update system status display
    dom.systemStatus.textContent = `${systemStatus.toUpperCase()}`;
    dom.systemStatus.style.background = systemStatus === 'online' ? 'var(--accent-green)' : (systemStatus === 'offline' ? 'var(--accent-red)' : '#6b7280');
    dom.systemStatus.style.color = systemStatus === 'online' ? '#0f1724' : 'var(--text)';

    // Update mode buttons and display
    if (dom.kitchenBtn) {
        dom.kitchenBtn.disabled = systemStatus !== 'online';
        dom.kitchenBtn.classList.toggle('btn-green', mode === 'kitchen');
        dom.kitchenBtn.classList.toggle('btn-green', mode === 'kitchen');
    }
    if (dom.returnBtn) {
        dom.returnBtn.disabled = systemStatus !== 'online';
        dom.returnBtn.classList.toggle('btn-green', mode === 'return');
    }

    if (dom.modeDisplay) dom.modeDisplay.textContent = `Status: ${mode ? (mode === 'kitchen' ? 'Kitchen Prep Mode' : 'Return Scan Mode') : 'Please select a mode'}`;
    if (dom.prepLabel) dom.prepLabel.textContent = mode === 'kitchen' ? 'Prepared Today' : 'Scanned Back Today';

    // Update user/dish selection (simplified for brevity, ensure all are handled)
    if (dom.userSelect) dom.userSelect.disabled = !mode || systemStatus !== 'online';
    if (dom.dishSelect) dom.dishSelect.disabled = mode !== 'kitchen' || !currentUser || systemStatus !== 'online';
    if (dom.startBtn) dom.startBtn.disabled = (mode === 'kitchen' && !dishLetter) || !currentUser || isScanning || systemStatus !== 'online';
    if (dom.stopBtn) dom.stopBtn.disabled = !isScanning;
    if (dom.scanInput) dom.scanInput.disabled = !isScanning;

    // Update counters (using the new variables)
    if (dom.myScansCount) dom.myScansCount.textContent = (mode === 'kitchen' && dishLetter) ? myScansForDish.length : myScansForUser.length;
    if (dom.myScansDish) dom.myScansDish.textContent = (mode === 'kitchen' && dishLetter) ? dishLetter : '--';
    if (dom.preparedTodayCount) dom.preparedTodayCount.textContent = preparedTodayCount; // 🚀 FAST COUNT (Calculated from unique cache)
    if (dom.activeCount) dom.activeCount.textContent = activeCount; // 🚀 FAST COUNT
    if (dom.returnedTodayCount) dom.returnedTodayCount.textContent = returnedTodayCount; // 🚀 FAST COUNT
    
    // Update preparation report (using the NEW, small preparedTodayCache)
    if (dom.livePrepReportBody) {
        // Use objectToArray on the local preparedTodayCache (only today's data)
        const preparedToday = objectToArray(appState.appData.preparedTodayCache); 
        
        // This report relies only on the minimal 'dish' and 'user' properties now
        const prepReport = preparedToday.reduce((acc, bowl) => {
            // Note: The preparedTodayCache item only contains code, dish, user, creationDate, and timestamp now
            const key = `${bowl.dish}__${bowl.user}`;
            if (!acc[key]) acc[key] = { dish: bowl.dish, user: bowl.user, count: 0 };
            acc[key].count++;
            return acc;
        }, {});

        const sortedReport = Object.values(prepReport).sort((a,b) => a.dish.localeCompare(b.dish) || a.user.localeCompare(b.user));
        dom.livePrepReportBody.innerHTML = sortedReport.length > 0 ? 
            sortedReport.map(row => `
                <tr>
                    <td style="padding:8px;font-weight:bold">${row.dish}</td>
                    <td style="padding:8px">${row.user}</td>
                    <td style="padding:8px;text-align:right">${row.count}</td>
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
    
    const { mode, currentUser, dishLetter } = appState;
    const now = nowISO();

    // Use cached element
    if (dom.scanInput) dom.scanInput.disabled = true;
    setTimeout(() => { 
        // Use cached element
        if (appState.isScanning && dom.scanInput) { 
            dom.scanInput.disabled = false; 
            dom.scanInput.focus(); 
        } 
    }, 500);

    if (appState.systemStatus !== 'online') {
        showMessage('Cannot scan: App is disconnected.', 'error');
        // Use cached element
        if (dom.scanInput) dom.scanInput.value = '';
        return;
    }
    
    // Mode-specific validation
    if (mode === 'kitchen' && !dishLetter) {
        showMessage('Please select a Dish Letter before scanning in Kitchen Prep Mode.', 'warning');
        if (dom.scanInput) dom.scanInput.value = '';
        return;
    }
    if (!currentUser) {
         showMessage('Please select a User before scanning.', 'warning');
        if (dom.scanInput) dom.scanInput.value = '';
        return;
    }

    // 🚀 FIX: Encode the code for use as a Firebase Key
    const firebaseKey = encodeFirebaseKey(code);
    
    // Look up customer data from the local customerData array (Best performance for an array)
    // NOTE: This array is synced once on startup and on patch, avoiding a slow Firebase query.
    const customer = appState.appData.customerData.find(c => c.bowl_id === code) || {};


    // Prepare the set of ATOMIC UPDATES to send to Firebase
    const firebaseUpdates = {};
    
    // FIX: Sanitize the ISO timestamp by removing forbidden characters (:, .)
    const safeNow = now.replace(/[:.]/g, ''); 
    
    const historyCodeKey = encodeFirebaseKey(code);
    // FIX: Use the safe timestamp for the key!
    const scanHistoryKey = `${safeNow}-${historyCodeKey}`; 
    firebaseUpdates[`scanHistory/${scanHistoryKey}`] = { code, user: currentUser, mode, timestamp: now };

    if (mode === 'kitchen') {
        
        // --- DUPLICATE CHECK ---
        let isDuplicate = false;
        if (appState.appData.preparedTodayCache[code]) {
             showMessage(`⚠️ Bowl ${code} already scanned for Dish ${dishLetter} today. Scan recorded for audit, but check item.`, 'warning');
             isDuplicate = true;
        } else {
             showMessage(`✅ Prep scan OK: ${code} for Dish ${dishLetter}`, 'success');
        }

        // --- SIMPLIFIED PAYLOAD FOR AUDIT LISTS ---
        // As requested: Only store VYT URL (code), Dish Letter, User, and minimal tracking data
        const newPreparedAudit = {
            code, 
            dish: dishLetter, 
            user: currentUser,
            creationDate: todayDateStr(), 
            timestamp: now
        };
        
        // --- FULL PAYLOAD FOR ACTIVE BOWLS (Retains all customer data from patch) ---
        // When a new Active Bowl is created/updated by the kitchen scan, it should retain 
        // the rich customer data fetched locally, if available. If no customer data is found, 
        // it retains the minimal data from the prep scan.
        const newActiveBowl = {
            code, 
            dish: dishLetter, 
            user: currentUser,
            company: customer.company || 'N/A', 
            customer: customer.customer_name || 'N/A',
            creationDate: todayDateStr(), 
            timestamp: now
        };
        
        // ⚠️ ATOMIC WRITE 1: Set the bowl as ACTIVE. (Uses rich data to enable return tracking/export)
        firebaseUpdates[`activeBowls/${firebaseKey}`] = newActiveBowl;
        
        // ⚠️ ATOMIC WRITE 2: Add a new entry to the preparedBowls list (using minimal data)
        const preparedKey = `${safeNow}-${firebaseKey}`; 
        firebaseUpdates[`preparedBowls/${preparedKey}`] = newPreparedAudit; // Uses simplified object
        
        // ⚠️ ATOMIC WRITE 3: Add a new entry to the myScans list (using minimal data)
        const myScanKey = `${safeNow}-${firebaseKey}-${currentUser}`; 
        firebaseUpdates[`myScans/${myScanKey}`] = { user: currentUser, dish: dishLetter, code }; // Uses minimal object
        
        // --- MANUAL SYNCHRONOUS CACHE UPDATE ---
        // Update the local cache with the minimal data required for duplicate checking (code/dish/user)
        appState.appData.preparedTodayCache[code] = newPreparedAudit;
        
        // Note: The 'Prepared Today' counter updates via the Firebase listener (on line 938)
        // which prevents the count from increasing on the second scan (duplicate) because
        // it checks if the entry is already in the preparedTodayCache (which it now is, instantly).
        
    } else if (mode === 'return') {
        
        // 1. 🎯 TARGETED READ: Fetch only the specific active bowl from Firebase for validation. Use encoded key.
        const bowlRef = firebase.database().ref(`progloveData/activeBowls/${firebaseKey}`);
        const snapshot = await bowlRef.once('value'); // FASTEST one-time read
        const activeBowl = snapshot.val(); 
        
        if (!activeBowl) {
            // Check works directly on the database result
            showMessage(`Bowl ${code} not found in active list (Check DB)`, 'error');
            // Use cached element
            if (dom.scanInput) dom.scanInput.value = '';
            return;
        }

        // ⚠️ ATOMIC WRITE 1: Remove from active list by setting the code key to null (Targeted Delete). Use encoded key.
        firebaseUpdates[`activeBowls/${firebaseKey}`] = null;
        
        // ⚠️ ATOMIC WRITE 2: Add to returned list (using unique key). Keeps original rich data from activeBowl.
        const returnedKey = `${safeNow}-${firebaseKey}`; 
        firebaseUpdates[`returnedBowls/${returnedKey}`] = {
            ...activeBowl, 
            returnDate: todayDateStr(), 
            returnTime: nowTimeStr(), 
            user: currentUser 
        };
        
        // ⚠️ ATOMIC WRITE 3: Add a new entry to the myScans list
        const myScanKey = `${safeNow}-${firebaseKey}-${currentUser}`; 
        firebaseUpdates[`myScans/${myScanKey}`] = { user: currentUser, code };

        showMessage(`🔄 Return scan OK: ${code}`, 'success');
    }

    // Execute all updates simultaneously (ATOMIC COMMIT)
    try {
        await firebase.database().ref('progloveData').update(firebaseUpdates);
    } catch (e) {
        // FIX: Ensured the detailed error is logged to the console for diagnosis
        console.error("Firebase atomic update failed:", e);
        showMessage('Error: Could not save scan. Check connection.', 'error');
    }
    
    // Use cached element
    if (dom.scanInput) dom.scanInput.value = '';
    
    // 🚀 FIX: Force UI update here to reflect the cache change, which now drives the counter
    updateUI();
}

// --- DROPDOWN & MODE CONTROL FUNCTIONS (Definitions moved up to prevent ReferenceError) ---

function populateDropdowns() {
    // Populate User Dropdown
    if (dom.userSelect) {
        dom.userSelect.innerHTML = '<option value="">-- Select User --</option>';
        // Filter users based on the selected mode
        const usersInMode = USERS.filter(u => u.role.toLowerCase().includes(appState.mode));
        usersInMode.forEach(user => {
            const option = document.createElement('option');
            option.value = user.name;
            option.textContent = `${user.name} (${user.role})`;
            dom.userSelect.appendChild(option);
        });
        dom.userSelect.value = appState.currentUser || '';
    }

    // Populate Dish Dropdown
    if (dom.dishSelect) {
        dom.dishSelect.innerHTML = '<option value="">-- Select Dish --</option>';
        const dishes = ['A', 'B', 'C', 'D', '1', '2', '3', '4']; // Example dish letters/numbers
        dishes.forEach(dish => {
            const option = document.createElement('option');
            option.value = dish;
            option.textContent = `Dish ${dish}`;
            dom.dishSelect.appendChild(option);
        });
        dom.dishSelect.value = appState.dishLetter || '';
    }
}

function stopScanning() {
    if (!appState.isScanning) return;
    
    appState.isScanning = false;
    showMessage('Scanner stopped.', 'info');
    
    // Update button states using cached DOM elements
    dom.startBtn.disabled = false;
    dom.stopBtn.disabled = true;
    dom.scanInput.disabled = true;
    dom.scanInput.value = '';
    dom.scanInput.placeholder = 'Select user and press START...';

    // Re-enable user/dish selection based on mode and system status
    if (appState.systemStatus === 'online') {
        dom.userSelect.disabled = false;
        if (appState.mode === 'kitchen') dom.dishSelect.disabled = false;
    }
    
    updateUI();
}

function setMode(mode) {
    if (appState.systemStatus !== 'online') {
        showMessage('Cannot change mode while offline.', 'error');
        return;
    }

    appState.mode = mode;
    appState.currentUser = null;
    appState.dishLetter = null;
    stopScanning(); // Stop scanning when mode changes

    // Update buttons using cached DOM elements
    dom.kitchenBtn.classList.toggle('btn-green', mode === 'kitchen');
    dom.returnBtn.classList.toggle('btn-green', mode === 'return');

    // Update UI elements
    dom.modeDisplay.textContent = `Status: ${mode === 'kitchen' ? 'Kitchen Prep Mode' : 'Return Scan Mode'}. Please select your user.`;
    dom.userSelect.disabled = false;
    dom.userSelect.value = '';
    
    // Toggle Dish selection visibility/functionality
    if (mode === 'kitchen') {
        dom.dishWrapper.style.display = 'block';
        dom.dishSelect.disabled = true; // Disable until user is selected
        dom.prepLabel.textContent = 'Prepared Today';
    } else {
        dom.dishWrapper.style.display = 'none';
        dom.dishSelect.disabled = true;
        dom.prepLabel.textContent = 'Returned Today';
    }

    // Update user dropdown content based on selected mode
    populateDropdowns();
    updateUI();
}

function startScanning() {
    if (appState.isScanning) return;
    
    // Pre-flight checks use cached elements
    if (appState.mode === 'kitchen' && !appState.dishLetter) {
        showMessage('Please select a Dish Letter before starting the scanner.', 'warning');
        return;
    }
    if (!appState.currentUser) {
        showMessage('Please select a User before starting the scanner.', 'warning');
        return;
    }

    appState.isScanning = true;
    showMessage(`Scanner started in ${appState.mode.toUpperCase()} mode. Ready for scan!`, 'info');
    
    // Update button states using cached DOM elements
    dom.startBtn.disabled = true;
    dom.stopBtn.disabled = false;
    dom.scanInput.disabled = false;
    dom.scanInput.placeholder = `Scanning as ${appState.currentUser}...`;
    dom.scanInput.focus();
    
    // Disable user/dish selection while scanning
    dom.userSelect.disabled = true;
    if (dom.dishSelect) dom.dishSelect.disabled = true;
    
    updateUI();
}


function selectUser() {
    // Use cached element
    appState.currentUser = dom.userSelect.value || null;
    appState.isScanning = false; // Reset scan state
    stopScanning(); // Will update button states and input focus

    if (appState.mode === 'kitchen') {
        // Only enable dish selection if a user is chosen
        dom.dishSelect.disabled = !appState.currentUser;
        if (!appState.currentUser) dom.dishSelect.value = '';
    } else {
        // Enable start button directly for return mode (stopScanning handles re-enabling)
        dom.startBtn.disabled = !appState.currentUser;
    }
    
    if (appState.currentUser) {
        showMessage(`User selected: ${appState.currentUser}.`, 'info');
    }
    updateUI();
}

function selectDishLetter() {
    // Use cached element
    appState.dishLetter = dom.dishSelect.value || null;
    appState.isScanning = false; // Reset scan state
    stopScanning(); // Will update button states and input focus

    // Enable start button if both user and dish are selected
    dom.startBtn.disabled = !(appState.currentUser && appState.dishLetter);

    if (appState.dishLetter) {
        showMessage(`Dish selected: ${appState.dishLetter}. Ready to start scanning.`, 'info');
    }
    updateUI();
}

async function processJSONData() {
    await processJsonPatch();
}

async function resetTodaysPreparedBowls() {
    await resetPrepared();
}


async function processJsonPatch() {
    // Use cached element
    if (!dom.jsonInput) return;
    
    const jsonText = dom.jsonInput.value.trim();
    if (!jsonText) {
        showResult('⚠️ Warning: Please paste JSON data into the box.', 'warning');
        return;
    }

    // ⚠️ NEW: Function to display the patch results
    const showResult = (message, type) => {
        // Use cached elements
        if (dom.patchResultContainer && dom.patchSummary) {
            const classMap = {
                error: 'background:var(--accent-red); color:var(--text);',
                success: 'background:var(--accent-green); color:#05201a;',
            };
            dom.patchResultContainer.style.display = 'block';
            dom.patchResultContainer.style.cssText = `margin-top:12px;padding:10px;border-radius:8px;font-size:14px;${classMap[type] || classMap.error}`;
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
    
    // Prepare an atomic update map
    const updates = {};
    
    // Fetch current active bowls for accurate created/updated count feedback
    const activeSnap = await firebase.database().ref('progloveData/activeBowls').once('value');
    const currentActiveBowlsMap = activeSnap.val() || {};

    companiesData.forEach(company => {
        const companyName = company.name || 'N/A';

        (company.boxes || []).forEach(box => {
            let deliveryDate = today;
            if (box.uniqueIdentifier) {
                const dateMatch = box.uniqueIdentifier.match(/\d{4}-\d{2}-\d{2}/);
                if (dateMatch) {
                    deliveryDate = dateMatch[0];
                }
            }

            (box.dishes || []).forEach(dish => {
                const customers = (dish.users && dish.users.length > 0) ?
                    dish.users.map(u => u.username).join(', ') : 'N/A';

                (dish.bowlCodes || []).forEach(code => {
                    if (!code) return;

                    // 🚀 FIX: Encode the code for use as a Firebase Key
                    const firebaseKey = encodeFirebaseKey(code);
                    
                    // Check if bowl exists using the encoded map keys
                    // This is only used for the reporting count (Created vs Updated).
                    const isExisting = !!currentActiveBowlsMap[firebaseKey];

                    const newBowl = {
                        code: code, // Store original code in the object body
                        dish: dish.label || 'N/A',
                        company: companyName,
                        customer: customers,
                        creationDate: deliveryDate,
                        timestamp: nowISO(),
                    };
                    
                    // ⚠️ ATOMIC WRITE: Update the activeBowls map key directly. Use encoded key.
                    // This overwrites (replaces) any existing bowl with the same key,
                    // ensuring data integrity and preventing duplicates.
                    updates[`activeBowls/${firebaseKey}`] = newBowl;

                    if (isExisting) {
                        updatedCount++;
                    } else {
                        createdCount++;
                    }
                });
            });
        });
    });
    
    // ⚠️ ATOMIC WRITE: Perform the update on the Firebase root path
    updates['customerData'] = companiesData;

    // Check if any updates were prepared before committing
    // We check if the updates object size is greater than 1 (customerData + at least one activeBowl)
    if (Object.keys(updates).length <= 1) { 
        showResult("⚠️ Warning: No valid bowl codes were found in the provided JSON data. Please check the data structure.", 'error');
        return;
    }
    
    try {
        await firebase.database().ref('progloveData').update(updates);
        
        // 🚀 FIX: Call the new function to correct the active bowl counter, 
        // mitigating corruption from child_added/removed events after bulk update.
        await refreshActiveCount(); 

    } catch (e) {
        console.error("Firebase atomic update failed during patch:", e);
        showResult('❌ Error: Could not save patch data. Check connection.', 'error');
        return; // Stop processing on write failure
    }

    let resultMessage = `✅ JSON processed successfully.<br>`;
    resultMessage += `✨ Created <strong>${createdCount}</strong> new bowl record(s).<br>`;
    resultMessage += `🔄 Updated <strong>${updatedCount}</strong> existing bowl record(s).`;
    
    showResult(resultMessage, 'success');
    // Use cached element
    if (dom.jsonInput) dom.jsonInput.value = '';
    showMessage('Customer data applied successfully! All devices updated.', 'success');
}

async function resetPrepared() {
    showMessage('Please confirm this action. Resetting prepared bowls requires administrative confirmation and cannot be undone.', 'warning');
    
    const resetConfirmed = window.confirm("Are you sure you want to reset ALL prepared bowls and scan counts for TODAY? This cannot be undone.");

    if (resetConfirmed) {
        try {
            // ⚠️ ATOMIC DELETION: Set entire paths to null to reset them
            const resetUpdates = {};
            resetUpdates['preparedBowls'] = null;
            resetUpdates['myScans'] = null;
            
            await firebase.database().ref('progloveData').update(resetUpdates);
            
            // Manually reset local cache and counter for immediate UI update
            appState.appData.preparedTodayCount = 0;
            appState.appData.preparedTodayCache = {};
            updateUI();

            showMessage('Prepared data and scan counts have been reset across all devices.', 'success');
        } catch (e) {
            console.error("Reset failed:", e);
            showMessage('Failed to perform reset!', 'error');
        }
    }
}

/**
 * ==============================================================================
 * 🚀 EFFICIENT DELTA-SYNC & COUNTER SETUP (Count, Don't Download)
 * ==============================================================================
 */
function setupRealtimeDeltaSync() {
    const dbRef = firebase.database().ref('progloveData');
    console.log("🚀 Setting up Delta Sync (Count, Don't Download)...");
    const today = todayDateStr();

    // Reset local counts before listeners attach (to prevent stale data from initial load)
    appState.appData.activeCount = 0;
    appState.appData.preparedTodayCount = 0;
    appState.appData.returnedTodayCount = 0;
    appState.appData.preparedTodayCache = {}; // Clear the cache
    updateUI();
    
    // 1. Initial Load: Get small lists ONCE.
    dbRef.once('value', (snapshot) => {
        const firebaseData = snapshot.val();
        if (firebaseData) {
            // Load only small, essential data that is stored as an array/object:
            appState.appData.customerData = firebaseData.customerData || [];
            appState.appData.myScans = firebaseData.myScans || {};
            appState.appData.scanHistory = firebaseData.scanHistory || {};
            appState.appData.lastSync = firebaseData.lastSync || null;

            // ⚠️ IMPORTANT: Perform an initial count check here to set the count correctly on startup
            const activeBowls = firebaseData.activeBowls || {};
            appState.appData.activeCount = Object.keys(activeBowls).length;

            showMessage('✅ Initial configuration data loaded.', 'success');
        } else {
            // Handle fresh start
            appState.appData = createDefaultAppData();
            showMessage('Firebase is empty. Starting fresh.', 'info');
        }
        updateUI(); 
        console.log("✅ Initial load complete. Attaching delta listeners...");
    }, (error) => {
        console.error("Firebase initial data load failed:", error);
        showMessage("Failed to load initial data. Please refresh.", 'error');
        appState.systemStatus = 'error';
        updateUI();
    });

    // 2. Attach HIGHLY TARGETED LISTENERS (Count, Don't Download)
    
    // A) ACTIVE BOWLS COUNTER
    // These listeners handle single scan updates but will be unreliable after bulk patches.
    const activeRef = dbRef.child('activeBowls');
    activeRef.on('child_added', () => {
        appState.appData.activeCount++; 
        updateUI();
    });
    activeRef.on('child_removed', () => {
        appState.appData.activeCount--; 
        updateUI();
    });
    
    // B) PREPARED TODAY COUNTER & CACHE
    const preparedRef = dbRef.child('preparedBowls');
    preparedRef.on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (data && data.creationDate === today) {
            // FIX: Removed appState.appData.preparedTodayCount++ to prevent double counting.
            // Only update the cache for remote sync. The counter is now calculated in updateUI.
            appState.appData.preparedTodayCache[data.code] = data; 
            updateUI();
        }
    });
    // This handles a full reset (preparedBowls = null)
    preparedRef.on('value', (valueSnapshot) => {
        if (!valueSnapshot.exists()) {
             if (appState.appData.preparedTodayCount > 0) {
                console.log(`Delta: preparedBowls -> RESET (null)`);
                appState.appData.preparedTodayCount = 0;
                appState.appData.preparedTodayCache = {};
                updateUI();
            }
        }
    });

    // C) RETURNED TODAY COUNTER
    const returnedRef = dbRef.child('returnedBowls');
    returnedRef.on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (data && data.returnDate === today) {
            appState.appData.returnedTodayCount++; 
            updateUI();
        }
    });
    
    // D) Low-frequency data (customerData and lastSync)
    dbRef.child('customerData').on('value', (snapshot) => {
        console.log("Delta: customerData updated.");
        appState.appData.customerData = snapshot.val() || [];
        updateUI();
    });

    dbRef.child('lastSync').on('value', (snapshot) => {
        appState.appData.lastSync = snapshot.val();
        updateUI(); // Just updates the sync time text
    });
}


// --- EVENT LISTENER SETUP ---
function initEventListeners() {
    console.log("✅ Using inline event handlers from HTML and adding change listeners for selects/input");
    
    // Only add listeners for elements that don't have inline handlers
    // Use cached elements
    if (dom.userSelect) {
        // This function must be defined above (which it now is)
        dom.userSelect.addEventListener('change', selectUser); 
    }
    if (dom.dishSelect) {
        // This function must be defined above (which it now is)
        dom.dishSelect.addEventListener('change', selectDishLetter);
    }
    if (dom.scanInput) {
        dom.scanInput.addEventListener('change', (e) => handleScan(e.target.value.trim()));
    }
}


// --- INITIALIZATION ---
async function initializeApp() {
    console.log("🚀 Starting ProGlove Scanner App...");
    
    try {
        // --- FIX: cacheDOMElements is defined and called here
        cacheDOMElements(); 
        initEventListeners();
        appState.appData = createDefaultAppData();
        updateUI();

        if (initFirebase()) {
            // 1. Set up the high-performance listeners immediately
            setupRealtimeDeltaSync(); 

            // 2. Monitor connection status for UI feedback
            monitorFirebaseConnection(
                () => { // onConnected
                    console.log("✅ Firebase connected");
                    appState.systemStatus = 'online';
                    showMessage('Connected to Firebase.', 'success');
                    updateUI(); 
                },
                () => { // onDisconnected
                    console.log("❌ Firebase disconnected");
                    appState.systemStatus = 'offline';
                    showMessage('Connection lost. Changes are disabled until reconnected.', 'warning');
                    stopScanning(); 
                    updateUI();
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
