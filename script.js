// script.js
// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
// IMPORTANT: Replace these with your actual Firebase project configuration.
// You can find this in your Firebase project settings -> Project settings -> General -> Your apps -> Firebase SDK snippet -> Config.
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Use the projectId from your firebaseConfig for the Firestore path
const appId = firebaseConfig.projectId; // Using project ID as a unique app identifier for Firestore paths

// Initialize Firebase
let app, db, auth, userId;
if (Object.keys(firebaseConfig).length > 0 && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    console.log("Firebase initialized successfully.");
} else {
    console.error("Firebase configuration is missing or placeholder values are present. Firestore features will not be available.");
    console.error("Please replace 'YOUR_API_KEY', 'YOUR_PROJECT_ID', etc., in script.js with your actual Firebase project configuration.");
}

// Global data stores for easy access and manipulation
let allProjects = [];
let allChangeOrders = [];
let allBOQItems = [];
let allBOMItems = [];
let allBOLItems = [];
let allBILLItems = []; // New array for Billing items

let tempBOQItems = []; // Temporary storage for BOQ items before saving all
let tempBOMItems = []; // Temporary storage for BOM items before saving all
let tempBOLItems = []; // Temporary storage for BOL items before saving all
let tempBILLItems = []; // Temporary storage for BILL items before saving all

let selectedBOQItemForBOM = null; // Store selected BOQ item for BOM calculations
let selectedBOQItemForBOL = null; // Store selected BOQ item for BOL calculations
let selectedBOQItemForBILL = null; // Store selected BOQ item for BILL calculations


// --- Custom Modal Functions (replacing alert/confirm) ---
window.showModal = function(title, message) {
    const modal = document.getElementById('customModal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    modal.classList.add('show');
    modal.classList.remove('hidden');
}

window.hideModal = function() {
    const modal = document.getElementById('customModal');
    modal.classList.remove('show');
    modal.classList.add('hidden');
}

// --- Core UI Logic ---

// Function to show/hide form sections in the left sidebar
window.showSidebarForm = function(formId) {
    document.querySelectorAll('.form-section').forEach(form => {
        form.classList.add('hidden');
        form.classList.remove('active');
    });
    const activeForm = document.getElementById(formId);
    if (activeForm) {
        activeForm.classList.remove('hidden');
        activeForm.classList.add('active');
    }

    // Update sidebar button active state
    document.querySelectorAll('.sidebar button').forEach(button => {
        button.classList.remove('active-sidebar-btn');
    });

    // Find the button that triggers this form and activate it
    const relevantButton = Array.from(document.querySelectorAll('.sidebar button')).find(button => {
        const onclickAttr = button.getAttribute('onclick');
        return onclickAttr && onclickAttr.includes(`showSidebarForm('${formId}')`);
    });
    if (relevantButton) {
        relevantButton.classList.add('active-sidebar-btn');
    } else if (formId === 'dashboardView') {
        // Special case for dashboard button
        document.querySelector('.sidebar button[onclick*="dashboardView"]').classList.add('active-sidebar-btn');
    }
}

// Function to show/hide dashboard tabs in the main content area
window.showDashboardTab = function(tabId) {
    document.querySelectorAll('.dashboard-tab-content').forEach(tab => {
        tab.classList.add('hidden');
        tab.classList.remove('active');
    });
    const activeTab = document.getElementById(tabId);
    if (activeTab) {
        activeTab.classList.remove('hidden');
        activeTab.classList.add('active');
    }

    // Update dashboard tab button active state
    document.querySelectorAll('.dashboard-tab-button').forEach(button => {
        button.classList.remove('active');
    });
    const activeTabButton = document.querySelector(`.dashboard-tab-button[onclick*="${tabId}"]`);
    if (activeTabButton) {
        activeTabButton.classList.add('active');
    }

    // Also ensure the "VIEW" sidebar button is active if a dashboard tab is shown
    const viewButton = document.querySelector('.sidebar button[onclick*="dashboardView"]');
    if (viewButton) {
        viewButton.classList.add('active-sidebar-btn');
    }
}


// --- Firebase Data Handling ---

// Fetch projects and populate dropdowns
async function fetchProjects() {
    if (!db || !userId) { console.warn("Firestore not ready for projects."); return; }
    try {
        // Data stored in /artifacts/{appId}/users/{userId}/projects
        const projectsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/projects`);
        onSnapshot(projectsCollectionRef, (snapshot) => {
            allProjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            window.populateProjectDropdowns();
            window.renderProjectsDashboard();
        }, (error) => {
            console.error("Error fetching projects:", error);
            window.showModal("Error", "Failed to load projects: " + error.message);
        });
    } catch (e) {
        console.error("Error setting up project listener:", e);
        window.showModal("Error", "Could not set up project listener: " + e.message);
    }
}

// Fetch change orders
async function fetchChangeOrders() {
    if (!db || !userId) { console.warn("Firestore not ready for change orders."); return; }
    try {
        // Data stored in /artifacts/{appId}/users/{userId}/changeOrders
        const coCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/changeOrders`);
        onSnapshot(coCollectionRef, (snapshot) => {
            allChangeOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            window.populateCODropdowns();
            window.renderChangeOrdersDashboard();
        }, (error) => {
            console.error("Error fetching change orders:", error);
            window.showModal("Error", "Failed to load change orders: " + error.message);
        });
    } catch (e) {
        console.error("Error setting up change order listener:", e);
        window.showModal("Error", "Could not set up change order listener: " + e.message);
    }
}

// Fetch BOQ items
async function fetchBOQItems() {
    if (!db || !userId) { console.warn("Firestore not ready for BOQ items."); return; }
    try {
        // Data stored in /artifacts/{appId}/users/{userId}/billOfQuantities
        const boqCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/billOfQuantities`);
        onSnapshot(boqCollectionRef, (snapshot) => {
            allBOQItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            window.populateBOQDropdowns();
            window.populateBOMBoqParentDropdown(); // Update BOM BOQ dropdown
            window.populateBOLBoqParentDropdown(); // Update BOL BOQ dropdown
            window.populateBILLBoqParentDropdown(); // Update BILL BOQ dropdown
            window.renderBOQDashboard();
        }, (error) => {
            console.error("Error fetching BOQ items:", error);
            window.showModal("Error", "Failed to load BOQ items: " + error.message);
        });
    } catch (e) {
        console.error("Error setting up BOQ listener:", e);
        window.showModal("Error", "Could not set up BOQ listener: " + e.message);
    }
}

// Fetch BOM items
async function fetchBOMItems() {
    if (!db || !userId) { console.warn("Firestore not ready for BOM items."); return; }
    try {
        // Data stored in /artifacts/{appId}/users/{userId}/billOfMaterials
        const bomCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/billOfMaterials`);
        onSnapshot(bomCollectionRef, (snapshot) => {
            allBOMItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            window.renderBOMDashboard();
        }, (error) => {
            console.error("Error fetching BOM items:", error);
            window.showModal("Error", "Failed to load BOM items: " + error.message);
        });
    } catch (e) {
        console.error("Error setting up BOM listener:", e);
        window.showModal("Error", "Could not set up BOM listener: " + e.message);
    }
}

// Fetch BOL items
async function fetchBOLItems() {
    if (!db || !userId) { console.warn("Firestore not ready for BOL items."); return; }
    try {
        // Data stored in /artifacts/{appId}/users/{userId}/billOfLabor
        const bolCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/billOfLabor`);
        onSnapshot(bolCollectionRef, (snapshot) => {
            allBOLItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            window.renderBOLDashboard();
        }, (error) => {
            console.error("Error fetching BOL items:", error);
            window.showModal("Error", "Failed to load BOL items: " + error.message);
        });
    } catch (e) {
        console.error("Error setting up BOL listener:", e);
        window.showModal("Error", "Could not set up BOL listener: " + e.message);
    }
}

// Fetch BILL items (New)
async function fetchBILLItems() {
    if (!db || !userId) { console.warn("Firestore not ready for BILL items."); return; }
    try {
        // Data stored in /artifacts/{appId}/users/{userId}/billing
        const billCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/billing`);
        onSnapshot(billCollectionRef, (snapshot) => {
            allBILLItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            window.renderBILLDashboard();
        }, (error) => {
            console.error("Error fetching BILL items:", error);
            window.showModal("Error", "Failed to load BILL items: " + error.message);
        });
    } catch (e) {
        console.error("Error setting up BILL listener:", e);
        window.showModal("Error", "Could not set up BILL listener: " + e.message);
    }
}


// --- Dropdown Population Functions ---

