// ProGlove Scanner - Complete Bowl Tracking System
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
    lastCleanup: null,
    lastSync: null
};

// CORRECTED USER LIST
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

// FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyCL3hffCHosBceIRGR1it2dYEDb3uxIrJw",
    authDomain: "proglove-scanner.firebaseapp.com",
    databaseURL: "https://proglove-scanner-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "proglove-scanner",
    storageBucket: "proglove-scanner.firebasestorage.app",
    messagingSenderId: "177575768177",
    appId: "1:177575768177:web:0a0acbf222218e0c0b2bd0"
};

// ========== FILE LOADERS ==========

function loadXLSXLibrary() {
    return new Promise((resolve, reject) => {
        if (typeof XLSX !== 'undefined') {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load XLSX library'));
        document.head.appendChild(script);
    });
}

function loadFirebaseSDK() {
    return new Promise((resolve, reject) => {
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
            resolve();
            return;
        }
        const scriptApp = document.createElement('script');
        scriptApp.src = 'https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js';
        scriptApp.onload = function() {
            const scriptDatabase = document.createElement('script');
            scriptDatabase.src = 'https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js';
            scriptDatabase.onload = resolve;
            scriptDatabase.onerror = () => reject(new Error('Failed to load Firebase Database'));
            document.head.appendChild(scriptDatabase);
        };
        scriptApp.onerror = () => reject(new Error('Failed to load Firebase App'));
        document.head.appendChild(scriptApp);
    });
}

function initializeFirebase() {
    loadFirebaseSDK()
        .then(() => {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            loadFromFirebase();
        })
        .catch((error) => {
            console.error('❌ Failed to load Firebase SDK:', error);
            loadFromStorage();
            initializeUI();
            showMessage('⚠️ Using local storage (Firebase failed)', 'warning');
            document.getElementById('modeDisplay').textContent = '⚠️ Offline Mode - Local Storage';
        });
}

// ========== DATA UTILITIES ==========

function smartMergeData(firebaseData) {
    const localData = getLocalData();
    const mergeStats = { activeAdded: 0, preparedAdded: 0, returnedAdded: 0, scansAdded: 0, historyAdded: 0 };
    const firebaseActiveCodes = new Set((firebaseData.activeBowls || []).map(b => b.code));
    const uniqueLocalActive = (localData.activeBowls || []).filter(localBowl => !firebaseActiveCodes.has(localBowl.code));
    const mergedActive = [...(firebaseData.activeBowls || []), ...uniqueLocalActive];
    mergeStats.activeAdded = uniqueLocalActive.length;
    
    // Merge prepared bowls based on unique key
    const allPrepared = new Map();
    (firebaseData.preparedBowls || []).forEach(bowl => allPrepared.set(bowl.code + '-' + bowl.date + '-' + bowl.user, bowl));
    (localData.preparedBowls || []).forEach(bowl => allPrepared.set(bowl.code + '-' + bowl.date + '-' + bowl.user, bowl));
    const mergedPrepared = Array.from(allPrepared.values());
    mergeStats.preparedAdded = mergedPrepared.length - (firebaseData.preparedBowls?.length || 0);

    const firebaseReturnedCodes = new Set((firebaseData.returnedBowls || []).map(b => b.code));
    const uniqueLocalReturned = (localData.returnedBowls || []).filter(localBowl => !firebaseReturnedCodes.has(localBowl.code));
    const mergedReturned = [...(firebaseData.returnedBowls || []), ...uniqueLocalReturned];
    mergeStats.returnedAdded = uniqueLocalReturned.length;
    
    const mergedScans = mergeArraysByTimestamp(firebaseData.myScans, localData.myScans);
    const mergedHistory = mergeArraysByTimestamp(firebaseData.scanHistory, localData.scanHistory);
    mergeStats.scansAdded = mergedScans.added;
    mergeStats.historyAdded = mergedHistory.added;

    return {
        activeBowls: mergedActive,
        preparedBowls: mergedPrepared,
        returnedBowls: mergedReturned,
        myScans: mergedScans.array,
        scanHistory: mergedHistory.array,
        customerData: firebaseData.customerData || localData.customerData || [],
        lastCleanup: firebaseData.lastCleanup || localData.lastCleanup,
        mergeStats: mergeStats
    };
}

function mergeArraysByTimestamp(firebaseArray = [], localArray = []) {
    const combined = [...firebaseArray, ...localArray];
    const uniqueMap = new Map();
    combined.forEach(item => {
        const key = item.code + '-' + item.timestamp;
        const existing = uniqueMap.get(key);
        if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) {
            uniqueMap.set(key, item);
        }
    });
    const uniqueArray = Array.from(uniqueMap.values());
    const added = uniqueArray.length - (firebaseArray.length || 0);
    uniqueArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return { array: uniqueArray, added: Math.max(0, added) };
}

