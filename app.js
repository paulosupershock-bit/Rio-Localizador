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

// Inicializa Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const database = firebase.database();

// Variáveis Globais
let map = null;
let userMarker = null;
let watchId = null;
const otherMarkers = {};
let currentPolyline = null;

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

// Drawer
const btnOpenDrawer = document.getElementById("btn-open-drawer");
const btnCloseDrawer = document.getElementById("btn-close-drawer");
const drawer = document.getElementById("drawer");
const overlay = document.getElementById("drawer-overlay");

// Funções para controle do Drawer
function openDrawer() {
  if (drawer && overlay) {
    drawer.classList.add("open");
    overlay.classList.remove("hidden");
  }
}

function closeDrawer() {
  if (drawer && overlay) {
    drawer.classList.remove("open");
    overlay.classList.add("hidden");
  }
}

if (btnOpenDrawer) btnOpenDrawer.addEventListener("click", openDrawer);
if (btnCloseDrawer) btnCloseDrawer.addEventListener("click", closeDrawer);
if (overlay) overlay.addEventListener("click", closeDrawer);

// MONITOR DE AUTENTICAÇÃO
auth.onAuthStateChanged((user) => {
  if (user) {
    // Esconde a tela de login completamente
    authScreen.classList.add("hidden");
    mapScreen.classList.remove("hidden");

    // Inicializa o mapa com pequeno atraso para renderizar no tamanho correto
    setTimeout(() => {
      initMap();
      if (map) map.invalidateSize();
    }, 200);

    startLocationTracking(user.uid);
  } else {
    // Mostra a tela de login
    authScreen.classList.remove("hidden");
    mapScreen.classList.add("hidden");
    if (watchId) navigator.geolocation.clearWatch(watchId);
  }
});

// LOGIN COM E-MAIL E SENHA
if (loginForm) {
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(emailInput.value, passwordInput.value)
      .catch((error) => {
        if (error.code === "auth/user-not-found" || error.code === "auth/invalid-credential") {
          alert("E-mail ou senha incorretos. Se ainda não tem conta, clique em 'Cadastrar'.");
        } else {
          alert("Erro no login: " + error.message);
        }
      });
  });
}

// CADASTRO DE USUÁRIO
if (btnRegister) {
  btnRegister.addEventListener("click", () => {
    if (!emailInput.value || !passwordInput.value) {
      alert("Preencha e-mail e senha para cadastrar.");
      return;
    }

    auth.createUserWithEmailAndPassword(emailInput.value, passwordInput.value)
      .then((cred) => {
        database.ref(`users/${cred.user.uid}`).set({
          email: cred.user.email.toLowerCase()
        });
        alert("Conta criada com sucesso!");
      })
      .catch((error) => alert("Erro ao cadastrar: " + error.message));
  });
}

// LOGIN COM GOOGLE
const googleProvider = new firebase.auth.GoogleAuthProvider();
const btnGoogleLogin = document.getElementById("btn-google-login");
if (btnGoogleLogin) {
  btnGoogleLogin.addEventListener("click", () => {
    auth.signInWithPopup(googleProvider)
      .then((result) => {
        database.ref(`users/${result.user.uid}`).update({
          email: result.user.email.toLowerCase()
        });
      })
      .catch((error) => {
        if (error.code !== "auth/popup-closed-by-user") {
          alert("Erro no Login com Google: " + error.message);
        }
      });
  });
}

// RECUPERAR SENHA
if (btnForgotPassword) {
  btnForgotPassword.addEventListener("click", () => {
    if (!emailInput.value) {
      alert("Digite seu e-mail no campo acima para redefinir a senha.");
      return;
    }
    auth.sendPasswordResetEmail(emailInput.value)
      .then(() => alert("E-mail de redefinição enviado com sucesso!"))
      .catch((error) => alert("Erro: " + error.message));
  });
}

// LOGOUT
if (btnLogout) {
  btnLogout.addEventListener("click", () => auth.signOut());
}

// INICIALIZAR MAPA
function initMap() {
  if (map) return;
  const initialCoords = [-22.9068, -43.1729]; // Rio de Janeiro

  map = L.map('map').setView(initialCoords, 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  // Ação do Botão Centralizar (Alvo 🎯)
  if (btnRecenter) {
    btnRecenter.addEventListener("click", () => {
      if (userMarker) {
        map.setView(userMarker.getLatLng(), 16);
      } else {
        alert("Aguardando sinal de GPS...");
      }
    });
  }
}

// RASTREAMENTO GPS
function startLocationTracking(uid) {
  if (!navigator.geolocation) {
    alert("Seu navegador não suporta geolocalização.");
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      const latLng = [latitude, longitude];

      if (!userMarker) {
        userMarker = L.marker(latLng).addTo(map).bindPopup("<b>Sua localização</b>");
        map.setView(latLng, 16);
      } else {
        userMarker.setLatLng(latLng);
      }

      // Salva no Firebase
      database.ref(`locations/${uid}`).set({
        latitude,
        longitude,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });
    },
    (error) => console.warn("GPS Warning:", error.message),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}