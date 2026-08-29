/* ==========================================================================
   RIO LOCALIZADOR - APP.JS (CÓDIGO COMPLETO E ATUALIZADO)
   ========================================================================== */

// --- CONFIGURAÇÃO E INICIALIZAÇÃO DO FIREBASE ---
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

// ⚠️ INSIRA ABAIXO O SEU E-MAIL DE ADMINISTRADOR DO FIREBASE ⚠️
const ADMIN_EMAIL = "paulo.supershock@gmail.com"; 

// --- VARIÁVEIS GLOBAIS DO MAPA ---
let map = null;
let userMarker = null;
let watchId = null;
const otherMarkers = {};
let currentPolyline = null;
let activePolylineUid = null;

// --- ELEMENTOS DO DOM ---
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

// Drawer & Ações
const btnOpenDrawer = document.getElementById("btn-open-drawer");
const btnCloseDrawer = document.getElementById("btn-close-drawer");
const drawer = document.getElementById("drawer");
const overlay = document.getElementById("drawer-overlay");
const friendsList = document.getElementById("friends-list") || document.getElementById("contactsList");
const btnMyHistory = document.getElementById("btn-toggle-history");
const btnTogglePrivacy = document.getElementById("btn-toggle-privacy");

// Admin e Formulário de Adição
const adminSection = document.getElementById("admin-section");
const btnAdminRegisterUser = document.getElementById("btn-admin-register-user") || document.getElementById("btnAdminRegisterUser");
const friendSearchType = document.getElementById("friend-search-type");
const friendEmailInput = document.getElementById("friend-email-input");
const friendPhoneInput = document.getElementById("friend-phone-input");
const addFriendForm = document.getElementById("add-friend-form");

// --- UTILS: FORMATAÇÃO DE TELEFONE ---
function formatPhoneNumber(phoneInput) {
  if (!phoneInput) return "";
  let cleaned = ('' + phoneInput).replace(/\D/g, "");
  if (!cleaned) return "";

  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = "55" + cleaned;
  }
  return "+" + cleaned;
}

// --- CONTROLE DO MENU LATERAL (DRAWER) ---
function openDrawer() {
  if (drawer) drawer.classList.add("open");
  if (overlay) overlay.classList.remove("hidden");
}

function closeDrawer() {
  if (drawer) drawer.classList.remove("open");
  if (overlay) overlay.classList.add("hidden");
}

if (btnOpenDrawer) btnOpenDrawer.addEventListener("click", openDrawer);
if (btnCloseDrawer) btnCloseDrawer.addEventListener("click", closeDrawer);
if (overlay) overlay.addEventListener("click", closeDrawer);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && drawer && drawer.classList.contains('open')) {
    closeDrawer();
  }
});

// ==========================================================================
// 1. AUTENTICAÇÃO (LOGIN, GOOGLE, CADASTRAR-SE)
// ==========================================================================

// Login E-mail e Senha
if (loginForm) {
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(emailInput.value, passwordInput.value)
      .catch((error) => alert("Erro ao entrar: " + error.message));
  });
}

