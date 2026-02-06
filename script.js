// --- CONFIGURACIÓN DE FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    query,
    where,
    orderBy,
    deleteDoc,
    updateDoc,
    doc,
    serverTimestamp,
    getDocs
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// --- TU CONFIGURACIÓN AQUÍ ABAJO ---
// IMPORTANTE: Pega tu objeto de configuración dentro de las llaves.
const firebaseConfig = {
    apiKey: "AIzaSyBix3HVaY9vdMb83Tw1migARxaD4Q5Hplo",
    authDomain: "dispatch-rp-v1.firebaseapp.com",
    projectId: "dispatch-rp-v1",
    storageBucket: "dispatch-rp-v1.firebasestorage.app",
    messagingSenderId: "1018730676406",
    appId: "1:1018730676406:web:145458463c495ac02ba617"
};


// --- DRAG AND DROP (SORTABLEJS) ---
// Configuración visual local
function initSortable() {
    const feedLCSCO = document.getElementById('feed-lcsco');
    const feedLSPD = document.getElementById('feed-lspd');

    const sortableConfig = {
        animation: 150,
        ghostClass: 'blue-background-class',
        // No guardamos orden en DB, es solo visual
        onEnd: function (evt) {
            // Se podría guardar en localStorage si quisiéramos persistencia local
            // console.log('Item movido', evt.item);
        }
    };

    if (feedLCSCO) new Sortable(feedLCSCO, sortableConfig);
    if (feedLSPD) new Sortable(feedLSPD, sortableConfig);
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initSortable);

// Inicializar Firebase (Solo si hay config, para evitar error en consola si está vacío)
let db, auth;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (e) {
    console.warn("Esperando configuración de Firebase...", e);
}

// --- THEME & SETUP ---
// Recuperar tema
const savedTheme = localStorage.getItem('dispatch_theme');
if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
}

// Toggle logic
const themeToggleBtn = document.getElementById('theme-toggle');

// Helper para actualizar icono
function updateThemeIcon(isLight) {
    if (!themeToggleBtn) return;
    const icon = themeToggleBtn.querySelector('i');
    if (icon) {
        if (isLight) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }
}

// Set initial icon
if (savedTheme === 'light') updateThemeIcon(true);

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        localStorage.setItem('dispatch_theme', isLight ? 'light' : 'dark');
        updateThemeIcon(isLight);
    });
} else {
    console.warn("Botón de tema no encontrado (theme-toggle)");
}


// --- LÓGICA DE TSUNAMI (08:00 y 20:00) ---
/**
 * Calcula el timestamp del último Tsunami (reinicio).
 * Reglas:
 * - Reinicios a las 08:00 y 20:00.
 * - Si son las 14:00, el último fue hoy a las 08:00.
 * - Si son las 21:00, el último fue hoy a las 20:00.
 * - Si son las 05:00, el último fue ayer a las 20:00.
 */
function getLastTsunamiTime() {
    const now = new Date();
    const tsunamiToday08 = new Date(now);
    tsunamiToday08.setHours(8, 0, 0, 0);

    const tsunamiToday20 = new Date(now);
    tsunamiToday20.setHours(20, 0, 0, 0);

    // Si la hora actual es mayor a las 20:00, el úlitmo fue las 20:00 de hoy
    if (now >= tsunamiToday20) {
        return tsunamiToday20;
    }
    // Si la hora actual está entre 08:00 y 20:00, el último fue las 08:00 de hoy
    else if (now >= tsunamiToday08) {
        return tsunamiToday08;
    }
    // Si es antes de las 08:00 (ej: 05:00), el último fue AYER a las 20:00
    else {
        const tsunamiYesterday20 = new Date(now);
        tsunamiYesterday20.setDate(now.getDate() - 1);
        tsunamiYesterday20.setHours(20, 0, 0, 0);
        return tsunamiYesterday20;
    }
}

// --- REFERENCIAS DOM ---
const modal = document.getElementById('modal-notice');
const btnNewNotice = document.getElementById('btn-new-notice');
const btnCloseModal = document.getElementById('btn-close-modal');
const formNotice = document.getElementById('form-notice');
const inputColor = document.getElementById('input-color');
const colorHex = document.getElementById('color-hex');
const feedLCSCO = document.getElementById('feed-lcsco');
const feedLSPD = document.getElementById('feed-lspd');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