// Populates project dropdowns for various forms (Project, CO, BOQ, BOM, BOL, BILL)
window.populateProjectDropdowns = function() {
    const projectDropdowns = [
        document.getElementById('co_project_id'),
        document.getElementById('boq_project_name'),
        document.getElementById('bom_project_name'),
        document.getElementById('bol_project_name'),
        document.getElementById('bill_project_name') // Added for BILL
    ];

    projectDropdowns.forEach(dropdown => {
        if (dropdown) {
            const currentSelectedId = dropdown.value; // Preserve current selection
            dropdown.innerHTML = '<option value="">Select Project Name</option>';
            allProjects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.proj_name;
                dropdown.appendChild(option);
            });
            // Restore selection if it still exists
            if (currentSelectedId && allProjects.some(p => p.id === currentSelectedId)) {
                dropdown.value = currentSelectedId;
            } else {
                dropdown.value = ""; // Reset if selection is no longer valid
            }
            // Trigger associated handlers if a value is restored to re-populate dependent dropdowns
            if (dropdown.value && dropdown.onchange) {
                 // Only trigger if a change actually occurred (value was present and is now restored)
                 // For initial load, this might trigger chains.
                 // For co_project_id specifically, it calls populateProjectCodeDropdown
                 // For boq_project_name, populateBOQProjectCodeDropdown etc.
                 // No explicit call needed here, the chained functions will handle.
            }
        }
    });
    // Manually trigger for CO and BOQ/BOM/BOL/BILL if a project was pre-selected
    if (document.getElementById('co_project_id').value) window.populateProjectCodeDropdown();
    if (document.getElementById('boq_project_name').value) window.populateBOQProjectCodeDropdown();
    if (document.getElementById('bom_project_name').value) window.populateBOMProjectCodeDropdown();
    if (document.getElementById('bol_project_name').value) window.populateBOLProjectCodeDropdown();
    if (document.getElementById('bill_project_name').value) window.populateBILLProjectCodeDropdown(); // Trigger for BILL
}

// Populates project code dropdown and updates client name for Change Order form
window.populateProjectCodeDropdown = function() {
    const projectId = document.getElementById('co_project_id').value;
    const projectCodeDropdown = document.getElementById('co_project_code_dropdown');
    const clientNameDisplay = document.getElementById('co_client_name_display');

    projectCodeDropdown.innerHTML = '<option value="">Select Project Code</option>';
    clientNameDisplay.value = '';
    projectCodeDropdown.disabled = true;

    if (projectId) {
        const selectedProject = allProjects.find(p => p.id === projectId);
        if (selectedProject) {
            const option = document.createElement('option');
            option.value = selectedProject.id; // Use project ID as value
            option.textContent = selectedProject.proj_code;
            projectCodeDropdown.appendChild(option);
            projectCodeDropdown.value = selectedProject.id; // Auto-select the only code
            projectCodeDropdown.disabled = false;
            clientNameDisplay.value = selectedProject.proj_client_name || '';
        }
    }
}

// Updates client name display for Change Order form (on project code change)
window.updateClientNameForCOForm = function() {
    const projectId = document.getElementById('co_project_code_dropdown').value; // It's actually project ID
    const clientNameDisplay = document.getElementById('co_client_name_display');
    const selectedProject = allProjects.find(p => p.id === projectId);
    clientNameDisplay.value = selectedProject ? selectedProject.proj_client_name : '';
}

// Populates CO dropdowns for various forms (BOQ, BOM, BOL, BILL)
window.populateCODropdowns = function() {
    const coDropdowns = [
        document.getElementById('boq_co_selector'),
        document.getElementById('bom_co_selector'),
        document.getElementById('bol_co_selector'),
        document.getElementById('bill_co_selector') // Added for BILL
    ];

    coDropdowns.forEach(dropdown => {
        if (dropdown) {
            const currentSelectedId = dropdown.value; // Preserve current selection
            dropdown.innerHTML = '<option value="">No Change Order (Link to Original Contract)</option>';
            allChangeOrders.forEach(co => {
                const option = document.createElement('option');
                option.value = co.id;
                option.textContent = `${co.co_number} - ${co.co_scope}`;
                dropdown.appendChild(option);
            });
            // Restore selection if it still exists
            if (currentSelectedId && allChangeOrders.some(co => co.id === currentSelectedId)) {
                dropdown.value = currentSelectedId;
            } else {
                dropdown.value = "";
            }
        }
    });
}

// Populates BOQ project code dropdown for BOQ form
window.populateBOQProjectCodeDropdown = function() {
    const projectId = document.getElementById('boq_project_name').value;
    const projectCodeDropdown = document.getElementById('boq_project_code_dropdown');
    const projectCodeLabel = document.getElementById('boq_project_code_dropdown_label');
    const coSelector = document.getElementById('boq_co_selector');
    const coSelectorLabel = document.getElementById('boq_co_selector_label');

    projectCodeDropdown.innerHTML = '<option value="">Select Project Code</option>';
    projectCodeDropdown.disabled = true;
    projectCodeDropdown.classList.add('hidden');
    projectCodeLabel.classList.add('hidden');
    coSelector.classList.add('hidden');
    coSelectorLabel.classList.add('hidden');

    if (projectId) {
        const selectedProject = allProjects.find(p => p.id === projectId);
        if (selectedProject) {
            const option = document.createElement('option');
            option.value = selectedProject.id;
            option.textContent = selectedProject.proj_code;
            projectCodeDropdown.appendChild(option);
            projectCodeDropdown.value = selectedProject.id;
            projectCodeDropdown.disabled = false;
            projectCodeDropdown.classList.remove('hidden');
            projectCodeLabel.classList.remove('hidden');
            window.populateBOQCOSelector(); // Populate CO dropdown after project code is set
        }
    }
}

// Populates CO selector for BOQ form
window.populateBOQCOSelector = function() {
    const projectId = document.getElementById('boq_project_code_dropdown').value;
    const coSelector = document.getElementById('boq_co_selector');
    const coSelectorLabel = document.getElementById('boq_co_selector_label');

    coSelector.innerHTML = '<option value="">No Change Order (Link to Original Contract)</option>';
    coSelector.classList.add('hidden');
    coSelectorLabel.classList.add('hidden');

    if (projectId) {
        const filteredCOs = allChangeOrders.filter(co => co.co_project_id === projectId);
        if (filteredCOs.length > 0) {
            filteredCOs.forEach(co => {
                const option = document.createElement('option');
                option.value = co.id;
                option.textContent = `${co.co_number} - ${co.co_scope}`;
                coSelector.appendChild(option);
            });
            coSelector.classList.remove('hidden');
            coSelectorLabel.classList.remove('hidden');
        }
    }
}

// Populates BOM project code dropdown for BOM form
window.populateBOMProjectCodeDropdown = function() {
    const projectId = document.getElementById('bom_project_name').value;
    const projectCodeDropdown = document.getElementById('bom_project_code_dropdown');
    const projectCodeLabel = document.getElementById('bom_project_code_dropdown_label');
    
    projectCodeDropdown.innerHTML = '<option value="">Select Project Code</option>';
    projectCodeDropdown.disabled = true;
    projectCodeDropdown.classList.add('hidden');
    projectCodeLabel.classList.add('hidden');
    document.getElementById('bom_co_selector').classList.add('hidden');
    document.getElementById('bom_co_selector_label').classList.add('hidden');
    document.getElementById('bom_boq_item').classList.add('hidden');
    document.getElementById('bom_boq_item').innerHTML = '<option value="">Select BOQ Item</option>';
    document.querySelector('label[for="bom_boq_item"]').classList.add('hidden');
    document.getElementById('bom_boq_quantity_display').classList.add('hidden');


    if (projectId) {
        const selectedProject = allProjects.find(p => p.id === projectId);
        if (selectedProject) {
            const option = document.createElement('option');
            option.value = selectedProject.id;
            option.textContent = selectedProject.proj_code;
            projectCodeDropdown.appendChild(option);
            projectCodeDropdown.value = selectedProject.id;
            projectCodeDropdown.disabled = false;
            projectCodeDropdown.classList.remove('hidden');
            projectCodeLabel.classList.remove('hidden');
            window.populateBOMCOSelector(); // Chain to populate CO selector
            window.populateBOMBoqParentDropdown(); // Chain to populate BOQ items
        }
    }
}

// Populates CO selector for BOM form
window.populateBOMCOSelector = function() {
    const projectId = document.getElementById('bom_project_code_dropdown').value;
    const coSelector = document.getElementById('bom_co_selector');
    const coSelectorLabel = document.getElementById('bom_co_selector_label');

    coSelector.innerHTML = '<option value="">No Change Order (Link to Original Contract)</option>';
    coSelector.disabled = true;
    coSelector.classList.add('hidden');
    coSelectorLabel.classList.add('hidden');

    if (projectId) {
        const filteredCOs = allChangeOrders.filter(co => co.co_project_id === projectId);
        if (filteredCOs.length > 0) {
            filteredCOs.forEach(co => {
                const option = document.createElement('option');
                option.value = co.id;
                option.textContent = `${co.co_number} - ${co.co_scope}`;
                coSelector.appendChild(option);
            });
            coSelector.disabled = false;
            coSelector.classList.remove('hidden');
            coSelectorLabel.classList.remove('hidden');
        }
    }
}

