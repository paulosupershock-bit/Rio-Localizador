// ==========================================================================
// RIO LOCALIZADOR - APP.JS COMPLETO E ATUALIZADO
// ==========================================================================

// Variáveis Globais de Estado
let map;
let otherMarkers = {};
let currentPolyline = null;
let activePolylineUid = null;
let realTimeListeners = {};
let activeProximityTargets = {};

// Elementos do DOM (inicializados após o carregamento)
let authContainer, mapContainer, drawer, drawerOverlay;
let loginForm, registerForm, btnShowRegister, btnShowLogin, btnGoogleLogin;
let emailInput, passwordInput, regEmailInput, regPasswordInput, regPhoneInput, regNameInput;
let btnToggleDrawer, btnCloseDrawer, logoutBtn, userEmailDisplay;
let whatsappModal, btnOpenWhatsappModal, btnSendWhatsappSelected, whatsappManualInput;
let addFriendBtn, friendInputType, friendInputVal;
let privacyToggleBtn, historyRouteBtn;

document.addEventListener("DOMContentLoaded", () => {
  // Inicialização de Referências do DOM
  authContainer = document.getElementById("auth-container");
  mapContainer = document.getElementById("map-container");
  drawer = document.getElementById("drawer");
  drawerOverlay = document.getElementById("drawer-overlay");

  loginForm = document.getElementById("login-form");
  registerForm = document.getElementById("register-form");
  btnShowRegister = document.getElementById("btn-show-register");
  btnShowLogin = document.getElementById("btn-show-login");
  btnGoogleLogin = document.getElementById("btn-google-login");

  emailInput = document.getElementById("email-input");
  passwordInput = document.getElementById("password-input");
  regEmailInput = document.getElementById("reg-email-input");
  regPasswordInput = document.getElementById("reg-password-input");
  regPhoneInput = document.getElementById("reg-phone-input");
  regNameInput = document.getElementById("reg-name-input");

  btnToggleDrawer = document.getElementById("btn-toggle-drawer");
  btnCloseDrawer = document.getElementById("btn-close-drawer");
  logoutBtn = document.getElementById("logout-btn");
  userEmailDisplay = document.getElementById("user-email-display");

  whatsappModal = document.getElementById("whatsapp-modal");
  btnOpenWhatsappModal = document.getElementById("btn-open-whatsapp-modal");
  btnSendWhatsappSelected = document.getElementById("btn-send-whatsapp-selected");
  whatsappManualInput = document.getElementById("whatsapp-manual-input");

  addFriendBtn = document.getElementById("add-friend-btn");
  friendInputType = document.getElementById("friend-input-type");
  friendInputVal = document.getElementById("friend-input-val");

  privacyToggleBtn = document.getElementById("privacy-toggle-btn");
  historyRouteBtn = document.getElementById("history-route-btn");

  // Configuração Inicial de Autenticação Observer e Tratamento de Redirecionamento do Google
  auth.getRedirectResult().then((result) => {
    if (result.user) {
      saveUserDataToFirebase(result.user);
    }
  }).catch((error) => {
    console.error("Erro no retorno do redirecionamento do Google:", error);
  });

  auth.onAuthStateChanged((user) => {
    if (user) {
      if (authContainer) authContainer.classList.add("hidden");
      if (mapContainer) mapContainer.classList.remove("hidden");
      
      if (userEmailDisplay) userEmailDisplay.innerText = user.email || user.displayName || "Usuário";
      
      // Garante que o usuário está salvo no Firebase
      saveUserDataToFirebase(user);

      // Verifica se entrou através de um link compartilhado via WhatsApp (?phone=...)
      checkUrlSharedPhone(user.uid);

      initMapIfNeeded();
      startLocationBroadcasting(user.uid);
      loadFriendsList(user.uid);
      loadPendingRequests(user.uid);
      loadUserData(user.uid);
    } else {
      if (mapContainer) mapContainer.classList.add("hidden");
      if (authContainer) authContainer.classList.remove("hidden");
      cleanupListeners();
    }
  });

  setupAuthEvents();
  setupDrawerEvents();
  setupWhatsappModalEvents();
  setupFriendSystem();
});