// NUEVAS VARIABLES GLOBALES
const btnEditIdentity = document.getElementById('btn-edit-identity');
const btnSubmitText = document.getElementById('btn-submit-text');
const inputPlayerId = document.getElementById('input-player-id');
let editingRobberyId = null; // Estado para saber si editamos


// --- IDENTITY MANAGEMENT ---
const identityModal = document.getElementById('identity-modal');
const inputAgentName = document.getElementById('agent-name');
const btnFactionLCSCO = document.getElementById('btn-faction-lcsco');
const btnFactionLSPD = document.getElementById('btn-faction-lspd');

// Check Identity on Load
let currentUser = JSON.parse(localStorage.getItem('dispatch_identity'));

if (currentUser) {
    // Si ya existe, ocultar modal
    if (identityModal) {
        identityModal.classList.remove('active');
        identityModal.classList.add('hidden');
    }
    console.log("Bienvenido agente:", currentUser.name, currentUser.faction);
} else {
    // Si no existe, asegurarse de que se muestra (aunque el HTML tiene active)
    if (identityModal) {
        identityModal.classList.remove('hidden');
        identityModal.classList.add('active');
    }
}

// Save Identity Function
const saveIdentity = (faction) => {
    const name = inputAgentName.value.trim();
    if (name.length < 2) {
        showToast("Por favor, introduce un nombre de agente válido.", "error");
        return;
    }

    currentUser = {
        name: name,
        faction: faction,
        localId: getLocalUserId() // Persistimos el mismo ID local
    };

    localStorage.setItem('dispatch_identity', JSON.stringify(currentUser));

    // Hide Modal with animation
    if (identityModal) {
        identityModal.classList.remove('active');
        setTimeout(() => {
            identityModal.classList.add('hidden');
        }, 300);
    }
};

if (btnFactionLCSCO) btnFactionLCSCO.addEventListener('click', () => saveIdentity('norte'));
if (btnFactionLSPD) btnFactionLSPD.addEventListener('click', () => saveIdentity('sur'));

if (btnEditIdentity) {
    btnEditIdentity.addEventListener('click', () => {
        if (currentUser) {
            inputAgentName.value = currentUser.name; // Rellenar nombre actual
        }
        identityModal.classList.remove('hidden');
        requestAnimationFrame(() => identityModal.classList.add('active'));
    });
}


// --- UI INTERACTION ---

// Verificación de elementos críticos
if (!btnNewNotice) console.error("Error: No se encontró el botón 'btn-new-notice'");
if (!modal) console.error("Error: No se encontró el modal 'modal-notice'");

// Modal Toggle
const toggleModal = (show) => {
    console.log("Toggle modal:", show);
    if (!modal) return;

    if (show) {
        modal.classList.remove('hidden');
        // Small timeout to allow display:flex to apply before opacity transition
        requestAnimationFrame(() => {
            modal.classList.add('active');
        });
    } else {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.classList.add('hidden');

            // Resetear estado al cerrar
            formNotice.reset();
            editingRobberyId = null;
            if (btnSubmitText) btnSubmitText.textContent = "Publicar Aviso";
        }, 300);
    }
};

if (btnNewNotice) {
    btnNewNotice.addEventListener('click', (e) => {
        e.preventDefault(); // Prevenir cualquier comportamiento default
        console.log("Click en Nuevo Aviso");
        toggleModal(true);
    });
}
if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => toggleModal(false));
}
if (modal) {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) toggleModal(false);
    });
}

// Color Picker Hex Update
if (inputColor) {
    inputColor.addEventListener('input', (e) => {
        if (colorHex) colorHex.textContent = e.target.value;
    });
}

// --- FIREBASE LOGIC ---

