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
let activePolylineUid = null;
const alertedFriends = new Set();

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
const friendSearchType = document.getElementById("friend-search-type");
const friendEmailInput = document.getElementById("friend-email-input");
const friendPhoneInput = document.getElementById("friend-phone-input");
const pendingRequestsList = document.getElementById("pending-requests-list");
const friendsList = document.getElementById("friends-list");
const btnMyHistory = document.getElementById("btn-toggle-history");
const btnUpdatePhone = document.getElementById("btn-update-phone");
let btnTogglePrivacy = document.getElementById("btn-toggle-privacy");

// --- FUNÇÃO AUXILIAR DE PADRONIZAÇÃO DE TELEFONE ---
function formatPhoneNumber(phoneInput) {
  if (!phoneInput) return "";
  let cleaned = phoneInput.replace(/\D/g, "");
  if (!cleaned) return "";

  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = "55" + cleaned;
  }

  return "+" + cleaned;
}

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

if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}

// --- GERENCIAMENTO EXCLUSIVO DE PRIVACIDADE DO ADMINISTRADOR ---
function listenToMyPrivacy(uid) {
  const user = auth.currentUser;
  
  // ⚠️ DIGITE SEU E-MAIL EXATO DE ADMINISTRADOR ABAIXO (EM LETRAS MINÚSCULAS):
  const ADMIN_EMAIL = "paulo.supershock@gmail.com"; 

  const isUserAdmin = user && user.email && user.email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();

  if (isUserAdmin) {
    if (btnTogglePrivacy) {
      btnTogglePrivacy.classList.remove("hidden");
      btnTogglePrivacy.style.display = "block";
    }

    const privacyRef = database.ref(`users/${uid}/isHistoryPrivate`);
    privacyRef.on('value', (snap) => {
      const isPrivate = snap.exists() ? snap.val() === true : false;

      if (btnTogglePrivacy) {
        btnTogglePrivacy.innerText = isPrivate 
          ? "Privacidade: Histórico Oculto (Privado)" 
          : "Privacidade: Histórico Visível para Amigos";
      }
    });
  } else {
    if (btnTogglePrivacy && btnTogglePrivacy.parentNode) {
      btnTogglePrivacy.parentNode.removeChild(btnTogglePrivacy);
      btnTogglePrivacy = null;
    }
    database.ref(`users/${uid}/isHistoryPrivate`).set(false);
  }
}

if (btnTogglePrivacy) {
  btnTogglePrivacy.addEventListener("click", () => {
    if (!btnTogglePrivacy) return;
    const user = auth.currentUser;
    if (!user) return;

    const privacyRef = database.ref(`users/${user.uid}/isHistoryPrivate`);
    privacyRef.once('value', (snap) => {
      const currentState = snap.exists() ? snap.val() === true : false;
      const newState = !currentState;

      privacyRef.set(newState).then(() => {
        alert(newState ? "Seu histórico agora está OCULTO para contatos." : "Seu histórico agora está VISÍVEL para contatos.");
      });
    });
  });
}

// Login
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  auth.signInWithEmailAndPassword(emailInput.value, passwordInput.value)
    .catch((error) => alert("Erro ao entrar: " + error.message));
});

// Cadastro de Usuário
btnRegister.addEventListener("click", () => {
  if (!emailInput.value || !passwordInput.value) {
    alert("Preencha e-mail e senha para cadastrar.");
    return;
  }
  
  const rawPhone = prompt("Digite seu telefone com DDD (ex: 21999998888 ou +5521999998888):") || "";
  const cleanedPhone = formatPhoneNumber(rawPhone);
  const userEmail = emailInput.value.toLowerCase().trim();

  auth.createUserWithEmailAndPassword(userEmail, passwordInput.value)
    .then((cred) => {
      database.ref(`users/${cred.user.uid}`).set({
        email: userEmail,
        phone: cleanedPhone,
        isHistoryPrivate: false
      });
      alert("Conta criada com sucesso!");
    })
    .catch((error) => alert("Erro ao cadastrar: " + error.message));
});

// Esqueceu a Senha
if (btnForgotPassword) {
  btnForgotPassword.addEventListener("click", () => {
    if (!emailInput.value) {
      alert("Digite seu e-mail para recuperar a senha.");
      return;
    }
    auth.sendPasswordResetEmail(emailInput.value.trim().toLowerCase())
      .then(() => alert("E-mail de redefinição enviado! Cheque sua caixa de entrada."))
      .catch((error) => alert("Erro: " + error.message));
  });
}

