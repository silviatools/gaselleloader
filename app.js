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

// Application state
let pallets = [];
let nextPalletId = 1;
let savedConfigurations = [];
let draggedPallet = null;
let dragOffset = { x: 0, y: 0 };
let selectedPallet = null;
let editingPalletId = null;

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

// Current loaded vehicle configuration
let loadedVehicleConfig = null;

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
    document.getElementById('applyVehicleBtn').addEventListener('click', applyVehicleConfig);
    document.getElementById('saveVehicleConfigBtn').addEventListener('click', saveVehicleConfigToFile);
    document.getElementById('loadVehicleConfigBtn').addEventListener('click', () => {
        document.getElementById('vehicleConfigFileInput').click();
    });
    document.getElementById('vehicleConfigFileInput').addEventListener('change', loadVehicleConfigFromFile);
    document.getElementById('resetVehicleBtn').addEventListener('click', resetToDefaultVehicle);
    
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
    updateCanvasSize();
    updateMeasurementCount();
    renderTopView();
    renderSideView();
    
    // Handle window resize to keep canvas size correct
    window.addEventListener('resize', () => {
        updateCanvasSize();
        renderTopView();
        renderSideView();
    });
}

// Save vehicle configuration to file
function saveVehicleConfigToFile() {
    const configName = document.getElementById('vehicleConfigName').value.trim() || 'Моя Газель';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    
    const config = {
        type: 'gazelle_vehicle_config',
        name: configName,
        version: '1.0',
        created_at: new Date().toISOString(),
        vehicle: {
            length_mm: VEHICLE.length_mm,
            width_mm: VEHICLE.width_mm,
            height_mm: VEHICLE.height_mm,
            max_weight_kg: VEHICLE.max_weight_kg
        }
    };
    
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gazelle_config_${configName.replace(/[^a-zа-яё0-9]/gi, '_')}_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Конфигурация "${configName}" сохранена на ПК`);
}

// Load vehicle configuration from file
function loadVehicleConfigFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const config = JSON.parse(e.target.result);
            
            // Validate file format
            if (config.type !== 'gazelle_vehicle_config' || !config.vehicle) {
                alert('Неверный формат файла конфигурации');
                return;
            }
            
            // Validate required fields
            const v = config.vehicle;
            if (!v.length_mm || !v.width_mm || !v.height_mm || !v.max_weight_kg) {
                alert('Неверный формат файла конфигурации: отсутствуют обязательные поля');
                return;
            }
            
            // Clear existing pallets if any
            if (pallets.length > 0) {
                if (!confirm('Загрузка конфигурации удалит все текущие паллеты. Продолжить?')) {
                    event.target.value = ''; // Reset file input
                    return;
                }
                pallets = [];
                nextPalletId = 1;
                selectedPallet = null;
            }
            
            // Apply configuration
            VEHICLE.length_mm = v.length_mm;
            VEHICLE.width_mm = v.width_mm;
            VEHICLE.height_mm = v.height_mm;
            VEHICLE.max_weight_kg = v.max_weight_kg;
            VEHICLE.volume_m3 = (v.length_mm * v.width_mm * v.height_mm) / 1000000000;
            VEHICLE.name = config.name || 'Загруженная конфигурация';
            
            // Update form fields
            document.getElementById('vehicleLength').value = v.length_mm;
            document.getElementById('vehicleWidth').value = v.width_mm;
            document.getElementById('vehicleHeight').value = v.height_mm;
            document.getElementById('vehicleMaxWeight').value = v.max_weight_kg;
            document.getElementById('vehicleConfigName').value = config.name || '';
            
            loadedVehicleConfig = config;
            
            updateVehicleConfigDisplay();
            updateCanvasSize();
            updateStatistics();
            updatePalletList();
            renderTopView();
            renderSideView();
            
            alert(`✓ Конфигурация "${config.name}" загружена`);
            
        } catch (error) {
            alert('Ошибка чтения файла: ' + error.message);
        }
        
        event.target.value = ''; // Reset file input
    };
    
    reader.readAsText(file);
}

// Reset to default vehicle
function resetToDefaultVehicle() {
    if (pallets.length > 0) {
        if (!confirm('Сброс на стандартную конфигурацию удалит все паллеты. Продолжить?')) {
            return;
        }
        pallets = [];
        nextPalletId = 1;
        selectedPallet = null;
    }
    
    VEHICLE.length_mm = 3000;
    VEHICLE.width_mm = 1900;
    VEHICLE.height_mm = 1800;
    VEHICLE.max_weight_kg = 1700;
    VEHICLE.volume_m3 = 10.26;
    VEHICLE.name = 'Газель (стандартная)';
    
    document.getElementById('vehicleLength').value = 3000;
    document.getElementById('vehicleWidth').value = 1900;
    document.getElementById('vehicleHeight').value = 1800;
    document.getElementById('vehicleMaxWeight').value = 1700;
    document.getElementById('vehicleConfigName').value = '';
    
    loadedVehicleConfig = null;
    
    updateVehicleConfigDisplay();
    updateCanvasSize();
    updateStatistics();
    updatePalletList();
    renderTopView();
    renderSideView();
    
    alert('Параметры сброшены на стандартную Газель');
}

// Update vehicle configuration display
function updateVehicleConfigDisplay() {
    const displayName = loadedVehicleConfig ? loadedVehicleConfig.name : 'Нет';
    document.getElementById('loadedConfigName').textContent = displayName;
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
    // Maximum canvas sizes (reduced for better fit)
    const maxCanvasWidth = 500;
    const maxCanvasHeight = 500;
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
    
    // Set canvas drawing buffer size to match display size exactly
    // This ensures 1 pixel in drawing = 1 pixel on screen
    topViewCanvas.width = Math.round(canvasWidth);
    topViewCanvas.height = Math.round(canvasHeight);
    
    // Ensure canvas style matches element size (no scaling)
    topViewCanvas.style.width = Math.round(canvasWidth) + 'px';
    topViewCanvas.style.height = Math.round(canvasHeight) + 'px';
    
    // Update side view canvas width to match
    sideViewCanvas.width = Math.round(canvasWidth);
    sideViewCanvas.style.width = Math.round(canvasWidth) + 'px';
    SIDE_VIEW_SCALE = TOP_VIEW_SCALE;
    
    // Update dimension label
    document.getElementById('vehicleDimensionsLabel').textContent = 
        `L: ${VEHICLE.length_mm}мм × W: ${VEHICLE.width_mm}мм | Масштаб: 1 клетка = 100 мм`;
    document.getElementById('vehicleHeightLabel').textContent = 
        `Высота кузова: ${VEHICLE.height_mm} мм`;
}

// Update pallet information display
function updatePalletInfo() {
    const palletType = document.getElementById('palletType').value;
    const loadWeight = parseFloat(document.getElementById('loadWeight').value) || 0;
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

// Apply vehicle configuration
function applyVehicleConfig() {
    const length = parseInt(document.getElementById('vehicleLength').value);
    const width = parseInt(document.getElementById('vehicleWidth').value);
    const height = parseInt(document.getElementById('vehicleHeight').value);
    const maxWeight = parseInt(document.getElementById('vehicleMaxWeight').value);

    if (pallets.length > 0) {
        if (!confirm('Изменение параметров кузова удалит все паллеты. Продолжить?')) {
            return;
        }
        pallets = [];
        nextPalletId = 1;
        selectedPallet = null;
    }

    VEHICLE.length_mm = length;
    VEHICLE.width_mm = width;
    VEHICLE.height_mm = height;
    VEHICLE.max_weight_kg = maxWeight;
    VEHICLE.volume_m3 = (length * width * height) / 1000000000;

    updateCanvasSize();
    updateStatistics();
    updatePalletList();
    renderTopView();
    renderSideView();
    
    // Update pallet count display
    document.getElementById('palletCountDisplay').textContent = pallets.length;

    alert('Параметры кузова применены');
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
                    <span class="pallet-type"> (${palletSpec.name}, ${effectiveLength}×${effectiveWidth}мм, ${pallet.totalWeight}кг)</span>
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
                    <span class="pallet-detail-value">${pallet.totalHeight} мм</span>
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
    if (totalWeight > VEHICLE.max_weight_kg) {
        warningMessage.textContent = `⚠️ Превышена грузоподъемность на ${(totalWeight - VEHICLE.max_weight_kg).toFixed(0)} кг!`;
        warningMessage.style.display = 'block';
    } else {
        warningMessage.style.display = 'none';
    }
}

// Render top view
function renderTopView() {
    const ctx = topViewCtx;
    const canvas = topViewCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate offset to center vehicle in canvas
    const vehicleWidth = VEHICLE.length_mm * TOP_VIEW_SCALE;
    const vehicleHeight = VEHICLE.width_mm * TOP_VIEW_SCALE;
    const offsetX = (canvas.width - vehicleWidth) / 2;
    const offsetY = (canvas.height - vehicleHeight) / 2;
    
    ctx.save();
    ctx.translate(offsetX, offsetY);

    // Draw grid
    drawGrid(ctx, vehicleWidth, vehicleHeight, TOP_VIEW_SCALE);

    // Draw vehicle outline
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, vehicleWidth, vehicleHeight);

    // Draw pallets
    pallets.forEach(pallet => {
        const effectiveLength = pallet.rotation === 90 ? pallet.width : pallet.length;
        const effectiveWidth = pallet.rotation === 90 ? pallet.length : pallet.width;
        
        const x = pallet.x * TOP_VIEW_SCALE;
        const y = pallet.y * TOP_VIEW_SCALE;
        const width = effectiveLength * TOP_VIEW_SCALE;
        const height = effectiveWidth * TOP_VIEW_SCALE;

        // Determine color based on weight
        const weightPercent = (pallets.reduce((sum, p) => sum + p.totalWeight, 0) / VEHICLE.max_weight_kg) * 100;
        let color = '#4CAF50'; // Green
        if (weightPercent > 90) color = '#FF9800'; // Orange
        if (weightPercent > 100) color = '#F44336'; // Red

        // Highlight if selected
        if (selectedPallet && selectedPallet.id === pallet.id) {
            ctx.fillStyle = 'rgba(33, 128, 141, 0.3)';
            ctx.fillRect(x - 3, y - 3, width + 6, height + 6);
        }

        // Draw pallet rectangle
        ctx.fillStyle = color;
        ctx.fillRect(x, y, width, height);

        // Draw pallet border
        ctx.strokeStyle = selectedPallet && selectedPallet.id === pallet.id ? '#21808D' : '#333';
        ctx.lineWidth = selectedPallet && selectedPallet.id === pallet.id ? 2 : 1;
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
    });
    
    // Draw measurements
    drawMeasurements(ctx, offsetX, offsetY);
    
    ctx.restore();
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
    const vehicleWidth = VEHICLE.length_mm * TOP_VIEW_SCALE;
    const vehicleHeight = VEHICLE.width_mm * TOP_VIEW_SCALE;
    const offsetX = (topViewCanvas.width - vehicleWidth) / 2;
    const offsetY = (topViewCanvas.height - vehicleHeight) / 2;
    
    let snappedX = x;
    let snappedY = y;
    let minDist = SNAP_DISTANCE_PX * 1.5; // Slightly larger snap distance for easier use
    
    // Snap to vehicle edges
    if (Math.abs(x - offsetX) < minDist) snappedX = offsetX;
    if (Math.abs(x - (offsetX + vehicleWidth)) < minDist) snappedX = offsetX + vehicleWidth;
    if (Math.abs(y - offsetY) < minDist) snappedY = offsetY;
    if (Math.abs(y - (offsetY + vehicleHeight)) < minDist) snappedY = offsetY + vehicleHeight;
    
    // Snap to pallet edges
    pallets.forEach(pallet => {
        const effectiveLength = pallet.rotation === 90 ? pallet.width : pallet.length;
        const effectiveWidth = pallet.rotation === 90 ? pallet.length : pallet.width;
        
        const px = offsetX + pallet.x * TOP_VIEW_SCALE;
        const py = offsetY + pallet.y * TOP_VIEW_SCALE;
        const pw = effectiveLength * TOP_VIEW_SCALE;
        const ph = effectiveWidth * TOP_VIEW_SCALE;
        
        // Left edge
        if (Math.abs(x - px) < minDist && y >= py - minDist && y <= py + ph + minDist) {
            snappedX = px;
        }
        // Right edge
        if (Math.abs(x - (px + pw)) < minDist && y >= py - minDist && y <= py + ph + minDist) {
            snappedX = px + pw;
        }
        // Top edge
        if (Math.abs(y - py) < minDist && x >= px - minDist && x <= px + pw + minDist) {
            snappedY = py;
        }
        // Bottom edge
        if (Math.abs(y - (py + ph)) < minDist && x >= px - minDist && x <= px + pw + minDist) {
            snappedY = py + ph;
        }
    });
    
    return { x: snappedX, y: snappedY };
}

// Draw measurements on canvas
function drawMeasurements(ctx, offsetX, offsetY) {
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
    
    // Get exact mouse position relative to canvas
    // This accounts for canvas position, padding, borders, etc.
    const scaleX = topViewCanvas.width / rect.width;
    const scaleY = topViewCanvas.height / rect.height;
    
    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;
    
    return { x: canvasX, y: canvasY };
}

// Handle mouse down for drag start
function handleMouseDown(event) {
    const coords = getCanvasCoordinates(event);
    let canvasX = coords.x;
    let canvasY = coords.y;
    
    const vehicleWidth = VEHICLE.length_mm * TOP_VIEW_SCALE;
    const vehicleHeight = VEHICLE.width_mm * TOP_VIEW_SCALE;
    const offsetX = (topViewCanvas.width - vehicleWidth) / 2;
    const offsetY = (topViewCanvas.height - vehicleHeight) / 2;
    
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
    
    const mouseX = (canvasX - offsetX) / TOP_VIEW_SCALE;
    const mouseY = (canvasY - offsetY) / TOP_VIEW_SCALE;

    // Find pallet under mouse
    for (let i = pallets.length - 1; i >= 0; i--) {
        const pallet = pallets[i];
        const effectiveLength = pallet.rotation === 90 ? pallet.width : pallet.length;
        const effectiveWidth = pallet.rotation === 90 ? pallet.length : pallet.width;
        
        if (mouseX >= pallet.x && mouseX <= pallet.x + effectiveLength &&
            mouseY >= pallet.y && mouseY <= pallet.y + effectiveWidth) {
            draggedPallet = pallet;
            selectedPallet = pallet;
            dragOffset.x = mouseX - pallet.x;
            dragOffset.y = mouseY - pallet.y;
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
    const rect = topViewCanvas.getBoundingClientRect();
    const vehicleWidth = VEHICLE.length_mm * TOP_VIEW_SCALE;
    const vehicleHeight = VEHICLE.width_mm * TOP_VIEW_SCALE;
    const offsetX = (topViewCanvas.width - vehicleWidth) / 2;
    const offsetY = (topViewCanvas.height - vehicleHeight) / 2;
    const mouseX = (event.clientX - rect.left - offsetX) / TOP_VIEW_SCALE;
    const mouseY = (event.clientY - rect.top - offsetY) / TOP_VIEW_SCALE;

    // Find pallet under mouse
    for (let i = pallets.length - 1; i >= 0; i--) {
        const pallet = pallets[i];
        const effectiveLength = pallet.rotation === 90 ? pallet.width : pallet.length;
        const effectiveWidth = pallet.rotation === 90 ? pallet.length : pallet.width;
        
        if (mouseX >= pallet.x && mouseX <= pallet.x + effectiveLength &&
            mouseY >= pallet.y && mouseY <= pallet.y + effectiveWidth) {
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
    
    const vehicleWidth = VEHICLE.length_mm * TOP_VIEW_SCALE;
    const vehicleHeight = VEHICLE.width_mm * TOP_VIEW_SCALE;
    const offsetX = (topViewCanvas.width - vehicleWidth) / 2;
    const offsetY = (topViewCanvas.height - vehicleHeight) / 2;
    
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
    
    const mouseX = (canvasX - offsetX) / TOP_VIEW_SCALE;
    const mouseY = (canvasY - offsetY) / TOP_VIEW_SCALE;

    if (draggedPallet) {
        const effectiveLength = draggedPallet.rotation === 90 ? draggedPallet.width : draggedPallet.length;
        const effectiveWidth = draggedPallet.rotation === 90 ? draggedPallet.length : draggedPallet.width;
        
        // Calculate new position
        let newX = mouseX - dragOffset.x;
        let newY = mouseY - dragOffset.y;

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
            if (mouseX >= pallet.x && mouseX <= pallet.x + effectiveLength &&
                mouseY >= pallet.y && mouseY <= pallet.y + effectiveWidth) {
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