// Lógica principal envuelta para ejecutar tras login
const startApp = () => {
    if (!db) return;

    const lastTsunami = getLastTsunamiTime();
    console.log("Filtrando datos desde el tsunami:", lastTsunami.toLocaleString());

    // 1. ESCUCHAR ROBOS
    // Filtramos por fecha creada >= lastTsunami
    // CAMBIO: Usamos timestamp en lugar de createdAt para el filtro y orden ASC
    const qRobos = query(
        collection(db, "solicitudes_robos"),
        where("timestamp", ">=", lastTsunami),
        orderBy("timestamp", "asc")
    );

    onSnapshot(qRobos, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            const id = change.doc.id;

            // Determinar contenedor
            let container = null;
            if (data.zone === 'norte') container = feedLCSCO;
            else container = feedLSPD;

            if (!container) return;

            if (change.type === "added") {
                // Crear y añadir AL FINAL
                const card = createRobberyCard(id, data);
                // Remover empty state si existe
                const empty = container.querySelector('.empty-state');
                if (empty) empty.remove();

                container.appendChild(card);
            }
            if (change.type === "modified") {
                // 1. Localizar la tarjeta antigua
                const existingCard = document.getElementById(`robbery-${id}`);

                // 2. Crear una nueva tarjeta con los datos actualizados
                const newCard = createRobberyCard(id, data);

                // 3. Reemplazar en el DOM (Swap)
                if (existingCard && existingCard.parentNode) {
                    existingCard.parentNode.replaceChild(newCard, existingCard);

                    // Efecto visual de actualización (parpadeo suave)
                    newCard.animate([
                        { opacity: 0.5, transform: 'scale(0.98)' },
                        { opacity: 1, transform: 'scale(1)' }
                    ], { duration: 300 });
                }
            }
            if (change.type === "removed") {
                const existingCard = document.getElementById(`robbery-${id}`);
                if (existingCard) existingCard.remove();

                // Si no quedan hijos, poner empty state
                if (container.children.length === 0) {
                    if (data.zone === 'norte') {
                        container.innerHTML = `
                            <div class="empty-state">
                                <i class="fa-solid fa-satellite-dish"></i>
                                <p>Sin novedades en el Norte</p>
                            </div>`;
                    } else {
                        container.innerHTML = `
                            <div class="empty-state">
                                <i class="fa-solid fa-shield-halved"></i>
                                <p>Sin novedades en el Sur</p>
                            </div>`;
                    }
                }
            }
        });
    });

    // 2. CREAR O EDITAR AVISO
    if (formNotice) {
        formNotice.addEventListener('submit', async (e) => {
            e.preventDefault();
            const zoneInput = document.querySelector('input[name="zone"]:checked');
            if (!zoneInput) { showToast("Selecciona jurisdicción", "error"); return; }

            const formData = {
                zone: zoneInput.value,
                playerId: document.getElementById('input-player-id').value, // NUEVO CAMPO
                band: document.getElementById('input-band').value,
                color: document.getElementById('input-color').value,
                robbery: document.getElementById('input-robbery').value
            };

            try {
                if (editingRobberyId) {
                    // MODO EDICIÓN: Actualizar existente
                    await updateDoc(doc(db, "solicitudes_robos", editingRobberyId), formData);
                    showToast("Aviso actualizado", "success");
                } else {
                    // MODO CREACIÓN: Nuevo documento
                    formData.status = 'pending';
                    formData.createdAt = serverTimestamp();
                    formData.timestamp = new Date();
                    await addDoc(collection(db, "solicitudes_robos"), formData);
                    showToast("Aviso publicado", "success");
                }

                // Resetear estado
                toggleModal(false);
                formNotice.reset();
                editingRobberyId = null;
                if (btnSubmitText) btnSubmitText.textContent = "Publicar Aviso";
                if (inputColor) inputColor.value = "#ff0000";

            } catch (error) {
                console.error(error);
                showToast("Error al guardar", "error");
            }
        });
    }

    // 3. CHAT INTERNO
    const qChat = query(
        collection(db, "chat_interno"),
        where("createdAt", ">=", lastTsunami),
        orderBy("createdAt", "asc")
    );

    onSnapshot(qChat, (snapshot) => {
        if (!chatMessages) return;

        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                const elm = document.createElement('div');

                // Si el mensaje tiene localId, comparamos para ver si es 'own'
                let isOwn = false;
                // Check current user logic
                let currentLocalId = null;
                if (currentUser) currentLocalId = currentUser.localId;
                else currentLocalId = getLocalUserId(); // Fallback

                if (data.localId && data.localId === currentLocalId) {
                    isOwn = true;
                }

                elm.className = `message ${isOwn ? 'own' : 'others'}`;

                // Format time
                let timeStr = "";
                if (data.createdAt && data.createdAt.toDate) {
                    const date = data.createdAt.toDate();
                    timeStr = date.getHours().toString().padStart(2, '0') + ":" + date.getMinutes().toString().padStart(2, '0');
                }

                // Determine user color class based on faction
                const factionClass = data.faction ? `msg-user ${data.faction}` : 'msg-user';

                elm.innerHTML = `
                    <div class="msg-header">
                        <span class="${factionClass}">${data.user || 'Agente'}</span>
                        <span>${timeStr}</span>
                    </div>
                    ${data.text}
                `;
                chatMessages.appendChild(elm);

                // Scroll to bottom only on add
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
            // Modified/Removed not strictly needed for chat usually, but good practice to handle if editing allowed later
        });
    });

    // Enviar Mensaje Chat
    if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (!text) return;

            // Ensure we have a user
            if (!currentUser) {
                showToast("Debes identificarte primero (Refresca la página).", "error");
                return;
            }

            try {
                await addDoc(collection(db, "chat_interno"), {
                    text,
                    user: currentUser.name,
                    faction: currentUser.faction,
                    localId: currentUser.localId,
                    createdAt: serverTimestamp()
                });
                chatInput.value = '';
            } catch (error) {
                console.error("Error enviando mensaje: ", error);
            }
        });
    }
    // 4. CONFIGURACIÓN DINÁMICA DE ROBOS (ADMIN) & SELECCIÓN
    const qConfig = query(collection(db, "config_robos"), orderBy("name"));
    const selectRobbery = document.getElementById('input-robbery');
    const listAdminRobberies = document.getElementById('admin-robbery-list');

    onSnapshot(qConfig, (snapshot) => {
        // A) Si está vacío, sembramos datos por defecto (SEEDING)
        if (snapshot.empty) {
            console.log("Configuración vacía, creando defaults...");
            const defaults = [
                { name: "Yate", color: "#3498db" },
                { name: "Ayuntamiento", color: "#9b59b6" },
                { name: "Galería de Arte", color: "#e67e22" },
                { name: "Life Invader", color: "#e74c3c" },
                { name: "Banco Sandy", color: "#2ecc71" },
                { name: "Furgón Blindado", color: "#f1c40f" },
                { name: "Furgón de Merryweather", color: "#34495e" }
            ];
            defaults.forEach(d => addDoc(collection(db, "config_robos"), d));
            return;
        }

        // B) Renderizar Select Principal (Usuario)
        if (selectRobbery) {
            selectRobbery.innerHTML = '<option value="" disabled selected>Selecciona el robo...</option>';
            snapshot.forEach(doc => {
                const data = doc.data();
                const opt = document.createElement('option');
                opt.value = data.name;
                opt.textContent = data.name;
                selectRobbery.appendChild(opt);
            });
        }

        // C) Renderizar Lista Admin
        if (listAdminRobberies) {
            listAdminRobberies.innerHTML = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                const item = document.createElement('div');
                item.className = 'admin-item';
                item.innerHTML = `
                    <div class="item-info">
                        <span class="color-dot" style="background:${data.color}"></span>
                        <span>${data.name}</span>
                    </div>
                    <button class="btn-trash" onclick="deleteRobberyConfig('${doc.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                `;
                listAdminRobberies.appendChild(item);
            });
        }
    });

    // --- ACCIONES ADMIN ---

    // Auth & Modal Opening
    const btnAdmin = document.getElementById('btn-admin');
    const adminModal = document.getElementById('admin-modal');
    const btnCloseAdmin = document.getElementById('btn-close-admin');
    const formAddRobbery = document.getElementById('admin-add-robbery');
    const btnNuke = document.getElementById('btn-nuke');

    // Password Modal Logic
    const passwordModal = document.getElementById('password-modal');
    const passwordForm = document.getElementById('form-admin-password');
    const passwordInput = document.getElementById('admin-password-input');
    const btnCancelPassword = document.getElementById('btn-cancel-password');
    const togglePasswordBtn = document.getElementById('toggle-password-visibility');

    const togglePasswordModal = (show) => {
        if (!passwordModal) return;
        if (show) {
            passwordModal.classList.remove('hidden');
            requestAnimationFrame(() => {
                passwordModal.classList.add('active');
                if (passwordInput) {
                    passwordInput.focus();
                    passwordInput.setAttribute('type', 'password'); // Reset to password
                }
                if (togglePasswordBtn) {
                    togglePasswordBtn.classList.remove('fa-eye-slash');
                    togglePasswordBtn.classList.add('fa-eye');
                }
            });
        } else {
            passwordModal.classList.remove('active');
            setTimeout(() => {
                passwordModal.classList.add('hidden');
                if (passwordInput) {
                    passwordInput.value = ''; // Clear on close
                    passwordInput.setAttribute('type', 'password'); // Reset for safety
                }
                if (togglePasswordBtn) {
                    togglePasswordBtn.classList.remove('fa-eye-slash');
                    togglePasswordBtn.classList.add('fa-eye');
                }
            }, 300);
        }
    };

    // Toggle Visibility Logic
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', function () {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }

    if (btnAdmin) {
        btnAdmin.addEventListener('click', () => {
            togglePasswordModal(true);
        });
    }

    if (btnCancelPassword) {
        btnCancelPassword.addEventListener('click', () => togglePasswordModal(false));
    }

    if (passwordForm) {
        passwordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const pass = passwordInput.value;

            if (pass === "PerroSanchez1379") {
                togglePasswordModal(false);
                // Open Admin Panel
                if (adminModal) {
                    adminModal.classList.remove('hidden');
                    requestAnimationFrame(() => adminModal.classList.add('active'));
                }
            } else {
                showToast("Contraseña incorrecta", "error");
                passwordInput.value = '';
                passwordInput.focus();
            }
        });
    }

    if (btnCloseAdmin) {
        btnCloseAdmin.addEventListener('click', () => {
            adminModal.classList.remove('active');
            setTimeout(() => adminModal.classList.add('hidden'), 300);
        });
    }

    // Añadir Nuevo Robo (Admin)
    if (formAddRobbery) {
        formAddRobbery.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('new-robbery-name').value.trim();
            const color = document.getElementById('new-robbery-color').value;

            if (!name) return;

            try {
                await addDoc(collection(db, "config_robos"), { name, color });
                formAddRobbery.reset();
                showToast("Tipo de robo añadido", "success");
            } catch (err) {
                console.error(err);
                showToast("Error al guardar", "error");
            }
        });
    }

    // NUKE DATOS (Danger Zone)
    if (btnNuke) {
        btnNuke.addEventListener('click', async () => {
            const confirm1 = await showCustomConfirm("⚠️ ZONA DE PELIGRO", "¿Estás seguro de que quieres borrar TODOS los datos?");
            if (!confirm1) return;

            const confirm2 = await showCustomConfirm("⚠️ CONFIRMACIÓN FINAL", "Esta acción no se puede deshacer. ¿Proceder?");
            if (!confirm2) return;

            // Execute NUKE calling global helper (defined below to access db scope or usually cleaner in global if db/auth passed, 
            // but here we are inside startApp where db is available. We can do it inline or call a function passing db).
            // Let's do inline for simplicity of closure.
            try {
                showToast("Iniciando borrado masivo...", "info");

                // Borrar Robos
                const robosSnapshot = await getDocs(collection(db, "solicitudes_robos"));
                const roboDeletes = robosSnapshot.docs.map(d => deleteDoc(d.ref));

                // Borrar Chat
                const chatSnapshot = await getDocs(collection(db, "chat_interno"));
                const chatDeletes = chatSnapshot.docs.map(d => deleteDoc(d.ref));

                await Promise.all([...roboDeletes, ...chatDeletes]);

                showToast("limpieza Completa (NUKE)", "success");
                adminModal.classList.remove('active');
                setTimeout(() => adminModal.classList.add('hidden'), 300);

            } catch (e) {
                console.error(e);
                showModalAlert("Error Critico", "Falló el borrado de datos.");
            }
        });
    }
};