function getLocalData() {
    try {
        const saved = localStorage.getItem('proglove_data');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (error) {
        console.log('No local data found');
    }
    return {};
}

function loadFromFirebase() {
    try {
        const db = firebase.database();
        const appDataRef = db.ref('progloveData');

        showMessage('🔄 Loading from cloud...', 'info');
        document.getElementById('modeDisplay').textContent = '🔄 Connecting to Cloud...';

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Firebase connection timeout')), 10000);
        });

        Promise.race([appDataRef.once('value'), timeoutPromise])
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const mergedData = smartMergeData(snapshot.val());
                    window.appData = { ...window.appData, ...mergedData };
                    cleanupPreparedBowls();
                    showMessage('✅ Cloud data loaded with smart merge', 'success');
                    document.getElementById('modeDisplay').textContent = '✅ Cloud Connected';
                    cleanupIncompleteBowls();
                    initializeUI();
                } else {
                    showMessage('❌ No cloud data - using local data', 'warning');
                    document.getElementById('modeDisplay').textContent = '✅ Cloud Connected (No Data)';
                    loadFromStorage();
                    initializeUI();
                }
            })
            .catch((error) => {
                showMessage('❌ Cloud load failed: ' + error.message, 'error');
                document.getElementById('modeDisplay').textContent = '⚠️ Offline Mode - Load Error';
                loadFromStorage();
                initializeUI();
            });
    } catch (error) {
        showMessage('❌ Firebase error: ' + error.message, 'error');
        document.getElementById('modeDisplay').textContent = '⚠️ Offline Mode - Firebase Error';
        loadFromStorage();
        initializeUI();
    }
}

function syncToFirebase() {
    try {
        saveToStorage();
        if (typeof firebase === 'undefined') return;
        const db = firebase.database();
        const backupData = {
            activeBowls: window.appData.activeBowls || [],
            preparedBowls: window.appData.preparedBowls || [],
            returnedBowls: window.appData.returnedBowls || [],
            myScans: window.appData.myScans || [],
            scanHistory: window.appData.scanHistory || [],
            customerData: window.appData.customerData || [],
            lastCleanup: window.appData.lastCleanup,
            lastSync: new Date().toISOString()
        };
        db.ref('progloveData').set(backupData)
            .then(() => {
                window.appData.lastSync = new Date().toISOString();
                document.getElementById('modeDisplay').textContent = '✅ Cloud Synced';
            })
            .catch((error) => {
                document.getElementById('modeDisplay').textContent = '⚠️ Sync Failed - Using Local';
            });
    } catch (error) {
        console.error('Sync error:', error);
    }
}

function saveToStorage() {
    try {
        const dataToSave = {
            activeBowls: window.appData.activeBowls,
            preparedBowls: window.appData.preparedBowls,
            returnedBowls: window.appData.returnedBowls,
            myScans: window.appData.myScans,
            scanHistory: window.appData.scanHistory,
            customerData: window.appData.customerData,
            lastCleanup: window.appData.lastCleanup,
            lastSync: window.appData.lastSync,
            lastActivity: window.appData.lastActivity
        };
        localStorage.setItem('proglove_data', JSON.stringify(dataToSave));
    } catch (error) {
        console.log('Storage save error:', error.message);
    }
}

function loadFromStorage() {
    try {
        const saved = localStorage.getItem('proglove_data');
        if (saved) {
            const data = JSON.parse(saved);
            window.appData = { 
                ...window.appData, 
                ...data,
                mode: window.appData.mode,
                user: window.appData.user, 
                dishLetter: window.appData.dishLetter,
                scanning: window.appData.scanning
            };
            cleanupPreparedBowls();
            cleanupIncompleteBowls();
        }
    } catch (error) {
        console.log('No previous data found - starting fresh');
    }
}

// ========== SCANNER LOGIC ==========

function detectVytCode(input) {
    if (!input || typeof input !== 'string' || input.length < 8) return null;
    const cleanInput = input.trim();
    const vytPatterns = [/(VYT\.TO\/[^\s]+)/i, /(VYTAL[^\s]+)/i, /(vyt\.to\/[^\s]+)/i, /(vytal[^\s]+)/i];
    for (const pattern of vytPatterns) {
        const match = cleanInput.match(pattern);
        if (match) {
            const fullUrl = match[1];
            return { fullUrl: fullUrl, type: fullUrl.includes('VYT.TO/') || fullUrl.includes('vyt.to/') ? 'VYT.TO' : 'VYTAL', originalInput: cleanInput };
        }
    }
    return null;
}