// Populates BOQ parent dropdown for BOM form
window.populateBOMBoqParentDropdown = function() {
    const projectId = document.getElementById('bom_project_name').value;
    const coId = document.getElementById('bom_co_selector').value || null; // Use null if no CO selected
    const boqItemDropdown = document.getElementById('bom_boq_item');
    const boqItemLabel = document.querySelector('label[for="bom_boq_item"]');

    boqItemDropdown.innerHTML = '<option value="">Select BOQ Item</option>';
    boqItemDropdown.classList.add('hidden');
    boqItemLabel.classList.add('hidden');
    document.getElementById('bom_boq_quantity_display').classList.add('hidden');
    selectedBOQItemForBOM = null; // Clear previously selected BOQ item

    if (projectId) {
        const filteredBOQItems = allBOQItems.filter(boq => 
            boq.projectId === projectId && 
            (coId ? boq.changeOrderId === coId : !boq.changeOrderId)
        );

        if (filteredBOQItems.length > 0) {
            filteredBOQItems.forEach(boq => {
                const option = document.createElement('option');
                option.value = boq.id;
                option.textContent = `${boq.itemDescription} (Qty: ${boq.quantity} ${boq.uom})`;
                boqItemDropdown.appendChild(option);
            });
            boqItemDropdown.classList.remove('hidden');
            boqItemLabel.classList.remove('hidden');
        } else {
            window.showModal("No BOQ Items Found", "No Bill of Quantity items found for the selected Project and Change Order (if any). Please add BOQ items first.");
        }
    }
}

// Displays selected BOQ item quantity for BOM form
window.displayBOQQuantityForBOM = function() {
    const boqItemId = document.getElementById('bom_boq_item').value;
    const boqQtyDisplay = document.getElementById('bom_boq_quantity_display');
    const boqQtyValueSpan = document.getElementById('bom_boq_qty_value');
    const boqQtyUOMSpan = document.getElementById('bom_boq_qty_uom');

    boqQtyDisplay.classList.add('hidden');
    boqQtyValueSpan.textContent = '';
    boqQtyUOMSpan.textContent = '';
    selectedBOQItemForBOM = null; // Clear previous selection

    if (boqItemId) {
        selectedBOQItemForBOM = allBOQItems.find(boq => boq.id === boqItemId);
        if (selectedBOQItemForBOM) {
            boqQtyValueSpan.textContent = selectedBOQItemForBOM.quantity;
            boqQtyUOMSpan.textContent = selectedBOQItemForBOM.uom;
            boqQtyDisplay.classList.remove('hidden');
        }
    }
    window.calculateBOMQuantitiesAndCosts(); // Recalculate BOM values when BOQ changes
}

// Populates BOL project code dropdown for BOL form
window.populateBOLProjectCodeDropdown = function() {
    const projectId = document.getElementById('bol_project_name').value;
    const projectCodeDropdown = document.getElementById('bol_project_code_dropdown');
    const projectCodeLabel = document.getElementById('bol_project_code_dropdown_label');
    
    projectCodeDropdown.innerHTML = '<option value="">Select Project Code</option>';
    projectCodeDropdown.disabled = true;
    projectCodeDropdown.classList.add('hidden');
    projectCodeLabel.classList.add('hidden');
    document.getElementById('bol_co_selector').classList.add('hidden');
    document.getElementById('bol_co_selector_label').classList.add('hidden');
    document.getElementById('bol_boq_item').classList.add('hidden');
    document.getElementById('bol_boq_item').innerHTML = '<option value="">Select BOQ Item</option>';
    document.querySelector('label[for="bol_boq_item"]').classList.add('hidden');
    document.getElementById('bol_boq_quantity_display').classList.add('hidden');

    if (projectId) {
        const selectedProject = allProjects.find(p => p.id === projectId);
        if (selectedProject) {
            const option = document.createElement('option');
            option.value = selectedProject.id;
            option.textContent = selectedProject.proj_code;
            projectCodeDropdown.appendChild(option);
            projectCodeDropdown.value = selectedProject.id;
            projectCodeDropdown.disabled = false;
            projectCodeDropdown.classList.remove('hidden');
            projectCodeLabel.classList.remove('hidden');
            window.populateBOLCOSelector(); // Chain to populate CO selector
            window.populateBOLBoqParentDropdown(); // Chain to populate BOQ items
        }
    }
}

// Populates CO selector for BOL form
window.populateBOLCOSelector = function() {
    const projectId = document.getElementById('bol_project_code_dropdown').value;
    const coSelector = document.getElementById('bol_co_selector');
    const coSelectorLabel = document.getElementById('bol_co_selector_label');

    coSelector.innerHTML = '<option value="">No Change Order (Link to Original Contract)</option>';
    coSelector.disabled = true;
    coSelector.classList.add('hidden');
    coSelectorLabel.classList.add('hidden');

    if (projectId) {
        const filteredCOs = allChangeOrders.filter(co => co.co_project_id === projectId);
        if (filteredCOs.length > 0) {
            filteredCOs.forEach(co => {
                const option = document.createElement('option');
                option.value = co.id;
                option.textContent = `${co.co_number} - ${co.co_scope}`;
                coSelector.appendChild(option);
            });
            coSelector.disabled = false;
            coSelector.classList.remove('hidden');
            coSelectorLabel.classList.remove('hidden');
        }
    }
}

// Populates BOQ parent dropdown for BOL form
window.populateBOLBoqParentDropdown = function() {
    const projectId = document.getElementById('bol_project_name').value;
    const coId = document.getElementById('bol_co_selector').value || null; // Use null if no CO selected
    const boqItemDropdown = document.getElementById('bol_boq_item');
    const boqItemLabel = document.querySelector('label[for="bol_boq_item"]');

    boqItemDropdown.innerHTML = '<option value="">Select BOQ Item</option>';
    boqItemDropdown.classList.add('hidden');
    boqItemLabel.classList.add('hidden');
    document.getElementById('bol_boq_quantity_display').classList.add('hidden');
    selectedBOQItemForBOL = null; // Clear previously selected BOQ item

    if (projectId) {
        const filteredBOQItems = allBOQItems.filter(boq => 
            boq.projectId === projectId && 
            (coId ? boq.changeOrderId === coId : !boq.changeOrderId)
        );

        if (filteredBOQItems.length > 0) {
            filteredBOQItems.forEach(boq => {
                const option = document.createElement('option');
                option.value = boq.id;
                option.textContent = `${boq.itemDescription} (Qty: ${boq.quantity} ${boq.uom})`;
                boqItemDropdown.appendChild(option);
            });
            boqItemDropdown.classList.remove('hidden');
            boqItemLabel.classList.remove('hidden');
        } else {
            window.showModal("No BOQ Items Found", "No Bill of Quantity items found for the selected Project and Change Order (if any). Please add BOQ items first.");
        }
    }
}

// Displays selected BOQ item quantity for BOL form
window.displayBOQQuantityForBOL = function() {
    const boqItemId = document.getElementById('bol_boq_item').value;
    const boqQtyDisplay = document.getElementById('bol_boq_quantity_display');
    const boqQtyValueSpan = document.getElementById('bol_boq_qty_value');
    const boqQtyUOMSpan = document.getElementById('bol_boq_qty_uom');

    boqQtyDisplay.classList.add('hidden');
    boqQtyValueSpan.textContent = '';
    boqQtyUOMSpan.textContent = '';
    selectedBOQItemForBOL = null; // Clear previous selection

    if (boqItemId) {
        selectedBOQItemForBOL = allBOQItems.find(boq => boq.id === boqItemId);
        if (selectedBOQItemForBOL) {
            boqQtyValueSpan.textContent = selectedBOQItemForBOL.quantity;
            boqQtyUOMSpan.textContent = selectedBOQItemForBOL.uom;
            boqQtyDisplay.classList.remove('hidden');
        }
    }
    window.calculateBOLQuantitiesAndCosts(); // Recalculate BOL values when BOQ changes
}

// --- NEW BILLING FUNCTIONS (Replicated and Adapted from BOL) ---

// Populates BILL project code dropdown for BILL form
window.populateBILLProjectCodeDropdown = function() {
    const projectId = document.getElementById('bill_project_name').value;
    const projectCodeDropdown = document.getElementById('bill_project_code_dropdown');
    const projectCodeLabel = document.getElementById('bill_project_code_dropdown_label');
    
    projectCodeDropdown.innerHTML = '<option value="">Select Project Code</option>';
    projectCodeDropdown.disabled = true;
    projectCodeDropdown.classList.add('hidden');
    projectCodeLabel.classList.add('hidden');
    document.getElementById('bill_co_selector').classList.add('hidden');
    document.getElementById('bill_co_selector_label').classList.add('hidden');
    document.getElementById('bill_boq_item').classList.add('hidden');
    document.getElementById('bill_boq_item').innerHTML = '<option value="">Select BOQ Item</option>';
    document.querySelector('label[for="bill_boq_item"]').classList.add('hidden');
    document.getElementById('bill_boq_quantity_display').classList.add('hidden');
    document.getElementById('bill_boq_unit_rate_display_container').classList.add('hidden'); // Hide unit rate display
    document.getElementById('bill_boq_uom_display').value = '';
    document.getElementById('bill_boq_unit_rate_display').value = '';
    document.getElementById('bill_total_cost').value = '';
    document.getElementById('bill_area').value = '';


    if (projectId) {
        const selectedProject = allProjects.find(p => p.id === projectId);
        if (selectedProject) {
            const option = document.createElement('option');
            option.value = selectedProject.id;
            option.textContent = selectedProject.proj_code;
            projectCodeDropdown.appendChild(option);
            projectCodeDropdown.value = selectedProject.id;
            projectCodeDropdown.disabled = false;
            projectCodeDropdown.classList.remove('hidden');
            projectCodeLabel.classList.remove('hidden');
            window.populateBILLCOSelector(); // Chain to populate CO selector
            window.populateBILLBoqParentDropdown(); // Chain to populate BOQ items
        }
    }
}