// --- GLOBAL ACTIONS (Admin Helpers) ---
window.deleteRobberyConfig = async (id) => {
    if (!db) return;
    if (await showCustomConfirm("Eliminar Configuración", "¿Borrar este tipo de robo?")) {
        try {
            await deleteDoc(doc(db, "config_robos", id));
        } catch (e) {
            console.error(e);
        }
    }
};

// --- MOBILE TAB LOGIC (Refactorizado: Función independiente) ---
function initMobileTabs() {
    const mobileNavItems = document.querySelectorAll('.nav-item');
    const cols = {
        'col-lcsco': document.getElementById('col-lcsco'),
        'col-chat': document.getElementById('col-chat'),
        'col-lspd': document.getElementById('col-lspd')
    };

    // Función para cambiar vista
    function updateMobileView(targetId) {
        if (window.innerWidth > 768) return; // Solo móvil

        // 1. Ocultar todo
        Object.values(cols).forEach(col => {
            if (col) col.classList.remove('active-view');
        });

        // 2. Mostrar target
        const target = cols[targetId];
        if (target) target.classList.add('active-view');

        // 3. Actualizar botones
        mobileNavItems.forEach(btn => {
            if (btn.dataset.target === targetId) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }

    // Listeners
    mobileNavItems.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            updateMobileView(btn.dataset.target);
        });
    });

    // Inicialización al cargar o redimensionar
    function checkMobileState() {
        if (window.innerWidth <= 768) {
            // Si no hay vista activa, activar Chat por defecto
            if (!document.querySelector('.column.active-view')) {
                // Intenta mantener la activa del botón, si no, chat
                const activeBtn = document.querySelector('.nav-item.active');
                const target = activeBtn ? activeBtn.dataset.target : 'col-chat';
                updateMobileView(target);
            }
        } else {
            // Resetear para escritorio (mostrar todo)
            Object.values(cols).forEach(col => {
                if (col) col.classList.remove('active-view');
            });
        }
    }

    checkMobileState();
    window.addEventListener('resize', checkMobileState);
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initMobileTabs);