function processScan(input) {
    if (!window.appData.scanning) {
        showMessage('❌ Scanning not active - click START SCANNING first', 'error');
        return;
    }
    let result;
    const startTime = Date.now();
    const vytInfo = detectVytCode(input);
    if (!vytInfo) {
        result = { message: "❌ Invalid VYT code/URL format: " + input, type: "error", responseTime: Date.now() - startTime };
        showMessage(result.message, result.type);
        return;
    }
    try {
        if (window.appData.mode === 'kitchen') {
            result = kitchenScan(vytInfo);
        } else if (window.appData.mode === 'return') {
            result = returnScan(vytInfo);
        } else {
            result = { message: "❌ Please select mode first", type: "error", responseTime: Date.now() - startTime };
        }
    } catch (error) {
        result = { message: "❌ Scan processing error: " + error.message, type: "error", responseTime: Date.now() - startTime };
    }

    document.getElementById('responseTimeValue')?.textContent = result.responseTime;
    showMessage(result.message, result.type);

    if 
    (result.type === 'error') 
    {
        document.getElementById('scanInput')?.classList.add('error');
        setTimeout(() => document.getElementById('scanInput')?.classList.remove('error'), 2000);
    } 
    else 
    {
        document.getElementById('scanInput')?.classList.add('success');
        setTimeout(() => document.getElementById('scanInput')?.classList.remove('success'), 500);
    }

    updateDisplay();
    updateOvernightStats();
    updateLastActivity();
}

function kitchenScan(vytInfo) {
    const startTime = Date.now();
    const today = new Date().toLocaleDateString('en-GB');

    const isPreparedByThisUser = window.appData.preparedBowls.some(bowl => 
        bowl.code === vytInfo.fullUrl && bowl.date === today && bowl.user === window.appData.user && bowl.dish === window.appData.dishLetter
    );
    if (isPreparedByThisUser) {
        return { message: "❌ You already prepared this bowl today: " + vytInfo.fullUrl, type: "error", responseTime: Date.now() - startTime };
    }

    const activeBowlIndex = window.appData.activeBowls.findIndex(bowl => bowl.code === vytInfo.fullUrl);
    let hadCustomerData = false;
    if (activeBowlIndex !== -1) {
        window.appData.activeBowls.splice(activeBowlIndex, 1);
        hadCustomerData = true;
    }

    const preparedBowl = {
        code: vytInfo.fullUrl, dish: window.appData.dishLetter, user: window.appData.user,
        company: "Unknown", customer: "Unknown", date: today, time: new Date().toLocaleTimeString(),
        timestamp: new Date().toISOString(), status: 'PREPARED', multipleCustomers: false, hadPreviousCustomer: hadCustomerData
    };
    window.appData.preparedBowls.push(preparedBowl);

    window.appData.myScans.push({
        type: 'kitchen', code: vytInfo.fullUrl, dish: window.appData.dishLetter, user: window.appData.user,
        company: "Unknown", customer: "Unknown", timestamp: new Date().toISOString(), hadPreviousCustomer: hadCustomerData
    });

    const message = hadCustomerData ? `✅ ${window.appData.dishLetter} Prepared: ${vytInfo.fullUrl} (customer data reset)` : `✅ ${window.appData.dishLetter} Prepared: ${vytInfo.fullUrl}`;

    window.appData.scanHistory.unshift({ type: 'kitchen', code: vytInfo.fullUrl, user: window.appData.user, timestamp: new Date().toISOString(), message: message });
    syncToFirebase();

    return { message: message, type: "success", responseTime: Date.now() - startTime };
}

