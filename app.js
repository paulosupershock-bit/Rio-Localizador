// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBNkf6_wsmi3lH53oZyY50YDWt7mCAdwzk",
  authDomain: "riolocalizador.firebaseapp.com",
  databaseURL: "https://riolocalizador-default-rtdb.firebaseio.com",
  projectId: "riolocalizador",
  storageBucket: "riolocalizador.firebasestorage.app",
  messagingSenderId: "698167641664",
  appId: "1:698167641664:web:fd4d41f8c221a460e401a5"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// Variáveis Globais
let map = null;
let userMarker = null;
let watchId = null;
const otherMarkers = {};
let currentPolyline = null;
const alertedFriends = new Set(); // Para não disparar notificação repetida no mesmo raio

// Elementos da DOM
const authScreen = document.getElementById("auth-screen");
const mapScreen = document.getElementById("map-screen");
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const btnRegister = document.getElementById("btn-register");
const btnLogout = document.getElementById("btn-logout");
const btnRecenter = document.getElementById("btn-recenter");
const btnForgotPassword = document.getElementById("btn-forgot-password");

// Drawer & Amigos
const btnOpenDrawer = document.getElementById("btn-open-drawer");
const btnCloseDrawer = document.getElementById("btn-close-drawer");
const drawer = document.getElementById("drawer");
const overlay = document.getElementById("drawer-overlay");
const addFriendForm = document.getElementById("add-friend-form");
const friendEmailInput = document.getElementById("friend-email-input");
const addFriendPhoneForm = document.getElementById("add-friend-phone-form");
const friendPhoneInput = document.getElementById("friend-phone-input");
const pendingRequestsList = document.getElementById("pending-requests-list");
const friendsList = document.getElementById("friends-list");
const btnMyHistory = document.getElementById("btn-toggle-history");

// --- CONTROLE DO MENU LATERAL ---
function openDrawer() {
  drawer.classList.add("open");
  overlay.classList.remove("hidden");
}

function closeDrawer() {
  drawer.classList.remove("open");
  overlay.classList.add("hidden");
}

btnOpenDrawer.addEventListener("click", openDrawer);
btnCloseDrawer.addEventListener("click", closeDrawer);
overlay.addEventListener("click", closeDrawer);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && drawer.classList.contains('open')) {
    closeDrawer();
  }
});

// Pedir Permissão para Notificações ao Carregar
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}

// Autenticação
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  auth.signInWithEmailAndPassword(emailInput.value, passwordInput.value)
    .catch((error) => alert("Erro ao entrar: " + error.message));
});

btnRegister.addEventListener("click", () => {
  if (!emailInput.value || !passwordInput.value) {
    alert("Preencha e-mail e senha para cadastrar.");
    return;
  }
  auth.createUserWithEmailAndPassword(emailInput.value, passwordInput.value)
    .then((cred) => {
      // Salva usuário no banco
      database.ref(`users/${cred.user.uid}`).set({
        email: cred.user.email
      });
      alert("Conta criada com sucesso!");
    })
    .catch((error) => alert("Erro ao cadastrar: " + error.message));
});

if (btnForgotPassword) {
  btnForgotPassword.addEventListener("click", () => {
    if (!emailInput.value) {
      alert("Digite seu e-mail para recuperar a senha.");
      return;
    }
    auth.sendPasswordResetEmail(emailInput.value)
      .then(() => alert("E-mail de redefinição enviado! Check sua caixa de entrada."))
      .catch((error) => alert("Erro: " + error.message));
  });
}

const googleProvider = new firebase.auth.GoogleAuthProvider();
const btnGoogleLogin = document.getElementById("btn-google-login");
if (btnGoogleLogin) {
  btnGoogleLogin.addEventListener("click", () => {
    auth.signInWithPopup(googleProvider)
      .then((result) => {
        database.ref(`users/${result.user.uid}`).set({ email: result.user.email });
      })
      .catch((error) => {
        if (error.code !== "auth/popup-closed-by-user") {
          alert("Erro no Google Login: " + error.message);
        }
      });
  });
}

btnLogout.addEventListener("click", () => auth.signOut());

