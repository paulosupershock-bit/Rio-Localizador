/* ==========================================================================
   RIO LOCALIZADOR - APP.JS (VERSÃO COMPLETA ATUALIZADA)
   ========================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyBNkf6_wsmi3lH53oZyY50YDWt7mCAdwzk",
  authDomain: "riolocalizador.firebaseapp.com",
  databaseURL: "https://riolocalizador-default-rtdb.firebaseio.com",
  projectId: "riolocalizador",
  storageBucket: "riolocalizador.firebasestorage.app",
  messagingSenderId: "698167641664",
  appId: "1:698167641664:web:fd4d41f8c221a460e401a5"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const database = firebase.database();
const ADMIN_EMAIL = "paulo.supershock@gmail.com"; 

let map = null;
let userMarker = null;
let watchId = null;
const otherMarkers = {};
let currentPolyline = null;
let activePolylineUid = null;
let realTimeListeners = {};

// Controle de KM
let trackingKmActive = true; // Ativo por padrão em metros/quilômetros
let lastKmPosition = null;
let accumulatedMeters = 0;

// Alertas de Proximidade Individuais
let activeProximityTargets = {}; // { friendUid: { radiusMeters, name } }
let currentTriggeredFriendUid = null;
let audioAlertCtx = null;

// Roteirização por Contato (Armazena polilinhas e rotas ativas)
let contactRoutePolylines = {}; // { friendUid: L.polyline }

// Elementos do DOM
const authScreen = document.getElementById("auth-screen");
const mapScreen = document.getElementById("map-screen");
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const btnRegister = document.getElementById("btn-register");
const btnLogout = document.getElementById("btn-logout");
const btnGoogleLogin = document.getElementById("btn-google-login");
const btnRecenter = document.getElementById("btn-recenter");

const btnOpenDrawer = document.getElementById("btn-open-drawer");
const btnCloseDrawer = document.getElementById("btn-close-drawer");
const drawer = document.getElementById("drawer");
const overlay = document.getElementById("drawer-overlay");
const friendsList = document.getElementById("friends-list");
const btnMyHistory = document.getElementById("btn-toggle-history");
const btnTogglePrivacy = document.getElementById("btn-toggle-privacy");
const adminSection = document.getElementById("admin-section");
const btnAdminRegisterUser = document.getElementById("btnAdminRegisterUser");
const friendSearchType = document.getElementById("friend-search-type");
const friendEmailInput = document.getElementById("friend-email-input");
const friendPhoneInput = document.getElementById("friend-phone-input");
const addFriendForm = document.getElementById("add-friend-form");

const btnOpenWhatsappModal = document.getElementById("btn-open-whatsapp-modal");
const whatsappModal = document.getElementById("whatsapp-modal");
const whatsappCheckboxesDiv = document.getElementById("whatsapp-contacts-checkboxes");
const btnSendWhatsappSelected = document.getElementById("btn-send-whatsapp-selected");
let loadedFriendsDataMap = {};

const LETTERS_ARRAY = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

function formatPhoneNumber(phoneInput) {
  if (!phoneInput) return "";
  let cleaned = ('' + phoneInput).replace(/\D/g, "");
  if (!cleaned) return "";
  if (cleaned.length === 10 || cleaned.length === 11) cleaned = "55" + cleaned;
  return "+" + cleaned;
}

function openDrawer() { if (drawer) drawer.classList.add("open"); if (overlay) overlay.classList.remove("hidden"); }
function closeDrawer() { if (drawer) drawer.classList.remove("open"); if (overlay) overlay.classList.add("hidden"); }

if (btnOpenDrawer) btnOpenDrawer.addEventListener("click", openDrawer);
if (btnCloseDrawer) btnCloseDrawer.addEventListener("click", closeDrawer);
if (overlay) overlay.addEventListener("click", closeDrawer);

// ==========================================================================
// 1. AUTENTICAÇÃO
// ==========================================================================
if (loginForm) {
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(emailInput.value, passwordInput.value)
      .catch((error) => alert("Erro ao entrar: " + error.message));
  });
}

const googleProvider = new firebase.auth.GoogleAuthProvider();
if (btnGoogleLogin) {
  btnGoogleLogin.addEventListener("click", () => {
    auth.signInWithPopup(googleProvider).then((result) => {
      const userRef = database.ref(`users/${result.user.uid}`);
      userRef.once('value', (snapshot) => {
        const userData = snapshot.val() || {};
        const updates = { 
          email: result.user.email.toLowerCase().trim(),
          displayName: result.user.displayName || result.user.email,
          uid: result.user.uid,
          isHistoryPrivate: false
        };
        if (!userData.phone) {
          const rawPhone = prompt("Digite seu telefone com DDD (ex: 21999998888):") || "";
          updates.phone = formatPhoneNumber(rawPhone);
        }
        userRef.update(updates);
      });
    });
  });
}

if (btnRegister) {
  btnRegister.addEventListener("click", () => {
    if (!emailInput.value || !passwordInput.value) { alert("Preencha e-mail e senha."); return; }
    const rawPhone = prompt("Digite seu telefone com DDD (ex: 21999998888):") || "";
    const cleanedPhone = formatPhoneNumber(rawPhone);
    const userEmail = emailInput.value.toLowerCase().trim();

    auth.createUserWithEmailAndPassword(userEmail, passwordInput.value)
      .then((cred) => {
        database.ref(`users/${cred.user.uid}`).set({
          uid: cred.user.uid, email: userEmail, phone: cleanedPhone, displayName: userEmail, isHistoryPrivate: false
        });
        alert("Conta criada com sucesso!");
      }).catch((error) => alert("Erro: " + error.message));
  });
}

if (btnLogout) btnLogout.addEventListener("click", () => auth.signOut());

// ==========================================================================
// 2. ADMIN E ADICIONAR AMIGO
// ==========================================================================
if (btnAdminRegisterUser) {
  btnAdminRegisterUser.addEventListener("click", async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.email.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase().trim()) return;
    const rawPhone = prompt("TELEFONE com DDD (ex: 21999998888):");
    if (!rawPhone) return;
    const cleanedPhone = formatPhoneNumber(rawPhone);
    const displayName = prompt("Nome do Contato:") || cleanedPhone;

    const myUid = currentUser.uid;
    const newFriendUid = database.ref('users').push().key;
    const updates = {};
    updates[`/users/${newFriendUid}`] = { uid: newFriendUid, phone: cleanedPhone, displayName, isHistoryPrivate: false };
    updates[`/friendships/${myUid}/${newFriendUid}`] = "accepted";
    updates[`/friendships/${newFriendUid}/${myUid}`] = "accepted";
    await database.ref().update(updates);
    alert(`Contato ${displayName} cadastrado!`);
    loadContactsList(myUid);
  });
}

if (friendSearchType) {
  friendSearchType.addEventListener("change", () => {
    if (friendSearchType.value === "email") {
      friendEmailInput.classList.remove("hidden"); friendEmailInput.required = true;
      friendPhoneInput.classList.add("hidden"); friendPhoneInput.required = false;
    } else {
      friendPhoneInput.classList.remove("hidden"); friendPhoneInput.required = true;
      friendEmailInput.classList.add("hidden"); friendEmailInput.required = false;
    }
  });
}

if (addFriendForm) {
  addFriendForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const searchType = friendSearchType ? friendSearchType.value : "phone";
    const myUid = auth.currentUser ? auth.currentUser.uid : null;
    if (!myUid) return;

    database.ref('users').once('value', (snapshot) => {
      let foundUid = null;
      let targetValue = searchType === "phone" ? formatPhoneNumber(friendPhoneInput.value) : friendEmailInput.value.trim().toLowerCase();

      snapshot.forEach((child) => {
        const u = child.val();
        if (searchType === "phone" && u && u.phone && formatPhoneNumber(u.phone) === targetValue) foundUid = child.key;
        if (searchType === "email" && u && u.email && u.email.trim().toLowerCase() === targetValue) foundUid = child.key;
      });

      if (!foundUid) { alert("Usuário não encontrado."); return; }
      if (foundUid === myUid) { alert("Você não pode se adicionar."); return; }

      const updates = {};
      updates[`/friendships/${myUid}/${foundUid}`] = "accepted";
      updates[`/friendships/${foundUid}/${myUid}`] = "accepted";
      database.ref().update(updates).then(() => {
        alert("Contato adicionado!");
        if (friendPhoneInput) friendPhoneInput.value = "";
        loadContactsList(myUid);
      });
    });
  });
}

// ==========================================================================
// 3. MAPA, GPS E HISTÓRICO DE KM EM UNIDADES INTERNACIONAIS (m / km)
// ==========================================================================
auth.onAuthStateChanged((user) => {
  if (user) {
    if (authScreen) authScreen.classList.add("hidden");
    if (mapScreen) mapScreen.classList.remove("hidden");
    setTimeout(() => { initMap(); if (map) map.invalidateSize(); }, 200);
    startLocationTracking(user.uid);
    checkAdminPermissions(user);
    loadContactsList(user.uid);
  } else {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (authScreen) authScreen.classList.remove("hidden");
    if (mapScreen) mapScreen.classList.add("hidden");
  }
});

function initMap() {
  if (map) return;
  map = L.map('map').setView([-22.9068, -43.1729], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);

  if (btnRecenter) {
    btnRecenter.addEventListener("click", () => { if (userMarker) map.setView(userMarker.getLatLng(), 16); });
  }

  if (btnMyHistory) {
    btnMyHistory.addEventListener("click", () => {
      if (auth.currentUser) toggleUserRouteHistory(auth.currentUser.uid, "Meu Trajeto", btnMyHistory);
    });
  }
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Metros
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function startLocationTracking(uid) {
  if (!navigator.geolocation) return;

  watchId = navigator.geolocation.watchPosition((position) => {
    const { latitude, longitude } = position.coords;
    const latLng = [latitude, longitude];

    if (!userMarker) {
      userMarker = L.marker(latLng).addTo(map).bindPopup("Você está aqui");
      map.setView(latLng, 15);
    } else {
      userMarker.setLatLng(latLng);
    }

    if (trackingKmActive) {
      if (lastKmPosition) {
        const dist = calculateDistanceMeters(lastKmPosition[0], lastKmPosition[1], latitude, longitude);
        if (dist > 2) {
          accumulatedMeters += dist;
          lastKmPosition = [latitude, longitude];
          saveKmHistoryToDatabase(uid, accumulatedMeters);
        }
      } else {
        lastKmPosition = [latitude, longitude];
      }
    }

    checkProximityAlerts(latitude, longitude);

    const timestamp = Date.now();
    database.ref('locations/' + uid).set({ latitude, longitude, timestamp: firebase.database.ServerValue.TIMESTAMP });
    database.ref(`location_history/${uid}`).push({ latitude, longitude, timestamp });
  }, (error) => console.error("GPS Error:", error), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

function saveKmHistoryToDatabase(uid, meters) {
  const todayStr = new Date().toISOString().split('T')[0];
  const kmVal = (meters / 1000).toFixed(3);
  database.ref(`km_history/${uid}/${todayStr}`).set({
    kilometers: parseFloat(kmVal),
    meters: Math.round(meters),
    formatted: meters >= 1000 ? `${(meters/1000).toFixed(2)} km` : `${Math.round(meters)} m`,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}

// ==========================================================================
// 4. BUSCA DE ENDEREÇOS COM AUTOCOMPLETE E HISTÓRICO NO FIREBASE
// ==========================================================================
function setupAddressAutocomplete(inputElement, suggestionContainerId, uid) {
  const container = document.getElementById(suggestionContainerId);
  let debounceTimer = null;

  inputElement.addEventListener("input", (e) => {
    const query = e.target.value.trim();
    clearTimeout(debounceTimer);
    container.innerHTML = "";

    if (query.length < 3) {
      container.classList.add("hidden");
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        // Buscar histórico recente salvo no Firebase primeiro
        const histSnap = await database.ref(`search_history/${uid}`).limitToLast(5).once('value');
        let suggestionsHTML = "";
        
        histSnap.forEach((child) => {
          const addr = child.val().address;
          if (addr.toLowerCase().includes(query.toLowerCase())) {
            suggestionsHTML += `<div class="autocomplete-item" onclick="selectAddress('${inputElement.id}', '${addr.replace(/'/g, "")}', '${suggestionContainerId}')">🕒 ${addr} (Recente)</div>`;
          }
        });

        // Buscar Nominatim API
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=4`);
        const data = await res.json();

        data.forEach(item => {
          const displayName = item.display_name.replace(/'/g, "");
          suggestionsHTML += `<div class="autocomplete-item" onclick="selectAddress('${inputElement.id}', '${displayName}', '${suggestionContainerId}', ${item.lat}, ${item.lon})">📍 ${displayName}</div>`;
        });

        if (suggestionsHTML) {
          container.innerHTML = suggestionsHTML;
          container.classList.remove("hidden");
        } else {
          container.classList.add("hidden");
        }
      } catch (err) { console.error("Erro autocomplete", err); }
    }, 350);
  });
}

window.selectAddress = function(inputId, addressText, containerId, lat = null, lon = null) {
  const input = document.getElementById(inputId);
  input.value = addressText;
  document.getElementById(containerId).classList.add("hidden");

  // Salvar no histórico recente do Firebase
  if (auth.currentUser) {
    database.ref(`search_history/${auth.currentUser.uid}`).push({
      address: addressText,
      lat,
      lon,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  }
};

// ==========================================================================
// 5. ALERTAS DE PROXIMIDADE INDIVIDUAIS E CHECKS
// ==========================================================================
function setupProximityAlert(friendUid, friendName) {
  const inputMeters = prompt(`Defina a distância em metros para o alerta de proximidade de ${friendName}:`, "500");
  if (!inputMeters) return;
  const meters = parseFloat(inputMeters);
  if (isNaN(meters) || meters <= 0) { alert("Valor inválido."); return; }

  activeProximityTargets[friendUid] = { radiusMeters: meters, name: friendName, triggered: false };
  alert(`✅ Alerta configurado para ${friendName} (${meters} metros).`);
}

function checkProximityAlerts(myLat, myLon) {
  if (!userMarker) return;
  for (const [fUid, info] of Object.entries(activeProximityTargets)) {
    if (otherMarkers[fUid] && otherMarkers[fUid].latLng) {
      const fPos = otherMarkers[fUid].latLng;
      const dist = calculateDistanceMeters(myLat, myLon, fPos[0], fPos[1]);
      if (dist <= info.radiusMeters && !info.triggered) {
        info.triggered = true;
        currentTriggeredFriendUid = fUid;
        triggerProximitySoundAndVisual(info.name, Math.round(dist));
      }
    }
  }
}

function triggerProximitySoundAndVisual(friendName, distanceMeters) {
  const modal = document.getElementById("proximity-modal");
  const desc = document.getElementById("proximity-desc");
  if (modal) {
    desc.innerText = `${friendName} está a apenas ${distanceMeters} metros de você!`;
    modal.classList.remove("hidden");
    playAlarmSound();
  }
}

function playAlarmSound() {
  try {
    if (!audioAlertCtx) audioAlertCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioAlertCtx.createOscillator();
    const gain = audioAlertCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audioAlertCtx.currentTime);
    gain.gain.setValueAtTime(0.4, audioAlertCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioAlertCtx.destination);
    osc.start();
    osc.stop(audioAlertCtx.currentTime + 0.5);
  } catch (e) { console.log(e); }
}

window.dismissProximityAlertOnly = function() {
  const modal = document.getElementById("proximity-modal");
  if (modal) modal.classList.add("hidden");
  currentTriggeredFriendUid = null;
};

window.executeProximityCheckAndDismiss = function() {
  const modal = document.getElementById("proximity-modal");
  if (modal) modal.classList.add("hidden");

  if (currentTriggeredFriendUid && auth.currentUser) {
    const checkTime = new Date().toLocaleString();
    database.ref(`proximity_checks/${auth.currentUser.uid}/${currentTriggeredFriendUid}`).push({
      timestamp: checkTime,
      rawTime: firebase.database.ServerValue.TIMESTAMP
    });
    alert(`✅ Check de proximidade registrado com sucesso às ${checkTime}!`);
    
    // Reseta o gatilho para permitir novo alerta se necessário futuramente
    if (activeProximityTargets[currentTriggeredFriendUid]) {
      activeProximityTargets[currentTriggeredFriendUid].triggered = false;
    }
  }
  currentTriggeredFriendUid = null;
};

// ==========================================================================
// 6. LISTAGEM DE CONTATOS & ROTEIRIZAÇÃO ISOLADA (A até J - Até 10 Pontos)
// ==========================================================================
function loadContactsList(myUid) {
  database.ref(`friendships/${myUid}`).on('value', async (snapshot) => {
    if (!friendsList) return;
    friendsList.innerHTML = '';
    whatsappCheckboxesDiv.innerHTML = '';
    loadedFriendsDataMap = {};

    const friendships = snapshot.val();
    if (!friendships) {
      friendsList.innerHTML = '<p style="font-size: 13px; color: #94a3b8;">Nenhum contato adicionado.</p>';
      return;
    }

    for (const [friendUid, status] of Object.entries(friendships)) {
      if (status === 'accepted') {
        const userSnap = await database.ref(`users/${friendUid}`).once('value');
        const friendData = userSnap.val();
        if (friendData) {
          loadedFriendsDataMap[friendUid] = friendData;
          renderContactCard(friendUid, friendData, myUid);
          listenToFriendLocation(friendUid, friendData.displayName || friendData.phone);
          renderWhatsappCheckbox(friendUid, friendData);
        }
      }
    }
  });
}

function renderContactCard(friendUid, friendData, myUid) {
  const name = friendData.displayName || friendData.phone || 'Contato';
  const div = document.createElement("div");
  div.className = "friend-item";
  div.id = `friend-item-${friendUid}`;

  div.innerHTML = `
    <div class="friend-info">
      <strong>${name}</strong>
      <small>${friendData.phone || ''}</small>
      <small id="time-status-${friendUid}" class="time-status">Aguardando GPS...</small>
    </div>
    <div class="friend-actions">
      <button class="btn-action-small" onclick="toggleUserRouteHistory('${friendUid}', '${name}', this)">30 Dias</button>
      <button class="btn-action-small realtime" onclick="toggleRealtimeTracking('${friendUid}', '${name}', this)">Tempo Real</button>
      <button class="btn-action-small km" onclick="viewKmHistory('${friendUid}', '${name}')">Ver KM</button>
      <button class="btn-action-small alert" onclick="setupProximityAlert('${friendUid}', '${name}')">Alerta M</button>
      <button class="btn-action-small route" onclick="toggleContactRoutePanel('${friendUid}')">Rotas A-J</button>
    </div>
    <div id="route-panel-${friendUid}" class="contact-route-container hidden">
      <p style="font-weight:bold; margin-bottom:6px; color:#0f172a;">Planejador de Trajeto (A ao J)</p>
      <div id="waypoints-list-${friendUid}">
        <div class="waypoint-row" id="wp-row-${friendUid}-0">
          <input type="text" id="wp-${friendUid}-0" placeholder="Ponto A (Origem ou Meu Local)" autocomplete="off" />
          <div id="sugg-${friendUid}-0" class="autocomplete-suggestions hidden"></div>
          <button class="btn-check-point" onclick="executeWaypointCheck('${friendUid}', 0, 'A')">Check A</button>
        </div>
        <div class="waypoint-row" id="wp-row-${friendUid}-1">
          <input type="text" id="wp-${friendUid}-1" placeholder="Ponto B (Destino)" autocomplete="off" />
          <div id="sugg-${friendUid}-1" class="autocomplete-suggestions hidden"></div>
          <button class="btn-check-point" onclick="executeWaypointCheck('${friendUid}', 1, 'B')">Check B</button>
        </div>
      </div>
      <div style="display:flex; gap:4px; margin-top:6px;">
        <button class="btn-primary" style="padding:6px; font-size:11px;" onclick="addWaypointRow('${friendUid}')">+ Ponto</button>
        <button class="btn-primary" style="padding:6px; font-size:11px; background:#16a34a;" onclick="calculateMultiPointRoute('${friendUid}')">Calcular Rota</button>
      </div>
      <div id="route-info-${friendUid}" style="font-size:11px; color:#334155; margin-top:6px; background:#f1f5f9; padding:6px; border-radius:4px;" class="hidden"></div>
      <button class="btn-primary" style="padding:4px; font-size:10px; background:#475569; margin-top:4px;" onclick="viewWaypointChecksHistory('${friendUid}', '${name}')">Ver Histórico de Checks</button>
    </div>
  `;
  friendsList.appendChild(div);

  // Ativar autocomplete nos campos iniciais A e B
  setTimeout(() => {
    const inputA = document.getElementById(`wp-${friendUid}-0`);
    const inputB = document.getElementById(`wp-${friendUid}-1`);
    if (inputA) setupAddressAutocomplete(inputA, `sugg-${friendUid}-0`, myUid);
    if (inputB) setupAddressAutocomplete(inputB, `sugg-${friendUid}-1`, myUid);
  }, 100);
}

window.toggleContactRoutePanel = function(friendUid) {
  const panel = document.getElementById(`route-panel-${friendUid}`);
  if (panel) panel.classList.toggle("hidden");
};

window.addWaypointRow = function(friendUid) {
  const container = document.getElementById(`waypoints-list-${friendUid}`);
  const currentRows = container.getElementsByClassName("waypoint-row").length;
  if (currentRows >= 10) {
    alert("O limite máximo é de 10 trajetos (A até J).");
    return;
  }
  const letter = LETTERS_ARRAY[currentRows];
  const rowId = currentRows;

  const newDiv = document.createElement("div");
  newDiv.className = "waypoint-row";
  newDiv.id = `wp-row-${friendUid}-${rowId}`;
  newDiv.innerHTML = `
    <input type="text" id="wp-${friendUid}-${rowId}" placeholder="Ponto ${letter}" autocomplete="off" />
    <div id="sugg-${friendUid}-${rowId}" class="autocomplete-suggestions hidden"></div>
    <button class="btn-check-point" onclick="executeWaypointCheck('${friendUid}', ${rowId}, '${letter}')">Check ${letter}</button>
  `;
  container.appendChild(newDiv);
  setupAddressAutocomplete(document.getElementById(`wp-${friendUid}-${rowId}`), `sugg-${friendUid}-${rowId}`, auth.currentUser.uid);
};

// Cálculo de rota multi-pontos com OSRM respeitando A até J
window.calculateMultiPointRoute = async function(friendUid) {
  const container = document.getElementById(`waypoints-list-${friendUid}`);
  const inputs = container.getElementsByTagName("input");
  let coordsList = [];

  for (let i = 0; i < inputs.length; i++) {
    const val = inputs[i].value.trim();
    if (!val) continue;
    let coords = null;
    if (val.toLowerCase() === "meu local" || val === "") {
      if (!userMarker) { alert("Sua localização GPS ainda não foi carregada."); return; }
      coords = userMarker.getLatLng();
    } else {
      coords = await geocodeAddress(val);
    }
    if (coords) coordsList.push([coords.lng, coords.lat]);
  }

  if (coordsList.length < 2) {
    alert("Preencha pelo menos 2 pontos válidos para calcular o trajeto.");
    return;
  }

  const coordinatesStr = coordsList.map(c => `${c[0]},${c[1]}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinatesStr}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const routeCoords = route.geometry.coordinates.map(c => [c[1], c[0]]);

      if (contactRoutePolylines[friendUid]) {
        map.removeLayer(contactRoutePolylines[friendUid]);
      }
      contactRoutePolylines[friendUid] = L.polyline(routeCoords, { color: '#2563eb', weight: 5 }).addTo(map);
      map.fitBounds(contactRoutePolylines[friendUid].getBounds(), { padding: [40, 40] });

      const distanceKm = (route.distance / 1000).toFixed(2);
      const durationMin = Math.round(route.duration / 60);

      const infoDiv = document.getElementById(`route-info-${friendUid}`);
      infoDiv.classList.remove("hidden");
      infoDiv.innerHTML = `🚗 <b>Distância Total:</b> ${distanceKm} km<br>⏱️ <b>Tempo Estimado:</b> ~${durationMin} min`;
    } else {
      alert("Não foi possível traçar a rota otimizada.");
    }
  } catch (err) { alert("Erro ao consultar serviço de rotas."); }
};

async function geocodeAddress(addressStr) {
  if (addressStr.includes(',')) {
    const parts = addressStr.split(',');
    const lat = parseFloat(parts[0]); const lon = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lon)) return L.latLng(lat, lon);
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressStr)}&limit=1`);
    const data = await res.json();
    if (data && data.length > 0) return L.latLng(parseFloat(data[0].lat), parseFloat(data[0].lon));
  } catch (e) {}
  return null;
}

// Check de chegada em pontos específicos (A, B, C...)
window.executeWaypointCheck = function(friendUid, rowId, letter) {
  const input = document.getElementById(`wp-${friendUid}-${rowId}`);
  if (!input || !input.value.trim()) {
    alert(`O ponto ${letter} está vazio.`);
    return;
  }
  const address = input.value.trim();
  const checkTime = new Date().toLocaleString();
  const myUid = auth.currentUser.uid;

  database.ref(`waypoint_checks/${myUid}/${friendUid}/${letter}`).set({
    address,
    timestamp: checkTime,
    rawTime: firebase.database.ServerValue.TIMESTAMP
  }).then(() => {
    alert(`✅ Check do Ponto ${letter} registrado com sucesso às ${checkTime}!`);
  });
};

window.viewWaypointChecksHistory = function(friendUid, friendName) {
  const myUid = auth.currentUser.uid;
  database.ref(`waypoint_checks/${myUid}/${friendUid}`).once('value').then((snapshot) => {
    if (!snapshot.exists()) {
      alert(`Nenhum check de ponto registrado para ${friendName}.`);
      return;
    }
    let msg = `📋 Histórico de Checks - ${friendName}:\n\n`;
    snapshot.forEach((child) => {
      msg += `📍 Ponto ${child.key}: ${child.val().address}\n🕒 Horário: ${child.val().timestamp}\n\n`;
    });
    alert(msg);
  });
};

// Demais funções auxiliares (Tempo Real, Histórico 30d, KM)
function listenToFriendLocation(friendUid, friendName) {
  database.ref(`locations/${friendUid}`).on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    const { latitude, longitude, timestamp } = data;
    const latLng = [latitude, longitude];

    if (!otherMarkers[friendUid]) {
      const marker = L.marker(latLng).addTo(map).bindPopup(`<b>${friendName}</b>`);
      otherMarkers[friendUid] = { marker, latLng };
    } else {
      otherMarkers[friendUid].marker.setLatLng(latLng);
      otherMarkers[friendUid].latLng = latLng;
    }

    const timeElem = document.getElementById(`time-status-${friendUid}`);
    if (timeElem && timestamp) {
      timeElem.innerText = `Atualizado às ${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  });
}

window.toggleRealtimeTracking = function(friendUid, friendName, btnElem) {
  if (realTimeListeners[friendUid]) {
    database.ref(`locations/${friendUid}`).off('value', realTimeListeners[friendUid]);
    delete realTimeListeners[friendUid];
    btnElem.innerText = "Tempo Real";
    btnElem.style.backgroundColor = "#059669";
    return;
  }
  realTimeListeners[friendUid] = database.ref(`locations/${friendUid}`).on('value', (snapshot) => {
    const data = snapshot.val();
    if (data && data.latitude && data.longitude) map.setView([data.latitude, data.longitude], 17);
  });
  btnElem.innerText = "❌ Parar";
  btnElem.style.backgroundColor = "#ef4444";
  closeDrawer();
};

window.viewKmHistory = function(friendUid, friendName) {
  database.ref(`km_history/${friendUid}`).once('value').then((snapshot) => {
    if (!snapshot.exists()) { alert(`Nenhum registro de quilometragem para ${friendName}.`); return; }
    let msg = `📊 Quilometragem de ${friendName}:\n\n`;
    snapshot.forEach((child) => {
      msg += `📅 ${child.key}: ${child.val().formatted || (child.val().kilometers + ' km')}\n`;
    });
    alert(msg);
  });
};

window.toggleUserRouteHistory = function(targetUid, title, buttonElem) {
  if (activePolylineUid === targetUid && currentPolyline) {
    if (currentPolyline) map.removeLayer(currentPolyline);
    currentPolyline = null;
    activePolylineUid = null;
    if (buttonElem) buttonElem.innerText = "30 Dias";
    return;
  }
  if (currentPolyline) map.removeLayer(currentPolyline);
  
  database.ref(`location_history/${targetUid}`).once('value').then((snapshot) => {
    if (!snapshot.exists()) { alert(`Nenhum histórico disponível.`); return; }
    const latLngs = [];
    snapshot.forEach((child) => {
      const val = child.val();
      if (val && typeof val.latitude === 'number') latLngs.push([val.latitude, val.longitude]);
    });
    currentPolyline = L.polyline(latLngs, { color: '#0052d4', weight: 5 }).addTo(map);
    map.fitBounds(currentPolyline.getBounds(), { padding: [40, 40] });
    activePolylineUid = targetUid;
    if (buttonElem) buttonElem.innerText = "❌ Ocultar";
    closeDrawer();
  });
};

// WhatsApp Modal e Compartilhamento
if (btnOpenWhatsappModal) {
  btnOpenWhatsappModal.addEventListener("click", () => whatsappModal.classList.remove("hidden"));
}
function closeWhatsappModal() { whatsappModal.classList.add("hidden"); }

function renderWhatsappCheckbox(uid, data) {
  if (!data.phone) return;
  const div = document.createElement("div");
  div.className = "whatsapp-contact-item";
  div.innerHTML = `<input type="checkbox" value="${data.phone}" id="wa-chk-${uid}" /> <label for="wa-chk-${uid}">${data.displayName || data.phone}</label>`;
  whatsappCheckboxesDiv.appendChild(div);
}

if (btnSendWhatsappSelected) {
  btnSendWhatsappSelected.addEventListener("click", () => {
    const checked = whatsappCheckboxesDiv.querySelectorAll("input[type='checkbox']:checked");
    if (checked.length === 0) { alert("Selecione pelo menos um contato."); return; }
    const message = encodeURIComponent(`Olá! Acompanhe meu localizador pelo link: ${window.location.href}`);
    checked.forEach(chk => {
      window.open(`https://api.whatsapp.com/send?phone=${chk.value.replace(/\D/g, "")}&text=${message}`, '_blank');
    });
    closeWhatsappModal();
  });
}

function checkAdminPermissions(user) {
  const isAdmin = user && user.email && user.email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();
  if (adminSection) adminSection.style.display = isAdmin ? "block" : "none";
  if (btnTogglePrivacy) btnTogglePrivacy.style.display = isAdmin ? "block" : "none";
}