// Populates CO selector for BILL form
window.populateBILLCOSelector = function() {
    const projectId = document.getElementById('bill_project_code_dropdown').value;
    const coSelector = document.getElementById('bill_co_selector');
    const coSelectorLabel = document.getElementById('bill_co_selector_label');

    coSelector.innerHTML = '<option value="">No Change Order (Link to Original Contract)</option>';
    coSelector.disabled = true;
    coSelector.classList.add('hidden');
    coSelectorLabel.classList.add('hidden');

    if (projectId) {
        const filteredCOs = allChangeOrders.filter(co => co.co_project_id === projectId);
        if (filteredCOs.length > 0) {
            filteredCOs.forEach(co => {
                const option = document.createElement('option');
                option.value = co.id;
                option.textContent = `${co.co_number} - ${co.co_scope}`;
                coSelector.appendChild(option);
            });
            coSelector.disabled = false;
            coSelector.classList.remove('hidden');
            coSelectorLabel.classList.remove('hidden');
        }
    }
}

// Populates BOQ parent dropdown for BILL form
window.populateBILLBoqParentDropdown = function() {
    const projectId = document.getElementById('bill_project_name').value;
    const coId = document.getElementById('bill_co_selector').value || null; // Use null if no CO selected
    const boqItemDropdown = document.getElementById('bill_boq_item');
    const boqItemLabel = document.querySelector('label[for="bill_boq_item"]');

    boqItemDropdown.innerHTML = '<option value="">Select BOQ Item</option>';
    boqItemDropdown.classList.add('hidden');
    boqItemLabel.classList.add('hidden');
    document.getElementById('bill_boq_quantity_display').classList.add('hidden');
    document.getElementById('bill_boq_unit_rate_display_container').classList.add('hidden'); // Hide unit rate display
    document.getElementById('bill_boq_uom_display').value = '';
    document.getElementById('bill_boq_unit_rate_display').value = '';
    document.getElementById('bill_total_cost').value = '';
    document.getElementById('bill_area').value = '';

    selectedBOQItemForBILL = null; // Clear previously selected BOQ item

    if (projectId) {
        const filteredBOQItems = allBOQItems.filter(boq => 
            boq.projectId === projectId && 
            (coId ? boq.changeOrderId === coId : !boq.changeOrderId)
        );

        if (filteredBOQItems.length > 0) {
            filteredBOQItems.forEach(boq => {
                const option = document.createElement('option');
                option.value = boq.id;
                option.textContent = `${boq.itemDescription} (Qty: ${boq.quantity} ${boq.uom})`;
                boqItemDropdown.appendChild(option);
            });
            boqItemDropdown.classList.remove('hidden');
            boqItemLabel.classList.remove('hidden');
        } else {
            window.showModal("No BOQ Items Found", "No Bill of Quantity items found for the selected Project and Change Order (if any). Please add BOQ items first.");
        }
    }
}

// Displays selected BOQ item quantity, UOM, and Unit Rate for BILL form
window.displayBOQQuantityForBILL = function() {
    const boqItemId = document.getElementById('bill_boq_item').value;
    const boqQtyDisplay = document.getElementById('bill_boq_quantity_display');
    const boqQtyValueSpan = document.getElementById('bill_boq_qty_value');
    const boqQtyUOMSpan = document.getElementById('bill_boq_qty_uom');
    const boqUnitRateDisplayContainer = document.getElementById('bill_boq_unit_rate_display_container');
    const boqUnitRateValueSpan = document.getElementById('bill_boq_unit_rate_value');
    const billUOMDisplay = document.getElementById('bill_boq_uom_display');
    const billUnitRateDisplay = document.getElementById('bill_boq_unit_rate_display');
    
    boqQtyDisplay.classList.add('hidden');
    boqQtyValueSpan.textContent = '';
    boqQtyUOMSpan.textContent = '';
    boqUnitRateDisplayContainer.classList.add('hidden');
    boqUnitRateValueSpan.textContent = '';
    billUOMDisplay.value = '';
    billUnitRateDisplay.value = '';

    selectedBOQItemForBILL = null; // Clear previous selection

    if (boqItemId) {
        selectedBOQItemForBILL = allBOQItems.find(boq => boq.id === boqItemId);
        if (selectedBOQItemForBILL) {
            boqQtyValueSpan.textContent = selectedBOQItemForBILL.quantity;
            boqQtyUOMSpan.textContent = selectedBOQItemForBILL.uom;
            boqUnitRateValueSpan.textContent = parseFloat(selectedBOQItemForBILL.unitRate).toFixed(2); // Display as currency
            billUOMDisplay.value = selectedBOQItemForBILL.uom;
            billUnitRateDisplay.value = parseFloat(selectedBOQItemForBILL.unitRate).toFixed(2);

            boqQtyDisplay.classList.remove('hidden');
            boqUnitRateDisplayContainer.classList.remove('hidden');
        }
    }
    window.calculateBILLQuantitiesAndCosts(); // Recalculate BILL values when BOQ changes
}

// Calculates total cost for BILL items based on billing quantity and BOQ unit rate
window.calculateBILLQuantitiesAndCosts = function() {
    const billAreaInput = document.getElementById('bill_area');
    const billTotalCostInput = document.getElementById('bill_total_cost');
    const billUnitRateDisplay = document.getElementById('bill_boq_unit_rate_display'); // This now holds the selected BOQ unit rate

    const billingQuantity = parseFloat(billAreaInput.value);
    const unitRate = parseFloat(billUnitRateDisplay.value); // Get unit rate from display field

    if (!isNaN(billingQuantity) && billingQuantity >= 0 && !isNaN(unitRate) && selectedBOQItemForBILL) {
        const totalCost = billingQuantity * unitRate;
        billTotalCostInput.value = totalCost.toFixed(2);
    } else {
        billTotalCostInput.value = '';
    }
}

// Adds a BILL item to the temporary list
window.addBILLItemToList = function() {
    const projectId = document.getElementById('bill_project_name').value;
    const projectCode = document.getElementById('bill_project_code_dropdown').value;
    const changeOrderId = document.getElementById('bill_co_selector').value || null;
    const boqItemId = document.getElementById('bill_boq_item').value;
    const billingQuantity = parseFloat(document.getElementById('bill_area').value);
    const uom = document.getElementById('bill_boq_uom_display').value;
    const unitCost = parseFloat(document.getElementById('bill_boq_unit_rate_display').value);
    const totalCost = parseFloat(document.getElementById('bill_total_cost').value);
    const remarks = document.getElementById('bill_remarks').value.toUpperCase().trim();

    if (!projectId || !projectCode) {
        window.showModal("Validation Error", "Please select a Project Name and Project Code.");
        return;
    }
    if (!boqItemId) {
        window.showModal("Validation Error", "Please select a Parent BOQ Item.");
        return;
    }
    if (isNaN(billingQuantity) || billingQuantity <= 0) {
        window.showModal("Validation Error", "Please enter a valid Billing Quantity/Area (must be a positive number).");
        return;
    }
    if (isNaN(unitCost) || unitCost < 0) {
        window.showModal("Validation Error", "Unit Cost is invalid or missing. Please select a valid BOQ item.");
        return;
    }
    if (isNaN(totalCost) || totalCost < 0) {
        window.showModal("Validation Error", "Total Cost is invalid. Please check quantity and unit cost.");
        return;
    }
    if (!uom) {
        window.showModal("Validation Error", "UOM is missing. Please select a valid BOQ item.");
        return;
    }

    const projectName = allProjects.find(p => p.id === projectId)?.proj_name || 'N/A';
    const projCodeValue = allProjects.find(p => p.id === projectId)?.proj_code || 'N/A';
    const changeOrderCode = allChangeOrders.find(co => co.id === changeOrderId)?.co_number || 'N/A (Original)';
    const boqItemDescription = allBOQItems.find(boq => boq.id === boqItemId)?.itemDescription || 'N/A';

    const newItem = {
        id: Date.now().toString(), // Temporary ID for client-side list
        projectId,
        projectName,
        projectCode: projCodeValue,
        changeOrderId,
        changeOrderCode,
        boqItemId,
        boqItemDescription,
        billingQuantity,
        uom,
        unitCost,
        totalCost,
        remarks
    };

    tempBILLItems.push(newItem);
    window.renderBILLTempTable();
    document.getElementById('saveAllBILLItemsBtn').disabled = false; // Enable save button
    
    // Clear form fields after adding
    document.getElementById('bill_area').value = '';
    document.getElementById('bill_remarks').value = '';
    document.getElementById('bill_total_cost').value = '';
    document.getElementById('bill_boq_item').value = '';
    document.getElementById('bill_boq_quantity_display').classList.add('hidden');
    document.getElementById('bill_boq_unit_rate_display_container').classList.add('hidden');
    document.getElementById('bill_boq_uom_display').value = '';
    document.getElementById('bill_boq_unit_rate_display').value = '';
    selectedBOQItemForBILL = null;
}

