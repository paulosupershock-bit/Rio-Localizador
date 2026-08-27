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

// Inicializa o Firebase — SÓ UMA VEZ!
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// Variáveis Globais
let map = null;
let userMarker = null;
let watchId = null;
let lastSavedPosition = null;
let currentPolyline = null;
const otherMarkers = {};

// Elementos da DOM
const authScreen = document.getElementById("auth-screen");
const mapScreen = document.getElementById("map-screen");
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const btnRegister = document.getElementById("btn-register");
const btnLogout = document.getElementById("btn-logout");
const btnRecenter = document.getElementById("btn-recenter");

// --- CONTROLE DO MENU LATERAL ---
const btnOpenDrawer = document.getElementById("btn-open-drawer");
const btnCloseDrawer = document.getElementById("btn-close-drawer");
const drawer = document.getElementById("drawer");
const overlay = document.getElementById("drawer-overlay");

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

// Fechar menu se a tecla ESC for pressionada
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && drawer.classList.contains('open')) {
    closeDrawer();
  }
});

// Autenticação: Login
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = emailInput.value;
  const password = passwordInput.value;

  auth.signInWithEmailAndPassword(email, password)
    .catch((error) => alert("Erro ao entrar: " + error.message));
});

// Autenticação: Cadastro
btnRegister.addEventListener("click", () => {
  const email = emailInput.value;
  const password = passwordInput.value;

  if (!email || !password) {
    alert("Preencha e-mail e senha para cadastrar.");
    return;
  }

  auth.createUserWithEmailAndPassword(email, password)
    .then(() => alert("Conta criada com sucesso!"))
    .catch((error) => alert("Erro ao cadastrar: " + error.message));
});

// Autenticação: Logout
btnLogout.addEventListener("click", () => {
  auth.signOut();
});

// Observador do Estado de Autenticação
auth.onAuthStateChanged((user) => {
  if (user) {
    authScreen.classList.add("hidden");
    mapScreen.classList.remove("hidden");
    
    initMap();
    
    // Força o Leaflet a atualizar as dimensões da div #map assim que ela fica visível
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 200);

    startLocationTracking(user.uid);
    listenToOtherLocations();
  } else {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    authScreen.classList.remove("hidden");
    mapScreen.classList.add("hidden");
  }
});

// --- Funções do Mapa e Geolocalização ---

function initMap() {
  if (map) return; // Evita recriar o mapa se já existir

  // Coordenadas padrão do Rio de Janeiro
  const rioCoords = [-22.9068, -43.1729];
  
  map = L.map('map').setView(rioCoords, 13);

  // Adiciona a camada de mapa do OpenStreetMap
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);
}

// Botão Recenter (Centralizar Mapa)
btnRecenter.addEventListener("click", () => {
  if (!map) return;

  // Atualiza as dimensões da div do mapa caso a tela tenha mudado
  map.invalidateSize();

  if (userMarker) {
    // Se o marcador já existe, pega a posição dele e centraliza
    const position = userMarker.getLatLng();
    map.setView(position, 16, { animate: true });
    userMarker.openPopup();
  } else {
    // Se não há marcador ainda, solicita a posição atual via navegador
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const latLng = [latitude, longitude];

        if (!userMarker) {
          userMarker = L.marker(latLng).addTo(map).bindPopup("<b>Sua localização</b>");
        } else {
          userMarker.setLatLng(latLng);
        }

        map.setView(latLng, 16, { animate: true });
        userMarker.openPopup();
      },
      (error) => {
        alert("Não foi possível obter sua localização. Verifique se a permissão de GPS está ativada no seu navegador.");
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }
});