// --- AUTENTICACIÓN (Al final del archivo) ---
if (auth) {
    let appInitialized = false;
    signInAnonymously(auth).then(() => {
        console.log("Autenticado anónimamente.");
        onAuthStateChanged(auth, (user) => {
            if (user && !appInitialized) {
                appInitialized = true;
                console.log("Iniciando aplicación...");
                startApp();
            }
        });
    }).catch((error) => console.error("Error Auth:", error));
}

// --- HELPERS & GLOBALS ---

window.startEditRobbery = (id, data) => {
    editingRobberyId = id; // Marcamos modo edición

    // Rellenar formulario
    if (inputPlayerId) inputPlayerId.value = data.playerId || '';
    document.getElementById('input-band').value = data.band;
    document.getElementById('input-color').value = data.color;
    document.getElementById('input-robbery').value = data.robbery;
    if (colorHex) colorHex.textContent = data.color;

    // Marcar Radio Button correcto
    const radios = document.getElementsByName('zone');
    radios.forEach(r => {
        if (r.value === data.zone) r.checked = true;
    });

    // Cambiar UI y abrir
    if (btnSubmitText) btnSubmitText.textContent = "Guardar Cambios";
    toggleModal(true);
};

function createRobberyCard(docId, data) {
    const div = document.createElement('div');
    div.className = 'robbery-card';
    div.id = `robbery-${docId}`;

    // Status logic
    const status = data.status || 'pending';
    if (status === 'progress') div.classList.add('status-progress');
    else if (status === 'completed') div.classList.add('status-completed');

    div.style.borderLeftColor = data.color;

    // Time logic
    let timeStr = "--:--";
    if (data.createdAt && data.createdAt.toDate) {
        const d = data.createdAt.toDate();
        timeStr = d.getHours().toString().padStart(2, '0') + ":" + d.getMinutes().toString().padStart(2, '0');
    } else if (data.timestamp) {
        const d = data.timestamp.seconds ? new Date(data.timestamp.seconds * 1000) : new Date(data.timestamp);
        timeStr = d.getHours().toString().padStart(2, '0') + ":" + d.getMinutes().toString().padStart(2, '0');
    }

    // HTML Structure
    div.innerHTML = `
        <div class="card-info">
            <h4>${data.robbery}</h4>
            <div class="card-meta">
                <span class="band-tag" style="background:${data.color}40; color:${data.color}; border:1px solid ${data.color}">
                    ${data.band}
                </span>
                ${data.playerId ? `<span class="id-badge"><i class="fa-solid fa-id-card"></i> ${data.playerId}</span>` : ''}
                <span class="status-badge">${getStatusText(status)}</span>
                <span><i class="fa-regular fa-clock"></i> ${timeStr}</span>
            </div>
        </div>
        <div class="card-actions">
            <button class="btn-action-icon btn-edit" title="Editar Aviso">
                <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn-action-icon btn-status-toggle" onclick="toggleStatus('${docId}', '${status}')">
                <i class="fa-solid fa-traffic-light"></i>
            </button>
            <button class="btn-action-icon btn-delete" onclick="deleteRobbery('${docId}')">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `;

    // Listener para Editar
    const btnEdit = div.querySelector('.btn-edit');
    if (btnEdit) {
        btnEdit.addEventListener('click', (e) => {
            e.stopPropagation();
            startEditRobbery(docId, data);
        });
    }

    return div;
}