// Renders the temporary BILL items table
window.renderBILLTempTable = function() {
    const tableBody = document.getElementById('billTempTableBody');
    tableBody.innerHTML = ''; // Clear existing rows

    tempBILLItems.forEach((item, index) => {
        const row = tableBody.insertRow();
        row.insertCell(0).textContent = item.projectName;
        row.insertCell(1).textContent = item.projectCode;
        row.insertCell(2).textContent = item.changeOrderCode;
        row.insertCell(3).textContent = item.boqItemDescription;
        row.insertCell(4).textContent = item.billingQuantity;
        row.insertCell(5).textContent = item.uom;
        row.insertCell(6).textContent = item.unitCost.toFixed(2);
        row.insertCell(7).textContent = item.totalCost.toFixed(2);
        row.insertCell(8).textContent = item.remarks;

        const actionsCell = row.insertCell(9);
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.onclick = () => window.removeBILLTempItem(index);
        actionsCell.appendChild(deleteButton);
    });
}

// Removes a BILL item from the temporary list
window.removeBILLTempItem = function(index) {
    tempBILLItems.splice(index, 1);
    window.renderBILLTempTable();
    if (tempBILLItems.length === 0) {
        document.getElementById('saveAllBILLItemsBtn').disabled = true;
    }
}

// Saves all temporary BILL items to Firestore
window.saveAllBILLItems = async function() {
    if (!db || !userId) {
        window.showModal("Error", "Firestore not ready. Please try again.");
        return;
    }
    if (tempBILLItems.length === 0) {
        window.showModal("Info", "No items to save.");
        return;
    }

    const billCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/billing`);
    let successfulSaves = 0;
    let failedSaves = 0;

    for (const item of tempBILLItems) {
        try {
            // Remove temporary 'id' before saving to Firestore
            const { id, ...itemToSave } = item;
            await addDoc(billCollectionRef, {
                ...itemToSave,
                timestamp: new Date().toISOString() // Add timestamp
            });
            successfulSaves++;
        } catch (e) {
            console.error("Error adding BILL item: ", e);
            failedSaves++;
        }
    }

    if (failedSaves === 0) {
        window.showModal("Success", `Successfully saved ${successfulSaves} billing item(s).`);
    } else {
        window.showModal("Warning", `Saved ${successfulSaves} item(s), but ${failedSaves} item(s) failed to save. Check console for details.`);
    }

    tempBILLItems = []; // Clear temporary items after saving
    window.renderBILLTempTable(); // Clear the temporary table display
    document.getElementById('saveAllBILLItemsBtn').disabled = true; // Disable save button
}

// Renders the persistent BILL items dashboard table
window.renderBILLDashboard = function() {
    const tableBody = document.getElementById('billTableBody');
    tableBody.innerHTML = '';
    let totalCost = 0;

    const filteredBILLItems = window.applyGlobalFilter(allBILLItems); // Apply global filter

    filteredBILLItems.forEach(item => {
        const row = tableBody.insertRow();
        row.insertCell(0).textContent = new Date(item.timestamp).toLocaleString();
        row.insertCell(1).textContent = item.projectName;
        row.insertCell(2).textContent = item.projectCode;
        row.insertCell(3).textContent = item.changeOrderCode;
        row.insertCell(4).textContent = item.boqItemDescription;
        row.insertCell(5).textContent = item.billingQuantity;
        row.insertCell(6).textContent = item.uom;
        row.insertCell(7).textContent = item.unitCost.toFixed(2);
        row.insertCell(8).textContent = item.totalCost.toFixed(2);
        row.insertCell(9).textContent = item.remarks;

        const actionsCell = row.insertCell(10);
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.classList.add('bg-red-500', 'hover:bg-red-700', 'text-white', 'font-bold', 'py-1', 'px-2', 'rounded', 'ml-2');
        deleteButton.onclick = () => window.confirmAndDeleteBILLItem(item.id);
        actionsCell.appendChild(deleteButton);

        totalCost += item.totalCost;
    });
    document.getElementById('billTotalCostDisplay').innerHTML = `Total Cost: <span class="text-green-600 font-bold">Php ${totalCost.toFixed(2)}</span> 💰`;
}

// Confirm and delete a BILL item from Firestore
window.confirmAndDeleteBILLItem = async function(itemId) {
    if (!db || !userId) {
        window.showModal("Error", "Firestore not ready. Cannot delete.");
        return;
    }

    const isConfirmed = window.confirm("Are you sure you want to delete this billing item? This action cannot be undone.");
    if (!isConfirmed) {
        return;
    }

    try {
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/billing`, itemId);
        await deleteDoc(docRef);
        window.showModal("Success", "Billing item deleted successfully.");
    } catch (error) {
        console.error("Error deleting BILL item:", error);
        window.showModal("Error", "Failed to delete billing item: " + error.message);
    }
}

// --- Other Forms' Save Functions (Placeholder, assuming they exist or will be filled) ---

window.saveProject = async function() {
    if (!db || !userId) { window.showModal("Error", "Firestore not ready. Cannot save project."); return; }
    const proj_name = document.getElementById('proj_name').value.toUpperCase().trim();
    const proj_client_name = document.getElementById('proj_client_name').value.toUpperCase().trim();
    const proj_scope = document.getElementById('proj_scope').value.toUpperCase().trim();
    const proj_code = document.getElementById('proj_code').value.toUpperCase().trim();
    const proj_amount = parseFloat(document.getElementById('proj_amount').value);
    const proj_start = document.getElementById('proj_start').value;
    const proj_end = document.getElementById('proj_end').value;
    const proj_remarks = document.getElementById('proj_remarks').value.toUpperCase().trim();

    // Log values for debugging
    console.log("Saving Project - Captured values:", {
        proj_name, proj_client_name, proj_scope, proj_code, proj_amount, proj_start, proj_end, proj_remarks
    });


    if (!proj_name || !proj_client_name || !proj_scope || !proj_code || isNaN(proj_amount) || proj_amount <= 0 || !proj_start || !proj_end) {
        window.showModal("Validation Error", "Please fill all required project fields correctly.");
        return;
    }

    try {
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/projects`), {
            proj_name,
            proj_client_name,
            proj_scope,
            proj_code,
            proj_amount,
            proj_start,
            proj_end,
            proj_remarks,
            timestamp: new Date().toISOString()
        });
        window.showModal("Success", "Project saved successfully!");
        // Clear form
        document.getElementById('proj_name').value = '';
        document.getElementById('proj_client_name').value = '';
        document.getElementById('proj_scope').value = '';
        document.getElementById('proj_code').value = '';
        document.getElementById('proj_amount').value = '';
        document.getElementById('proj_start').value = '';
        document.getElementById('proj_end').value = '';
        document.getElementById('proj_remarks').value = '';
    } catch (e) {
        console.error("Error adding document: ", e);
        window.showModal("Error", "Failed to save project: " + e.message);
    }
}

window.saveChangeOrder = async function() {
    if (!db || !userId) { window.showModal("Error", "Firestore not ready. Cannot save change order."); return; }
    const co_project_id = document.getElementById('co_project_id').value;
    const co_number = document.getElementById('co_number').value.toUpperCase().trim();
    const co_scope = document.getElementById('co_scope').value.toUpperCase().trim();
    const co_amount = parseFloat(document.getElementById('co_amount').value);
    const co_start = document.getElementById('co_start').value;
    const co_end = document.getElementById('co_end').value;
    const co_remarks = document.getElementById('co_remarks').value.toUpperCase().trim();

    if (!co_project_id || !co_number || !co_scope || isNaN(co_amount) || co_amount <= 0 || !co_start || !co_end) {
        window.showModal("Validation Error", "Please fill all required change order fields correctly.");
        return;
    }

    const selectedProject = allProjects.find(p => p.id === co_project_id);
    if (!selectedProject) {
        window.showModal("Validation Error", "Selected project not found.");
        return;
    }

    try {
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/changeOrders`), {
            co_project_id: co_project_id, // Store ID
            proj_name: selectedProject.proj_name,
            proj_code: selectedProject.proj_code,
            proj_client_name: selectedProject.proj_client_name, // Store client name directly
            co_number,
            co_scope,
            co_amount,
            co_start,
            co_end,
            co_remarks,
            timestamp: new Date().toISOString()
        });
        window.showModal("Success", "Change Order saved successfully!");
        // Clear form
        document.getElementById('co_project_id').value = '';
        document.getElementById('co_project_code_dropdown').innerHTML = '<option value="">Select Project Code</option>';
        document.getElementById('co_project_code_dropdown').disabled = true;
        document.getElementById('co_client_name_display').value = '';
        document.getElementById('co_number').value = '';
        document.getElementById('co_scope').value = '';
        document.getElementById('co_amount').value = '';
        document.getElementById('co_start').value = '';
        document.getElementById('co_end').value = '';
        document.getElementById('co_remarks').value = '';
    } catch (e) {
        console.error("Error adding change order: ", e);
        window.showModal("Error", "Failed to save change order: " + e.message);
    }
}

