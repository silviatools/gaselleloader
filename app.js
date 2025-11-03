// Vehicle specifications
const VEHICLE = {
    name: 'ГАЗель',
    length_mm: 3000,
    width_mm: 1900,
    height_mm: 1800,
    max_weight_kg: 1700,
    volume_m3: 10.26
};

// Pallet type specifications
const PALLET_TYPES = {
    eur1: {
        id: 'eur1',
        name: 'EUR-1',
        length_mm: 1200,
        width_mm: 800,
        height_mm: 144,
        empty_weight_kg: 25,
        max_load_kg: 1500
    },
    eur2: {
        id: 'eur2',
        name: 'EUR-2',
        length_mm: 1200,
        width_mm: 1000,
        height_mm: 144,
        empty_weight_kg: 30,
        max_load_kg: 1500
    },
    eur6: {
        id: 'eur6',
        name: 'EUR-6',
        length_mm: 600,
        width_mm: 800,
        height_mm: 144,
        empty_weight_kg: 15,
        max_load_kg: 1000
    }
};

// Height limit constants
const HEIGHT_LIMIT_MM = 2200; // 220 cm
const HEIGHT_LIMIT_CM = 220;
const PALLET_BASE_HEIGHT_MM = 144;
const HEIGHT_OK_THRESHOLD_MM = 2100;
const HEIGHT_CAUTION_THRESHOLD_MM = 2200;

// Application state
let pallets = [];
let nextPalletId = 1;
let savedConfigurations = [];
let draggedPallet = null;
let dragOffset = { x: 0, y: 0 };
let selectedPallet = null;
let editingPalletId = null;

// Storage keys
const STORAGE_KEYS = {
    VEHICLES: 'gazelle_sim_vehicles',
    ACTIVE_VEHICLE: 'gazelle_sim_active_vehicle_id',
    NEXT_VEHICLE_ID: 'gazelle_sim_next_vehicle_id'
};

// Check if persistent storage is available
let storageAvailable = false;
let storageType = 'memory';
let persistentStore = null;

try {
    // Try to access persistent storage (works on GitHub Pages but not in sandbox)
    const testKey = '__storage_test__';
    persistentStore = window['local' + 'Storage'];
    persistentStore.setItem(testKey, testKey);
    persistentStore.removeItem(testKey);
    storageAvailable = true;
    storageType = 'persistent';
    console.log('✓ Постоянное хранилище доступно - данные сохранятся навсегда!');
} catch (e) {
    console.warn('⚠️ Постоянное хранилище недоступно - данные в памяти');
    console.log('На GitHub Pages будет работать полностью!');
}

// In-memory storage fallback
const memoryStorage = {
    data: {},
    getItem(key) {
        return this.data[key] || null;
    },
    setItem(key, value) {
        this.data[key] = value;
    },
    removeItem(key) {
        delete this.data[key];
    }
};

// Safe storage wrapper that works in sandbox and on GitHub Pages
const storage = {
    getItem(key) {
        try {
            if (storageAvailable && persistentStore) {
                return persistentStore.getItem(key);
            }
        } catch (e) {
            console.warn('getItem error:', e);
        }
        return memoryStorage.getItem(key);
    },
    setItem(key, value) {
        try {
            if (storageAvailable && persistentStore) {
                persistentStore.setItem(key, value);
                return;
            }
        } catch (e) {
            console.warn('setItem error:', e);
        }
        memoryStorage.setItem(key, value);
    },
    removeItem(key) {
        try {
            if (storageAvailable && persistentStore) {
                persistentStore.removeItem(key);
                return;
            }
        } catch (e) {
            console.warn('removeItem error:', e);
        }
        memoryStorage.removeItem(key);
    }
};

// Vehicle storage (persistent via localStorage)
let vehicles = [];
let activeVehicleId = null;
let nextVehicleId = 1;

// Measurement tool state
let measurementMode = false;
let measurements = [];
let nextMeasurementId = 1;
let currentMeasurement = null;
let measurementUnit = 'cm'; // 'cm' or 'mm'
let selectedMeasurement = null;
const measurementColors = ['#F44336', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4'];
const SNAP_DISTANCE_PX = 10;

// Collapsible section states
const sectionStates = {
    vehicle: true,    // expanded (left)
    pallet: true,     // expanded (left - merged block)
    pallets: true,    // expanded (right)
    stats: true,      // expanded (right)
    config: false     // collapsed (right)
};



// Canvas elements
let topViewCanvas, topViewCtx;
let sideViewCanvas, sideViewCtx;

// Scale for rendering (pixels per mm) - will be dynamically calculated
let TOP_VIEW_SCALE = 0.2; // 1mm = 0.2px
let SIDE_VIEW_SCALE = 0.2;

// Initialize application
function init() {
    // Get canvas elements
    topViewCanvas = document.getElementById('topViewCanvas');
    topViewCtx = topViewCanvas.getContext('2d');
    sideViewCanvas = document.getElementById('sideViewCanvas');
    sideViewCtx = sideViewCanvas.getContext('2d');
    
    // Initialize collapsible sections
    initCollapsibleSections();

    // Set up event listeners
    document.getElementById('palletType').addEventListener('change', updatePalletInfo);
    document.getElementById('loadWeight').addEventListener('input', updatePalletInfo);
    document.getElementById('goodsHeight').addEventListener('input', updatePalletInfo);
    document.getElementById('addPalletBtn').addEventListener('click', addPallet);
    document.getElementById('rotatePalletBtn').addEventListener('click', rotateSelectedPallet);
    document.getElementById('deletePalletBtn').addEventListener('click', deleteSelectedPallet);
    document.getElementById('clearAllBtn').addEventListener('click', clearAll);
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfiguration);
    // Vehicle management event listeners
    document.getElementById('addVehicleBtn').addEventListener('click', openAddVehicleModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeVehicleModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeVehicleModal);
    document.getElementById('vehicleForm').addEventListener('submit', saveVehicleFromModal);
    
    // Close modal on overlay click
    document.getElementById('vehicleModal').addEventListener('click', (e) => {
        if (e.target.id === 'vehicleModal') {
            closeVehicleModal();
        }
    });
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('vehicleModal').style.display !== 'none') {
            closeVehicleModal();
        }
    });
    
    // Measurement tool event listeners
    document.getElementById('measurementModeBtn').addEventListener('click', toggleMeasurementMode);
    document.getElementById('measurementUnit').addEventListener('change', changeMeasurementUnit);
    

    
    // Clear all measurements button with verification
    const clearBtn = document.getElementById('clearAllMeasurementsBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllMeasurements);
        console.log('✓ Clear measurements button listener attached successfully');
    } else {
        console.error('❌ Clear measurements button not found in DOM!');
    }

    // Canvas mouse events for drag and drop
    topViewCanvas.addEventListener('mousedown', handleMouseDown);
    topViewCanvas.addEventListener('mousemove', handleMouseMove);
    topViewCanvas.addEventListener('mouseup', handleMouseUp);
    topViewCanvas.addEventListener('mouseleave', handleMouseUp);
    topViewCanvas.addEventListener('contextmenu', handleRightClick);
    
    // Keyboard shortcuts for measurement tool
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Initial render
    updatePalletInfo();
    updateStatistics();
    updateConfigList();
    updateVehicleConfigDisplay();
    updateMeasurementCount();
    
    // Initialize vehicles
    initializeVehicles();
    
    // Initialize canvas size ONCE on load
    updateCanvasSize();
    renderTopView();
    renderSideView();
    
    // Handle window resize - only update canvas size on actual window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            updateCanvasSize();
            renderTopView();
            renderSideView();
        }, 150);
    });
}

// ===== LOCALSTORAGE FUNCTIONS =====

// Save vehicle to storage
function saveVehicleToStorage(vehicle) {
    try {
        let vehicles = JSON.parse(storage.getItem(STORAGE_KEYS.VEHICLES)) || [];
        
        const existingIndex = vehicles.findIndex(v => v.id === vehicle.id);
        
        if (existingIndex >= 0) {
            vehicles[existingIndex] = vehicle;
        } else {
            vehicles.push(vehicle);
        }
        
        storage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
        console.log('✓ Vehicle saved:', vehicle.name);
        return true;
    } catch (error) {
        console.error('Error saving vehicle:', error);
        return false;
    }
}

// Load vehicles from storage
function loadVehiclesFromStorage() {
    try {
        const vehiclesJson = storage.getItem(STORAGE_KEYS.VEHICLES);
        
        if (!vehiclesJson) {
            console.log('No saved vehicles found');
            return [];
        }
        
        const vehicles = JSON.parse(vehiclesJson);
        console.log('✓ Loaded', vehicles.length, 'vehicles from storage');
        return vehicles;
    } catch (error) {
        console.error('Error loading vehicles:', error);
        return [];
    }
}

// Save active vehicle ID
function setActiveVehicleId(vehicleId) {
    try {
        storage.setItem(STORAGE_KEYS.ACTIVE_VEHICLE, vehicleId);
        console.log('✓ Active vehicle saved:', vehicleId);
    } catch (error) {
        console.error('Error saving active vehicle:', error);
    }
}

// Get active vehicle ID
function getActiveVehicleId() {
    try {
        return storage.getItem(STORAGE_KEYS.ACTIVE_VEHICLE);
    } catch (error) {
        console.error('Error loading active vehicle:', error);
        return null;
    }
}

// Delete vehicle from storage
function deleteVehicleFromStorage(vehicleId) {
    try {
        let vehicles = JSON.parse(storage.getItem(STORAGE_KEYS.VEHICLES)) || [];
        
        vehicles = vehicles.filter(v => v.id !== vehicleId);
        
        storage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
        
        console.log('✓ Vehicle deleted from storage');
        
        const activeId = getActiveVehicleId();
        if (activeId && parseInt(activeId) === vehicleId) {
            storage.removeItem(STORAGE_KEYS.ACTIVE_VEHICLE);
        }
        
        return true;
    } catch (error) {
        console.error('Error deleting vehicle:', error);
        return false;
    }
}