// ==========================================================================
// 1. AUTENTICAÇÃO E PERSISTÊNCIA NO BANCO
// ==========================================================================
function saveUserDataToFirebase(user, customData = {}) {
  if (!user) return;
  const userRef = database.ref('users/' + user.uid);
  
  userRef.once('value').then((snapshot) => {
    const existingData = snapshot.val() || {};
    const phoneToSave = customData.phone || existingData.phone || regPhoneInput?.value || "";
    const nameToSave = customData.name || existingData.name || regNameInput?.value || user.displayName || "Usuário";

    const userData = {
      uid: user.uid,
      email: user.email || "",
      name: nameToSave,
      phone: phoneToSave,
      isHistoryPrivate: existingData.isHistoryPrivate || false,
      lastUpdated: firebase.database.ServerValue.TIMESTAMP
    };

    userRef.update(userData);
    if (phoneToSave) {
      localStorage.setItem("rio_shared_phone", phoneToSave);
    }
  });
}

function checkUrlSharedPhone(currentMyUid) {
  const urlParams = new URLSearchParams(window.location.search);
  const sharedPhone = urlParams.get('phone');
  
  if (!sharedPhone || !currentMyUid) return;

  const cleanPhone = sharedPhone.replace(/\D/g, "");

  database.ref('users').orderByChild('phone').equalTo(cleanPhone).once('value').then((snapshot) => {
    if (snapshot.exists()) {
      let targetUid = null;
      snapshot.forEach((child) => {
        targetUid = child.key;
      });

      if (targetUid && targetUid !== currentMyUid) {
        // Conecta automaticamente reciprocamente
        database.ref(`friendships/${currentMyUid}/${targetUid}`).set(true);
        database.ref(`friendships/${targetUid}/${currentMyUid}`).set(true);
        
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  });
}

function setupAuthEvents() {
  if (btnShowRegister && registerForm && loginForm) {
    btnShowRegister.addEventListener("click", () => {
      loginForm.classList.add("hidden");
      registerForm.classList.remove("hidden");
    });
  }

  if (btnShowLogin && registerForm && loginForm) {
    btnShowLogin.addEventListener("click", () => {
      registerForm.classList.add("hidden");
      loginForm.classList.remove("hidden");
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      auth.signInWithEmailAndPassword(emailInput.value, passwordInput.value)
        .catch(err => alert("Erro ao entrar: " + err.message));
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = regEmailInput.value;
      const password = regPasswordInput.value;
      const phone = regPhoneInput?.value || "";
      const name = regNameInput?.value || "Usuário";

      auth.createUserWithEmailAndPassword(email, password)
        .then((cred) => {
          saveUserDataToFirebase(cred.user, { phone, name });
        })
        .catch(err => alert("Erro ao cadastrar: " + err.message));
    });
  }

  if (btnGoogleLogin) {
    btnGoogleLogin.addEventListener("click", (e) => {
      e.preventDefault();
      const provider = new firebase.auth.GoogleAuthProvider();
      auth.signInWithRedirect(provider).catch((err) => {
        alert("Erro no login com Google: " + err.message);
      });
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      auth.signOut();
    });
  }
}

// ==========================================================================
// 2. MAPA E GEOLOCALIZAÇÃO
// ==========================================================================
function initMapIfNeeded() {
  if (map) return;
  map = L.map('map').setView([-22.9068, -43.1729], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);
}

function startLocationBroadcasting(uid) {
  if (!navigator.geolocation) {
    alert("Geolocalização não é suportada pelo seu navegador.");
    return;
  }

  navigator.geolocation.watchPosition((position) => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const timestamp = Date.now();

    database.ref(`locations/${uid}`).set({
      latitude: lat,
      longitude: lng,
      timestamp: timestamp
    });

    database.ref(`location_history/${uid}`).push({
      latitude: lat,
      longitude: lng,
      timestamp: timestamp
    });
  }, (err) => {
    console.warn("Erro ao obter geolocalização: " + err.message);
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 });
}

// ==========================================================================
// 3. MENU LATERAL (DRAWER)
// ==========================================================================
function setupDrawerEvents() {
  if (btnToggleDrawer) {
    btnToggleDrawer.addEventListener("click", () => {
      if (drawer) drawer.classList.add("open");
      if (drawerOverlay) drawerOverlay.classList.remove("hidden");
    });
  }

  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener("click", closeDrawer);
  }

  if (drawerOverlay) {
    drawerOverlay.addEventListener("click", closeDrawer);
  }
}