// BOQ Logic
window.calculateBOQCostsAndTotal = function() {
    const quantity = parseFloat(document.getElementById('boq_quantity').value);
    const laborCost = parseFloat(document.getElementById('boq_labor_cost').value) || 0;
    const materialCost = parseFloat(document.getElementById('boq_material_cost').value) || 0;
    const otherCost = parseFloat(document.getElementById('boq_other_cost').value) || 0;

    const unitRate = laborCost + materialCost + otherCost;
    document.getElementById('boq_unit_rate').value = unitRate.toFixed(2);

    if (!isNaN(quantity) && quantity > 0) {
        const totalAmount = quantity * unitRate;
        document.getElementById('boq_total_amount').value = totalAmount.toFixed(2);
    } else {
        document.getElementById('boq_total_amount').value = '';
    }
}

window.addBOQItemToList = function() {
    const projectId = document.getElementById('boq_project_name').value;
    const projectCodeId = document.getElementById('boq_project_code_dropdown').value; // This is the Project ID
    const changeOrderId = document.getElementById('boq_co_selector').value || null;
    const itemDescription = document.getElementById('boq_item_description').value.toUpperCase().trim();
    const quantity = parseFloat(document.getElementById('boq_quantity').value);
    const uom = document.getElementById('boq_uom').value.toUpperCase().trim();
    const laborCost = parseFloat(document.getElementById('boq_labor_cost').value) || 0;
    const materialCost = parseFloat(document.getElementById('boq_material_cost').value) || 0;
    const otherCost = parseFloat(document.getElementById('boq_other_cost').value) || 0;
    const unitRate = parseFloat(document.getElementById('boq_unit_rate').value);
    const totalAmount = parseFloat(document.getElementById('boq_total_amount').value);

    if (!projectId || !projectCodeId) {
        window.showModal("Validation Error", "Please select a Project Name and Project Code.");
        return;
    }
    if (!itemDescription || isNaN(quantity) || quantity <= 0 || !uom || isNaN(unitRate) || unitRate < 0 || isNaN(totalAmount) || totalAmount < 0) {
        window.showModal("Validation Error", "Please fill all BOQ item details correctly: Description, Quantity (>0), UOM, and ensure costs result in valid Unit Rate/Total Amount.");
        return;
    }

    const projectName = allProjects.find(p => p.id === projectId)?.proj_name || 'N/A';
    const projectCode = allProjects.find(p => p.id === projectCodeId)?.proj_code || 'N/A';
    const changeOrderCode = allChangeOrders.find(co => co.id === changeOrderId)?.co_number || 'N/A (Original)';
    const clientName = allProjects.find(p => p.id === projectId)?.proj_client_name || 'N/A';


    const newItem = {
        id: Date.now().toString(), // Temporary ID for client-side list
        projectId,
        projectName,
        projectCode,
        changeOrderId,
        changeOrderCode,
        clientName,
        itemDescription,
        quantity,
        uom,
        laborCost,
        materialCost,
        otherCost,
        unitRate,
        totalAmount
    };

    tempBOQItems.push(newItem);
    window.renderBOQTempTable();
    document.getElementById('saveAllBOQItemsBtn').disabled = false; // Enable save button

    // Clear form fields
    document.getElementById('boq_item_description').value = '';
    document.getElementById('boq_quantity').value = '';
    document.getElementById('boq_uom').value = '';
    document.getElementById('boq_labor_cost').value = '';
    document.getElementById('boq_material_cost').value = '';
    document.getElementById('boq_other_cost').value = '';
    document.getElementById('boq_unit_rate').value = '';
    document.getElementById('boq_total_amount').value = '';
}

window.renderBOQTempTable = function() {
    const tableBody = document.getElementById('boqTempTableBody');
    tableBody.innerHTML = '';

    tempBOQItems.forEach((item, index) => {
        const row = tableBody.insertRow();
        row.insertCell(0).textContent = item.itemDescription;
        row.insertCell(1).textContent = item.quantity + ' ' + item.uom;
        row.insertCell(2).textContent = item.unitRate.toFixed(2);
        row.insertCell(3).textContent = item.totalAmount.toFixed(2);
        
        const actionsCell = row.insertCell(4);
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.onclick = () => window.removeBOQTempItem(index);
        actionsCell.appendChild(deleteButton);
    });
}

window.removeBOQTempItem = function(index) {
    tempBOQItems.splice(index, 1);
    window.renderBOQTempTable();
    if (tempBOQItems.length === 0) {
        document.getElementById('saveAllBOQItemsBtn').disabled = true;
    }
}

window.saveAllBOQItems = async function() {
    if (!db || !userId) {
        window.showModal("Error", "Firestore not ready. Please try again.");
        return;
    }
    if (tempBOQItems.length === 0) {
        window.showModal("Info", "No items to save.");
        return;
    }

    const boqCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/billOfQuantities`);
    let successfulSaves = 0;
    let failedSaves = 0;

    for (const item of tempBOQItems) {
        try {
            const { id, ...itemToSave } = item; // Remove temporary 'id'
            await addDoc(boqCollectionRef, {
                ...itemToSave,
                timestamp: new Date().toISOString()
            });
            successfulSaves++;
        } catch (e) {
            console.error("Error adding BOQ item: ", e);
            failedSaves++;
        }
    }

    if (failedSaves === 0) {
        window.showModal("Success", `Successfully saved ${successfulSaves} BOQ item(s).`);
    } else {
        window.showModal("Warning", `Saved ${successfulSaves} item(s), but ${failedSaves} item(s) failed to save. Check console for details.`);
    }

    tempBOQItems = [];
    window.renderBOQTempTable();
    document.getElementById('saveAllBOQItemsBtn').disabled = true;
}

// BOM Logic
window.calculateBOMQuantitiesAndCosts = function() {
    const materialCoverage = parseFloat(document.getElementById('bom_material_coverage').value);
    const unitCost = parseFloat(document.getElementById('bom_unit_cost').value);
    const calculatedQuantityInput = document.getElementById('bom_calculated_quantity');
    const totalCostInput = document.getElementById('bom_total_cost');

    calculatedQuantityInput.value = '';
    totalCostInput.value = '';

    if (selectedBOQItemForBOM && !isNaN(materialCoverage) && materialCoverage > 0 && !isNaN(unitCost) && unitCost >= 0) {
        const boqQuantity = selectedBOQItemForBOM.quantity;
        const calculatedQty = boqQuantity / materialCoverage;
        const totalCost = calculatedQty * unitCost;

        calculatedQuantityInput.value = calculatedQty.toFixed(2);
        totalCostInput.value = totalCost.toFixed(2);
    }
}

window.addBOMItemToList = function() {
    const projectId = document.getElementById('bom_project_name').value;
    const projectCodeId = document.getElementById('bom_project_code_dropdown').value;
    const changeOrderId = document.getElementById('bom_co_selector').value || null;
    const boqItemId = document.getElementById('bom_boq_item').value;
    const materialName = document.getElementById('bom_material_name').value.toUpperCase().trim();
    const materialCoverage = parseFloat(document.getElementById('bom_material_coverage').value);
    const coverageUOM = document.getElementById('bom_coverage_uom').value.toUpperCase().trim();
    const materialUOM = document.getElementById('bom_material_uom').value.toUpperCase().trim();
    const unitCost = parseFloat(document.getElementById('bom_unit_cost').value);
    const calculatedQuantity = parseFloat(document.getElementById('bom_calculated_quantity').value);
    const totalCost = parseFloat(document.getElementById('bom_total_cost').value);
    const remarks = document.getElementById('bom_remarks').value.toUpperCase().trim();

    if (!projectId || !projectCodeId || !boqItemId) {
        window.showModal("Validation Error", "Please select a Project, Project Code, and Parent BOQ Item.");
        return;
    }
    if (!materialName || isNaN(materialCoverage) || materialCoverage <= 0 || !coverageUOM || !materialUOM || isNaN(unitCost) || unitCost < 0 || isNaN(calculatedQuantity) || calculatedQuantity < 0 || isNaN(totalCost) || totalCost < 0) {
        window.showModal("Validation Error", "Please fill all BOM item details correctly: Material Name, Material Coverage (>0), UOMs, Unit Cost, and ensure calculations are valid.");
        return;
    }

    const projectName = allProjects.find(p => p.id === projectId)?.proj_name || 'N/A';
    const projectCode = allProjects.find(p => p.id === projectCodeId)?.proj_code || 'N/A';
    const changeOrderCode = allChangeOrders.find(co => co.id === changeOrderId)?.co_number || 'N/A (Original)';
    const boqItemDescription = allBOQItems.find(boq => boq.id === boqItemId)?.itemDescription || 'N/A';


    const newItem = {
        id: Date.now().toString(), // Temporary ID
        projectId,
        projectName,
        projectCode,
        changeOrderId,
        changeOrderCode,
        boqItemId,
        boqItemDescription,
        materialName,
        materialCoverage,
        coverageUOM,
        materialUOM,
        unitCost,
        calculatedQuantity,
        totalCost,
        remarks
    };

    tempBOMItems.push(newItem);
    window.renderBOMTempTable();
    document.getElementById('saveAllBOMItemsBtn').disabled = false;

    // Clear form fields
    document.getElementById('bom_material_name').value = '';
    document.getElementById('bom_material_coverage').value = '';
    document.getElementById('bom_coverage_uom').value = '';
    document.getElementById('bom_material_uom').value = '';
    document.getElementById('bom_unit_cost').value = '';
    document.getElementById('bom_calculated_quantity').value = '';
    document.getElementById('bom_total_cost').value = '';
    document.getElementById('bom_remarks').value = '';
    document.getElementById('bom_boq_item').value = ''; // Clear BOQ selection
    document.getElementById('bom_boq_quantity_display').classList.add('hidden'); // Hide BOQ quantity display
    selectedBOQItemForBOM = null;
}

window.renderBOMTempTable = function() {
    const tableBody = document.getElementById('bomTempTableBody');
    tableBody.innerHTML = '';

    tempBOMItems.forEach((item, index) => {
        const row = tableBody.insertRow();
        row.insertCell(0).textContent = item.materialName;
        row.insertCell(1).textContent = `${item.materialCoverage} ${item.coverageUOM}`;
        row.insertCell(2).textContent = `${item.calculatedQuantity.toFixed(2)} ${item.materialUOM}`;
        row.insertCell(3).textContent = item.totalCost.toFixed(2);

        const actionsCell = row.insertCell(4);
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.onclick = () => window.removeBOMTempItem(index);
        actionsCell.appendChild(deleteButton);
    });
}

window.removeBOMTempItem = function(index) {
    tempBOMItems.splice(index, 1);
    window.renderBOMTempTable();
    if (tempBOMItems.length === 0) {
        document.getElementById('saveAllBOMItemsBtn').disabled = true;
    }
}

window.saveAllBOMItems = async function() {
    if (!db || !userId) {
        window.showModal("Error", "Firestore not ready. Please try again.");
        return;
    }
    if (tempBOMItems.length === 0) {
        window.showModal("Info", "No items to save.");
        return;
    }

    const bomCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/billOfMaterials`);
    let successfulSaves = 0;
    let failedSaves = 0;

    for (const item of tempBOMItems) {
        try {
            const { id, ...itemToSave } = item;
            await addDoc(bomCollectionRef, {
                ...itemToSave,
                timestamp: new Date().toISOString()
            });
            successfulSaves++;
        } catch (e) {
            console.error("Error adding BOM item: ", e);
            failedSaves++;
        }
    }

    if (failedSaves === 0) {
        window.showModal("Success", `Successfully saved ${successfulSaves} BOM item(s).`);
    } else {
        window.showModal("Warning", `Saved ${successfulSaves} item(s), but ${failedSaves} item(s) failed to save. Check console for details.`);
    }

    tempBOMItems = [];
    window.renderBOMTempTable();
    document.getElementById('saveAllBOMItemsBtn').disabled = true;
}