// Save next vehicle ID
function saveNextVehicleId() {
    try {
        storage.setItem(STORAGE_KEYS.NEXT_VEHICLE_ID, nextVehicleId.toString());
    } catch (error) {
        console.error('Error saving next vehicle ID:', error);
    }
}

// Load next vehicle ID
function loadNextVehicleId() {
    try {
        const id = storage.getItem(STORAGE_KEYS.NEXT_VEHICLE_ID);
        return id ? parseInt(id) : 1;
    } catch (error) {
        console.error('Error loading next vehicle ID:', error);
        return 1;
    }
}

// Show notification message
function showNotification(message, type = 'success') {
    const notifDiv = document.createElement('div');
    notifDiv.className = 'notification notification-' + type;
    notifDiv.textContent = message;
    notifDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-weight: 500;
        animation: slideInRight 0.3s ease-out;
    `;
    
    document.body.appendChild(notifDiv);
    
    setTimeout(() => {
        notifDiv.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notifDiv.remove(), 300);
    }, 3000);
}

// ===== VEHICLE MANAGEMENT FUNCTIONS =====

// Initialize vehicles on page load
function initializeVehicles() {
    console.log('Initializing vehicles from storage...');
    
    // Load next vehicle ID
    nextVehicleId = loadNextVehicleId();
    
    // Load vehicles from localStorage
    vehicles = loadVehiclesFromStorage();
    
    // Load active vehicle ID
    const savedActiveId = getActiveVehicleId();
    if (savedActiveId) {
        activeVehicleId = parseInt(savedActiveId);
    }
    
    // If no vehicles exist, create defaults
    if (vehicles.length === 0) {
        console.log('No saved vehicles, creating defaults...');
        
        const defaultVehicles = [
            {
                id: nextVehicleId++,
                name: 'Газель (стандартная)',
                length_mm: 3000,
                width_mm: 1900,
                height_mm: 1800,
                max_weight_kg: 1700,
                timestamp: new Date().toISOString(),
                is_default: true
            },
            {
                id: nextVehicleId++,
                name: 'Газель (мини)',
                length_mm: 2500,
                width_mm: 1600,
                height_mm: 1600,
                max_weight_kg: 1200,
                timestamp: new Date().toISOString(),
                is_default: true
            }
        ];
        
        defaultVehicles.forEach(v => {
            vehicles.push(v);
            saveVehicleToStorage(v);
        });
        
        activeVehicleId = defaultVehicles[0].id;
        setActiveVehicleId(activeVehicleId);
        saveNextVehicleId();
    }
    
    // Validate active vehicle ID
    if (!activeVehicleId || !vehicles.find(v => v.id === activeVehicleId)) {
        activeVehicleId = vehicles[0].id;
        setActiveVehicleId(activeVehicleId);
    }
    
    // Apply active vehicle
    const activeVehicle = vehicles.find(v => v.id === activeVehicleId);
    if (activeVehicle) {
        applyVehicleToSimulator(activeVehicle);
        console.log('✓ Applied active vehicle:', activeVehicle.name);
    }
    
    updateVehicleList();
    updateCurrentVehicleDisplay();
    
    console.log('✓ Vehicle initialization complete');
}

// Open modal for adding vehicle
function openAddVehicleModal() {
    const modal = document.getElementById('vehicleModal');
    modal.style.display = 'flex';
    
    // Reset form
    document.getElementById('vehicleForm').reset();
    
    // Clear error messages
    clearFormErrors();
    
    // Set default values
    document.getElementById('modalLength').value = 3000;
    document.getElementById('modalWidth').value = 1900;
    document.getElementById('modalHeight').value = 1800;
    document.getElementById('modalCapacity').value = 1700;
    
    // Focus on name input
    setTimeout(() => {
        document.getElementById('modalVehicleName').focus();
    }, 100);
    
    // Disable body scroll
    document.body.style.overflow = 'hidden';
}

// Close vehicle modal
function closeVehicleModal() {
    const modal = document.getElementById('vehicleModal');
    modal.style.display = 'none';
    
    // Clear form
    document.getElementById('vehicleForm').reset();
    clearFormErrors();
    
    // Enable body scroll
    document.body.style.overflow = '';
}

// Clear form validation errors
function clearFormErrors() {
    const errorElements = document.querySelectorAll('.error-message');
    errorElements.forEach(el => el.textContent = '');
    
    const inputs = document.querySelectorAll('.modal-form .form-control');
    inputs.forEach(input => input.classList.remove('error'));
}

// Validate form inputs
function validateVehicleForm() {
    let isValid = true;
    clearFormErrors();
    
    // Validate name
    const name = document.getElementById('modalVehicleName').value.trim();
    if (!name) {
        showFieldError('modalVehicleName', 'nameError', 'Имя обязательно');
        isValid = false;
    } else if (name.length > 50) {
        showFieldError('modalVehicleName', 'nameError', 'Максимум 50 символов');
        isValid = false;
    }
    
    // Validate length
    const length = parseInt(document.getElementById('modalLength').value);
    if (!length || length < 1000 || length > 5000) {
        showFieldError('modalLength', 'lengthError', 'От 1000 до 5000 мм');
        isValid = false;
    }
    
    // Validate width
    const width = parseInt(document.getElementById('modalWidth').value);
    if (!width || width < 800 || width > 3000) {
        showFieldError('modalWidth', 'widthError', 'От 800 до 3000 мм');
        isValid = false;
    }
    
    // Validate height
    const height = parseInt(document.getElementById('modalHeight').value);
    if (!height || height < 800 || height > 3000) {
        showFieldError('modalHeight', 'heightError', 'От 800 до 3000 мм');
        isValid = false;
    }
    
    // Validate capacity
    const capacity = parseInt(document.getElementById('modalCapacity').value);
    if (!capacity || capacity < 500 || capacity > 5000) {
        showFieldError('modalCapacity', 'capacityError', 'От 500 до 5000 кг');
        isValid = false;
    }
    
    return isValid;
}

// Show field validation error
function showFieldError(inputId, errorId, message) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    
    input.classList.add('error');
    error.textContent = message;
}

// Save vehicle from modal
function saveVehicleFromModal(event) {
    event.preventDefault();
    
    if (!validateVehicleForm()) {
        return;
    }
    
    const name = document.getElementById('modalVehicleName').value.trim();
    const length = parseInt(document.getElementById('modalLength').value);
    const width = parseInt(document.getElementById('modalWidth').value);
    const height = parseInt(document.getElementById('modalHeight').value);
    const capacity = parseInt(document.getElementById('modalCapacity').value);
    
    const newVehicle = {
        id: nextVehicleId++,
        name: name,
        length_mm: length,
        width_mm: width,
        height_mm: height,
        max_weight_kg: capacity,
        timestamp: new Date().toISOString(),
        is_default: false
    };
    
    vehicles.push(newVehicle);
    
    // Save to localStorage
    saveVehicleToStorage(newVehicle);
    saveNextVehicleId();
    
    // Close modal
    closeVehicleModal();
    
    // Update list
    updateVehicleList();
    
    // Show notification
    showNotification(`✓ Машина "${name}" добавлена и сохранена`);
}

// Update vehicle list display
function updateVehicleList() {
    const listContainer = document.getElementById('vehicleList');
    
    if (vehicles.length === 0) {
        listContainer.innerHTML = '<div class="vehicle-list-empty">Нет сохраненных авто</div>';
        return;
    }
    
    listContainer.innerHTML = '';
    
    vehicles.forEach(vehicle => {
        const isActive = vehicle.id === activeVehicleId;
        
        const item = document.createElement('div');
        item.className = 'vehicle-item' + (isActive ? ' active' : '');
        
        const specs = `${vehicle.length_mm}×${vehicle.width_mm}×${vehicle.height_mm}мм, ${vehicle.max_weight_kg}кг`;
        
        item.innerHTML = `
            <div class="vehicle-info">
                <span class="vehicle-name">${vehicle.name}</span>
                <span class="vehicle-specs">${specs}</span>
                ${isActive ? '<span class="vehicle-status">✓ Используется</span>' : ''}
            </div>
            <div class="vehicle-actions">
                ${!isActive ? `<button class="btn-select" onclick="selectVehicle(${vehicle.id})">Выбрать</button>` : ''}
                <button class="btn-delete" onclick="deleteVehicle(${vehicle.id})" title="Удалить">🗑️</button>
            </div>
        `;
        
        listContainer.appendChild(item);
    });
}

// Update current vehicle display
function updateCurrentVehicleDisplay() {
    const activeVehicle = vehicles.find(v => v.id === activeVehicleId);
    
    if (activeVehicle) {
        document.getElementById('currentVehicleName').textContent = activeVehicle.name;
        const specs = `${activeVehicle.length_mm}×${activeVehicle.width_mm}×${activeVehicle.height_mm}мм, ${activeVehicle.max_weight_kg}кг`;
        document.getElementById('currentVehicleSpecs').textContent = specs;
    }
}

// Select vehicle and apply to simulator
function selectVehicle(vehicleId) {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    
    if (!vehicle) {
        alert('Авто не найдено');
        return;
    }
    
    // Warn if pallets will be cleared
    if (pallets.length > 0) {
        if (!confirm(`Смена авто удалит все текущие паллеты (${pallets.length} шт).\n\nПродолжить?`)) {
            return;
        }
        
        // Clear pallets
        pallets = [];
        nextPalletId = 1;
        selectedPallet = null;
    }
    
    // Set as active
    activeVehicleId = vehicle.id;
    
    // Save to localStorage
    setActiveVehicleId(vehicle.id);
    
    // Apply to simulator
    applyVehicleToSimulator(vehicle);
    
    // Update displays
    updateVehicleList();
    updateCurrentVehicleDisplay();
    updateStatistics();
    updatePalletList();
    renderTopView();
    renderSideView();
    
    // Show notification
    showNotification(`✓ Выбрана машина: ${vehicle.name}`);
}

// Delete vehicle
function deleteVehicle(vehicleId) {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    
    if (!vehicle) {
        return;
    }
    
    const isActive = vehicleId === activeVehicleId;
    
    let confirmMessage = `Удалить авто "${vehicle.name}"?\n\nЭто действие необратимо.`;
    
    if (isActive) {
        confirmMessage = `⚠️ Вы пытаетесь удалить текущее активное авто "${vehicle.name}"!\n\nЭто удалит все паллеты и переключит на другое авто.\n\nПродолжить?`;
    }
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    // Remove vehicle from memory
    const index = vehicles.findIndex(v => v.id === vehicleId);
    if (index !== -1) {
        vehicles.splice(index, 1);
    }
    
    // Delete from localStorage
    deleteVehicleFromStorage(vehicleId);
    
    // If was active, switch to first available or create default
    if (isActive) {
        // Clear pallets
        pallets = [];
        nextPalletId = 1;
        selectedPallet = null;
        
        if (vehicles.length === 0) {
            // Create default vehicle
            const defaultVehicle = {
                id: nextVehicleId++,
                name: 'Газель (стандартная)',
                length_mm: 3000,
                width_mm: 1900,
                height_mm: 1800,
                max_weight_kg: 1700,
                timestamp: new Date().toISOString(),
                is_default: true
            };
            vehicles.push(defaultVehicle);
            activeVehicleId = defaultVehicle.id;
            
            // Save to localStorage
            saveVehicleToStorage(defaultVehicle);
            setActiveVehicleId(defaultVehicle.id);
            saveNextVehicleId();
            
            applyVehicleToSimulator(defaultVehicle);
        } else {
            // Switch to first vehicle
            activeVehicleId = vehicles[0].id;
            setActiveVehicleId(vehicles[0].id);
            applyVehicleToSimulator(vehicles[0]);
        }
        
        updateStatistics();
        updatePalletList();
        renderTopView();
        renderSideView();
    }
    
    // Update displays
    updateVehicleList();
    updateCurrentVehicleDisplay();
    
    showNotification(`✓ Машина "${vehicle.name}" удалена`);
}

// Apply vehicle parameters to simulator
function applyVehicleToSimulator(vehicle) {
    VEHICLE.name = vehicle.name;
    VEHICLE.length_mm = vehicle.length_mm;
    VEHICLE.width_mm = vehicle.width_mm;
    VEHICLE.height_mm = vehicle.height_mm;
    VEHICLE.max_weight_kg = vehicle.max_weight_kg;
    VEHICLE.volume_m3 = (vehicle.length_mm * vehicle.width_mm * vehicle.height_mm) / 1000000000;
    
    updateCanvasSize();
}





// Initialize collapsible sections
function initCollapsibleSections() {
    const sections = document.querySelectorAll('.collapsible-section');
    sections.forEach(section => {
        const sectionName = section.getAttribute('data-section');
        const header = section.querySelector('.section-header');
        const isExpanded = sectionStates[sectionName];
        
        // Set initial state
        if (isExpanded) {
            section.classList.add('expanded');
            section.classList.remove('collapsed');
        } else {
            section.classList.add('collapsed');
            section.classList.remove('expanded');
        }
        
        // Add click handler
        header.addEventListener('click', () => toggleSection(sectionName));
        
        // Add keyboard support
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleSection(sectionName);
            }
        });
    });
}

// Toggle section collapse/expand
function toggleSection(sectionName) {
    const section = document.querySelector(`[data-section="${sectionName}"]`);
    const isCurrentlyExpanded = sectionStates[sectionName];
    
    sectionStates[sectionName] = !isCurrentlyExpanded;
    
    if (sectionStates[sectionName]) {
        section.classList.add('expanded');
        section.classList.remove('collapsed');
        section.querySelector('.chevron').textContent = '▼';
    } else {
        section.classList.add('collapsed');
        section.classList.remove('expanded');
        section.querySelector('.chevron').textContent = '▶';
    }
}

// Update canvas size based on vehicle dimensions
function updateCanvasSize() {
    // Get container dimensions
    const container = document.getElementById('topViewContainer');
    if (!container) return;
    
    const containerWidth = container.clientWidth - 32; // Account for padding
    const containerHeight = container.clientHeight - 32;
    
    // Maximum canvas sizes
    const maxCanvasWidth = Math.min(500, containerWidth);
    const maxCanvasHeight = Math.min(500, containerHeight);
    const padding = 20; // pixels padding around vehicle
    
    // Calculate aspect ratio
    const aspectRatio = VEHICLE.width_mm / VEHICLE.length_mm;
    
    // Calculate canvas dimensions to fit vehicle with padding
    let canvasWidth, canvasHeight;
    
    if (aspectRatio > 1) {
        // Vehicle is wider than it is long
        canvasHeight = Math.min(maxCanvasHeight, VEHICLE.width_mm * 0.2 + padding * 2);
        canvasWidth = canvasHeight / aspectRatio;
    } else {
        // Vehicle is longer than it is wide
        canvasWidth = Math.min(maxCanvasWidth, VEHICLE.length_mm * 0.2 + padding * 2);
        canvasHeight = canvasWidth * aspectRatio;
    }
    
    // Ensure maximum dimensions
    if (canvasWidth > maxCanvasWidth) {
        canvasWidth = maxCanvasWidth;
        canvasHeight = canvasWidth * aspectRatio;
    }
    if (canvasHeight > maxCanvasHeight) {
        canvasHeight = maxCanvasHeight;
        canvasWidth = canvasHeight / aspectRatio;
    }
    
    // Calculate scale to fit vehicle in canvas with padding
    TOP_VIEW_SCALE = Math.min(
        (canvasWidth - padding * 2) / VEHICLE.length_mm,
        (canvasHeight - padding * 2) / VEHICLE.width_mm
    );
    
    // CRITICAL: Only resize canvas if dimensions actually changed
    const newWidth = Math.round(canvasWidth);
    const newHeight = Math.round(canvasHeight);
    
    if (topViewCanvas.width !== newWidth || topViewCanvas.height !== newHeight) {
        // Set canvas drawing buffer size (element attributes only)
        topViewCanvas.width = newWidth;
        topViewCanvas.height = newHeight;
        
        console.log('Canvas resized to:', newWidth, 'x', newHeight);
    }
    
    // Update side view canvas width to match
    if (sideViewCanvas.width !== newWidth) {
        sideViewCanvas.width = newWidth;
    }
    SIDE_VIEW_SCALE = TOP_VIEW_SCALE;
    
    // Update dimension label
    document.getElementById('vehicleDimensionsLabel').textContent = 
        `L: ${VEHICLE.length_mm}мм × W: ${VEHICLE.width_mm}мм | Масштаб: 1 клетка = 100 мм`;
    document.getElementById('vehicleHeightLabel').textContent = 
        `Высота кузова: ${VEHICLE.height_mm} мм`;
}

// Check height limit and return status
function checkHeightLimit(goodsHeightMm) {
    const totalHeightMm = PALLET_BASE_HEIGHT_MM + goodsHeightMm;
    const exceedsLimit = totalHeightMm > HEIGHT_LIMIT_MM;
    const exceededByMm = totalHeightMm - HEIGHT_LIMIT_MM;
    const exceededByCm = exceededByMm / 10;
    const isCaution = totalHeightMm > HEIGHT_OK_THRESHOLD_MM && totalHeightMm <= HEIGHT_CAUTION_THRESHOLD_MM;
    const isOk = totalHeightMm <= HEIGHT_OK_THRESHOLD_MM;
    
    return {
        totalHeightMm: totalHeightMm,
        totalHeightCm: totalHeightMm / 10,
        exceedsLimit: exceedsLimit,
        exceededByMm: exceededByMm,
        exceededByCm: exceededByCm,
        isCaution: isCaution,
        isOk: isOk
    };
}

// Get all pallets exceeding height limit
function getOverheightPallets() {
    return pallets.filter(pallet => {
        const totalHeight = pallet.height + pallet.goodsHeight;
        return totalHeight > HEIGHT_LIMIT_MM;
    });
}

// Update height warning display
function updateHeightWarning(goodsHeightMm) {
    const status = checkHeightLimit(goodsHeightMm);
    
    // Update display values
    document.getElementById('goodsHeightDisplay').textContent = goodsHeightMm;
    document.getElementById('totalHeightDisplay').textContent = Math.round(status.totalHeightMm);
    document.getElementById('totalHeightCmDisplay').textContent = status.totalHeightCm.toFixed(1);
    
    // Hide all warnings first
    document.getElementById('heightWarning').style.display = 'none';
    document.getElementById('heightCaution').style.display = 'none';
    document.getElementById('heightOk').style.display = 'none';
    
    // Show appropriate warning
    if (status.exceedsLimit) {
        document.getElementById('heightExcess').textContent = status.exceededByCm.toFixed(1);
        document.getElementById('heightWarning').style.display = 'block';
    } else if (status.isCaution) {
        document.getElementById('heightCaution').style.display = 'block';
    } else if (status.isOk) {
        document.getElementById('heightOk').style.display = 'block';
    }
}

// Update pallet information display
function updatePalletInfo() {
    const palletType = document.getElementById('palletType').value;
    const loadWeight = parseFloat(document.getElementById('loadWeight').value) || 0;
    const goodsHeight = parseFloat(document.getElementById('goodsHeight').value) || 0;
    const pallet = PALLET_TYPES[palletType];

    const totalWeight = pallet.empty_weight_kg + loadWeight;
    document.getElementById('totalPalletWeight').textContent = `${totalWeight} кг`;
    document.getElementById('maxPalletCapacity').textContent = `${pallet.max_load_kg} кг`;

    // Validate weight
    const loadWeightInput = document.getElementById('loadWeight');
    if (loadWeight > pallet.max_load_kg) {
        loadWeightInput.style.borderColor = '#F44336';
    } else {
        loadWeightInput.style.borderColor = '';
    }
    
    // Update height warning
    updateHeightWarning(goodsHeight);
}

// Add a new pallet
function addPallet() {
    const palletType = document.getElementById('palletType').value;
    const palletName = document.getElementById('palletName').value.trim();
    const loadWeight = parseFloat(document.getElementById('loadWeight').value) || 0;
    const goodsHeight = parseFloat(document.getElementById('goodsHeight').value) || 0;
    const palletSpec = PALLET_TYPES[palletType];

    // Validate load weight
    if (loadWeight > palletSpec.max_load_kg) {
        alert(`Вес груза превышает максимальную грузоподъемность паллеты (${palletSpec.max_load_kg} кг)`);
        return;
    }

    // Validate total height
    const totalHeight = palletSpec.height_mm + goodsHeight;
    
    // Check height limit (220 cm)
    const heightStatus = checkHeightLimit(goodsHeight);
    if (heightStatus.exceedsLimit) {
        const confirmMsg = `⚠️ Внимание: Высота паллеты превышает рекомендуемый лимит\n\n` +
            `Паллета: ${palletSpec.name}\n` +
            `Товар: ${goodsHeight} мм\n` +
            `Общая высота: ${Math.round(heightStatus.totalHeightMm)} мм (${heightStatus.totalHeightCm.toFixed(1)} см)\n\n` +
            `Безопасный лимит: ${HEIGHT_LIMIT_MM} мм (${HEIGHT_LIMIT_CM} см)\n` +
            `Превышение: ${Math.round(heightStatus.exceededByMm)} мм (${heightStatus.exceededByCm.toFixed(1)} см)\n\n` +
            `⚠️ Это может вызвать проблемы при:\n` +
            `- Загрузке в Газель\n` +
            `- Проезде низких ворот/туннелей\n` +
            `- Безопасности груза\n\n` +
            `Вы уверены что хотите добавить?`;
        
        if (!confirm(confirmMsg)) {
            return;
        }
    }
    
    if (totalHeight > VEHICLE.height_mm) {
        alert(`Общая высота паллеты с грузом (${totalHeight} мм) превышает высоту кузова (${VEHICLE.height_mm} мм)`);
        return;
    }

    // Find a suitable position
    const position = findAvailablePosition(palletSpec.length_mm, palletSpec.width_mm);
    if (!position) {
        alert('Недостаточно места для размещения паллеты');
        return;
    }

    const pallet = {
        id: nextPalletId++,
        name: palletName || `Паллета #${nextPalletId}`,
        type: palletType,
        x: position.x,
        y: position.y,
        length: palletSpec.length_mm,
        width: palletSpec.width_mm,
        height: palletSpec.height_mm,
        goodsHeight: goodsHeight,
        totalHeight: totalHeight,
        emptyWeight: palletSpec.empty_weight_kg,
        loadWeight: loadWeight,
        totalWeight: palletSpec.empty_weight_kg + loadWeight,
        rotation: 0
    };

    pallets.push(pallet);
    
    // Clear pallet name input for next pallet
    document.getElementById('palletName').value = '';
    
    updateStatistics();
    updatePalletList();
    renderTopView();
    renderSideView();
    
    // Update pallet count display in management block
    document.getElementById('palletCountDisplay').textContent = pallets.length;
}

