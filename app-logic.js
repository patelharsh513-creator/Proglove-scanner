// app-logic.js (Near the top, e.g., line ~40)
// --- GLOBAL DOM REFERENCES ---
const dom = {}; // Global object to hold all cached DOM elements
// app-logic.js (Add this function definition)
// --- DOM CACHE ---
function cacheDOMElements() {
    // Basic elements for status and controls
    dom.systemStatus = document.getElementById('systemStatus');
    dom.userSelect = document.getElementById('userSelect');
    dom.dishSelect = document.getElementById('dishSelect');
    dom.scanInput = document.getElementById('scanInput');
    dom.messageContainer = document.getElementById('messageContainer'); // Although showMessage handles a fallback
    
    // Counters
    dom.myScansCount = document.getElementById('myScansCount');
    dom.myScansDish = document.getElementById('myDishLetter');
    dom.preparedTodayCount = document.getElementById('preparedTodayCount');
    dom.activeCount = document.getElementById('activeCount');
    dom.returnedTodayCount = document.getElementById('returnedCount');
    
    // Report
    dom.livePrepReportBody = document.getElementById('livePrepReportBody');
    
    // Status/Utility
    dom.lastSyncInfo = document.getElementById('lastSyncInfo');
    
    // Data Management
    dom.jsonInput = document.getElementById('jsonData');
    dom.patchResultContainer = document.getElementById('patchResults');
    dom.patchSummary = document.getElementById('patchSummary');

    console.log("✅ DOM elements cached.");
}
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