// Login com Google
const googleProvider = new firebase.auth.GoogleAuthProvider();
const btnGoogleLogin = document.getElementById("btn-google-login");
if (btnGoogleLogin) {
  btnGoogleLogin.addEventListener("click", () => {
    auth.signInWithPopup(googleProvider)
      .then((result) => {
        const userRef = database.ref(`users/${result.user.uid}`);
        
        userRef.once('value', (snapshot) => {
          const userData = snapshot.val() || {};
          const updates = { 
            email: result.user.email.toLowerCase().trim(),
            isHistoryPrivate: false
          };
          
          if (!userData.phone) {
            const rawPhone = prompt("Bem-vindo! Digite seu telefone com DDD para completar o cadastro (ex: 21999998888):") || "";
            updates.phone = formatPhoneNumber(rawPhone);
          }
          
          userRef.update(updates);
        });
      })
      .catch((error) => {
        if (error.code !== "auth/popup-closed-by-user") {
          alert("Erro no Google Login: " + error.message);
        }
      });
  });
}

// Botão de Atualizar/Cadastrar Telefone
if (btnUpdatePhone) {
  btnUpdatePhone.addEventListener("click", () => {
    const user = auth.currentUser;
    if (!user) return;

    const rawPhone = prompt("Digite seu telefone com DDD (ex: 21999998888):");
    const cleanedPhone = formatPhoneNumber(rawPhone);

    if (!cleanedPhone || cleanedPhone.length < 12) {
      alert("Por favor, digite um número válido com DDD.");
      return;
    }

    database.ref(`users/${user.uid}`).update({
      phone: cleanedPhone,
      email: user.email ? user.email.toLowerCase().trim() : ""
    })
    .then(() => alert(`Telefone ${cleanedPhone} salvo com sucesso!`))
    .catch((error) => alert("Erro ao salvar telefone: " + error.message));
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
    listenToMyPrivacy(user.uid);

    if (user.email) {
      database.ref(`users/${user.uid}`).update({ email: user.email.toLowerCase().trim() });
    }
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
    if (auth.currentUser) {
      toggleUserRoute(auth.currentUser.uid, "Meu Trajeto", btnMyHistory);
    }
  });
}

// Rastreamento GPS Próprio
function startLocationTracking(uid) {
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      const latLng = [latitude, longitude];

      if (!userMarker) {
        userMarker = L.marker(latLng).addTo(map).bindPopup("Você está aqui");
        map.setView(latLng, 15);
      } else {
        userMarker.setLatLng(latLng);
      }

      const timestamp = Date.now();

      database.ref('locations/' + uid).set({ latitude, longitude, timestamp: firebase.database.ServerValue.TIMESTAMP });
      database.ref(`location_history/${uid}`).push({ latitude, longitude, timestamp });
    },
    (error) => console.error("Erro GPS: ", error),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// --- GERENCIAMENTO E ADIÇÃO DE AMIGOS (MELHORADO E CORRIGIDO) ---

if (friendSearchType) {
  friendSearchType.addEventListener("change", () => {
    if (friendSearchType.value === "email") {
      friendEmailInput.classList.remove("hidden");
      friendEmailInput.required = true;
      friendPhoneInput.classList.add("hidden");
      friendPhoneInput.required = false;
    } else {
      friendEmailInput.classList.add("hidden");
      friendEmailInput.required = false;
      friendPhoneInput.classList.remove("hidden");
      friendPhoneInput.required = true;
    }
  });
}