// BOL Logic
window.calculateBOLQuantitiesAndCosts = function() {
    const laborCoverage = parseFloat(document.getElementById('bol_labor_coverage').value);
    const unitCost = parseFloat(document.getElementById('bol_unit_cost').value);
    const calculatedQuantityInput = document.getElementById('bol_calculated_quantity');
    const totalCostInput = document.getElementById('bol_total_cost');

    calculatedQuantityInput.value = '';
    totalCostInput.value = '';

    if (selectedBOQItemForBOL && !isNaN(laborCoverage) && laborCoverage > 0 && !isNaN(unitCost) && unitCost >= 0) {
        const boqQuantity = selectedBOQItemForBOL.quantity;
        const calculatedQty = boqQuantity / laborCoverage;
        const totalCost = calculatedQty * unitCost;

        calculatedQuantityInput.value = calculatedQty.toFixed(2);
        totalCostInput.value = totalCost.toFixed(2);
    }
}

window.addBOLItemToList = function() {
    const projectId = document.getElementById('bol_project_name').value;
    const projectCodeId = document.getElementById('bol_project_code_dropdown').value;
    const changeOrderId = document.getElementById('bol_co_selector').value || null;
    const boqItemId = document.getElementById('bol_boq_item').value;
    const laborName = document.getElementById('bol_labor_name').value.toUpperCase().trim();
    const laborCoverage = parseFloat(document.getElementById('bol_labor_coverage').value);
    const coverageUOM = document.getElementById('bol_coverage_uom').value.toUpperCase().trim();
    const laborUOM = document.getElementById('bol_labor_uom').value.toUpperCase().trim();
    const unitCost = parseFloat(document.getElementById('bol_unit_cost').value);
    const calculatedQuantity = parseFloat(document.getElementById('bol_calculated_quantity').value);
    const totalCost = parseFloat(document.getElementById('bol_total_cost').value);
    const remarks = document.getElementById('bol_remarks').value.toUpperCase().trim();

    if (!projectId || !projectCodeId || !boqItemId) {
        window.showModal("Validation Error", "Please select a Project, Project Code, and Parent BOQ Item.");
        return;
    }
    if (!laborName || isNaN(laborCoverage) || laborCoverage <= 0 || !coverageUOM || !laborUOM || isNaN(unitCost) || unitCost < 0 || isNaN(calculatedQuantity) || calculatedQuantity < 0 || isNaN(totalCost) || totalCost < 0) {
        window.showModal("Validation Error", "Please fill all BOL item details correctly: Labor Skill, Labor Coverage (>0), UOMs, Unit Cost, and ensure calculations are valid.");
        return;
    }

    const projectName = allProjects.find(p => p.id === projectId)?.proj_name || 'N/A';
    const projectCode = allProjects.find(p => p.id === projectCodeId)?.proj_code || 'N/A';
    const changeOrderCode = allChangeOrders.find(co => co.id === changeOrderId)?.co_number || 'N/A (Original)';
    const boqItemDescription = allBOQItems.find(boq => boq.id === boqItemId)?.itemDescription || 'N/A';

    const newItem = {
        id: Date.now().toString(), // Temporary ID
        projectId,
        projectName,
        projectCode,
        changeOrderId,
        changeOrderCode,
        boqItemId,
        boqItemDescription,
        laborName,
        laborCoverage,
        coverageUOM,
        laborUOM,
        unitCost,
        calculatedQuantity,
        totalCost,
        remarks
    };

    tempBOLItems.push(newItem);
    window.renderBOLTempTable();
    document.getElementById('saveAllBOLItemsBtn').disabled = false;

    // Clear form fields
    document.getElementById('bol_labor_name').value = '';
    document.getElementById('bol_labor_coverage').value = '';
    document.getElementById('bol_coverage_uom').value = '';
    document.getElementById('bol_labor_uom').value = '';
    document.getElementById('bol_unit_cost').value = '';
    document.getElementById('bol_calculated_quantity').value = '';
    document.getElementById('bol_total_cost').value = '';
    document.getElementById('bol_remarks').value = '';
    document.getElementById('bol_boq_item').value = ''; // Clear BOQ selection
    document.getElementById('bol_boq_quantity_display').classList.add('hidden'); // Hide BOQ quantity display
    selectedBOQItemForBOL = null;
}

window.renderBOLTempTable = function() {
    const tableBody = document.getElementById('bolTempTableBody');
    tableBody.innerHTML = '';

    tempBOLItems.forEach((item, index) => {
        const row = tableBody.insertRow();
        row.insertCell(0).textContent = item.laborName;
        row.insertCell(1).textContent = `${item.laborCoverage} ${item.coverageUOM}`;
        row.insertCell(2).textContent = `${item.calculatedQuantity.toFixed(2)} ${item.laborUOM}`;
        row.insertCell(3).textContent = item.totalCost.toFixed(2);

        const actionsCell = row.insertCell(4);
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.onclick = () => window.removeBOLTempItem(index);
        actionsCell.appendChild(deleteButton);
    });
}

window.removeBOLTempItem = function(index) {
    tempBOLItems.splice(index, 1);
    window.renderBOLTempTable();
    if (tempBOLItems.length === 0) {
        document.getElementById('saveAllBOLItemsBtn').disabled = true;
    }
}