function closeDrawer() {
  if (drawer) drawer.classList.remove("open");
  if (drawerOverlay) drawerOverlay.classList.add("hidden");
}

// ==========================================================================
// 4. MODAL DE WHATSAPP
// ==========================================================================
function setupWhatsappModalEvents() {
  if (btnOpenWhatsappModal) {
    btnOpenWhatsappModal.addEventListener("click", () => {
      if (whatsappModal) whatsappModal.classList.remove("hidden");
      if (whatsappManualInput) whatsappManualInput.value = "";
    });
  }

  window.closeWhatsappModal = function() {
    if (whatsappModal) whatsappModal.classList.add("hidden");
  };

  if (btnSendWhatsappSelected) {
    btnSendWhatsappSelected.addEventListener("click", () => {
      if (!whatsappManualInput) return;
      
      let destination = whatsappManualInput.value.trim();
      if (!destination) {
        alert("Por favor, digite um número de contato ou um e-mail.");
        return;
      }

      const currentAppUrl = window.location.href.split('?')[0];
      const currentUserPhone = auth.currentUser ? (localStorage.getItem("rio_shared_phone") || "") : "";
      const shareLink = `${currentAppUrl}?phone=${encodeURIComponent(currentUserPhone)}`;
      const message = encodeURIComponent(`Olá! Acompanhe minha localização e rotas no Rio Localizador através deste link: ${shareLink}`);

      if (destination.includes("@")) {
        window.location.href = `mailto:${destination}?subject=${encodeURIComponent("Convite - Rio Localizador")}&body=${message}`;
      } else {
        let formattedPhone = destination.replace(/\D/g, "");
        if (formattedPhone.length === 10 || formattedPhone.length === 11) {
          formattedPhone = "55" + formattedPhone;
        }
        const whatsappUrl = `https://wa.me/${formattedPhone}?text=${message}`;
        window.open(whatsappUrl, '_blank');
      }

      window.closeWhatsappModal();
    });
  }
}

// ==========================================================================
// 5. SISTEMA DE AMIGOS E PRIVACIDADE
// ==========================================================================
function setupFriendSystem() {
  if (addFriendBtn) {
    addFriendBtn.addEventListener("click", () => {
      const val = friendInputVal.value.trim();
      if (!val) {
        alert("Preencha o campo de busca do amigo.");
        return;
      }

      const searchType = friendInputType.value;
      database.ref('users').orderByChild(searchType).equalTo(val).once('value').then((snapshot) => {
        if (!snapshot.exists()) {
          alert("Nenhum usuário encontrado com esse " + (searchType === 'phone' ? 'telefone' : 'e-mail') + ".");
          return;
        }

        let targetUid = null;
        snapshot.forEach((child) => {
          targetUid = child.key;
        });

        const myUid = auth.currentUser.uid;
        if (targetUid === myUid) {
          alert("Você não pode adicionar a si mesmo.");
          return;
        }

        database.ref(`friend_requests/${targetUid}/${myUid}`).set({
          email: auth.currentUser.email,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
          alert("Solicitação de amizade enviada com sucesso!");
          friendInputVal.value = "";
        });
      });
    });
  }

  if (privacyToggleBtn) {
    privacyToggleBtn.addEventListener("click", () => {
      const myUid = auth.currentUser.uid;
      database.ref(`users/${myUid}/isHistoryPrivate`).once('value').then((snap) => {
        const currentVal = snap.val() || false;
        database.ref(`users/${myUid}/isHistoryPrivate`).set(!currentVal).then(() => {
          updatePrivacyButtonState(!currentVal);
        });
      });
    });
  }
}