function returnScan(vytInfo) {
    const startTime = Date.now();
    const today = new Date().toLocaleDateString('en-GB');

    const preparedIndex = window.appData.preparedBowls.findIndex(bowl => bowl.code === vytInfo.fullUrl && bowl.date === today);
    if (preparedIndex === -1) {
        return { message: "❌ Bowl not prepared today: " + vytInfo.fullUrl, type: "error", responseTime: Date.now() - startTime };
    }

    const preparedBowl = window.appData.preparedBowls[preparedIndex];
    window.appData.preparedBowls.splice(preparedIndex, 1);
    
    const returnedBowl = {
        code: vytInfo.fullUrl, dish: preparedBowl.dish, user: window.appData.user,
        company: preparedBowl.company, customer: preparedBowl.customer, returnedBy: window.appData.user,
        returnDate: today, returnTime: new Date().toLocaleTimeString(), returnTimestamp: new Date().toISOString(), status: 'RETURNED'
    };
    window.appData.returnedBowls.push(returnedBowl);

    window.appData.myScans.push({
        type: 'return', code: vytInfo.fullUrl, user: window.appData.user,
        company: returnedBowl.company, customer: returnedBowl.customer, timestamp: new Date().toISOString()
    });
    window.appData.scanHistory.unshift({ type: 'return', code: vytInfo.fullUrl, user: window.appData.user, timestamp: new Date().toISOString(), message: `✅ Returned: ${vytInfo.fullUrl}` });
    syncToFirebase();
    return { message: `✅ Returned: ${vytInfo.fullUrl}`, type: "success", responseTime: Date.now() - startTime };
}

// Scanning Functions
function startScanning() {
    if (!window.appData.user) { showMessage('❌ Please select user first', 'error'); return; }
    if (window.appData.mode === 'kitchen' && !window.appData.dishLetter) { showMessage('❌ Please select dish letter first', 'error'); return; }
    window.appData.scanning = true;
    updateDisplay();
    const input = document.getElementById('scanInput'); 
    if (input) { input.focus(); input.value = ''; }
    updateLastActivity();
    showMessage(`🎯 SCANNING ACTIVE - Ready to scan`, 'success');
}

function stopScanning() {
    window.appData.scanning = false;
    updateDisplay();
    updateLastActivity();
    showMessage(`⏹ Scanning stopped`, 'info');
}

// ========== USER AND MODE MANAGEMENT ==========

function initializeUI() {
    initializeUsers();
    updateDisplay();
    updateOvernightStats();
    startDailyCleanupTimer();

    const progloveInput = document.getElementById('scanInput'); 
    if (progloveInput) {
        progloveInput.addEventListener('input', handleScanInput);
        progloveInput.addEventListener('keydown', handleKeyDown);
        progloveInput.addEventListener('change', handleScanChange);
    }
    document.addEventListener('click', updateLastActivity);
    document.addEventListener('keydown', updateLastActivity);
}

function handleKeyDown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const scanValue = e.target.value.trim();
        if (scanValue && window.appData.scanning) {
            processScan(scanValue);
            e.target.value = '';
        }
    }
}

function handleScanChange(e) {
    if (!window.appData.scanning) return;
    const scanValue = e.target.value.trim();
    if (scanValue.length >= 5) {
        processScan(scanValue);
        setTimeout(() => { e.target.value = ''; e.target.focus(); }, 50);
    }
}

function handleScanInput(e) {
    if (!window.appData.scanning) return;
    const scanValue = e.target.value.trim();
    if (scanValue.length >= 3 && (scanValue.includes('VYT') || scanValue.includes('vyt'))) {
        processScan(scanValue);
        setTimeout(() => { e.target.value = ''; e.target.focus(); }, 100);
    }
    updateLastActivity();
}

function initializeUsers() {
    const dropdown = document.getElementById('userSelect');
    if (!dropdown) return;
    dropdown.innerHTML = '<option value="" disabled selected>-- Select User --</option>';
    USERS.forEach(user => {
        const option = document.createElement('option');
        option.value = user.name;
        option.textContent = user.name + (user.role ? ` (${user.role})` : '');
        dropdown.appendChild(option);
    });
}

function setMode(mode) {
    window.appData.mode = mode;
    window.appData.user = null;
    window.appData.dishLetter = null;
    window.appData.scanning = false;

    const kitchenBtn = document.getElementById('kitchenBtn');
    const returnBtn = document.getElementById('returnBtn');
    if (kitchenBtn) kitchenBtn.classList.toggle('active', mode === 'kitchen');
    if (returnBtn) returnBtn.classList.toggle('active', mode === 'return');
    const dishSection = document.getElementById('dishSection');
    if (dishSection) dishSection.classList.toggle('hidden', mode !== 'kitchen');

    const userDropdown = document.getElementById('userSelect'); 
    const dishDropdown = document.getElementById('dishLetterSelect');
    const progloveInput = document.getElementById('scanInput'); 
    
    if (userDropdown) userDropdown.value = '';
    if (dishDropdown) dishDropdown.value = '';
    if (progloveInput) progloveInput.value = '';

    loadUsers();
    updateStatsLabels();
    updateDisplay();
    updateLastActivity();
    showMessage(`📱 ${mode.toUpperCase()} mode selected`, 'info');
}

