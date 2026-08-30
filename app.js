/* ==========================================================================
   RIO LOCALIZADOR - APP.JS (VERSÃO COMPLETA E ATUALIZADA)
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

// Controle de KM Rodados
let trackingKmActive = false;
let lastKmPosition = null;
let accumulatedMeters = 0;

// Alerta de Proximidade Ativo
let activeProximityTargets = {}; // { uid: { radiusMeters, name } }
let audioAlertCtx = null;

// Elementos do DOM
const authScreen = document.getElementById("auth-screen");
const mapScreen = document.getElementById("map-screen");
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const btnRegister = document.getElementById("btn-register");
const btnLogout = document.getElementById("btn-logout");
const btnForgotPassword = document.getElementById("btn-forgot-password");
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

// Rota Ponto A / B
const btnCalculateRoute = document.getElementById("btn-calculate-route");
const routeOriginInput = document.getElementById("route-origin");
const routeDestinationInput = document.getElementById("route-destination");
const routeResultsDiv = document.getElementById("route-results");
let routePolyline = null;
let destinationMarker = null;

// WhatsApp Modal
const btnOpenWhatsappModal = document.getElementById("btn-open-whatsapp-modal");
const whatsappModal = document.getElementById("whatsapp-modal");
const whatsappCheckboxesDiv = document.getElementById("whatsapp-contacts-checkboxes");
const btnSendWhatsappSelected = document.getElementById("btn-send-whatsapp-selected");
let loadedFriendsDataMap = {};

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
    }).catch((error) => {
      if (error.code !== "auth/popup-closed-by-user") alert("Erro no Google Login: " + error.message);
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
      }).catch((error) => alert("Erro ao cadastrar: " + error.message));
  });
}

if (btnLogout) btnLogout.addEventListener("click", () => auth.signOut());

// ==========================================================================
// 2. ADMIN E ADICIONAR AMIGO
// ==========================================================================
if (btnAdminRegisterUser) {
  btnAdminRegisterUser.addEventListener("click", async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.email.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase().trim()) {
      alert("Acesso negado."); return;
    }
    const rawPhone = prompt("TELEFONE com DDD (ex: 21999998888):");
    if (!rawPhone) return;
    const cleanedPhone = formatPhoneNumber(rawPhone);
    const optionalEmail = prompt("E-MAIL (Opcional):") || "";
    const displayName = prompt("Nome do Contato:") || cleanedPhone;

    try {
      const myUid = currentUser.uid;
      const newFriendUid = database.ref('users').push().key;
      const updates = {};
      updates[`/users/${newFriendUid}`] = { uid: newFriendUid, phone: cleanedPhone, email: optionalEmail.trim().toLowerCase(), displayName, isHistoryPrivate: false };
      updates[`/friendships/${myUid}/${newFriendUid}`] = "accepted";
      updates[`/friendships/${newFriendUid}/${myUid}`] = "accepted";
      await database.ref().update(updates);
      alert(`Contato ${displayName} cadastrado!`);
      loadContactsList(myUid);
    } catch (err) { alert("Erro: " + err.message); }
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
// 3. MAPA E RASTREAMENTO GPS + CÁLCULO DE DISTÂNCIA EM METROS
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
      if (auth.currentUser) toggleUserRoute(auth.currentUser.uid, "Meu Trajeto", btnMyHistory);
    });
  }

  // Clique no mapa define destino da rota A/B
  map.on('click', (e) => {
    routeDestinationInput.value = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
    if (destinationMarker) map.removeLayer(destinationMarker);
    destinationMarker = L.marker(e.latlng).addTo(map).bindPopup("Destino selecionado").openPopup();
  });
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Raio da Terra em metros
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

    // Cálculo Quilometragem Ativa
    if (trackingKmActive) {
      if (lastKmPosition) {
        const dist = calculateDistanceMeters(lastKmPosition[0], lastKmPosition[1], latitude, longitude);
        if (dist > 3) { // Filtro de ruído mínimo de 3 metros
          accumulatedMeters += dist;
          lastKmPosition = [latitude, longitude];
          saveKmHistoryToDatabase(uid, accumulatedMeters);
        }
      } else {
        lastKmPosition = [latitude, longitude];
      }
    }

    // Verificar Alertas de Proximidade com Amigos
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
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}

// ==========================================================================
// 4. ALERTA DE PROXIMIDADE (VISUAL E SONORO)
// ==========================================================================
function setupProximityAlert(friendUid, friendName) {
  const inputMeters = prompt(`Defina a distância em metros para receber alerta de proximidade de ${friendName}:`, "500");
  if (!inputMeters) return;
  const meters = parseFloat(inputMeters);
  if (isNaN(meters) || meters <= 0) { alert("Valor inválido."); return; }

  activeProximityTargets[friendUid] = { radiusMeters: meters, name: friendName };
  alert(`✅ Alerta ativado! Você será avisado quando ${friendName} estiver a menos de ${meters} metros.`);
}

function checkProximityAlerts(myLat, myLon) {
  if (!userMarker) return;
  for (const [fUid, info] of Object.entries(activeProximityTargets)) {
    if (otherMarkers[fUid] && otherMarkers[fUid].latLng) {
      const fPos = otherMarkers[fUid].latLng;
      const dist = calculateDistanceMeters(myLat, myLon, fPos[0], fPos[1]);
      if (dist <= info.radiusMeters) {
        triggerProximitySoundAndVisual(info.name, Math.round(dist));
      }
    }
  }
}

function triggerProximitySoundAndVisual(friendName, distanceMeters) {
  const modal = document.getElementById("proximity-modal");
  const desc = document.getElementById("proximity-desc");
  if (modal && modal.classList.contains("hidden")) {
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
    osc.frequency.setValueAtTime(880, audioAlertCtx.currentTime); // Tom alto
    gain.gain.setValueAtTime(0.5, audioAlertCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioAlertCtx.destination);
    osc.start();
    osc.stop(audioAlertCtx.currentTime + 0.6);
  } catch (e) { console.log("Áudio bloqueado pelo navegador", e); }
}

window.dismissProximityAlert = function() {
  const modal = document.getElementById("proximity-modal");
  if (modal) modal.classList.add("hidden");
};

// ==========================================================================
// 5. LISTAGEM DE CONTATOS & OPÇÕES (Trajeto 30d, Realtime, KM, Alerta)
// ==========================================================================
function loadContactsList(myUid) {
  database.ref(`friendships/${myUid}`).on('value', async (snapshot) => {
    if (!friendsList) return;
    friendsList.innerHTML = '';
    whatsappCheckboxesDiv.innerHTML = '';
    loadedFriendsDataMap = {};

    const friendships = snapshot.val();
    if (!friendships) {
      friendsList.innerHTML = '<p class="empty-msg" style="font-size: 13px; color: #94a3b8;">Nenhum contato adicionado.</p>';
      return;
    }

    for (const [friendUid, status] of Object.entries(friendships)) {
      if (status === 'accepted') {
        const userSnap = await database.ref(`users/${friendUid}`).once('value');
        const friendData = userSnap.val();
        if (friendData) {
          loadedFriendsDataMap[friendUid] = friendData;
          renderContactCard(friendUid, friendData);
          listenToFriendLocation(friendUid, friendData.displayName || friendData.phone);
          renderWhatsappCheckbox(friendUid, friendData);
        }
      }
    }
  });
}

function renderContactCard(friendUid, friendData) {
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
      <button id="btn-route-${friendUid}" class="btn-history-small" onclick="toggleUserRoute('${friendUid}', '${name}', this)">30 Dias</button>
      <button id="btn-realtime-${friendUid}" class="btn-history-small realtime" onclick="toggleRealtimeTracking('${friendUid}', '${name}', this)">Tempo Real</button>
      <button class="btn-history-small km" onclick="viewKmHistory('${friendUid}', '${name}')">Ver KM</button>
      <button class="btn-history-small alert" onclick="setupProximityAlert('${friendUid}', '${name}')">Alerta M</button>
    </div>
  `;
  friendsList.appendChild(div);
}

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
      const lastSeenDate = new Date(timestamp);
      timeElem.className = "time-status online";
      timeElem.innerText = `Atualizado às ${lastSeenDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  });
}

// Tempo Real (Centralizar automático no amigo)
window.toggleRealtimeTracking = function(friendUid, friendName, btnElem) {
  if (realTimeListeners[friendUid]) {
    database.ref(`locations/${friendUid}`).off('value', realTimeListeners[friendUid]);
    delete realTimeListeners[friendUid];
    btnElem.innerText = "Tempo Real";
    btnElem.style.backgroundColor = "#059669";
    alert(`Acompanhamento em tempo real de ${friendName} desativado.`);
    return;
  }

  realTimeListeners[friendUid] = database.ref(`locations/${friendUid}`).on('value', (snapshot) => {
    const data = snapshot.val();
    if (data && data.latitude && data.longitude) {
      map.setView([data.latitude, data.longitude], 17);
    }
  });

  btnElem.innerText = "❌ Parar Tempo Real";
  btnElem.style.backgroundColor = "#ef4444";
  alert(`Acompanhamento em tempo real de ${friendName} ativado! O mapa seguirá a posição dele.`);
  closeDrawer();
};

// Histórico de Quilometragem
window.viewKmHistory = function(friendUid, friendName) {
  database.ref(`km_history/${friendUid}`).once('value').then((snapshot) => {
    if (!snapshot.exists()) {
      alert(`Nenhum registro de quilometragem para ${friendName}.`);
      return;
    }
    let msg = `📊 Quilometragem de ${friendName} por data:\n\n`;
    snapshot.forEach((child) => {
      msg += `📅 ${child.key}: ${child.val().kilometers} km (${child.val().meters} metros)\n`;
    });
    alert(msg);
  });
};

// ==========================================================================
// 6. ROTA PONTO A / B COM OSRM (TEMPO REAL E ESTIMATIVA)
// ==========================================================================
if (btnCalculateRoute) {
  btnCalculateRoute.addEventListener("click", async () => {
    const originVal = routeOriginInput.value.trim();
    const destVal = routeDestinationInput.value.trim();

    if (!destVal) { alert("Informe o destino ou clique no mapa."); return; }

    let originCoords = null;
    if (!originVal || originVal.toLowerCase() === "meu local" || originVal === "") {
      if (!userMarker) { alert("Sua localização atual ainda não foi obtida pelo GPS."); return; }
      originCoords = userMarker.getLatLng();
    } else {
      originCoords = await geocodeAddress(originVal);
    }

    let destCoords = await geocodeAddress(destVal);
    if (!originCoords || !destCoords) { alert("Não foi possível localizar os endereços informados."); return; }

    fetchRouteFromOSRM(originCoords, destCoords);
  });
}

async function geocodeAddress(addressStr) {
  // Se forem coordenadas diretas separadas por vírgula
  if (addressStr.includes(',')) {
    const parts = addressStr.split(',');
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lon)) return L.latLng(lat, lon);
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressStr)}`);
    const data = await res.json();
    if (data && data.length > 0) {
      return L.latLng(parseFloat(data[0].lat), parseFloat(data[0].lon));
    }
  } catch (e) { console.error("Erro geocoding", e); }
  return null;
}

function fetchRouteFromOSRM(origin, dest) {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
  
  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coords = route.geometry.coordinates.map(c => [c[1], c[0]]); // [lat, lon]
        
        if (routePolyline) map.removeLayer(routePolyline);
        routePolyline = L.polyline(coords, { color: '#2563eb', weight: 6 }).addTo(map);
        map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });

        const distanceKm = (route.distance / 1000).toFixed(1);
        const durationMin = Math.round(route.duration / 60);

        routeResultsDiv.classList.remove("hidden");
        routeResultsDiv.innerHTML = `🚗 <b>Distância:</b> ${distanceKm} km<br>⏱️ <b>Tempo Estimado:</b> ~${durationMin} minutos`;
      } else {
        alert("Não foi possível traçar a rota.");
      }
    })
    .catch(err => alert("Erro ao calcular rota: " + err.message));
}

// ==========================================================================
// 7. COMPARTILHAMENTO WHATSAPP PARA MÚLTIPLOS CONTATOS
// ==========================================================================
if (btnOpenWhatsappModal) {
  btnOpenWhatsappModal.addEventListener("click", () => {
    if (whatsappModal) whatsappModal.classList.remove("hidden");
  });
}

function closeWhatsappModal() {
  if (whatsappModal) whatsappModal.classList.add("hidden");
}

function renderWhatsappCheckbox(uid, data) {
  if (!data.phone) return;
  const div = document.createElement("div");
  div.className = "whatsapp-contact-item";
  div.innerHTML = `
    <input type="checkbox" value="${data.phone}" id="wa-chk-${uid}" />
    <label for="wa-chk-${uid}"><b>${data.displayName || data.phone}</b> (${data.phone})</label>
  `;
  whatsappCheckboxesDiv.appendChild(div);
}

if (btnSendWhatsappSelected) {
  btnSendWhatsappSelected.addEventListener("click", () => {
    const checkedBoxes = whatsappCheckboxesDiv.querySelectorAll("input[type='checkbox']:checked");
    if (checkedBoxes.length === 0) { alert("Selecione pelo menos um contato."); return; }

    const siteLink = window.location.href;
    const message = encodeURIComponent(`Olá! Acesse meu localizador em tempo real pelo link: ${siteLink}`);

    checkedBoxes.forEach(chk => {
      const phone = chk.value.replace(/\D/g, "");
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${message}`;
      window.open(whatsappUrl, '_blank');
    });

    closeWhatsappModal();
  });
}

// ==========================================================================
// 8. HISTÓRICO 30 DIAS
// ==========================================================================
window.toggleUserRoute = function(targetUid, title, buttonElem) {
  if (activePolylineUid === targetUid && currentPolyline) {
    clearCurrentRoute();
    resetButtonState(targetUid, buttonElem);
    return;
  }
  clearCurrentRoute();
  fetchAndDrawHistory(targetUid, title, buttonElem);
};

function clearCurrentRoute() {
  if (currentPolyline) { map.removeLayer(currentPolyline); currentPolyline = null; }
  if (activePolylineUid) {
    const prevBtn = document.getElementById(`btn-route-${activePolylineUid}`);
    if (prevBtn) { prevBtn.innerText = "30 Dias"; prevBtn.style.backgroundColor = ""; }
  }
  activePolylineUid = null;
}

function resetButtonState(targetUid, buttonElem) {
  if (!buttonElem) return;
  buttonElem.innerText = "30 Dias";
  buttonElem.style.backgroundColor = "";
}

function fetchAndDrawHistory(targetUid, title, buttonElem) {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  database.ref(`users/${targetUid}/isHistoryPrivate`).once('value', (privacySnap) => {
    const isPrivate = privacySnap.exists() ? privacySnap.val() === true : false;
    const isMe = auth.currentUser && auth.currentUser.uid === targetUid;

    if (isPrivate && !isMe) { alert(`O histórico de ${title} é privado.`); return; }

    database.ref(`location_history/${targetUid}`).once('value').then((snapshot) => {
      if (!snapshot.exists()) { alert(`Nenhum histórico para ${title}.`); return; }
      const latLngs = [];
      snapshot.forEach((child) => {
        const val = child.val();
        if (val && typeof val.latitude === 'number' && typeof val.longitude === 'number') {
          if ((val.timestamp || Date.now()) >= thirtyDaysAgo) latLngs.push([val.latitude, val.longitude]);
        }
      });
      if (latLngs.length === 0) { alert("Nenhum trajeto recente."); return; }

      currentPolyline = L.polyline(latLngs, { color: '#0052d4', weight: 5, opacity: 0.8 }).addTo(map);
      map.fitBounds(currentPolyline.getBounds(), { padding: [40, 40] });
      activePolylineUid = targetUid;
      if (buttonElem) { buttonElem.innerText = "❌ Ocultar"; buttonElem.style.backgroundColor = "#ef4444"; }
      closeDrawer();
    });
  });
}

function checkAdminPermissions(user) {
  const isUserAdmin = user && user.email && user.email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();
  if (adminSection) adminSection.style.display = isUserAdmin ? "block" : "none";
  if (btnTogglePrivacy) btnTogglePrivacy.style.display = isUserAdmin ? "block" : "none";
}