// --- Configuração do Firebase ---
// Substitua pelas suas credenciais do Firebase Console
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- Referências do DOM ---
const authScreen = document.getElementById("auth-screen");
const mapScreen = document.getElementById("map-screen");
const authForm = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const btnLogin = document.getElementById("btn-login");
const btnSignup = document.getElementById("btn-signup");
const btnLogout = document.getElementById("btn-logout");
const authError = document.getElementById("auth-error");
const userDisplayEmail = document.getElementById("user-display-email");

const friendEmailInput = document.getElementById("friend-email-input");
const btnAddFriend = document.getElementById("btn-add-friend");
const requestsList = document.getElementById("requests-list");
const friendsList = document.getElementById("friends-list");

const btnRecenter = document.getElementById("btn-recenter");
const btnMyHistory = document.getElementById("btn-my-history");

// --- Variáveis Globais de Controle ---
let map = null;
let userMarker = null;
let friendMarkers = {};
let activePolyline = null;
let watchId = null;

// --- Gestão de Autenticação ---

// Login
btnLogin.addEventListener("click", (e) => {
  e.preventDefault();
  const email = emailInput.value;
  const password = passwordInput.value;
  
  auth.signInWithEmailAndPassword(email, password)
    .catch(error => authError.textContent = error.message);
});

// Cadastro
btnSignup.addEventListener("click", (e) => {
  e.preventDefault();
  const email = emailInput.value;
  const password = passwordInput.value;

  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      // Cria registro na coleção de usuários
      return db.collection("users").doc(userCredential.user.uid).set({
        email: email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    })
    .catch(error => authError.textContent = error.message);
});

// Logout
btnLogout.addEventListener("click", () => {
  auth.signOut();
});

// Estado de Autenticação (Ciclo de Vida)
auth.onAuthStateChanged((user) => {
  if (user) {
    userDisplayEmail.textContent = user.email;
    authScreen.classList.add("hidden");
    mapScreen.classList.remove("hidden");

    // Inicializa o mapa Leaflet
    initMap();

    // Garante renderização perfeita ativando a reavaliação de tamanho após tornar visível
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (map) {
          map.invalidateSize();
        }
      }, 300);
    });

    startLocationTracking(user.uid);
    listenToFriendships(user.uid);
  } else {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    authScreen.classList.remove("hidden");
    mapScreen.classList.add("hidden");
  }
});

// --- Gestão do Mapa ---