function loadUsers() {
    const dropdown = document.getElementById('userSelect');
    if (!dropdown) return;
    dropdown.innerHTML = '<option value="" disabled selected>-- Select User --</option>';
    let usersToShow = [];
    if (window.appData.mode === 'kitchen') {
        usersToShow = USERS.filter(user => user.role === 'Kitchen');
    } else if (window.appData.mode === 'return') {
        usersToShow = USERS.filter(user => user.role === 'Return');
    }
    usersToShow.forEach(user => {
        const option = document.createElement('option');
        option.value = user.name;
        option.textContent = user.name;
        dropdown.appendChild(option);
    });
}

function selectUser() {
    const dropdown = document.getElementById('userSelect');
    if (!dropdown) return;
    window.appData.user = dropdown.value;

    if (window.appData.user) {
        showMessage(`✅ ${window.appData.user} selected`, 'success');
        if (window.appData.mode === 'kitchen') {
            const dishSection = document.getElementById('dishSection');
            if (dishSection) dishSection.classList.remove('hidden');
            loadDishLetters();
        }
    }
    updateDisplay();
    updateLastActivity();
}

function loadDishLetters() {
    const dropdown = document.getElementById('dishLetterSelect');
    if (!dropdown) return;
    dropdown.innerHTML = '<option value="" disabled selected>-- Select Dish Letter --</option>';
    
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(letter => {
        const option = document.createElement('option');
        option.value = letter;
        option.textContent = letter;
        dropdown.appendChild(option);
    });

    '1234'.split('').forEach(number => {
        const option = document.createElement('option');
        option.value = number;
        option.textContent = number;
        dropdown.appendChild(option);
    });
}

function selectDishLetter() {
    const dropdown = document.getElementById('dishLetterSelect');
    if (!dropdown) return;

    window.appData.dishLetter = dropdown.value;
    if (window.appData.dishLetter) {
        showMessage(`📝 Dish ${window.appData.dishLetter} selected`, 'success');
    }
    updateDisplay();
    updateLastActivity();
}

// ========== DISPLAY AND UTILITY FUNCTIONS ==========

function updateDisplay() {
    const userDropdown = document.getElementById('userSelect');
    const dishDropdown = document.getElementById('dishLetterSelect');

    if (userDropdown) userDropdown.disabled = false;
    if (dishDropdown) dishDropdown.disabled = false;

    let canScan = window.appData.user && !window.appData.scanning;
    if (window.appData.mode === 'kitchen') canScan = canScan && window.appData.dishLetter;

    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');

    if (startBtn) startBtn.disabled = !canScan;
    if (stopBtn) stopBtn.disabled = !window.appData.scanning;

    const input = document.getElementById('scanInput'); 
    const scanSection = document.getElementById('scanningCard'); 
    
    if (scanSection) {
        if (window.appData.scanning) {
            scanSection.classList.add('scanning-active');
            if (input) { input.placeholder = "Scan VYT code..."; input.disabled = false; }
        } else {
            scanSection.classList.remove('scanning-active');
            if (input) { input.placeholder = "Click START SCANNING..."; input.disabled = !window.appData.scanning; }
        }
    }

    const today = new Date().toLocaleDateString('en-GB');
    const preparedToday = window.appData.preparedBowls.filter(bowl => bowl.date === today).length;
    const returnedToday = window.appData.returnedBowls.filter(bowl => bowl.returnDate === today).length;
    const userTodayScans = window.appData.myScans.filter(scan => 
        scan.user === window.appData.user && new Date(scan.timestamp).toLocaleDateString('en-GB') === today
    ).length;

    const activeCount = document.getElementById('activeCount');
    const prepCount = document.getElementById('preparedTodayCount'); 
    const myScansCount = document.getElementById('myScansCount');
    const exportInfo = document.getElementById('lastSyncInfo'); 

    if (activeCount) activeCount.textContent = window.appData.activeBowls.length;

    if (window.appData.mode === 'kitchen') {
        if (prepCount) prepCount.textContent = preparedToday;
        if (myScansCount) myScansCount.textContent = userTodayScans;
    } else {
        if (prepCount) prepCount.textContent = returnedToday;
        if (myScansCount) myScansCount.textContent = userTodayScans;
    }

    if (exportInfo) {
        exportInfo.innerHTML = `
          <strong>Data Status:</strong> Active: ${window.appData.activeBowls.length} bowls • Prepared: ${preparedToday} today • Returns: ${window.appData.returnedBowls.length} total
      `;
    }
}