function startLocationTracking(uid) {
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      const latLng = [latitude, longitude];

      // --- 1. Atualiza/Cria o marcador do PRÓPRIO usuário ---
      if (!userMarker) {
        userMarker = L.marker(latLng).addTo(map).bindPopup("<b>Sua localização</b>");
        // Centraliza automaticamente e ajusta tamanho do mapa no 1º sinal
        map.invalidateSize();
        map.setView(latLng, 16);
      } else {
        userMarker.setLatLng(latLng);
      }

      // --- 2. Atualiza a localização ATUAL em tempo real ---
      database.ref('locations/' + uid).set({
        latitude: latitude,
        longitude: longitude,
        email: auth.currentUser ? auth.currentUser.email : '',
        displayName: auth.currentUser ? auth.currentUser.displayName : '',
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });

      // --- 3. Salva no HISTÓRICO apenas se moveu mais de 15 metros ---
      let shouldSaveHistory = false;

      if (!lastSavedPosition) {
        shouldSaveHistory = true;
      } else {
        const distanceMoved = calculateDistance(
          lastSavedPosition.lat, 
          lastSavedPosition.lng, 
          latitude, 
          longitude
        );

        if (distanceMoved >= 15) {
          shouldSaveHistory = true;
        }
      }

      if (shouldSaveHistory) {
        database.ref(`location_history/${uid}`).push({
          latitude: latitude,
          longitude: longitude,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        lastSavedPosition = { lat: latitude, lng: longitude };
      }
    },
    (error) => console.error("Erro no GPS: ", error),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function listenToOtherLocations() {
  const locationsRef = database.ref('locations');

  locationsRef.on('child_added', (snapshot) => {
    const data = snapshot.val();
    updateOtherUserMarker(snapshot.key, data);
  });

  locationsRef.on('child_changed', (snapshot) => {
    const data = snapshot.val();
    updateOtherUserMarker(snapshot.key, data);
  });

  locationsRef.on('child_removed', (snapshot) => {
    const uid = snapshot.key;
    if (otherMarkers[uid]) {
      map.removeLayer(otherMarkers[uid]);
      delete otherMarkers[uid];
    }
  });
}

function updateOtherUserMarker(uid, data) {
  const currentUserId = auth.currentUser ? auth.currentUser.uid : null;
  if (uid === currentUserId || !data) return;

  const latLng = [data.latitude, data.longitude];
  const displayName = data.displayName || data.email || `Usuário (${uid.substring(0, 5)}...)`;

  const friendIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  if (!otherMarkers[uid]) {
    otherMarkers[uid] = L.marker(latLng, { icon: friendIcon })
      .addTo(map)
      .bindPopup(`<b>${displayName}</b><br>Em movimento`);
  } else {
    otherMarkers[uid].setLatLng(latLng);
  }

  checkProximityAlert(uid, data.latitude, data.longitude);
}

// Calcula distância entre dois pontos em metros (Fórmula de Haversine)
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

function checkProximityAlert(friendUid, friendLat, friendLng) {
  if (!userMarker) return;
  const myPos = userMarker.getLatLng();
  
  const distance = calculateDistance(myPos.lat, myPos.lng, friendLat, friendLng);
  const ALARM_RADIUS_METERS = 500;

  if (distance <= ALARM_RADIUS_METERS) {
    if (Notification.permission === "granted") {
      new Notification("Amigo Próximo!", {
        body: `Um amigo está a apenas ${Math.round(distance)}m de você.`,
        icon: "/icon.png"
      });
    } else {
      alert(`⚠️ Amigo Próximo! Um amigo está a ${Math.round(distance)}m de você.`);
    }
  }
}

// Aceitar solicitação de amizade
function acceptFriendRequest(friendUid) {
  const currentUid = auth.currentUser.uid;

  const updates = {};
  updates[`/friendships/${currentUid}/${friendUid}`] = 'accepted';
  updates[`/friendships/${friendUid}/${currentUid}`] = 'accepted';

  database.ref().update(updates)
    .then(() => alert("Solicitação aceita!"))
    .catch((err) => alert("Erro ao aceitar: " + err.message));
}

// Recusar ou cancelar solicitação
function rejectFriendRequest(friendUid) {
  const currentUid = auth.currentUser.uid;

  const updates = {};
  updates[`/friendships/${currentUid}/${friendUid}`] = null;
  updates[`/friendships/${friendUid}/${currentUid}`] = null;

  database.ref().update(updates)
    .then(() => alert("Solicitação removida."))
    .catch((err) => alert("Erro ao recusar: " + err.message));
}

function drawUserHistory(targetUid) {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

  database.ref(`location_history/${targetUid}`)
    .orderByChild('timestamp')
    .startAt(thirtyDaysAgo)
    .once('value', (snapshot) => {
      const latLngs = [];

      snapshot.forEach((child) => {
        const val = child.val();
        latLngs.push([val.latitude, val.longitude]);
      });

      if (currentPolyline) {
        map.removeLayer(currentPolyline);
      }

      if (latLngs.length > 0) {
        currentPolyline = L.polyline(latLngs, { color: '#0052d4', weight: 4, opacity: 0.7 }).addTo(map);
        map.fitBounds(currentPolyline.getBounds());
      } else {
        alert("Nenhum trajeto encontrado nos últimos 30 dias.");
      }
    });
}

// --- ENTRAR COM CONTA DO GOOGLE ---
const googleProvider = new firebase.auth.GoogleAuthProvider();
const btnGoogleLogin = document.getElementById("btn-google-login");

if (btnGoogleLogin) {
  btnGoogleLogin.addEventListener("click", () => {
    auth.signInWithPopup(googleProvider)
      .then((result) => {
        const user = result.user;
        alert("Login com Google bem-sucedido! Bem-vindo, " + user.displayName);
      })
      .catch((error) => {
        if (error.code !== "auth/popup-closed-by-user") {
          alert("Erro ao entrar com Google: " + error.message);
        }
      });
  });
}