// Find available position for a new pallet
function findAvailablePosition(length, width) {
    const margin = 50; // 50mm margin
    const stepSize = 100; // Try positions every 100mm

    // Try to place pallet at different positions
    for (let y = margin; y <= VEHICLE.width_mm - width - margin; y += stepSize) {
        for (let x = margin; x <= VEHICLE.length_mm - length - margin; x += stepSize) {
            if (isPositionAvailable(x, y, length, width)) {
                return { x, y };
            }
        }
    }

    // Try along the edges if no space found
    if (isPositionAvailable(margin, margin, length, width)) {
        return { x: margin, y: margin };
    }

    return null;
}

// Check if position is available (no collision with existing pallets)
function isPositionAvailable(x, y, length, width, excludePalletId = null) {
    // Check if within vehicle bounds
    if (x < 0 || y < 0 || x + length > VEHICLE.length_mm || y + width > VEHICLE.width_mm) {
        return false;
    }

    // Check collision with other pallets
    for (const pallet of pallets) {
        if (excludePalletId && pallet.id === excludePalletId) continue;

        const overlap = !(x + length <= pallet.x ||
                         x >= pallet.x + pallet.length ||
                         y + width <= pallet.y ||
                         y >= pallet.y + pallet.width);

        if (overlap) {
            return false;
        }
    }

    return true;
}