if (addFriendForm) {
  addFriendForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const searchType = friendSearchType ? friendSearchType.value : "email";
    
    // Busca ampla na lista inteira de usuários para evitar falhas de indexação do Realtime DB
    database.ref('users').once('value', (snapshot) => {
      if (!snapshot.exists()) {
        alert("Nenhum usuário cadastrado no sistema.");
        return;
      }

      let foundUid = null;
      let targetValue = "";

      if (searchType === "email") {
        targetValue = friendEmailInput.value.trim().toLowerCase();
        snapshot.forEach((child) => {
          const u = child.val();
          if (u && u.email && u.email.toLowerCase().trim() === targetValue) {
            foundUid = child.key;
          }
        });
      } else {
        const rawPhone = friendPhoneInput.value;
        targetValue = formatPhoneNumber(rawPhone);
        
        snapshot.forEach((child) => {
          const u = child.val();
          if (u && u.phone) {
            const formattedDbPhone = formatPhoneNumber(u.phone);
            if (formattedDbPhone === targetValue) {
              foundUid = child.key;
            }
          }
        });
      }

      if (!foundUid) {
        alert(`Usuário não encontrado com o ${searchType === "email" ? "e-mail" : "telefone"}: ${targetValue}.\n\nCertifique-se de que a pessoa já se cadastrou no aplicativo.`);
        return;
      }

      if (foundUid === auth.currentUser.uid) {
        alert("Você não pode adicionar seu próprio usuário.");
        return;
      }

      const updates = {};
      updates[`/friendships/${auth.currentUser.uid}/${foundUid}`] = "pending_sent";
      updates[`/friendships/${foundUid}/${auth.currentUser.uid}`] = "pending_received";

      database.ref().update(updates)
        .then(() => {
          alert("Solicitação enviada com sucesso!");
          if (friendEmailInput) friendEmailInput.value = "";
          if (friendPhoneInput) friendPhoneInput.value = "";
        })
        .catch(err => alert("Erro ao enviar solicitação: " + err.message));
    });
  });
}

function listenToFriendships(myUid) {
  database.ref(`friendships/${myUid}`).on('value', (snapshot) => {
    pendingRequestsList.innerHTML = "";
    friendsList.innerHTML = "";
    
    Object.keys(otherMarkers).forEach(uid => {
      map.removeLayer(otherMarkers[uid].marker);
      delete otherMarkers[uid];
    });

    if (!snapshot.exists()) return;

    snapshot.forEach((child) => {
      const friendUid = child.key;
      const status = child.val();

      database.ref(`users/${friendUid}`).once('value', (userSnap) => {
        const userData = userSnap.val() || {};
        const friendIdentifier = userData.email || userData.phone || friendUid;

        if (status === "pending_received") {
          renderPendingRequest(friendUid, friendIdentifier);
        } else if (status === "accepted") {
          renderFriendItem(friendUid, friendIdentifier);
          listenToFriendLocation(friendUid, friendIdentifier);
        }
      });
    });
  });
}

function renderPendingRequest(friendUid, friendIdentifier) {
  const item = document.createElement("div");
  item.className = "pending-request-item";
  item.innerHTML = `
    <span><strong>${friendIdentifier}</strong> quer compartilhar a localização.</span>
    <div style="margin-top: 5px;">
      <button class="btn-accept" onclick="acceptFriendRequest('${friendUid}')">Aceitar</button>
      <button class="btn-danger" onclick="rejectFriendRequest('${friendUid}')">Recusar</button>
    </div>
  `;
  pendingRequestsList.appendChild(item);
}

window.acceptFriendRequest = function(friendUid) {
  const myUid = auth.currentUser.uid;
  const updates = {};
  updates[`/friendships/${myUid}/${friendUid}`] = 'accepted';
  updates[`/friendships/${friendUid}/${myUid}`] = 'accepted';

  database.ref().update(updates).then(() => alert("Solicitação aceita!"));
};

window.rejectFriendRequest = function(friendUid) {
  const myUid = auth.currentUser.uid;
  const updates = {};
  updates[`/friendships/${myUid}/${friendUid}`] = null;
  updates[`/friendships/${friendUid}/${myUid}`] = null;

  database.ref().update(updates);
};

// --- RENDERIZAR ITEM DA LISTA DE AMIGOS COM BOTÃO ALTERNANTE ---
function renderFriendItem(friendUid, friendIdentifier) {
  const div = document.createElement("div");
  div.className = "friend-item";
  div.id = `friend-item-${friendUid}`;

  div.innerHTML = `
    <div class="friend-info">
      <strong>${friendIdentifier}</strong>
      <small id="time-status-${friendUid}" class="time-status">Aguardando dados...</small>
    </div>
    <button id="btn-route-${friendUid}" class="btn-history-small" onclick="toggleUserRoute('${friendUid}', '${friendIdentifier}', this)">Ver Trajeto (30d)</button>
  `;

  friendsList.appendChild(div);
}