function showMessage(text, type = 'info') {
    // ... (showMessage function remains the same) ...
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
        // NOTE: These classes must be manually added to index.html style block for functionality
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
    // ... (initFirebase logic remains the same) ...
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
    // ... (monitorFirebaseConnection logic remains the same) ...
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

// ... (exportData functions remain largely the same, but now use targeted reads or just export what's on the server) ...
// NOTE: Export functions are not part of the speed/atomic requirement but are left for completeness.
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
                const prepData = allPreparedBowls.map(/* ... mapping logic ... */ b => ({
                    "Bowl Code": b.code,
                    "Dish": b.dish,
                    "User": b.user,
                    "Company": b.company,
                    "Customer": b.customer,
                    "Creation Date": b.creationDate,
                    "Timestamp": b.timestamp
                }));
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
async function exportAllDataWrapper() { exportData('all'); } // Keep the wrapper for the HTML
// ... (exportActiveBowls, exportReturnData remain as wrappers) ...


// --- UI UPDATE LOGIC ---
function updateUI() {
    if (!dom.systemStatus) return;
    
    const { mode, currentUser, dishLetter, isScanning, systemStatus, appData } = appState;
    
    // ⚠️ Counters now read directly from the fast-updating local count variables
    const activeCount = appData.activeCount;
    const preparedTodayCount = appData.preparedTodayCount;
    const returnedTodayCount = appData.returnedTodayCount;
    
    // The following two are still filtered from the small local caches:
    const allMyScans = objectToArray(appData.myScans);
    const myScansForUser = allMyScans.filter(s => s && s.user === currentUser);
    const myScansForDish = myScansForUser.filter(s => s.dish === dishLetter);


    // ... (UI status and control updates remain the same) ...

    // Update counters (using the new variables)
    if (dom.myScansCount) dom.myScansCount.textContent = (mode === 'kitchen' && dishLetter) ? myScansForDish.length : myScansForUser.length;
    if (dom.myScansDish) dom.myScansDish.textContent = (mode === 'kitchen' && dishLetter) ? dishLetter : '--';
    if (dom.preparedTodayCount) dom.preparedTodayCount.textContent = preparedTodayCount; // 🚀 FAST COUNT
    if (dom.activeCount) dom.activeCount.textContent = activeCount; // 🚀 FAST COUNT
    if (dom.returnedTodayCount) dom.returnedTodayCount.textContent = returnedTodayCount; // 🚀 FAST COUNT
    
    // Update preparation report (using the NEW, small preparedTodayCache)
    if (dom.livePrepReportBody) {
        // Use objectToArray on the local preparedTodayCache (only today's data)
        const preparedToday = objectToArray(appState.appData.preparedTodayCache); 
        
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
    
    const { mode, currentUser, dishLetter } = appState;
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
    
    // Look up customer data from the local customerData array (Best performance for an array)
    // NOTE: This array is synced once on startup and on patch, avoiding a slow Firebase query.
    const customer = appState.appData.customerData.find(c => c.bowl_id === code) || {};


    // Prepare the set of ATOMIC UPDATES to send to Firebase
    const firebaseUpdates = {};
    const scanHistoryKey = `${now}-${code}`;
    firebaseUpdates[`scanHistory/${scanHistoryKey}`] = { code, user: currentUser, mode, timestamp: now };

    if (mode === 'kitchen') {
        const newBowl = {
            code, 
            dish: dishLetter, 
            user: currentUser,
            company: customer.company || 'N/A', 
            customer: customer.customer_name || 'N/A',
            creationDate: todayDateStr(), 
            timestamp: now
        };
        
        // ⚠️ ATOMIC WRITE 1: Set the bowl as ACTIVE. Code is the key. 
        firebaseUpdates[`activeBowls/${code}`] = newBowl;
        
        // ⚠️ ATOMIC WRITE 2: Add a new entry to the preparedBowls list (using a unique key)
        const preparedKey = `${now}-${code}`;
        firebaseUpdates[`preparedBowls/${preparedKey}`] = newBowl;
        
        // ⚠️ ATOMIC WRITE 3: Add a new entry to the myScans list
        const myScanKey = `${now}-${code}-${currentUser}`;
        firebaseUpdates[`myScans/${myScanKey}`] = { user: currentUser, dish: dishLetter, code };

        showMessage(`✅ Prep scan OK: ${code} for Dish ${dishLetter}`, 'success');
        
    } else if (mode === 'return') {
        
        // 1. 🎯 TARGETED READ: Fetch only the specific active bowl from Firebase for validation
        const bowlRef = firebase.database().ref(`progloveData/activeBowls/${code}`);
        const snapshot = await bowlRef.once('value'); // FASTEST one-time read
        const activeBowl = snapshot.val(); 
        
        if (!activeBowl) {
            // Check works directly on the database result
            showMessage(`Bowl ${code} not found in active list (Check DB)`, 'error');
            if (dom.scanInput) dom.scanInput.value = '';
            return;
        }

        // ⚠️ ATOMIC WRITE 1: Remove from active list by setting the code key to null (Targeted Delete)
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

    // Execute all updates simultaneously (ATOMIC COMMIT)
    try {
        await firebase.database().ref('progloveData').update(firebaseUpdates);
    } catch (e) {
        console.error("Firebase atomic update failed:", e);
        showMessage('Error: Could not save scan. Check connection.', 'error');
    }
    
    if (dom.scanInput) dom.scanInput.value = '';
}

// ... (populateDropdowns, setMode, startScanning, stopScanning, export wrappers, selectUser, selectDishLetter remain the same) ...

// --- EVENT LISTENER SETUP ---
function initEventListeners() {
    // ... (initEventListeners logic remains the same) ...
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
    // ... (processJsonPatch logic remains the same, but now updates are atomic) ...
    if (!dom.jsonInput) return;
    
    // ... (JSON parsing and validation) ...
    
    // ⚠️ NEW: Function to display the patch results
    const showResult = (message, type) => {
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
        // ... (data extraction logic) ...
        const companyName = company.name || 'N/A';

        company.boxes.forEach(box => {
            // ... (box/date logic) ...
            let deliveryDate = today;
            if (box.uniqueIdentifier) {
                const dateMatch = box.uniqueIdentifier.match(/\d{4}-\d{2}-\d{2}/);
                if (dateMatch) {
                    deliveryDate = dateMatch[0];
                }
            }

            box.dishes.forEach(dish => {
                // ... (dish/customer logic) ...
                const customers = (dish.users && dish.users.length > 0) ?
                    dish.users.map(u => u.username).join(', ') : 'N/A';

                dish.bowlCodes.forEach(code => {
                    if (!code) return;

                    // Check if bowl exists using the map keys
                    const isExisting = !!currentActiveBowlsMap[code];

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
    // NOTE: We also update customerData here as it is patched from the UI
    updates['customerData'] = companiesData;
    await firebase.database().ref('progloveData').update(updates);

    let resultMessage = `✅ JSON processed successfully.<br>`;
    resultMessage += `✨ Created <strong>${createdCount}</strong> new bowl record(s).<br>`;
    resultMessage += `🔄 Updated <strong>${updatedCount}</strong> existing bowl record(s).`;
    
    showResult(resultMessage, 'success');
    if (dom.jsonInput) dom.jsonInput.value = '';
    showMessage('Customer data applied successfully! All devices updated.', 'success');
}

async function resetPrepared() {
    // ... (resetPrepared logic remains the same) ...
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
            appState.appData.preparedTodayCount++; 
            // Add to small local cache for the Live Prep Report (Filtered by date)
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


// --- INITIALIZATION ---
async function initializeApp() {
    console.log("🚀 Starting ProGlove Scanner App...");
    
    try {
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