function getStatusText(status) {
    if (status === 'progress') return "🚨 EN CURSO";
    if (status === 'completed') return "✅ FINALIZADO";
    return "⏳ PENDIENTE";
}

// Global functions for inline HTML events
window.deleteRobbery = async (id) => {
    if (!db) return;
    const confirmed = await showCustomConfirm("¿Finalizar Aviso?", "¿Estás seguro de que quieres finalizar este aviso?");
    if (confirmed) {
        try {
            await deleteDoc(doc(db, "solicitudes_robos", id));
        } catch (e) {
            console.error(e);
        }
    }
};

window.toggleStatus = async (id, currentStatus) => {
    if (!db) return;

    // Cycle: pending -> progress -> completed -> pending
    let nextStatus = 'pending';
    if (currentStatus === 'pending') nextStatus = 'progress';
    else if (currentStatus === 'progress') nextStatus = 'completed';
    else if (currentStatus === 'completed') nextStatus = 'pending';

    try {
        await updateDoc(doc(db, "solicitudes_robos", id), {
            status: nextStatus
        });
    } catch (e) {
        console.error("Error updating status:", e);
    }
};

// Generar un ID "local" para distinguir mis mensajes en esta sesión
function getLocalUserId() {
    let id = localStorage.getItem('dispatch_local_id');
    if (!id) {
        id = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('dispatch_local_id', id);
    }
    return id;
}