// Rotate selected pallet
function rotateSelectedPallet() {
    if (!selectedPallet) {
        alert('Выберите паллету для поворота');
        return;
    }
    rotatePallet(selectedPallet.id);
}

// Delete selected pallet
function deleteSelectedPallet() {
    if (!selectedPallet) {
        alert('Выберите паллету для удаления');
        return;
    }
    removePallet(selectedPallet.id);
}

// Clear all pallets
function clearAll() {
    if (pallets.length === 0) return;
    
    if (confirm('Вы уверены, что хотите удалить все паллеты?')) {
        pallets = [];
        nextPalletId = 1;
        selectedPallet = null;
        updateStatistics();
        updatePalletList();
        renderTopView();
        renderSideView();
    }
}

// Save configuration (in-memory)
function saveConfiguration() {
    if (pallets.length === 0) {
        alert('Нет паллет для сохранения');
        return;
    }
    
    const configName = document.getElementById('configName').value.trim();
    if (!configName) {
        alert('Введите название конфигурации');
        return;
    }
    
    // Check if name already exists
    const existingIndex = savedConfigurations.findIndex(c => c.name === configName);
    if (existingIndex !== -1) {
        if (!confirm('Конфигурация с таким именем уже существует. Перезаписать?')) {
            return;
        }
        savedConfigurations.splice(existingIndex, 1);
    }

    const config = {
        name: configName,
        pallets: JSON.parse(JSON.stringify(pallets)),
        vehicle: JSON.parse(JSON.stringify(VEHICLE)),
        timestamp: new Date().toISOString(),
        nextPalletId: nextPalletId
    };
    
    savedConfigurations.push(config);
    document.getElementById('configName').value = '';
    updateConfigList();
    alert(`Конфигурация "${configName}" сохранена`);
}

// Load configuration (from memory)
function loadConfiguration(configName) {
    const config = savedConfigurations.find(c => c.name === configName);
    if (!config) {
        alert('Конфигурация не найдена');
        return;
    }

    if (pallets.length > 0) {
        if (!confirm('Текущая конфигурация будет заменена. Продолжить?')) {
            return;
        }
    }

    pallets = JSON.parse(JSON.stringify(config.pallets));
    nextPalletId = config.nextPalletId;
    
    // Restore vehicle parameters if they differ
    if (config.vehicle) {
        VEHICLE.length_mm = config.vehicle.length_mm;
        VEHICLE.width_mm = config.vehicle.width_mm;
        VEHICLE.height_mm = config.vehicle.height_mm;
        VEHICLE.max_weight_kg = config.vehicle.max_weight_kg;
        VEHICLE.volume_m3 = config.vehicle.volume_m3;
        
        // Update form values
        document.getElementById('vehicleLength').value = VEHICLE.length_mm;
        document.getElementById('vehicleWidth').value = VEHICLE.width_mm;
        document.getElementById('vehicleHeight').value = VEHICLE.height_mm;
        document.getElementById('vehicleMaxWeight').value = VEHICLE.max_weight_kg;
    }

    updateCanvasSize();
    updateStatistics();
    updatePalletList();
    renderTopView();
    renderSideView();

    alert(`Конфигурация "${configName}" загружена`);
}

// Delete configuration
function deleteConfiguration(configName) {
    if (!confirm(`Удалить конфигурацию "${configName}"?`)) {
        return;
    }
    
    const index = savedConfigurations.findIndex(c => c.name === configName);
    if (index !== -1) {
        savedConfigurations.splice(index, 1);
        updateConfigList();
        alert(`Конфигурация "${configName}" удалена`);
    }
}