// Login com Google
const googleProvider = new firebase.auth.GoogleAuthProvider();
if (btnGoogleLogin) {
  btnGoogleLogin.addEventListener("click", () => {
    auth.signInWithPopup(googleProvider)
      .then((result) => {
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

// Criar Conta Própria
if (btnRegister) {
  btnRegister.addEventListener("click", () => {
    if (!emailInput.value || !passwordInput.value) {
      alert("Preencha e-mail e senha para cadastrar.");
      return;
    }
    
    const rawPhone = prompt("Digite seu telefone com DDD (ex: 21999998888):") || "";
    const cleanedPhone = formatPhoneNumber(rawPhone);
    const userEmail = emailInput.value.toLowerCase().trim();

    auth.createUserWithEmailAndPassword(userEmail, passwordInput.value)
      .then((cred) => {
        database.ref(`users/${cred.user.uid}`).set({
          uid: cred.user.uid,
          email: userEmail,
          phone: cleanedPhone,
          displayName: userEmail,
          isHistoryPrivate: false
        });
        alert("Conta criada com sucesso!");
      })
      .catch((error) => alert("Erro ao cadastrar: " + error.message));
  });
}

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

if (btnLogout) btnLogout.addEventListener("click", () => auth.signOut());

// ==========================================================================
// 2. EXCLUSIVIDADE DE CADASTRO PARA ADMIN E BUSCA DE AMIGOS
// ==========================================================================
if (btnAdminRegisterUser) {
  btnAdminRegisterUser.addEventListener("click", async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.email.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase().trim()) {
      alert("Acesso negado: Apenas o administrador pode cadastrar usuários no banco de dados.");
      return;
    }

    const rawPhone = prompt("Digite o TELEFONE com DDD do contato (ex: 21999998888):");
    if (!rawPhone) return;

    const cleanedPhone = formatPhoneNumber(rawPhone);
    if (!cleanedPhone || cleanedPhone.length < 12) {
      alert("Por favor, digite um número de telefone válido com DDD.");
      return;
    }

    const optionalEmail = prompt("Digite o E-MAIL do contato (OPCIONAL):") || "";
    const userEmail = optionalEmail.trim().toLowerCase();
    const displayName = prompt("Digite o NOME do contato:") || cleanedPhone;

    try {
      const myUid = currentUser.uid;
      const newUserRef = database.ref('users').push();
      const newFriendUid = newUserRef.key;

      const updates = {};
      updates[`/users/${newFriendUid}`] = {
        uid: newFriendUid,
        phone: cleanedPhone,
        email: userEmail,
        displayName: displayName,
        isHistoryPrivate: false,
        createdManual: true
      };

      updates[`/friendships/${myUid}/${newFriendUid}`] = "accepted";
      updates[`/friendships/${newFriendUid}/${myUid}`] = "accepted";

      await database.ref().update(updates);
      alert(`✅ Contato ${displayName} cadastrado e vinculado com sucesso!`);
      loadContactsList(myUid);
    } catch (error) {
      alert("Erro ao cadastrar contato: " + error.message);
    }
  });
}

// Alternância dos campos de Busca (Telefone / E-mail)
if (friendSearchType) {
  friendSearchType.addEventListener("change", () => {
    if (friendSearchType.value === "email") {
      if (friendEmailInput) { friendEmailInput.classList.remove("hidden"); friendEmailInput.required = true; }
      if (friendPhoneInput) { friendPhoneInput.classList.add("hidden"); friendPhoneInput.required = false; friendPhoneInput.value = ""; }
    } else {
      if (friendPhoneInput) { friendPhoneInput.classList.remove("hidden"); friendPhoneInput.required = true; }
      if (friendEmailInput) { friendEmailInput.classList.add("hidden"); friendEmailInput.required = false; friendEmailInput.value = ""; }
    }
  });
}

// Form de Adicionar Amigo
if (addFriendForm) {
  addFriendForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const searchType = friendSearchType ? friendSearchType.value : "phone";
    const myUid = auth.currentUser ? auth.currentUser.uid : null;

    if (!myUid) {
      alert("Você precisa estar logado para enviar uma solicitação.");
      return;
    }

    database.ref('users').once('value', (snapshot) => {
      if (!snapshot.exists()) {
        alert("Nenhum usuário encontrado no sistema.");
        return;
      }

      let foundUid = null;
      let targetValue = "";

      if (searchType === "phone" && friendPhoneInput) {
        targetValue = formatPhoneNumber(friendPhoneInput.value);
        snapshot.forEach((child) => {
          const u = child.val();
          if (u && u.phone && formatPhoneNumber(u.phone) === targetValue) foundUid = child.key;
        });
      } else if (friendEmailInput) {
        targetValue = friendEmailInput.value.trim().toLowerCase();
        snapshot.forEach((child) => {
          const u = child.val();
          if (u && u.email && u.email.trim().toLowerCase() === targetValue) foundUid = child.key;
        });
      }

      if (!foundUid) {
        alert(`Usuário não encontrado com o ${searchType === "phone" ? "telefone" : "e-mail"}: ${targetValue}`);
        return;
      }

      if (foundUid === myUid) {
        alert("Você não pode adicionar seu próprio usuário.");
        return;
      }

      const updates = {};
      updates[`/friendships/${myUid}/${foundUid}`] = "accepted";
      updates[`/friendships/${foundUid}/${myUid}`] = "accepted";

      database.ref().update(updates)
        .then(() => {
          alert("Contato adicionado com sucesso!");
          if (friendPhoneInput) friendPhoneInput.value = "";
          if (friendEmailInput) friendEmailInput.value = "";
          loadContactsList(myUid);
        })
        .catch(err => alert("Erro ao adicionar contato: " + err.message));
    });
  });
}

// ==========================================================================
// 3. SESSÃO, MAPA E RASTREAMENTO GPS
// ==========================================================================
auth.onAuthStateChanged((user) => {
  if (user) {
    if (authScreen) authScreen.classList.add("hidden");
    if (mapScreen) mapScreen.classList.remove("hidden");
    
    setTimeout(() => {
      initMap();
      if (map) map.invalidateSize();
    }, 200);

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
  const rioCoords = [-22.9068, -43.1729];
  map = L.map('map').setView(rioCoords, 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  if (btnRecenter) {
    btnRecenter.addEventListener("click", () => {
      if (userMarker) map.setView(userMarker.getLatLng(), 16);
    });
  }

  if (btnMyHistory) {
    btnMyHistory.addEventListener("click", () => {
      if (auth.currentUser) {
        toggleUserRoute(auth.currentUser.uid, "Meu Trajeto", btnMyHistory);
      }
    });
  }
}

function startLocationTracking(uid) {
  if (!navigator.geolocation) return;

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

// ==========================================================================
// 4. PERMISSÕES DE ADMIN & LISTAGEM DE CONTATOS
// ==========================================================================
function checkAdminPermissions(user) {
  const isUserAdmin = user && user.email && user.email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();

  if (adminSection) {
    if (isUserAdmin) {
      adminSection.classList.remove("hidden");
      adminSection.style.display = "block";
    } else {
      adminSection.classList.add("hidden");
      adminSection.style.display = "none";
    }
  }

  if (btnTogglePrivacy) {
    if (isUserAdmin) {
      btnTogglePrivacy.classList.remove("hidden");
      btnTogglePrivacy.style.display = "block";

      database.ref(`users/${user.uid}/isHistoryPrivate`).on('value', (snap) => {
        const isPrivate = snap.exists() ? snap.val() === true : false;
        btnTogglePrivacy.innerText = isPrivate 
          ? "Privacidade: Histórico Oculto (Privado)" 
          : "Privacidade: Histórico Visível para Amigos";
      });
    } else {
      btnTogglePrivacy.classList.add("hidden");
      btnTogglePrivacy.style.display = "none";
    }
  }
}

if (btnTogglePrivacy) {
  btnTogglePrivacy.addEventListener("click", () => {
    const user = auth.currentUser;
    if (!user) return;

    const privacyRef = database.ref(`users/${user.uid}/isHistoryPrivate`);
    privacyRef.once('value', (snap) => {
      const currentState = snap.exists() ? snap.val() === true : false;
      const newState = !currentState;
      privacyRef.set(newState).then(() => {
        alert(newState ? "Seu histórico agora está OCULTO." : "Seu histórico agora está VISÍVEL.");
      });
    });
  });
}

function loadContactsList(myUid) {
  database.ref(`friendships/${myUid}`).on('value', async (snapshot) => {
    if (!friendsList) return;
    friendsList.innerHTML = '';

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
          renderContactCard(friendUid, friendData);
          listenToFriendLocation(friendUid, friendData.displayName || friendData.phone);
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
      <small id="time-status-${friendUid}" class="time-status">Aguardando dados GPS...</small>
    </div>
    <button id="btn-route-${friendUid}" class="btn-history-small" onclick="toggleUserRoute('${friendUid}', '${name}', this)">Ver Trajeto (30d)</button>
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

// ==========================================================================
// 5. TRAJETO E HISTÓRICO DE 30 DIAS
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

  database.ref(`users/${targetUid}/isHistoryPrivate`).once('value', (privacySnap) => {
    const isPrivate = privacySnap.exists() ? privacySnap.val() === true : false;
    const isMe = auth.currentUser && auth.currentUser.uid === targetUid;

    if (isPrivate && !isMe) {
      alert(`O usuário ${title} definiu o histórico de 30 dias como privado.`);
      return;
    }

    database.ref(`location_history/${targetUid}`).once('value')
      .then((snapshot) => {
        if (!snapshot.exists()) {
          alert(`Nenhum histórico registrado para ${title}.`);
          return;
        }

        const latLngs = [];
        snapshot.forEach((child) => {
          const val = child.val();
          if (val && typeof val.latitude === 'number' && typeof val.longitude === 'number') {
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
  });
}