// --- HYBRID NOTIFICATION SYSTEM ---

window.showToast = (message, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Icon selection
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-triangle-exclamation';

    toast.innerHTML = `
        <i class="fa-solid ${iconClass} toast-icon"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
};

window.showModalAlert = (title, message) => {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-alert-modal');
        const titleEl = document.getElementById('alert-title');
        const msgEl = document.getElementById('alert-message');
        const btnConfirm = document.getElementById('btn-alert-confirm');
        const btnCancel = document.getElementById('btn-alert-cancel');

        if (!modal) return resolve();

        titleEl.textContent = title;
        msgEl.textContent = message;

        // Ensure Cancel is hidden for simple alerts
        btnCancel.classList.add('hidden');

        // Remove previous listeners using clone
        const newBtnConfirm = btnConfirm.cloneNode(true);
        btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);

        // Add listener
        newBtnConfirm.addEventListener('click', () => {
            modal.classList.remove('active');
            modal.classList.add('hidden');
            resolve();
        });

        // Show modal
        modal.classList.remove('hidden');
        requestAnimationFrame(() => modal.classList.add('active'));
    });
};

window.showCustomConfirm = (title, message) => {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-alert-modal');
        const titleEl = document.getElementById('alert-title');
        const msgEl = document.getElementById('alert-message');
        const btnConfirm = document.getElementById('btn-alert-confirm');
        const btnCancel = document.getElementById('btn-alert-cancel');

        if (!modal) return resolve(false);

        titleEl.textContent = title;
        msgEl.textContent = message;

        // Show Cancel button
        btnCancel.classList.remove('hidden');

        // Clone to clear listeners
        const newBtnConfirm = btnConfirm.cloneNode(true);
        btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);

        const newBtnCancel = btnCancel.cloneNode(true);
        btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

        // Handlers
        newBtnConfirm.addEventListener('click', () => {
            modal.classList.remove('active');
            modal.classList.add('hidden');
            resolve(true);
        });

        newBtnCancel.addEventListener('click', () => {
            modal.classList.remove('active');
            modal.classList.add('hidden');
            resolve(false);
        });

        modal.classList.remove('hidden');
        requestAnimationFrame(() => modal.classList.add('active'));
    });
};