function initMap() {
  if (map) return;

  // Posição inicial padrão (Rio de Janeiro)
  const defaultCoords = [-22.9068, -43.1729];
  map = L.map('map').setView(defaultCoords, 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  setTimeout(() => {
    if (map) map.invalidateSize();
  }, 200);

  if (btnRecenter) {
    btnRecenter.addEventListener("click", () => {
      if (userMarker) map.setView(userMarker.getLatLng(), 16);
    });
  }

  if (btnMyHistory) {
    btnMyHistory.addEventListener("click", () => {
      if (auth.currentUser) drawUserHistory(auth.currentUser.uid, "Meu Trajeto");
    });
  }
}

// --- Geolocalização e Rastreamento em Tempo Real ---

function startLocationTracking(userId) {
  if (!navigator.geolocation) {
    alert("Geolocalização não suportada pelo seu navegador.");
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const latLng = [lat, lng];

      // Atualiza ou cria marcador do usuário
      if (!userMarker) {
        userMarker = L.marker(latLng).addTo(map).bindPopup("Você está aqui");
        map.setView(latLng, 15);
      } else {
        userMarker.setLatLng(latLng);
      }

      // Salva no Firestore
      db.collection("locations").doc(userId).set({
        latitude: lat,
        longitude: lng,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Salva histórico
      db.collection("locations").doc(userId).collection("history").add({
        latitude: lat,
        longitude: lng,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    },
    (error) => console.error("Erro ao obter localização:", error),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
  );
}

// --- Sistema de Amizades ---

btnAddFriend.addEventListener("click", () => {
  const friendEmail = friendEmailInput.value.trim();
  if (!friendEmail) return;

  db.collection("users").where("email", "==", friendEmail).get()
    .then(snapshot => {
      if (snapshot.empty) {
        alert("Usuário não encontrado.");
        return;
      }

      const friendId = snapshot.docs[0].id;
      const currentUserId = auth.currentUser.uid;

      if (friendId === currentUserId) {
        alert("Você não pode adicionar a si mesmo.");
        return;
      }

      db.collection("friendships").add({
        requesterId: currentUserId,
        receiverId: friendId,
        status: "pending"
      }).then(() => {
        alert("Solicitação enviada!");
        friendEmailInput.value = "";
      });
    });
});

function listenToFriendships(userId) {
  // Solicitações Recebidas Pendentes
  db.collection("friendships")
    .where("receiverId", "==", userId)
    .where("status", "==", "pending")
    .onSnapshot(snapshot => {
      requestsList.innerHTML = "";
      snapshot.forEach(doc => {
        const data = doc.data();
        
        db.collection("users").doc(data.requesterId).get().then(userDoc => {
          const li = document.createElement("li");
          li.textContent = userDoc.data()?.email || "Usuário";
          
          const btnAccept = document.createElement("button");
          btnAccept.textContent = "Aceitar";
          btnAccept.className = "btn-accept";
          btnAccept.onclick = () => acceptFriendship(doc.id);

          li.appendChild(btnAccept);
          requestsList.appendChild(li);
        });
      });
    });

  // Amigos Aceitos (Enviados ou Recebidos)
  db.collection("friendships")
    .where("status", "==", "accepted")
    .onSnapshot(snapshot => {
      friendsList.innerHTML = "";
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.requesterId === userId || data.receiverId === userId) {
          const friendId = data.requesterId === userId ? data.receiverId : data.requesterId;
          
          db.collection("users").doc(friendId).get().then(userDoc => {
            const friendData = userDoc.data();
            if (!friendData) return;

            const li = document.createElement("li");
            li.textContent = friendData.email;

            const btnTrack = document.createElement("button");
            btnTrack.textContent = "Ver Trajeto";
            btnTrack.className = "btn-track";
            btnTrack.onclick = () => drawUserHistory(friendId, friendData.email);

            li.appendChild(btnTrack);
            friendsList.appendChild(li);

            // Escuta localização do amigo em tempo real
            trackFriendLocation(friendId, friendData.email);
          });
        }
      });
    });
}

function acceptFriendship(friendshipId) {
  db.collection("friendships").doc(friendshipId).update({
    status: "accepted"
  });
}

function trackFriendLocation(friendId, friendEmail) {
  db.collection("locations").doc(friendId).onSnapshot(doc => {
    if (!doc.exists) return;

    const data = doc.data();
    const latLng = [data.latitude, data.longitude];

    if (!friendMarkers[friendId]) {
      friendMarkers[friendId] = L.marker(latLng).addTo(map).bindPopup(friendEmail);
    } else {
      friendMarkers[friendId].setLatLng(latLng);
    }
  });
}

// --- Histórico de Trajeto ---

function drawUserHistory(targetUserId, label) {
  const startOfDay = new Date();
  startOfDay.setHours(0,0,0,0);

  db.collection("locations").doc(targetUserId).collection("history")
    .where("timestamp", ">=", startOfDay)
    .orderBy("timestamp", "asc")
    .get()
    .then(snapshot => {
      const latLngs = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        latLngs.push([data.latitude, data.longitude]);
      });

      if (latLngs.length === 0) {
        alert("Nenhum histórico encontrado para hoje.");
        return;
      }

      if (activePolyline) {
        map.removeLayer(activePolyline);
      }

      activePolyline = L.polyline(latLngs, { color: 'blue', weight: 4 }).addTo(map);
      map.fitBounds(activePolyline.getBounds());
    })
    .catch(err => console.error("Erro ao carregar histórico:", err));
}