function updateOvernightStats() {
    const statsBody = document.getElementById('livePrepReportBody');
    const cycleInfo = document.getElementById('lastSyncInfo');
    if (!statsBody || !cycleInfo) return;

    const now = new Date();
    const today10AM = new Date(now); today10AM.setHours(10, 0, 0, 0);
    const yesterday10PM = new Date(now); yesterday10PM.setDate(yesterday10PM.getDate() - 1); yesterday10PM.setHours(22, 0, 0, 0);
    const isOvernightCycle = now >= yesterday10PM && now <= today10AM;
    cycleInfo.textContent = isOvernightCycle ? `Cycle: Yesterday 10PM - Today 10AM` : `Cycle: Today 10AM - Tomorrow 10AM`;

    const startFilterTime = isOvernightCycle ? yesterday10PM : today10AM;
    const currentCycleScans = window.appData.myScans.filter(scan => {
        const scanTime = new Date(scan.timestamp);
        return scanTime >= startFilterTime && scanTime <= now;
    });

    const dishStats = {};
    currentCycleScans.forEach(scan => {
        const key = `${scan.dish}-${scan.user}`;
        if (!dishStats[key]) {
            dishStats[key] = { dish: scan.dish, user: scan.user, scans: [], count: 0, startTime: null, endTime: null };
        }
        dishStats[key].scans.push(scan);
        dishStats[key].count++;

        const scanTime = new Date(scan.timestamp);
        if (!dishStats[key].startTime || scanTime < new Date(dishStats[key].startTime)) { dishStats[key].startTime = scan.timestamp; }
        if (!dishStats[key].endTime || scanTime > new Date(dishStats[key].endTime)) { dishStats[key].endTime = scan.timestamp; }
    });

    const statsArray = Object.values(dishStats).sort((a, b) => {
        if (a.dish !== b.dish) {
            const aIsNumber = !isNaN(a.dish);
            const bIsNumber = !isNaN(b.dish);
            if (aIsNumber && !bIsNumber) return 1;
            if (!aIsNumber && bIsNumber) return -1;
            if (aIsNumber && bIsNumber) return parseInt(a.dish) - parseInt(b.dish);
            return a.dish.localeCompare(b.dish);
        }
        return new Date(a.startTime) - new Date(b.startTime);
    });

    if (statsArray.length === 0) {
        statsBody.innerHTML = '<tr><td colspan="3" class="table-empty-cell">No kitchen scans recorded during this cycle.</td></tr>';
        return;
    }

    let html = '';
    statsArray.forEach(stat => {
        html += `
          <tr>
              <td class="dish-header">${stat.dish}</td>
              <td>${stat.user}</td>
              <td>${stat.count}</td>
          </tr>
      `;
    });
    statsBody.innerHTML = html;
}

function updateStatsLabels() {
    const prepLabel = document.getElementById('prepLabel');
    if (prepLabel) {
        if (window.appData.mode === 'kitchen') {
            prepLabel.textContent = 'Prepared Today';
        } else {
            prepLabel.textContent = 'Returned Today';
        }
    }
}

function extractCompanyFromUniqueIdentifier(uniqueIdentifier) {
    if (!uniqueIdentifier) return "Unknown";
    const parts = uniqueIdentifier.split('-');
    if (parts.length >= 3) { return parts.slice(2, -1).join(' ').trim(); }
    return uniqueIdentifier;
}

function combineCustomerNamesByDish() {
    const dishGroups = {};
    window.appData.activeBowls.forEach(bowl => { if (!dishGroups[bowl.dish]) { dishGroups[bowl.dish] = []; } dishGroups[bowl.dish].push(bowl); });
    Object.values(dishGroups).forEach(bowls => {
        if (bowls.length > 1) {
            const allCustomers = [...new Set(bowls.map(b => b.customer))].filter(name => name && name !== "Unknown");
            if (allCustomers.length > 0) {
                const combinedCustomers = allCustomers.join(', ');
                bowls.forEach(bowl => { bowl.customer = combinedCustomers; bowl.multipleCustomers = true; });
            }
        } else {
            if (bowls[0].customer && bowls[0].customer !== "Unknown") { bowls[0].multipleCustomers = false; }
        }
    });
    window.appData.preparedBowls.forEach(prepBowl => {
        const activeBowl = window.appData.activeBowls.find(bowl => bowl.code === prepBowl.code);
        if (activeBowl) { prepBowl.customer = activeBowl.customer; prepBowl.company = activeBowl.company; prepBowl.multipleCustomers = activeBowl.multipleCustomers; }
    });
}