// Estado de Autenticação
auth.onAuthStateChanged((user) => {
  if (user) {
    authScreen.classList.add("hidden");
    mapScreen.classList.remove("hidden");
    initMap();
    startLocationTracking(user.uid);
    listenToFriendships(user.uid);
  } else {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    authScreen.classList.remove("hidden");
    mapScreen.classList.add("hidden");
  }
});

// Mapa Leaflet
function initMap() {
  if (map) return;
  const rioCoords = [-22.9068, -43.1729];
  map = L.map('map').setView(rioCoords, 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  btnRecenter.addEventListener("click", () => {
    if (userMarker) map.setView(userMarker.getLatLng(), 16);
  });

  btnMyHistory.addEventListener("click", () => {
    if (auth.currentUser) drawUserHistory(auth.currentUser.uid, "Meu Trajeto");
  });
}

// Rastreamento GPS Próprio com Fallback para IP
function startLocationTracking(uid) {
  // Tenta obter a localização de alta precisão via GPS
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      processUserLocation(uid, latitude, longitude, "GPS");
    },
    (error) => {
      console.warn("Falha no GPS (" + error.message + "). Tentando geolocalização por IP...");
      // Se o GPS falhar ou for negado, busca por IP
      getLocationByIP(uid);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// Consulta a API gratuita ipapi.co para pegar a posição aproximada da rede
function getLocationByIP(uid) {
  fetch('https://ipapi.co/json/')
    .then(response => response.json())
    .then(data => {
      if (data.latitude && data.longitude) {
        console.log(`Localização por IP obtida (${data.city}, ${data.region})`);
        processUserLocation(uid, data.latitude, data.longitude, "IP (Aproximado)");
      } else {
        alert("Não foi possível obter sua localização nem via GPS nem via IP.");
      }
    })
    .catch(err => {
      console.error("Erro ao buscar IP:", err);
      alert("Erro ao conectar ao serviço de geolocalização por IP.");
    });
}

// Atualiza o mapa e salva as coordenadas no Firebase
function processUserLocation(uid, latitude, longitude, sourceLabel) {
  const latLng = [latitude, longitude];

  if (!userMarker) {
    userMarker = L.marker(latLng).addTo(map).bindPopup(`Você está aqui (${sourceLabel})`);
    map.setView(latLng, sourceLabel === "GPS" ? 15 : 12); // Zoom menor se for via IP
  } else {
    userMarker.setLatLng(latLng);
    userMarker.getPopup().setContent(`Você está aqui (${sourceLabel})`);
  }

  const timestamp = firebase.database.ServerValue.TIMESTAMP;

  // Localização Atual
  database.ref('locations/' + uid).set({
    latitude,
    longitude,
    source: sourceLabel,
    timestamp
  });

  // Histórico
  database.ref(`location_history/${uid}`).push({
    latitude,
    longitude,
    source: sourceLabel,
    timestamp
  });
}
// --- GERENCIAMENTO DE AMIGOS E SOLICITAÇÕES ---

if (addFriendForm) {
  addFriendForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const targetEmail = friendEmailInput.value.trim().toLowerCase();
    if (!targetEmail) return;

    // Buscar UID do e-mail digitado
    database.ref('users').orderByChild('email').equalTo(targetEmail).once('value', (snapshot) => {
      if (!snapshot.exists()) {
        alert("Usuário não encontrado.");
        return;
      }
// --- ADICIONAR POR TELEFONE ---
const addFriendPhoneForm = document.getElementById("add-friend-phone-form");
const friendPhoneInput = document.getElementById("friend-phone-input");

if (addFriendPhoneForm) {
  addFriendPhoneForm.addEventListener("submit", (e) => {
    e.preventDefault();
    // Limpa parênteses, traços e espaços mantendo apenas números e o +
    const phone = friendPhoneInput.value.trim().replace(/[^\d+]/g, '');
    searchAndSendRequest("phone", phone, friendPhoneInput);
  });
}

// Função genérica de busca no Firebase
function searchAndSendRequest(field, value, inputElement) {
  if (!value) return;

  database.ref('users').orderByChild(field).equalTo(value).once('value', (snapshot) => {
    if (!snapshot.exists()) {
      alert(`Nenhum usuário encontrado com este ${field === 'email' ? 'e-mail' : 'telefone'}.`);
      return;
    }

    let friendUid = null;
    snapshot.forEach(child => { friendUid = child.key; });

    if (friendUid === auth.currentUser.uid) {
      alert("Você não pode adicionar a si mesmo.");
      return;
    }

    const updates = {};
    updates[`/friendships/${auth.currentUser.uid}/${friendUid}`] = "pending_sent";
    updates[`/friendships/${friendUid}/${auth.currentUser.uid}`] = "pending_received";

    database.ref().update(updates)
      .then(() => {
        alert("Solicitação enviada com sucesso!");
        inputElement.value = "";
      })
      .catch(err => alert("Erro ao enviar: " + err.message));
  });
}


      let friendUid = null;
      snapshot.forEach(child => { friendUid = child.key; });

      if (friendUid === auth.currentUser.uid) {
        alert("Você não pode adicionar a si mesmo.");
        return;
      }

      const updates = {};
      updates[`/friendships/${auth.currentUser.uid}/${friendUid}`] = "pending_sent";
      updates[`/friendships/${friendUid}/${auth.currentUser.uid}`] = "pending_received";

      database.ref().update(updates)
        .then(() => {
          alert("Solicitação enviada!");
          friendEmailInput.value = "";
        })
        .catch(err => alert("Erro ao enviar: " + err.message));
    });
  });
}