function loadUserData(uid) {
  database.ref(`users/${uid}`).on('value', (snap) => {
    const data = snap.val();
    if (data && data.phone) {
      localStorage.setItem("rio_shared_phone", data.phone);
    }
    const isPrivate = data ? (data.isHistoryPrivate || false) : false;
    updatePrivacyButtonState(isPrivate);
  });
}

function updatePrivacyButtonState(isPrivate) {
  if (!privacyToggleBtn) return;
  if (isPrivate) {
    privacyToggleBtn.innerText = "Privacidade: Histórico Oculto";
    privacyToggleBtn.classList.add("btn-warning");
    privacyToggleBtn.classList.remove("btn-primary");
  } else {
    privacyToggleBtn.innerText = "Privacidade: Histórico Visível";
    privacyToggleBtn.classList.remove("btn-warning");
    privacyToggleBtn.classList.add("btn-primary");
  }
}

function loadFriendsList(myUid) {
  const container = document.getElementById("friends-list-container");
  if (!container) return;

  database.ref(`friendships/${myUid}`).on('value', (snapshot) => {
    container.innerHTML = "";
    if (!snapshot.exists()) {
      container.innerHTML = '<p class="empty-msg">Nenhum contato adicionado ainda.</p>';
      return;
    }

    snapshot.forEach((child) => {
      const friendUid = child.key;
      database.ref(`users/${friendUid}`).once('value').then((userSnap) => {
        const friendData = userSnap.val();
        if (!friendData) return;

        listenToFriendLocation(friendUid, friendData.name);

        const item = document.createElement("div");
        item.className = "friend-item";
        item.innerHTML = `
          <div class="friend-info">
            <strong>${friendData.name}</strong>
            <span class="time-status" id="time-status-${friendUid}">Carregando status...</span>
          </div>
          <button class="btn btn-primary btn-history-small" onclick="toggleUserRouteHistory('${friendUid}', '${friendData.name}', this)">Ver Trajeto</button>
          <button class="btn btn-secondary btn-history-small" onclick="viewKmHistory('${friendUid}', '${friendData.name}')">Histórico KM</button>
        `;
        container.appendChild(item);
      });
    });
  });
}

function loadPendingRequests(myUid) {
  const container = document.getElementById("pending-requests-container");
  if (!container) return;

  database.ref(`friend_requests/${myUid}`).on('value', (snapshot) => {
    container.innerHTML = "";
    if (!snapshot.exists()) {
      container.innerHTML = '<p class="empty-msg">Nenhuma solicitação pendente.</p>';
      return;
    }

    snapshot.forEach((child) => {
      const requesterUid = child.key;
      const reqData = child.val();

      database.ref(`users/${requesterUid}`).once('value').then((userSnap) => {
        const reqUser = userSnap.val() || { name: reqData.email };

        const item = document.createElement("div");
        item.className = "pending-request-item";
        item.innerHTML = `
          <span><strong>${reqUser.name}</strong> quer ser seu amigo.</span>
          <button class="btn btn-accept" onclick="acceptFriendRequest('${requesterUid}')">Aceitar</button>
        `;
        container.appendChild(item);
      });
    });
  });
}

window.acceptFriendRequest = function(requesterUid) {
  const myUid = auth.currentUser.uid;
  
  const updates = {};
  updates[`friendships/${myUid}/${requesterUid}`] = true;
  updates[`friendships/${requesterUid}/${myUid}`] = true;
  updates[`friend_requests/${myUid}/${requesterUid}`] = null;

  database.ref().update(updates).then(() => {
    alert("Amizade aceita com sucesso!");
  });
};

