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

// Inicializa o Firebase — SÓ UMA VEZ! SEM LINHAS DE IMPORT!
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// --- O RESTO DO SEU CÓDIGO CONTINUA IGUAL ABAIXO ---
// Variáveis Globais
let map = null;
let userMarker = null;
let watchId = null;
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

// --- Event Listeners ---

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

  btnRecenter.addEventListener("click", () => {
    if (userMarker) {
      map.setView(userMarker.getLatLng(), 16);
    }
  });
}

function startLocationTracking(uid) {
  // ... (código anterior da função) ...

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      const latLng = [latitude, longitude];

      // ... (código para atualizar o marcador do usuário, se houver) ...

      // --- PARTE DE SALVAMENTO NO BANCO ---

      // 1. Atualiza a localização ATUAL em tempo real (DEIXE ESTE TRECHO AQUI)
      database.ref('locations/' + uid).set({
        latitude: latitude,
        longitude: longitude,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });

      // 2. Salva um registro no HISTÓRICO (COLE ESTE TRECHO LOGO ABAIXO)
      database.ref(`location_history/${uid}`).push({
        latitude: latitude,
        longitude: longitude,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });

      // --- FIM DA PARTE DE SALVAMENTO ---

      // ... (resto do código da função, como o console.error) ...
    },
    (error) => console.error("Erro no GPS: ", error),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}	
function listenToOtherLocations() {
  const locationsRef = database.ref('locations');

  locationsRef.on('child_added', (snapshot) => {
    updateOtherUserMarker(snapshot.key, snapshot.val());
  });

  locationsRef.on('child_changed', (snapshot) => {
    updateOtherUserMarker(snapshot.key, snapshot.val());
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
  if (uid === currentUserId || !data) return; // Ignora o próprio usuário

  const latLng = [data.latitude, data.longitude];

  if (!otherMarkers[uid]) {
    otherMarkers[uid] = L.marker(latLng).addTo(map).bindPopup("Usuário: " + uid);
  } else {
    otherMarkers[uid].setLatLng(latLng);
  }
}

// Calcula distância entre dois pontos em metros
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distância em metros
}

// Chame esta verificação sempre que a posição de um amigo for atualizada:
function checkProximityAlert(friendUid, friendLat, friendLng) {
  if (!userMarker) return;
  const myPos = userMarker.getLatLng();
  
  const distance = calculateDistance(myPos.lat, myPos.lng, friendLat, friendLng);
  const ALARM_RADIUS_METERS = 500; // Raio configurável

  if (distance <= ALARM_RADIUS_METERS) {
    // Solicita permissão de notificação nativa do navegador/Android se necessário
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

  // Atualiza em ambas as pontas para amizade mútua
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


let currentPolyline = null;

function drawUserHistory(targetUid) {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

  // Busca pontos a partir de 30 dias atrás
  database.ref(`location_history/${targetUid}`)
    .orderByChild('timestamp')
    .startAt(thirtyDaysAgo)
    .once('value', (snapshot) => {
      const latLngs = [];

      snapshot.forEach((child) => {
        const val = child.val();
        latLngs.push([val.latitude, val.longitude]);
      });

      // Remove linha anterior se já existir no mapa
      if (currentPolyline) {
        map.removeLayer(currentPolyline);
      }	

      // Desenha a linha do trajeto no mapa (cor azul)
      if (latLngs.length > 0) {
        currentPolyline = L.polyline(latLngs, { color: '#0052d4', weight: 4, opacity: 0.7 }).addTo(map);
        map.fitBounds(currentPolyline.getBounds()); // Ajusta o zoom para cobrir o trajeto
      } else {
        alert("Nenhum trajeto encontrado nos últimos 30 dias.");
      }
    });
}

// --- ENTRAR COM CONTA DO GOOGLE ---

// Cria o provedor do Google
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Pega o botão
const btnGoogleLogin = document.getElementById("btn-google-login");

// Ação ao clicar no botão
btnGoogleLogin.addEventListener("click", () => {
  auth.signInWithPopup(googleProvider)
    .then((result) => {
      // Login bem-sucedido
      const user = result.user;
      alert("Login com Google bem-sucedido! Bem-vindo, " + user.displayName);
    })
    .catch((error) => {
      // Se o usuário fechou a janela ou deu erro
      if (error.code !== "auth/popup-closed-by-user") {
        alert("Erro ao entrar com Google: " + error.message);
      }
});