function listenToFriendships(myUid) {
  database.ref(`friendships/${myUid}`).on('value', (snapshot) => {
    pendingRequestsList.innerHTML = "";
    friendsList.innerHTML = "";
    
    // Limpar marcadores de amigos antigos antes de reescutar
    Object.keys(otherMarkers).forEach(uid => {
      map.removeLayer(otherMarkers[uid].marker);
      delete otherMarkers[uid];
    });

    if (!snapshot.exists()) return;

    snapshot.forEach((child) => {
      const friendUid = child.key;
      const status = child.val();

      // Buscar nome/email do amigo
      database.ref(`users/${friendUid}`).once('value', (userSnap) => {
        const userData = userSnap.val() || {};
        const friendEmail = userData.email || friendUid;

        if (status === "pending_received") {
          renderPendingRequest(friendUid, friendEmail);
        } else if (status === "accepted") {
          renderFriendItem(friendUid, friendEmail);
          listenToFriendLocation(friendUid, friendEmail);
        }
      });
    });
  });
}

// 2. Ações de Aceitar / Recusar no HTML
function renderPendingRequest(friendUid, friendEmail) {
  const item = document.createElement("div");
  item.className = "pending-request-item";
  item.innerHTML = `
    <span><strong>${friendEmail}</strong> quer compartilhar a localização.</span>
    <div>
      <button class="btn-accept" onclick="acceptFriendRequest('${friendUid}')">Aceitar</button>
      <button class="btn-danger" onclick="rejectFriendRequest('${friendUid}')">Recusar</button>
    </div>
  `;
  pendingRequestsList.appendChild(item);
}

function acceptFriendRequest(friendUid) {
  const myUid = auth.currentUser.uid;
  const updates = {};
  updates[`/friendships/${myUid}/${friendUid}`] = 'accepted';
  updates[`/friendships/${friendUid}/${myUid}`] = 'accepted';

  database.ref().update(updates).then(() => alert("Solicitação aceita!"));
}

function rejectFriendRequest(friendUid) {
  const myUid = auth.currentUser.uid;
  const updates = {};
  updates[`/friendships/${myUid}/${friendUid}`] = null;
  updates[`/friendships/${friendUid}/${myUid}`] = null;

  database.ref().update(updates);
}

// Renderiza Contato na Lista com status de horário
function renderFriendItem(friendUid, friendEmail) {
  const div = document.createElement("div");
  div.className = "friend-item";
  div.id = `friend-item-${friendUid}`;
  div.innerHTML = `
    <div class="friend-info">
      <strong>${friendEmail}</strong>
      <small id="time-status-${friendUid}" class="time-status">Aguardando dados...</small>
    </div>
    <button class="btn-history-small" onclick="drawUserHistory('${friendUid}', '${friendEmail}')">Ver Rota</button>
  `;
  friendsList.appendChild(div);
}