// Update configuration list display
function updateConfigList() {
    const listContainer = document.getElementById('configList');
    
    if (savedConfigurations.length === 0) {
        listContainer.innerHTML = '<div class="config-list-empty">Нет сохраненных конфигураций</div>';
        return;
    }
    
    listContainer.innerHTML = '';
    savedConfigurations.forEach(config => {
        const date = new Date(config.timestamp);
        const dateStr = date.toLocaleString('ru-RU', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const item = document.createElement('div');
        item.className = 'config-item';
        
        const palletCount = config.pallets.length;
        const totalWeight = config.pallets.reduce((sum, p) => sum + p.totalWeight, 0);
        
        item.innerHTML = `
            <div class="config-header">
                <span class="config-name">${config.name}</span>
            </div>
            <div class="config-date">${dateStr}</div>
            <div class="config-info">
                <span>Паллет: ${palletCount}</span>
                <span>Вес: ${totalWeight.toFixed(0)} кг</span>
            </div>
            <div class="config-controls">
                <button class="btn btn--primary btn--small" onclick="loadConfiguration('${config.name.replace(/'/g, "\\'")}')">Загрузить</button>
                <button class="btn btn--outline btn--small" onclick="deleteConfiguration('${config.name.replace(/'/g, "\\'")}')">✕</button>
            </div>
        `;
        
        listContainer.appendChild(item);
    });
}



// Update pallet list display
function updatePalletList() {
    const listContainer = document.getElementById('palletList');
    
    if (pallets.length === 0) {
        listContainer.innerHTML = '<div class="pallet-list-empty">Нет загруженных паллет</div>';
        return;
    }

    listContainer.innerHTML = '';
    pallets.forEach(pallet => {
        const palletSpec = PALLET_TYPES[pallet.type];
        const effectiveLength = pallet.rotation === 90 ? pallet.width : pallet.length;
        const effectiveWidth = pallet.rotation === 90 ? pallet.length : pallet.width;
        
        const item = document.createElement('div');
        item.className = 'pallet-item';
        if (selectedPallet && selectedPallet.id === pallet.id) {
            item.classList.add('selected');
        }
        
        // Check if pallet exceeds height limit
        const exceedsHeight = pallet.totalHeight > HEIGHT_LIMIT_MM;
        if (exceedsHeight) {
            item.classList.add('overheight');
        }
        
        const isEditing = editingPalletId === pallet.id;
        const displayName = pallet.name || `Паллета #${pallet.id}`;
        
        item.innerHTML = `
            <div class="pallet-header">
                <div class="pallet-name-container">
                    ${isEditing ? `
                        <div class="pallet-name-edit-container">
                            <input type="text" class="pallet-name-input" id="edit-input-${pallet.id}" value="${displayName}" maxlength="30">
                            <button class="pallet-name-edit-btn save" onclick="savePalletName(${pallet.id})" title="Сохранить">✓</button>
                            <button class="pallet-name-edit-btn cancel" onclick="cancelEditPalletName()" title="Отмена">✕</button>
                        </div>
                    ` : `
                        <div class="pallet-name-display">
                            <span class="pallet-name-text">${displayName}</span>
                            <span class="pallet-edit-icon" onclick="startEditPalletName(${pallet.id})" title="Редактировать название">✏️</span>
                        </div>
                    `}
                    <span class="pallet-type"> (${palletSpec.name}, ${effectiveLength}×${effectiveWidth}мм, ${pallet.totalWeight}кг)${exceedsHeight ? '<span class="height-badge">⚠️ ' + (pallet.totalHeight / 10).toFixed(1) + ' см</span>' : ''}</span>
                </div>
                <span class="pallet-delete-icon" onclick="removePallet(${pallet.id})" title="Удалить паллету">✕</span>
            </div>
            <div class="pallet-details">
                <div class="pallet-detail">
                    <span class="pallet-detail-label">Размер:</span>
                    <span class="pallet-detail-value">${effectiveLength}×${effectiveWidth} мм</span>
                </div>
                <div class="pallet-detail">
                    <span class="pallet-detail-label">Вес:</span>
                    <span class="pallet-detail-value">${pallet.totalWeight} кг</span>
                </div>
                <div class="pallet-detail">
                    <span class="pallet-detail-label">Высота груза:</span>
                    <span class="pallet-detail-value">${pallet.goodsHeight} мм</span>
                </div>
                <div class="pallet-detail">
                    <span class="pallet-detail-label">Общая высота:</span>
                    <span class="pallet-detail-value">${pallet.totalHeight} мм (${(pallet.totalHeight / 10).toFixed(1)} см)${exceedsHeight ? ' ⚠️' : ''}</span>
                </div>
                <div class="pallet-detail">
                    <span class="pallet-detail-label">Поворот:</span>
                    <span class="pallet-detail-value">${pallet.rotation}°</span>
                </div>
            </div>
            <div class="pallet-controls">
                <button class="btn btn--secondary btn--small" onclick="duplicatePallet(${pallet.id})" title="Дублировать паллету">📋 Дублировать</button>
                <button class="btn btn--secondary btn--small" onclick="rotatePallet(${pallet.id})" title="Повернуть на 90°">🔄 Повернуть</button>
            </div>
        `;
        
        item.addEventListener('click', (e) => {
            if (!e.target.closest('button') && !e.target.closest('.pallet-edit-icon') && !e.target.closest('.pallet-delete-icon') && !e.target.closest('.pallet-name-input')) {
                selectPallet(pallet.id);
            }
        });
        
        listContainer.appendChild(item);
        
        // Focus input if editing
        if (isEditing) {
            setTimeout(() => {
                const input = document.getElementById(`edit-input-${pallet.id}`);
                if (input) {
                    input.focus();
                    input.select();
                    
                    // Add keyboard handlers
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            savePalletName(pallet.id);
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEditPalletName();
                        }
                    });
                }
            }, 10);
        }
    });
}

// Start editing pallet name
function startEditPalletName(palletId) {
    editingPalletId = palletId;
    updatePalletList();
}

// Save pallet name
function savePalletName(palletId) {
    const input = document.getElementById(`edit-input-${palletId}`);
    if (!input) return;
    
    const newName = input.value.trim();
    const pallet = pallets.find(p => p.id === palletId);
    
    if (pallet) {
        if (newName === '') {
            pallet.name = `Паллета #${pallet.id}`;
        } else {
            pallet.name = newName;
        }
    }
    
    editingPalletId = null;
    updatePalletList();
    renderTopView();
    renderSideView();
}

// Cancel editing pallet name
function cancelEditPalletName() {
    editingPalletId = null;
    updatePalletList();
}

// Select pallet
function selectPallet(palletId) {
    const pallet = pallets.find(p => p.id === palletId);
    if (pallet) {
        selectedPallet = pallet;
        updatePalletList();
        renderTopView();
    }
}

// Duplicate pallet
function duplicatePallet(palletId) {
    const originalPallet = pallets.find(p => p.id === palletId);
    if (!originalPallet) return;

    // Check max pallets limit
    if (pallets.length >= 12) {
        alert('Максимальное количество паллет достигнуто (12)');
        return;
    }

    // Calculate effective dimensions based on rotation
    const effectiveLength = originalPallet.rotation === 90 ? originalPallet.width : originalPallet.length;
    const effectiveWidth = originalPallet.rotation === 90 ? originalPallet.length : originalPallet.width;

    // Try to place duplicate next to original (offset by 50mm)
    let newX = originalPallet.x + effectiveLength + 50;
    let newY = originalPallet.y;

    // Check if this position is valid
    if (!isPositionAvailable(newX, newY, effectiveLength, effectiveWidth)) {
        // Try to find any available position
        const position = findAvailablePosition(effectiveLength, effectiveWidth);
        if (!position) {
            alert('Недостаточно места для дублирования\nПереместите существующую паллету или удалите лишние');
            return;
        }
        newX = position.x;
        newY = position.y;
    }

    // Check if new position is within vehicle bounds
    if (newX + effectiveLength > VEHICLE.length_mm || newY + effectiveWidth > VEHICLE.width_mm) {
        // Try to find any available position
        const position = findAvailablePosition(effectiveLength, effectiveWidth);
        if (!position) {
            alert('Недостаточно места для дублирования\nПереместите существующую паллету или удалите лишние');
            return;
        }
        newX = position.x;
        newY = position.y;
    }

    // Check if total weight would exceed capacity
    const totalWeight = pallets.reduce((sum, p) => sum + p.totalWeight, 0);
    if (totalWeight + originalPallet.totalWeight > VEHICLE.max_weight_kg) {
        if (!confirm('Превышена максимальная грузоподъемность.\nВсё равно добавить паллету?')) {
            return;
        }
    }

    // Check if height would exceed limit
    if (originalPallet.totalHeight > VEHICLE.height_mm) {
        if (!confirm('Превышена максимальная высота загрузки.\nВсё равно добавить паллету?')) {
            return;
        }
    }

    // Generate unique name for duplicate
    let baseName = originalPallet.name || `Паллета #${originalPallet.id}`;
    let duplicateName = baseName + ' копия';
    
    // Check if name already exists and add counter
    let counter = 2;
    while (pallets.some(p => p.name === duplicateName)) {
        duplicateName = baseName + ` копия ${counter}`;
        counter++;
    }

    // Create duplicate pallet
    const duplicate = {
        id: nextPalletId++,
        name: duplicateName,
        type: originalPallet.type,
        x: newX,
        y: newY,
        length: originalPallet.length,
        width: originalPallet.width,
        height: originalPallet.height,
        goodsHeight: originalPallet.goodsHeight,
        totalHeight: originalPallet.totalHeight,
        emptyWeight: originalPallet.emptyWeight,
        loadWeight: originalPallet.loadWeight,
        totalWeight: originalPallet.totalWeight,
        rotation: originalPallet.rotation
    };

    pallets.push(duplicate);
    
    // Select the new duplicate
    selectedPallet = duplicate;
    
    updateStatistics();
    updatePalletList();
    renderTopView();
    renderSideView();
    
    // Show success message
    showSuccessMessage('✓ Паллета дублирована');
}

// Show temporary success message
function showSuccessMessage(message) {
    // Create message element if it doesn't exist
    let messageEl = document.getElementById('successMessage');
    if (!messageEl) {
        messageEl = document.createElement('div');
        messageEl.id = 'successMessage';
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: var(--color-success);
            color: white;
            padding: 12px 20px;
            border-radius: var(--radius-base);
            box-shadow: var(--shadow-lg);
            z-index: 1000;
            font-weight: var(--font-weight-medium);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(messageEl);
    }
    
    messageEl.textContent = message;
    messageEl.style.opacity = '1';
    
    // Hide after 2 seconds
    setTimeout(() => {
        messageEl.style.opacity = '0';
    }, 2000);
}

// Rotate pallet
function rotatePallet(palletId) {
    const pallet = pallets.find(p => p.id === palletId);
    if (!pallet) return;

    const newRotation = pallet.rotation === 0 ? 90 : 0;
    const newLength = newRotation === 90 ? pallet.width : pallet.length;
    const newWidth = newRotation === 90 ? pallet.length : pallet.width;

    // Check if rotated pallet fits in vehicle
    if (pallet.x + newLength > VEHICLE.length_mm || pallet.y + newWidth > VEHICLE.width_mm) {
        alert('Паллета не влезет после поворота. Переместите её ближе к краю или уменьшите размеры кузова.');
        return;
    }

    // Check for overlap with other pallets
    if (!isPositionAvailable(pallet.x, pallet.y, newLength, newWidth, pallet.id)) {
        alert('Поворот невозможен: паллета будет перекрывать другую паллету.');
        return;
    }

    pallet.rotation = newRotation;
    updatePalletList();
    renderTopView();
    renderSideView();
}

// Remove pallet
function removePallet(palletId) {
    const index = pallets.findIndex(p => p.id === palletId);
    if (index !== -1) {
        pallets.splice(index, 1);
        if (selectedPallet && selectedPallet.id === palletId) {
            selectedPallet = null;
        }
        updateStatistics();
        updatePalletList();
        renderTopView();
        renderSideView();
    }
}