function getCustomerNameColor(bowl) {
    if (bowl.multipleCustomers) { return 'red-text'; } else if (bowl.customer && bowl.customer !== "Unknown") { return 'green-text'; }
    return '';
}

function calculateDaysActive(creationDate) {
    if (!creationDate) return 0;
    const created = new Date(creationDate);
    const today = new Date();
    const diffTime = Math.abs(today - created);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function extractDateFromJSON(jsonData) {
    const dateFields = ['createdAt', 'creationDate', 'date', 'timestamp', 'created', 'orderDate'];
    for (const field of dateFields) { if (jsonData[field]) { return new Date(jsonData[field]).toISOString(); } }
    return new Date().toISOString();
}

function processCompanyDataWithDate(companyData, extractedData, patchResults) {
    const companyName = companyData.name;
    patchResults.companiesProcessed.add(companyName);
    const creationDate = extractDateFromJSON(companyData);
    if (companyData.boxes && Array.isArray(companyData.boxes)) {
        companyData.boxes.forEach(box => {
            const boxCompany = extractCompanyFromUniqueIdentifier(box.uniqueIdentifier) || companyName;
            if (box.dishes && Array.isArray(box.dishes)) {
                box.dishes.forEach(dish => {
                    if (dish.bowlCodes && Array.isArray(dish.bowlCodes)) {
                        dish.bowlCodes.forEach(bowlCode => {
                            if (bowlCode && dish.users && dish.users.length > 0) {
                                const allCustomers = dish.users.map(user => user.username).filter(name => name);
                                const customerNames = allCustomers.join(', ');
                                extractedData.push({
                                    vyt_code: bowlCode, company: boxCompany, customer: customerNames, dish: dish.label || '',
                                    multipleCustomers: allCustomers.length > 1, creationDate: creationDate
                                });
                            }
                        });
                    }
                });
            }
        });
    }
}

function processJSONData() {
    const jsonTextarea = document.getElementById('jsonData');
    const jsonText = jsonTextarea.value.trim();

    if (!jsonText) { showMessage('❌ Please paste JSON data first', 'error'); return; }

    try {
        const jsonData = JSON.parse(jsonText);
        const extractedData = [];
        const patchResults = { matched: 0, created: 0, failed: 0, companiesProcessed: new Set(), datesExtracted: 0 };
        if (jsonData.name && jsonData.boxes) { processCompanyDataWithDate(jsonData, extractedData, patchResults); }
        else if (Array.isArray(jsonData)) { jsonData.forEach((companyData, index) => { if (companyData.name && companyData.boxes) { processCompanyDataWithDate(companyData, extractedData, patchResults); } }); }
        else if (jsonData.companies && Array.isArray(jsonData.companies)) { jsonData.companies.forEach((companyData, index) => { if (companyData.name && companyData.boxes) { processCompanyDataWithDate(companyData, extractedData, patchResults); } }); }
        else { throw new Error('Unsupported JSON format'); }

        extractedData.forEach(customer => {
            const exactVytCode = customer.vyt_code.toString().trim();
            const creationDate = customer.creationDate || new Date().toISOString();
            const matchingBowls = window.appData.activeBowls.filter(bowl => bowl.code === exactVytCode);

            if (matchingBowls.length > 0) {
                matchingBowls.forEach(bowl => {
                    bowl.company = customer.company || "Unknown"; bowl.customer = customer.customer || "Unknown";
                    bowl.dish = customer.dish || bowl.dish; bowl.multipleCustomers = customer.multipleCustomers;
                    if (!bowl.creationDate && creationDate) { bowl.creationDate = creationDate; patchResults.datesExtracted++; }
                });
                patchResults.matched += matchingBowls.length;
            } else {
                const newBowl = {
                    code: exactVytCode, company: customer.company || "Unknown", customer: customer.customer || "Unknown",
                    dish: customer.dish || "Unknown", status: 'ACTIVE', timestamp: new Date().toISOString(),
                    date: new Date().toLocaleDateString('en-GB'), creationDate: creationDate,
                    multipleCustomers: customer.multipleCustomers, daysActive: calculateDaysActive(creationDate)
                };
                window.appData.activeBowls.push(newBowl); patchResults.created++; patchResults.datesExtracted++;
            }
        });

        cleanupPreparedBowls();
        updateDisplay();
        syncToFirebase();
        showMessage(`✅ JSON processing completed: ${extractedData.length} VYT codes from ${patchResults.companiesProcessed.size} companies (${patchResults.datesExtracted} dates extracted)`, 'success');
        document.getElementById('patchResults').style.display = 'block';
        document.getElementById('patchSummary').textContent = `Companies: ${patchResults.companiesProcessed.size} | VYT Codes: ${extractedData.length} | Updated: ${patchResults.matched} | Created: ${patchResults.created} | Dates: ${patchResults.datesExtracted}`;
        document.getElementById('failedMatches').innerHTML = patchResults.failed > 0 ? `<strong>Failed:</strong> ${patchResults.failed} bowls could not be processed` : '<em>All VYT codes processed successfully!</em>';
    } catch (error) {
        showMessage('❌ Error processing JSON data: ' + error.message, 'error');
    }
}

function convertToCSV(data, fields) {
    const headers = fields.join(',');
    const rows = data.map(item => fields.map(field => `"${item[field] || ''}"`).join(','));
    return [headers, ...rows].join('\n');
}

function downloadCSV(csvData, filename) {
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    window.URL.revokeObjectURL(url);
}

function exportActiveBowls() {
    if (window.appData.activeBowls.length === 0) { showMessage('❌ No active bowls to export', 'error'); return; }
    const bowlsWithDaysActive = window.appData.activeBowls.map(bowl => { return { ...bowl, daysActive: bowl.creationDate ? calculateDaysActive(bowl.creationDate) : 0 }; });
    const csvData = convertToCSV(bowlsWithDaysActive, ['code', 'dish', 'company', 'customer', 'creationDate', 'daysActive', 'user', 'date', 'time']);
    downloadCSV(csvData, 'active_bowls_with_dates.csv');
    showMessage('✅ Active bowls exported with date tracking', 'success');
}

function exportAllData() {
    loadXLSXLibrary()
        .then(() => {
            const wb = XLSX.utils.book_new();
            const processData = (arr, sheetName) => {
                if (arr.length > 0) {
                    const mappedData = arr.map(b => ({ 'Code': b.code, 'Dish': b.dish, 'Company': b.company || 'Unknown', 'Customer': b.customer || 'Unknown', 'Date': b.date || b.returnDate || b.creationDate, 'Status': b.status || 'N/A' }));
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mappedData), sheetName);
                }
            };

            const activeData = window.appData.activeBowls.map(b => ({ ...b, daysActive: b.creationDate ? calculateDaysActive(b.creationDate) : 0 }));
            processData(activeData, 'Active Bowls');
            processData(window.appData.preparedBowls, 'Prepared Bowls');
            processData(window.appData.returnedBowls, 'Returned Bowls');

            if (wb.SheetNames.length === 0) { showMessage('❌ No data available to export', 'error'); return; }
            XLSX.writeFile(wb, 'complete_scanner_data_with_dates.xlsx');
            showMessage('✅ All data exported as Excel with date tracking', 'success');
        })
        .catch(() => { showMessage('❌ Failed to load Excel export library.', 'error'); });
}