window.saveAllBOLItems = async function() {
    if (!db || !userId) {
        window.showModal("Error", "Firestore not ready. Please try again.");
        return;
    }
    if (tempBOLItems.length === 0) {
        window.showModal("Info", "No items to save.");
        return;
    }

    const bolCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/billOfLabor`);
    let successfulSaves = 0;
    let failedSaves = 0;

    for (const item of tempBOLItems) {
        try {
            const { id, ...itemToSave } = item;
            await addDoc(bolCollectionRef, {
                ...itemToSave,
                timestamp: new Date().toISOString()
            });
            successfulSaves++;
        } catch (e) {
            console.error("Error adding BOL item: ", e);
            failedSaves++;
        }
    }

    if (failedSaves === 0) {
        window.showModal("Success", `Successfully saved ${successfulSaves} BOL item(s).`);
    } else {
        window.showModal("Warning", `Saved ${successfulSaves} item(s), but ${failedSaves} item(s) failed to save. Check console for details.`);
    }

    tempBOLItems = [];
    window.renderBOLTempTable();
    document.getElementById('saveAllBOLItemsBtn').disabled = true;
}


// --- Dashboard Render Functions ---
window.renderProjectsDashboard = function() {
    const tableBody = document.getElementById('projectsTableBody');
    tableBody.innerHTML = '';
    let totalAmount = 0;

    const filteredProjects = window.applyGlobalFilter(allProjects);

    filteredProjects.forEach(project => {
        const row = tableBody.insertRow();
        row.insertCell(0).textContent = new Date(project.timestamp).toLocaleString();
        row.insertCell(1).textContent = project.proj_client_name;
        row.insertCell(2).textContent = project.proj_name;
        row.insertCell(3).textContent = project.proj_code;
        row.insertCell(4).textContent = project.proj_scope;
        row.insertCell(5).textContent = parseFloat(project.proj_amount).toFixed(2);
        row.insertCell(6).textContent = project.proj_start;
        row.insertCell(7).textContent = project.proj_end;
        row.insertCell(8).textContent = project.proj_remarks;
        totalAmount += parseFloat(project.proj_amount);
    });
    document.getElementById('projectTotalDisplay').textContent = `Total Amount: Php ${totalAmount.toFixed(2)} 💰`;
}

window.renderChangeOrdersDashboard = function() {
    const tableBody = document.getElementById('changeOrdersTableBody');
    tableBody.innerHTML = '';
    let totalCOAmount = 0;

    const filteredCOs = window.applyGlobalFilter(allChangeOrders);

    filteredCOs.forEach(co => {
        const row = tableBody.insertRow();
        row.insertCell(0).textContent = new Date(co.timestamp).toLocaleString();
        row.insertCell(1).textContent = co.proj_client_name;
        row.insertCell(2).textContent = co.proj_name;
        row.insertCell(3).textContent = co.co_scope; // Display CO scope first for better context
        row.insertCell(4).textContent = co.proj_code;
        row.insertCell(5).textContent = co.co_number;
        row.insertCell(6).textContent = parseFloat(co.co_amount).toFixed(2);
        row.insertCell(7).textContent = co.co_start;
        row.insertCell(8).textContent = co.co_end;
        row.insertCell(9).textContent = co.co_remarks;
        totalCOAmount += parseFloat(co.co_amount);
    });
    document.getElementById('changeOrderTotalDisplay').textContent = `Total Change Orders: Php ${totalCOAmount.toFixed(2)} 💰`;
}

window.renderBOQDashboard = function() {
    const tableBody = document.getElementById('boqTableBody');
    tableBody.innerHTML = '';
    let totalCost = 0;

    const filteredBOQItems = window.applyGlobalFilter(allBOQItems);

    filteredBOQItems.forEach(item => {
        const row = tableBody.insertRow();
        row.insertCell(0).textContent = new Date(item.timestamp).toLocaleString();
        row.insertCell(1).textContent = item.clientName;
        row.insertCell(2).textContent = item.projectName;
        row.insertCell(3).textContent = item.proj_scope || 'N/A'; // Assuming BOQ might inherit project scope, add fallback
        row.insertCell(4).textContent = item.projectCode;
        row.insertCell(5).textContent = item.changeOrderCode;
        row.insertCell(6).textContent = item.itemDescription;
        row.insertCell(7).textContent = item.quantity;
        row.insertCell(8).textContent = item.uom;
        row.insertCell(9).textContent = item.materialCost.toFixed(2);
        row.insertCell(10).textContent = item.laborCost.toFixed(2);
        row.insertCell(11).textContent = item.otherCost.toFixed(2);
        row.insertCell(12).textContent = item.unitRate.toFixed(2);
        row.insertCell(13).textContent = item.totalAmount.toFixed(2);
        row.insertCell(14).textContent = item.remarks || 'N/A';
        row.insertCell(15).textContent = item.changeOrderId ? 'Change Order' : 'Original Contract';
        totalCost += parseFloat(item.totalAmount);
    });
    document.getElementById('boqTotalCostDisplay').textContent = `Total Cost: Php ${totalCost.toFixed(2)} 💰`;
}

window.renderBOMDashboard = function() {
    const tableBody = document.getElementById('bomTableBody');
    tableBody.innerHTML = '';
    let totalCost = 0;

    const filteredBOMItems = window.applyGlobalFilter(allBOMItems);

    filteredBOMItems.forEach(item => {
        const row = tableBody.insertRow();
        row.insertCell(0).textContent = new Date(item.timestamp).toLocaleString();
        row.insertCell(1).textContent = item.projectName;
        row.insertCell(2).textContent = item.projectCode;
        row.insertCell(3).textContent = item.changeOrderCode;
        row.insertCell(4).textContent = item.boqItemDescription; // Display BOQ parent description
        row.insertCell(5).textContent = item.materialName;
        row.insertCell(6).textContent = `${item.materialCoverage} ${item.coverageUOM}`;
        row.insertCell(7).textContent = `${item.calculatedQuantity.toFixed(2)} ${item.materialUOM}`;
        row.insertCell(8).textContent = item.unitCost.toFixed(2);
        row.insertCell(9).textContent = item.totalCost.toFixed(2);
        row.insertCell(10).textContent = item.remarks;
        totalCost += item.totalCost;
    });
    document.getElementById('bomTotalCostDisplay').innerHTML = `Total Cost: <span class="text-green-600 font-bold">Php ${totalCost.toFixed(2)}</span> 💰`;
}

window.renderBOLDashboard = function() {
    const tableBody = document.getElementById('bolTableBody');
    tableBody.innerHTML = '';
    let totalCost = 0;

    const filteredBOLItems = window.applyGlobalFilter(allBOLItems);

    filteredBOLItems.forEach(item => {
        const row = tableBody.insertRow();
        row.insertCell(0).textContent = new Date(item.timestamp).toLocaleString();
        row.insertCell(1).textContent = item.projectName;
        row.insertCell(2).textContent = item.projectCode;
        row.insertCell(3).textContent = item.changeOrderCode;
        row.insertCell(4).textContent = item.boqItemDescription;
        row.insertCell(5).textContent = item.laborName;
        row.insertCell(6).textContent = `${item.laborCoverage} ${item.coverageUOM}`;
        row.insertCell(7).textContent = `${item.calculatedQuantity.toFixed(2)} ${item.laborUOM}`;
        row.insertCell(8).textContent = item.unitCost.toFixed(2);
        row.insertCell(9).textContent = item.totalCost.toFixed(2);
        row.insertCell(10).textContent = item.remarks;
        totalCost += item.totalCost;
    });
    document.getElementById('bolTotalCostDisplay').innerHTML = `Total Cost: <span class="text-green-600 font-bold">Php ${totalCost.toFixed(2)}</span> 💰`;
}

// Global Dashboard Filter
window.applyDashboardGlobalFilter = function() {
    window.renderProjectsDashboard();
    window.renderChangeOrdersDashboard();
    window.renderBOQDashboard();
    window.renderBOMDashboard();
    window.renderBOLDashboard();
    window.renderBILLDashboard(); // Render BILL dashboard after filtering
}

window.applyGlobalFilter = function(dataArray) {
    const filterValue = document.getElementById('globalDashboardFilter').value.toLowerCase().trim();
    if (!filterValue) {
        return dataArray;
    }
    const keywords = filterValue.split(',').map(kw => kw.trim()).filter(kw => kw.length > 0);

    return dataArray.filter(item => {
        const itemString = JSON.stringify(item).toLowerCase(); // Search across all fields
        return keywords.every(keyword => itemString.includes(keyword));
    });
}


// --- Initialization on DOM Load ---
document.addEventListener('DOMContentLoaded', async () => {
    // Initial sidebar and dashboard tab display
    window.showSidebarForm('projectForm'); // Default to Project form
    window.showDashboardTab('projectsDashboardTab'); // Default to Project dashboard

    // Firebase Authentication and Data Fetching
    if (auth) {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                console.log("Firebase authenticated. User ID:", userId);
                // Fetch all necessary data once authenticated
                await fetchProjects();
                await fetchChangeOrders();
                await fetchBOQItems();
                await fetchBOMItems();
                await fetchBOLItems();
                await fetchBILLItems(); // Fetch BILL items
            } else {
                // Sign in anonymously if no user is logged in (no custom token in GitHub environment)
                try {
                    await signInAnonymously(auth);
                    // onAuthStateChanged will be triggered again with the new user
                } catch (error) {
                    console.error("Anonymous authentication failed:", error);
                    window.showModal("Authentication Error", "Failed to authenticate. Some features may not work: " + error.message);
                }
            }
        });
    } else {
        window.showModal("Configuration Error", "Firebase is not configured. Please update script.js with your Firebase project details.");
    }
});