// ==========================================================================
// 6. RASTREAMENTO EM TEMPO REAL E HISTÓRICOS DE ROTA / KM
// ==========================================================================
function listenToFriendLocation(friendUid, friendName) {
  if (realTimeListeners[friendUid]) return;
  realTimeListeners[friendUid] = database.ref(`locations/${friendUid}`);
  
  realTimeListeners[friendUid].on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    database.ref(`users/${friendUid}/isHistoryPrivate`).once('value').then((snap) => {
      const isPrivate = snap.val() || false;
      const isRealtimeActive = activeProximityTargets[friendUid] && activeProximityTargets[friendUid].realtimeActive;

      if (isPrivate && !isRealtimeActive) {
        if (otherMarkers[friendUid]) {
          map.removeLayer(otherMarkers[friendUid]);
          delete otherMarkers[friendUid];
        }
        return;
      }

      const latLng = [data.latitude, data.longitude];
      const timeAgo = data.timestamp ? Math.round((Date.now() - data.timestamp) / 60000) : null;
      const timeStr = timeAgo !== null ? (timeAgo < 1 ? "Agora mesmo" : `Há ${timeAgo} min`) : "";

      const timeStatusEl = document.getElementById(`time-status-${friendUid}`);
      if (timeStatusEl) timeStatusEl.innerText = `Atualizado: ${timeStr}`;

      if (!otherMarkers[friendUid]) {
        otherMarkers[friendUid] = L.marker(latLng).addTo(map).bindPopup(friendName);
        otherMarkers[friendUid].latLng = latLng;
      } else {
        otherMarkers[friendUid].setLatLng(latLng);
        otherMarkers[friendUid].latLng = latLng;
      }

      if (activePolylineUid === friendUid) {
        updateLivePolyline(friendUid);
      }
    });
  });
}

window.toggleUserRouteHistory = function(uid, name, btnElement) {
  const isMe = auth.currentUser && auth.currentUser.uid === uid;
  
  database.ref(`location_history/${uid}`).orderByChild('timestamp').limitToLast(500).once('value').then((snapshot) => {
    if (!snapshot.exists()) {
      alert(`Nenhum trajeto registrado para ${name}.`);
      return;
    }

    if (activePolylineUid === uid) {
      if (currentPolyline) map.removeLayer(currentPolyline);
      currentPolyline = null;
      activePolylineUid = null;
      if (btnElement) btnElement.classList.remove("btn-primary");
      return;
    }

    if (currentPolyline) map.removeLayer(currentPolyline);

    let latLngs = [];
    snapshot.forEach((child) => {
      const pt = child.val();
      if (pt.latitude && pt.longitude) {
        latLngs.push([pt.latitude, pt.longitude]);
      }
    });

    if (latLngs.length > 0) {
      currentPolyline = L.polyline(latLngs, { color: isMe ? '#2563eb' : '#dc2626', weight: 4 }).addTo(map);
      map.fitBounds(currentPolyline.getBounds());
      activePolylineUid = uid;
      alert(`🗺️ Trajeto exibido no mapa para ${name}!`);
    } else {
      alert("Nenhum ponto válido encontrado.");
    }
  });
};

window.viewKmHistory = function(friendUid, contactName) {
  const myUid = auth.currentUser.uid;
  database.ref(`route_km_sessions/${myUid}/${friendUid}`).once('value').then((snapshot) => {
    if (!snapshot.exists()) {
      alert(`Nenhum histórico de KM gravado para ${contactName}.`);
      return;
    }
    let msg = `📊 Histórico de KM / Rotas - ${contactName}:\n\n`;
    snapshot.forEach((child) => {
      const v = child.val();
      msg += `⏱️ Início: ${v.startDateTime}\n⏹️ Fim: ${v.endDateTime}\n📏 Distância: ${v.traveledFormatted}\n--------------------------\n`;
    });
    alert(msg);
  });
};

function updateLivePolyline(friendUid) {
  database.ref(`location_history/${friendUid}`).orderByChild('timestamp').limitToLast(100).once('value').then((snapshot) => {
    let latLngs = [];
    snapshot.forEach((child) => {
      const pt = child.val();
      if (pt.latitude && pt.longitude) latLngs.push([pt.latitude, pt.longitude]);
    });
    if (latLngs.length > 1 && activePolylineUid === friendUid) {
      if (currentPolyline) map.removeLayer(currentPolyline);
      currentPolyline = L.polyline(latLngs, { color: '#059669', weight: 4 }).addTo(map);
    }
  });
}

function cleanupListeners() {
  Object.keys(realTimeListeners).forEach((uid) => {
    if (realTimeListeners[uid]) realTimeListeners[uid].off();
  });
  realTimeListeners = {};
}