// 3. Monitora GPS de Amigos e exibe tempo de atualização
function listenToFriendLocation(friendUid, friendEmail) {
  database.ref(`locations/${friendUid}`).on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const { latitude, longitude, timestamp } = data;
    const latLng = [latitude, longitude];

    // Atualiza/Cria Marcador
    if (!otherMarkers[friendUid]) {
      const marker = L.marker(latLng).addTo(map).bindPopup(`<b>${friendEmail}</b>`);
      otherMarkers[friendUid] = { marker, latLng };
    } else {
      otherMarkers[friendUid].marker.setLatLng(latLng);
      otherMarkers[friendUid].latLng = latLng;
    }

    // Atualiza Data/Hora na Lista
    updateLastSeenUI(friendUid, timestamp);

    // 1. Alerta de Proximidade (Raio de 500m)
    checkProximityAlert(friendUid, friendEmail, latitude, longitude);
  });
}

function updateLastSeenUI(friendUid, timestamp) {
  const timeElem = document.getElementById(`time-status-${friendUid}`);
  if (!timeElem || !timestamp) return;

  const lastSeenDate = new Date(timestamp);
  const now = new Date();
  const diffMinutes = Math.floor((now - lastSeenDate) / (1000 * 60));

  const timeFormatted = lastSeenDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (diffMinutes > 15) {
    timeElem.className = "time-status outdated";
    timeElem.innerText = `Desatualizado: ${timeFormatted} (${diffMinutes} min atrás)`;
  } else {
    timeElem.className = "time-status online";
    timeElem.innerText = `Atualizado às ${timeFormatted}`;
  }
}

// 1. Notificação de Proximidade (Raio 500m)
function checkProximityAlert(friendUid, friendEmail, friendLat, friendLng) {
  if (!userMarker) return;
  const myPos = userMarker.getLatLng();
  const distance = calculateDistance(myPos.lat, myPos.lng, friendLat, friendLng);
  const ALARM_RADIUS_METERS = 500;

  if (distance <= ALARM_RADIUS_METERS) {
    if (!alertedFriends.has(friendUid)) {
      alertedFriends.add(friendUid); // Evita múltiplos alertas no mesmo raio

      const msg = `${friendEmail} está próximo de você (${Math.round(distance)}m)!`;

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Amigo Próximo!", { body: msg });
      } else {
        alert("⚠️ " + msg);
      }
    }
  } else {
    alertedFriends.delete(friendUid); // Reseta se o amigo se afastar
  }
}

// Função de cálculo de distância (Haversine)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 4. Trajeto dos últimos 30 dias no Mapa
function drawUserHistory(targetUid, title) {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

  database.ref(`location_history/${targetUid}`)
    .orderByChild('timestamp')
    .startAt(thirtyDaysAgo)
    .once('value', (snapshot) => {
      const latLngs = [];

      snapshot.forEach((child) => {
        const val = child.val();
        if (val.latitude && val.longitude) {
          latLngs.push([val.latitude, val.longitude]);
        }
      });

// --- COMPARTILHAMENTO E CONVITE VIA WHATSAPP ---
const btnShareWhatsapp = document.getElementById("btn-share-whatsapp");

if (btnShareWhatsapp) {
  btnShareWhatsapp.addEventListener("click", () => {
    const user = auth.currentUser;
    if (!user) {
      alert("Você precisa estar logado para enviar convites.");
      return;
    }

    // Mensagem amigável com o e-mail de quem está convidando
    const userEmail = user.email;
    const message = `Olá! Estou usando o Rio Localizador para compartilhar minha localização no mapa.\n\nAdicione meu e-mail no aplicativo para me acompanhar: *${userEmail}*\n\nAcesse o app aqui: ${window.location.href}`;

    // Cria o link seguro do WhatsApp
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

    // Abre o WhatsApp no navegador ou app mobile
    window.open(whatsappUrl, "_blank");
  });
}

      if (currentPolyline) {
        map.removeLayer(currentPolyline);
      }

      if (latLngs.length > 0) {
        currentPolyline = L.polyline(latLngs, { color: '#0052d4', weight: 5, opacity: 0.8 }).addTo(map);
        map.fitBounds(currentPolyline.getBounds());
        closeDrawer();
        alert(`Exibindo trajeto de ${title}`);
      } else {
        alert(`Nenhum trajeto registrado nos últimos 30 dias para ${title}.`);
      }
    });
}