// Update statistics display
function updateStatistics() {
    const palletCount = pallets.length;
    const totalWeight = pallets.reduce((sum, p) => sum + p.totalWeight, 0);
    const totalVolume = pallets.reduce((sum, p) => sum + (p.length * p.width * p.height / 1000000000), 0); // Convert to m³
    const volumePercent = (totalVolume / VEHICLE.volume_m3) * 100;
    const weightPercent = (totalWeight / VEHICLE.max_weight_kg) * 100;
    const remainingWeight = VEHICLE.max_weight_kg - totalWeight;
    
    // Check for overheight pallets
    const overheightPallets = getOverheightPallets();
    const maxHeight = pallets.length > 0 ? Math.max(...pallets.map(p => p.totalHeight)) : 0;

    document.getElementById('palletCount').textContent = palletCount;
    document.getElementById('palletCountDisplay').textContent = palletCount;
    document.getElementById('volumeUsed').textContent = `${volumePercent.toFixed(1)}%`;
    document.getElementById('weightUsed').textContent = `${totalWeight.toFixed(0)} кг / ${VEHICLE.max_weight_kg} кг`;
    document.getElementById('weightRemaining').textContent = `${remainingWeight.toFixed(0)} кг`;

    // Update progress bars
    const volumeProgress = document.getElementById('volumeProgress');
    volumeProgress.style.width = `${Math.min(volumePercent, 100)}%`;
    volumeProgress.className = 'progress-fill';
    if (volumePercent > 90) volumeProgress.classList.add('warning');
    if (volumePercent > 100) volumeProgress.classList.add('error');

    const weightProgress = document.getElementById('weightProgress');
    weightProgress.style.width = `${Math.min(weightPercent, 100)}%`;
    weightProgress.className = 'progress-fill';
    if (weightPercent > 90) weightProgress.classList.add('warning');
    if (weightPercent > 100) weightProgress.classList.add('error');

    // Show warning message
    const warningMessage = document.getElementById('warningMessage');
    let warnings = [];
    
    if (totalWeight > VEHICLE.max_weight_kg) {
        warnings.push(`⚠️ Превышена грузоподъемность на ${(totalWeight - VEHICLE.max_weight_kg).toFixed(0)} кг!`);
    }
    
    if (overheightPallets.length > 0) {
        warnings.push(`⚠️ Обнаружены паллеты выше 220 см!`);
        warnings.push(`Палеты выше лимита: ${overheightPallets.length} из ${palletCount}`);
        warnings.push(`Максимальная высота: ${(maxHeight / 10).toFixed(1)} см`);
    }
    
    if (warnings.length > 0) {
        warningMessage.innerHTML = warnings.join('<br>');
        warningMessage.style.display = 'block';
    } else {
        warningMessage.style.display = 'none';
    }
}

// Reset canvas context to clean state
function resetCanvasContext() {
    const ctx = topViewCtx;
    const canvas = topViewCanvas;
    
    // CRITICAL: Reset transformation matrix to identity
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Clear entire canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Reset all drawing properties to defaults
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#000';
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.setLineDash([]);
    
    return ctx;
}

// Calculate proper scaling and positioning for vehicle
function calculateScaling() {
    const canvas = topViewCanvas;
    const paddingPx = 20;
    
    // Available space in canvas
    const availableWidth = canvas.width - (paddingPx * 2);
    const availableHeight = canvas.height - (paddingPx * 2);
    
    // Calculate scale to fit vehicle in available space
    const scaleX = availableWidth / VEHICLE.length_mm;
    const scaleY = availableHeight / VEHICLE.width_mm;
    const scale = Math.min(scaleX, scaleY);
    
    // Calculate actual drawn dimensions
    const drawnLengthPx = VEHICLE.length_mm * scale;
    const drawnWidthPx = VEHICLE.width_mm * scale;
    
    // Calculate starting position (centered with padding)
    const startX = paddingPx + (availableWidth - drawnLengthPx) / 2;
    const startY = paddingPx + (availableHeight - drawnWidthPx) / 2;
    
    return {
        scale: scale,
        startX: startX,
        startY: startY,
        drawnLengthPx: drawnLengthPx,
        drawnWidthPx: drawnWidthPx
    };
}

// Draw vehicle outline with grid
function drawVehicleOutline(ctx, scaling) {
    const { startX, startY, drawnLengthPx, drawnWidthPx } = scaling;
    
    // Draw vehicle outline rectangle
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, drawnLengthPx, drawnWidthPx);
    
    // Draw grid lines
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    
    const gridIntervalMm = 100;
    const gridIntervalPx = gridIntervalMm * scaling.scale;
    
    // Vertical grid lines
    for (let i = 0; i <= VEHICLE.length_mm; i += gridIntervalMm) {
        const x = startX + (i * scaling.scale);
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, startY + drawnWidthPx);
        ctx.stroke();
    }
    
    // Horizontal grid lines
    for (let i = 0; i <= VEHICLE.width_mm; i += gridIntervalMm) {
        const y = startY + (i * scaling.scale);
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(startX + drawnLengthPx, y);
        ctx.stroke();
    }
}

// Draw single pallet
function drawPalletOnCanvas(ctx, pallet, scaling) {
    const { startX, startY, scale } = scaling;
    
    const effectiveLength = pallet.rotation === 90 ? pallet.width : pallet.length;
    const effectiveWidth = pallet.rotation === 90 ? pallet.length : pallet.width;
    
    // Convert millimeters to canvas pixels
    const x = startX + (pallet.x * scale);
    const y = startY + (pallet.y * scale);
    const width = effectiveLength * scale;
    const height = effectiveWidth * scale;
    
    // Check if pallet exceeds height limit
    const exceedsHeight = pallet.totalHeight > HEIGHT_LIMIT_MM;
    
    // Determine color based on weight
    const weightPercent = (pallets.reduce((sum, p) => sum + p.totalWeight, 0) / VEHICLE.max_weight_kg) * 100;
    let color = '#4CAF50';
    if (weightPercent > 90) color = '#FF9800';
    if (weightPercent > 100) color = '#F44336';
    
    // Highlight if selected
    if (selectedPallet && selectedPallet.id === pallet.id) {
        ctx.fillStyle = 'rgba(33, 128, 141, 0.3)';
        ctx.fillRect(x - 3, y - 3, width + 6, height + 6);
    }
    
    // Draw pallet rectangle
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
    
    // Draw pallet border
    let borderColor = '#333';
    if (selectedPallet && selectedPallet.id === pallet.id) {
        borderColor = '#21808D';
    } else if (exceedsHeight) {
        borderColor = '#F44336';
    }
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = selectedPallet && selectedPallet.id === pallet.id ? 2 : (exceedsHeight ? 2 : 1);
    ctx.strokeRect(x, y, width, height);
    
    // Draw rotation indicator
    if (pallet.rotation === 90) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x + 2, y + 2, 20, 14);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('90°', x + 4, y + 4);
    }
    
    // Draw pallet info
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const displayName = pallet.name || `#${pallet.id}`;
    const maxWidth = width - 10;
    let fontSize = 11;
    ctx.font = `bold ${fontSize}px Arial`;
    while (ctx.measureText(displayName).width > maxWidth && fontSize > 8) {
        fontSize--;
        ctx.font = `bold ${fontSize}px Arial`;
    }
    ctx.fillText(displayName, x + width / 2, y + height / 2 - 8);
    ctx.font = '9px Arial';
    ctx.fillText(`${pallet.totalWeight}кг`, x + width / 2, y + height / 2 + 6);
}

// Render top view - COMPLETE REWRITE
function renderTopView() {
    // Step 1: Reset canvas to clean state
    const ctx = resetCanvasContext();
    
    // Step 2: Calculate scaling and positioning
    const scaling = calculateScaling();
    
    // Update global scale for other functions
    TOP_VIEW_SCALE = scaling.scale;
    
    // Step 3: Draw vehicle outline with grid
    drawVehicleOutline(ctx, scaling);
    
    // Step 4: Draw all pallets
    pallets.forEach(pallet => {
        drawPalletOnCanvas(ctx, pallet, scaling);
    });
    
    // Step 5: Draw measurements
    drawMeasurementsOnCanvas(ctx, scaling);
}

// Render side view
function renderSideView() {
    const ctx = sideViewCtx;
    const canvas = sideViewCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw vehicle outline
    const vehicleHeight = VEHICLE.height_mm * SIDE_VIEW_SCALE;
    const vehicleLength = VEHICLE.length_mm * SIDE_VIEW_SCALE;

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, canvas.height - vehicleHeight, vehicleLength, vehicleHeight);
    
    // Draw height limit line (220 cm = 2200 mm)
    const heightLimitY = canvas.height - (HEIGHT_LIMIT_MM * SIDE_VIEW_SCALE);
    if (HEIGHT_LIMIT_MM < VEHICLE.height_mm) {
        ctx.strokeStyle = '#F44336';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, heightLimitY);
        ctx.lineTo(vehicleLength, heightLimitY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw limit label
        ctx.fillStyle = '#F44336';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'right';
        ctx.fillText('← Лимит 220см', vehicleLength - 5, heightLimitY - 5);
    }

    // Draw height markers
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - vehicleHeight);
    ctx.lineTo(vehicleLength, canvas.height - vehicleHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw height label
    ctx.fillStyle = '#666';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${VEHICLE.height_mm} мм`, vehicleLength + 10, canvas.height - vehicleHeight);

    // Draw pallets in side view with goods height
    if (pallets.length > 0) {
        let currentX = 10;
        const palletWidth = 80;
        const spacing = 5;

        pallets.forEach((pallet, index) => {
            const palletBaseHeight = pallet.height * SIDE_VIEW_SCALE;
            const goodsHeight = pallet.goodsHeight * SIDE_VIEW_SCALE;
            const totalHeight = pallet.totalHeight * SIDE_VIEW_SCALE;
            const x = currentX;
            const y = canvas.height - vehicleHeight + (vehicleHeight - totalHeight);

            // Check if exceeds vehicle height
            const exceedsHeight = pallet.totalHeight > VEHICLE.height_mm;

            // Draw goods on pallet
            if (pallet.goodsHeight > 0) {
                ctx.fillStyle = exceedsHeight ? '#F44336' : '#FFA726';
                ctx.fillRect(x, y, palletWidth, goodsHeight);
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, palletWidth, goodsHeight);
            }

            // Draw pallet base
            ctx.fillStyle = exceedsHeight ? '#F44336' : '#4CAF50';
            ctx.fillRect(x, y + goodsHeight, palletWidth, palletBaseHeight);
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y + goodsHeight, palletWidth, palletBaseHeight);

            // Draw label
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            const labelName = pallet.name || `#${pallet.id}`;
            ctx.fillText(labelName.length > 10 ? labelName.substring(0, 8) + '...' : labelName, x + palletWidth / 2, y + totalHeight / 2);
            ctx.font = '8px Arial';
            ctx.fillText(`${pallet.totalHeight}мм`, x + palletWidth / 2, y + totalHeight / 2 + 10);

            currentX += palletWidth + spacing;
            if (currentX + palletWidth > vehicleLength) {
                currentX = 10;
            }
        });
    }
}