function listenToFriendLocation(friendUid, friendIdentifier) {
  database.ref(`locations/${friendUid}`).on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const { latitude, longitude, timestamp } = data;
    const latLng = [latitude, longitude];

    if (!otherMarkers[friendUid]) {
      const marker = L.marker(latLng).addTo(map).bindPopup(`<b>${friendIdentifier}</b>`);
      otherMarkers[friendUid] = { marker, latLng };
    } else {
      otherMarkers[friendUid].marker.setLatLng(latLng);
      otherMarkers[friendUid].latLng = latLng;
    }

    updateLastSeenUI(friendUid, timestamp);
    checkProximityAlert(friendUid, friendIdentifier, latitude, longitude);
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

function checkProximityAlert(friendUid, friendIdentifier, friendLat, friendLng) {
  if (!userMarker) return;
  const myPos = userMarker.getLatLng();
  const distance = calculateDistance(myPos.lat, myPos.lng, friendLat, friendLng);
  const ALARM_RADIUS_METERS = 500;

  if (distance <= ALARM_RADIUS_METERS) {
    if (!alertedFriends.has(friendUid)) {
      alertedFriends.add(friendUid);

      const msg = `${friendIdentifier} está próximo de você (${Math.round(distance)}m)!`;

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Amigo Próximo!", { body: msg });
      } else {
        alert("⚠️ " + msg);
      }
    }
  } else {
    alertedFriends.delete(friendUid);
  }
}

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

// --- FUNÇÃO PARA MANIPULAR E ALTERNAR O DESENHO DA ROTA ---
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
  if (currentPolyline) {
    map.removeLayer(currentPolyline);
    currentPolyline = null;
  }
  
  if (activePolylineUid) {
    const prevBtn = document.getElementById(`btn-route-${activePolylineUid}`);
    if (prevBtn) {
      prevBtn.innerText = "Ver Trajeto (30d)";
      prevBtn.style.backgroundColor = "";
    }
  }

  if (activePolylineUid === (auth.currentUser ? auth.currentUser.uid : null)) {
    if (btnMyHistory) btnMyHistory.innerText = "Ver Meu Trajeto (30 dias)";
  }

  activePolylineUid = null;
}

function resetButtonState(targetUid, buttonElem) {
  if (!buttonElem) return;

  if (targetUid === (auth.currentUser ? auth.currentUser.uid : null)) {
    buttonElem.innerText = "Ver Meu Trajeto (30 dias)";
  } else {
    buttonElem.innerText = "Ver Trajeto (30d)";
  }
  buttonElem.style.backgroundColor = "";
}

function fetchAndDrawHistory(targetUid, title, buttonElem) {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

  database.ref(`location_history/${targetUid}`).once('value')
    .then((snapshot) => {
      if (!snapshot.exists()) {
        alert(`Nenhum histórico registrado no banco para ${title}.`);
        return;
      }

      const latLngs = [];

      snapshot.forEach((child) => {
        const val = child.val();
        if (
          val &&
          typeof val.latitude === 'number' &&
          typeof val.longitude === 'number'
        ) {
          const ts = typeof val.timestamp === 'number' ? val.timestamp : Date.now();
          if (ts >= thirtyDaysAgo) {
            latLngs.push([val.latitude, val.longitude]);
          }
        }
      });

      if (latLngs.length === 0) {
        alert(`Nenhum trajeto encontrado nos últimos 30 dias para ${title}.`);
        return;
      }

      if (latLngs.length === 1) {
        map.setView(latLngs[0], 16);
        L.popup()
          .setLatLng(latLngs[0])
          .setContent(`<b>Único ponto registrado de ${title}</b>`)
          .openOn(map);
      } else {
        currentPolyline = L.polyline(latLngs, { 
          color: '#0052d4', 
          weight: 5, 
          opacity: 0.8 
        }).addTo(map);

        map.fitBounds(currentPolyline.getBounds(), { padding: [40, 40] });
      }

      activePolylineUid = targetUid;

      if (buttonElem) {
        buttonElem.innerText = "❌ Ocultar Trajeto";
        buttonElem.style.backgroundColor = "#ef4444";
      }

      closeDrawer();
    })
    .catch((error) => {
      console.error("Erro ao carregar histórico:", error);
      alert("Erro ao buscar histórico: " + error.message);
    });
}