function exportReturnData() {
    const today = new Date().toLocaleDateString('en-GB');
    const todayReturns = window.appData.returnedBowls.filter(bowl => bowl.returnDate === today);
    if (todayReturns.length === 0) { showMessage('❌ No return data to export today', 'error'); return; }
    const csvData = convertToCSV(todayReturns, ['code', 'dish', 'company', 'customer', 'returnedBy', 'returnDate', 'returnTime']);
    downloadCSV(csvData, 'return_data.csv');
    showMessage('✅ Return data exported as CSV', 'success');
}

window.initializeFirebase = initializeFirebase;
window.updateLastActivity = updateLastActivity;
window.startScanning = startScanning;
window.stopScanning = stopScanning;
window.setMode = setMode;
window.selectUser = selectUser;
window.selectDishLetter = selectDishLetter;
window.processJSONData = processJSONData;
window.exportActiveBowls = exportActiveBowls;
window.exportReturnData = exportReturnData;
window.exportAllData = exportAllData;
window.checkFirebaseData = checkFirebaseData;
window.syncToFirebase = syncToFirebase;
window.loadFromFirebase = loadFromFirebase;
window.resetTodaysPreparedBowls = function() { /* Placeholder */ showMessage('Reset functionality not yet implemented', 'warning'); };

// --- STARTUP SEQUENCE ---
document.addEventListener('DOMContentLoaded', function() {
    initializeFirebase();
    // Aggressive Focus Fix: For tablets, this helps ensure the input is focused instantly when the page loads
    document.addEventListener('keydown', (e) => {
        const scanInput = document.getElementById('scanInput');
        if (window.appData.scanning && scanInput && document.activeElement !== scanInput && /[\w\d]/.test(e.key)) {
            scanInput.focus();
        }
    });
});