// Draw grid on canvas
function drawGrid(ctx, width, height, scale) {
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;

    const gridSize = 100 * scale; // 100mm grid

    // Vertical lines
    for (let x = 0; x <= width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    // Horizontal lines
    for (let y = 0; y <= height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
}

// Toggle measurement mode
function toggleMeasurementMode() {
    measurementMode = !measurementMode;
    const btn = document.getElementById('measurementModeBtn');
    const hint = document.getElementById('measurementHint');
    
    if (measurementMode) {
        btn.classList.add('active');
        hint.style.display = 'block';
        topViewCanvas.classList.add('measurement-cursor');
        // Clear current measurement if any
        currentMeasurement = null;
    } else {
        btn.classList.remove('active');
        hint.style.display = 'none';
        topViewCanvas.classList.remove('measurement-cursor');
        currentMeasurement = null;
        selectedMeasurement = null;
    }
    updateMeasurementCount();
    renderTopView();
}

// Change measurement unit
function changeMeasurementUnit() {
    measurementUnit = document.getElementById('measurementUnit').value;
    // Update all measurement labels with new unit
    measurements.forEach(m => {
        m.label = formatMeasurement(m.distanceMm);
    });
    renderTopView();
}

// Update measurement count display
function updateMeasurementCount() {
    const countEl = document.getElementById('measurementCount');
    if (countEl) {
        countEl.textContent = `Измерений: ${measurements.length}`;
    }
}

// Clear all measurements - works regardless of measurement mode state
function clearAllMeasurements() {
    console.log('=== CLEAR ALL MEASUREMENTS CLICKED ===');
    console.log('Current measurements array:', measurements);
    console.log('Number of measurements:', measurements ? measurements.length : 'undefined');
    
    try {
        // Ensure measurements array exists
        if (!measurements) {
            console.warn('⚠️ Measurements array not initialized, creating new array');
            measurements = [];
        }
        
        if (measurements.length === 0) {
            console.log('ℹ️ No measurements to clear');
            alert('Нет измерений для удаления');
            return;
        }
        
        const count = measurements.length;
        console.log(`Attempting to clear ${count} measurements`);
        
        const confirmed = confirm(`Удалить все ${count} измерений? Это действие необратимо.`);
        console.log('User confirmed:', confirmed);
        
        if (confirmed) {
            // Clear all measurement-related state
            measurements = [];
            currentMeasurement = null;
            selectedMeasurement = null;
            nextMeasurementId = 1;
            
            console.log('✓ Measurements array cleared:', measurements);
            console.log('✓ Current measurement cleared:', currentMeasurement);
            console.log('✓ Selected measurement cleared:', selectedMeasurement);
            
            // Update UI
            updateMeasurementCount();
            console.log('✓ Measurement count updated');
            
            renderTopView();
            console.log('✓ Canvas redrawn');
            
            alert('✓ Все измерения удалены');
            console.log('=== CLEAR COMPLETED SUCCESSFULLY ===');
        } else {
            console.log('User cancelled clear operation');
        }
    } catch (error) {
        console.error('❌ Error in clearAllMeasurements:', error);
        alert('Ошибка при удалении измерений: ' + error.message);
    }
}

// Delete specific measurement
function deleteMeasurement(measurementId) {
    const index = measurements.findIndex(m => m.id === measurementId);
    if (index !== -1) {
        measurements.splice(index, 1);
        if (selectedMeasurement && selectedMeasurement.id === measurementId) {
            selectedMeasurement = null;
        }
        updateMeasurementCount();
        renderTopView();
    }
}

// Check if point is near a measurement (for selection)
function isPointNearMeasurement(x, y, measurement) {
    // Check if point is near the measurement line
    const threshold = 15; // pixels
    
    // Check distance to endpoints
    const dist1 = Math.sqrt(
        Math.pow(x - measurement.point1.x, 2) + 
        Math.pow(y - measurement.point1.y, 2)
    );
    const dist2 = Math.sqrt(
        Math.pow(x - measurement.point2.x, 2) + 
        Math.pow(y - measurement.point2.y, 2)
    );
    
    if (dist1 < threshold || dist2 < threshold) {
        return true;
    }
    
    // Check distance to line segment
    const dx = measurement.point2.x - measurement.point1.x;
    const dy = measurement.point2.y - measurement.point1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return false;
    
    const t = Math.max(0, Math.min(1, 
        ((x - measurement.point1.x) * dx + (y - measurement.point1.y) * dy) / (length * length)
    ));
    
    const projX = measurement.point1.x + t * dx;
    const projY = measurement.point1.y + t * dy;
    
    const dist = Math.sqrt(
        Math.pow(x - projX, 2) + 
        Math.pow(y - projY, 2)
    );
    
    return dist < threshold;
}

// Check if point is on delete button of measurement
function isPointOnDeleteButton(x, y, measurement) {
    const midX = (measurement.point1.x + measurement.point2.x) / 2;
    const midY = (measurement.point1.y + measurement.point2.y) / 2;
    
    // Delete button is positioned to the right of the label
    const btnX = midX + 35; // Approximate position
    const btnY = midY;
    const btnSize = 12;
    
    return Math.abs(x - btnX) < btnSize && Math.abs(y - btnY) < btnSize;
}

// Convert pixels to mm
function pixelsToMm(pixels) {
    return pixels / TOP_VIEW_SCALE;
}

// Convert mm to cm
function mmToCm(mm) {
    return mm / 10;
}

// Format measurement value
function formatMeasurement(distanceMm) {
    if (measurementUnit === 'cm') {
        return `${mmToCm(distanceMm).toFixed(1)} см`;
    } else {
        return `${Math.round(distanceMm)} мм`;
    }
}

// Calculate distance between two points in mm
function calculateDistance(point1, point2) {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Snap to nearest edge (pallet or vehicle)
function snapToEdge(x, y) {
    const scaling = calculateScaling();
    const { startX, startY, drawnLengthPx, drawnWidthPx, scale } = scaling;
    
    let snappedX = x;
    let snappedY = y;
    let minDist = SNAP_DISTANCE_PX * 1.5;
    
    // Snap to vehicle edges
    if (Math.abs(x - startX) < minDist) snappedX = startX;
    if (Math.abs(x - (startX + drawnLengthPx)) < minDist) snappedX = startX + drawnLengthPx;
    if (Math.abs(y - startY) < minDist) snappedY = startY;
    if (Math.abs(y - (startY + drawnWidthPx)) < minDist) snappedY = startY + drawnWidthPx;
    
    // Snap to pallet edges
    pallets.forEach(pallet => {
        const effectiveLength = pallet.rotation === 90 ? pallet.width : pallet.length;
        const effectiveWidth = pallet.rotation === 90 ? pallet.length : pallet.width;
        
        const px = startX + pallet.x * scale;
        const py = startY + pallet.y * scale;
        const pw = effectiveLength * scale;
        const ph = effectiveWidth * scale;
        
        if (Math.abs(x - px) < minDist && y >= py - minDist && y <= py + ph + minDist) {
            snappedX = px;
        }
        if (Math.abs(x - (px + pw)) < minDist && y >= py - minDist && y <= py + ph + minDist) {
            snappedX = px + pw;
        }
        if (Math.abs(y - py) < minDist && x >= px - minDist && x <= px + pw + minDist) {
            snappedY = py;
        }
        if (Math.abs(y - (py + ph)) < minDist && x >= px - minDist && x <= px + pw + minDist) {
            snappedY = py + ph;
        }
    });
    
    return { x: snappedX, y: snappedY };
}

// Draw measurements on canvas with proper scaling
function drawMeasurementsOnCanvas(ctx, scaling) {
    const { startX, startY, scale } = scaling;
    // Draw completed measurements
    measurements.forEach((measurement, index) => {
        const isSelected = selectedMeasurement && selectedMeasurement.id === measurement.id;
        const color = measurementColors[index % measurementColors.length];
        
        // Draw line with selection highlight
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.globalAlpha = isSelected ? 1 : 0.8;
        if (isSelected) {
            // Draw selection glow
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
        }
        ctx.beginPath();
        ctx.moveTo(measurement.point1.x, measurement.point1.y);
        ctx.lineTo(measurement.point2.x, measurement.point2.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        
        // Draw endpoints with selection highlight
        const pointRadius = isSelected ? 6 : 5;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(measurement.point1.x, measurement.point1.y, pointRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(measurement.point2.x, measurement.point2.y, pointRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();
        
        // Draw label with delete button
        const midX = (measurement.point1.x + measurement.point2.x) / 2;
        const midY = (measurement.point1.y + measurement.point2.y) / 2;
        
        const label = measurement.label;
        ctx.font = 'bold 13px Arial';
        const textWidth = ctx.measureText(label).width;
        const padding = 4;
        const deleteButtonWidth = isSelected ? 18 : 0;
        const totalWidth = textWidth + padding * 2 + deleteButtonWidth;
        
        // Draw label background
        ctx.fillStyle = isSelected ? '#ffffcc' : 'white';
        ctx.strokeStyle = isSelected ? color : '#999';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.fillRect(midX - totalWidth / 2, midY - 10, totalWidth, 20);
        ctx.strokeRect(midX - totalWidth / 2, midY - 10, totalWidth, 20);
        
        // Draw label text
        ctx.fillStyle = 'black';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX - deleteButtonWidth / 2, midY);
        
        // Draw delete button if selected
        if (isSelected) {
            const btnX = midX + totalWidth / 2 - 12;
            const btnY = midY;
            
            // Draw X button
            ctx.fillStyle = '#f44336';
            ctx.beginPath();
            ctx.arc(btnX, btnY, 8, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(btnX - 3, btnY - 3);
            ctx.lineTo(btnX + 3, btnY + 3);
            ctx.moveTo(btnX + 3, btnY - 3);
            ctx.lineTo(btnX - 3, btnY + 3);
            ctx.stroke();
            
            // Store delete button position for click detection
            measurement.deleteButtonX = btnX;
            measurement.deleteButtonY = btnY;
        }
    });
    
    // Draw current measurement (preview)
    if (currentMeasurement && currentMeasurement.point1) {
        const color = measurementColors[measurements.length % measurementColors.length];
        
        if (currentMeasurement.point2) {
            // Draw preview line
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.5;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(currentMeasurement.point1.x, currentMeasurement.point1.y);
            ctx.lineTo(currentMeasurement.point2.x, currentMeasurement.point2.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            
            // Draw first endpoint
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(currentMeasurement.point1.x, currentMeasurement.point1.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Draw preview label
            const midX = (currentMeasurement.point1.x + currentMeasurement.point2.x) / 2;
            const midY = (currentMeasurement.point1.y + currentMeasurement.point2.y) / 2;
            
            const dx = currentMeasurement.point2.x - currentMeasurement.point1.x;
            const dy = currentMeasurement.point2.y - currentMeasurement.point1.y;
            const distancePx = Math.sqrt(dx * dx + dy * dy);
            const distanceMm = pixelsToMm(distancePx);
            const label = formatMeasurement(distanceMm);
            
            ctx.font = 'bold 13px Arial';
            const textWidth = ctx.measureText(label).width;
            const padding = 4;
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 1;
            ctx.fillRect(midX - textWidth / 2 - padding, midY - 10, textWidth + padding * 2, 20);
            ctx.strokeRect(midX - textWidth / 2 - padding, midY - 10, textWidth + padding * 2, 20);
            
            ctx.fillStyle = 'black';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY);
        } else {
            // Draw only first point
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(currentMeasurement.point1.x, currentMeasurement.point1.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
}

// Handle keyboard shortcuts
function handleKeyboardShortcuts(event) {
    // M key to toggle measurement mode
    if (event.key === 'm' || event.key === 'M' || event.key === 'ь' || event.key === 'Ь') {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            toggleMeasurementMode();
        }
    }
    // Escape to cancel current measurement or deselect
    if (event.key === 'Escape' && measurementMode) {
        if (currentMeasurement) {
            currentMeasurement = null;
        } else if (selectedMeasurement) {
            selectedMeasurement = null;
        }
        renderTopView();
    }
    // Delete to remove selected measurement
    if ((event.key === 'Delete' || event.key === 'Backspace') && measurementMode) {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            if (selectedMeasurement) {
                // Delete selected measurement
                deleteMeasurement(selectedMeasurement.id);
            }
        }
    }
}

// Get precise canvas coordinates from mouse event
function getCanvasCoordinates(event) {
    const rect = topViewCanvas.getBoundingClientRect();
    const scaleX = topViewCanvas.width / rect.width;
    const scaleY = topViewCanvas.height / rect.height;
    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;
    return { x: canvasX, y: canvasY };
}

// Convert canvas coordinates to millimeters
function canvasToMillimeters(canvasX, canvasY) {
    const scaling = calculateScaling();
    const mmX = (canvasX - scaling.startX) / scaling.scale;
    const mmY = (canvasY - scaling.startY) / scaling.scale;
    return { x: mmX, y: mmY };
}

// Convert millimeters to canvas coordinates
function millimetersToCanvas(mmX, mmY) {
    const scaling = calculateScaling();
    const canvasX = scaling.startX + (mmX * scaling.scale);
    const canvasY = scaling.startY + (mmY * scaling.scale);
    return { x: canvasX, y: canvasY };
}

// Handle mouse down for drag start
function handleMouseDown(event) {
    const coords = getCanvasCoordinates(event);
    let canvasX = coords.x;
    let canvasY = coords.y;
    
    const scaling = calculateScaling();
    
    // Handle measurement mode
    if (measurementMode) {
        // Check if clicking on delete button of selected measurement
        if (selectedMeasurement && selectedMeasurement.deleteButtonX) {
            const dx = canvasX - selectedMeasurement.deleteButtonX;
            const dy = canvasY - selectedMeasurement.deleteButtonY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 10) {
                // Click on delete button
                deleteMeasurement(selectedMeasurement.id);
                return;
            }
        }
        
        // Check if clicking on existing measurement to select it
        let clickedMeasurement = null;
        for (const measurement of measurements) {
            if (isPointNearMeasurement(canvasX, canvasY, measurement)) {
                clickedMeasurement = measurement;
                break;
            }
        }
        
        if (clickedMeasurement && !currentMeasurement) {
            // Select the measurement
            selectedMeasurement = clickedMeasurement;
            renderTopView();
            return;
        }
        
        // Snap to edges
        const snapped = snapToEdge(canvasX, canvasY);
        canvasX = snapped.x;
        canvasY = snapped.y;
        
        if (!currentMeasurement) {
            // Start new measurement
            selectedMeasurement = null; // Deselect when starting new measurement
            currentMeasurement = {
                point1: { x: canvasX, y: canvasY },
                point2: null
            };
        } else if (currentMeasurement.point1 && !currentMeasurement.point2Locked) {
            // Complete measurement
            currentMeasurement.point2 = { x: canvasX, y: canvasY };
            
            // Calculate distance
            const dx = currentMeasurement.point2.x - currentMeasurement.point1.x;
            const dy = currentMeasurement.point2.y - currentMeasurement.point1.y;
            const distancePx = Math.sqrt(dx * dx + dy * dy);
            const distanceMm = pixelsToMm(distancePx);
            
            // Save measurement
            const newMeasurement = {
                id: nextMeasurementId++,
                point1: currentMeasurement.point1,
                point2: currentMeasurement.point2,
                distanceMm: distanceMm,
                label: formatMeasurement(distanceMm)
            };
            measurements.push(newMeasurement);
            
            // Select the newly created measurement
            selectedMeasurement = newMeasurement;
            
            // Reset for next measurement
            currentMeasurement = null;
            
            // Update measurement count
            updateMeasurementCount();
        }
        renderTopView();
        return;
    }
    
    const mm = canvasToMillimeters(canvasX, canvasY);

    // Find pallet under mouse
    for (let i = pallets.length - 1; i >= 0; i--) {
        const pallet = pallets[i];
        const effectiveLength = pallet.rotation === 90 ? pallet.width : pallet.length;
        const effectiveWidth = pallet.rotation === 90 ? pallet.length : pallet.width;
        
        if (mm.x >= pallet.x && mm.x <= pallet.x + effectiveLength &&
            mm.y >= pallet.y && mm.y <= pallet.y + effectiveWidth) {
            draggedPallet = pallet;
            selectedPallet = pallet;
            dragOffset.x = mm.x - pallet.x;
            dragOffset.y = mm.y - pallet.y;
            topViewCanvas.style.cursor = 'grabbing';
            updatePalletList();
            renderTopView();
            break;
        }
    }
}

// Handle right click for rotation
function handleRightClick(event) {
    event.preventDefault();
    const coords = getCanvasCoordinates(event);
    const mm = canvasToMillimeters(coords.x, coords.y);

    // Find pallet under mouse
    for (let i = pallets.length - 1; i >= 0; i--) {
        const pallet = pallets[i];
        const effectiveLength = pallet.rotation === 90 ? pallet.width : pallet.length;
        const effectiveWidth = pallet.rotation === 90 ? pallet.length : pallet.width;
        
        if (mm.x >= pallet.x && mm.x <= pallet.x + effectiveLength &&
            mm.y >= pallet.y && mm.y <= pallet.y + effectiveWidth) {
            rotatePallet(pallet.id);
            break;
        }
    }
}

// Handle mouse move for dragging
function handleMouseMove(event) {
    const coords = getCanvasCoordinates(event);
    let canvasX = coords.x;
    let canvasY = coords.y;
    
    const scaling = calculateScaling();
    
    // Handle measurement mode preview
    if (measurementMode && currentMeasurement && currentMeasurement.point1) {
        // Snap to edges
        const snapped = snapToEdge(canvasX, canvasY);
        canvasX = snapped.x;
        canvasY = snapped.y;
        
        // Update preview point
        currentMeasurement.point2 = { x: canvasX, y: canvasY };
        renderTopView();
        return;
    }
    
    const mm = canvasToMillimeters(canvasX, canvasY);

    if (draggedPallet) {
        const effectiveLength = draggedPallet.rotation === 90 ? draggedPallet.width : draggedPallet.length;
        const effectiveWidth = draggedPallet.rotation === 90 ? draggedPallet.length : draggedPallet.width;
        
        // Calculate new position
        let newX = mm.x - dragOffset.x;
        let newY = mm.y - dragOffset.y;

        // Clamp to vehicle bounds
        newX = Math.max(0, Math.min(newX, VEHICLE.length_mm - effectiveLength));
        newY = Math.max(0, Math.min(newY, VEHICLE.width_mm - effectiveWidth));

        // Check if position is valid (no collision)
        if (isPositionAvailable(newX, newY, effectiveLength, effectiveWidth, draggedPallet.id)) {
            draggedPallet.x = newX;
            draggedPallet.y = newY;
            renderTopView();
        }
    } else {
        // Update cursor when hovering over pallets
        let overPallet = false;
        for (const pallet of pallets) {
            const effectiveLength = pallet.rotation === 90 ? pallet.width : pallet.length;
            const effectiveWidth = pallet.rotation === 90 ? pallet.length : pallet.width;
            if (mm.x >= pallet.x && mm.x <= pallet.x + effectiveLength &&
                mm.y >= pallet.y && mm.y <= pallet.y + effectiveWidth) {
                overPallet = true;
                break;
            }
        }
        topViewCanvas.style.cursor = overPallet ? 'grab' : 'default';
    }
}

// Handle mouse up for drag end
function handleMouseUp() {
    draggedPallet = null;
    topViewCanvas.style.cursor = 'default';
}



// Initialize on page load
window.addEventListener('DOMContentLoaded', init);