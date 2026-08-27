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

// Elementos da DOM
const authScreen = document.getElementById("auth-screen");
const mapScreen = document.getElementById("map-screen");
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const btnRegister = document.getElementById("btn-register");
const btnGoogleLogin = document.getElementById("btn-google-login");
const btnLogout = document.getElementById("btn-logout");
const btnRecenter = document.getElementById("btn-recenter");
const btnForgotPassword = document.getElementById("btn-forgot-password");

// Menu (Drawer)
const btnOpenDrawer = document.getElementById("btn-open-drawer");
const btnCloseDrawer = document.getElementById("btn-close-drawer");
const drawer = document.getElementById("drawer");
const overlay = document.getElementById("drawer-overlay");

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
    authScreen.classList.add("hidden");
    mapScreen.classList.remove("hidden");

    setTimeout(() => {
      initMap();
      if (map) map.invalidateSize();
    }, 200);

    startLocationTracking(user.uid);
  } else {
    authScreen.classList.remove("hidden");
    mapScreen.classList.add("hidden");
    if (watchId) navigator.geolocation.clearWatch(watchId);
  }
});

// LOGIN COM E-MAIL E SENHA
if (loginForm) {
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      alert("Por favor, preencha o e-mail e a senha.");
      return;
    }

    auth.signInWithEmailAndPassword(email, password)
      .catch((error) => {
        console.error("Erro no login:", error);
        if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
          alert("E-mail ou senha incorretos. Caso não tenha conta, clique em 'Cadastrar'.");
        } else if (error.code === "auth/invalid-email") {
          alert("Formato de e-mail inválido.");
        } else {
          alert("Erro ao entrar: " + error.message);
        }
      });
  });
}

// CADASTRO DE USUÁRIO
if (btnRegister) {
  btnRegister.addEventListener("click", () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      alert("Preencha e-mail e senha no formulário antes de clicar em Cadastrar.");
      return;
    }

    if (password.length < 6) {
      alert("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    auth.createUserWithEmailAndPassword(email, password)
      .then((cred) => {
        database.ref(`users/${cred.user.uid}`).set({
          email: cred.user.email.toLowerCase()
        });
        alert("Conta cadastrada com sucesso!");
      })
      .catch((error) => {
        console.error("Erro no cadastro:", error);
        if (error.code === "auth/email-already-in-use") {
          alert("Este e-mail já está cadastrado. Tente entrar.");
        } else {
          alert("Erro no cadastro: " + error.message);
        }
      });
  });
}

// LOGIN COM GOOGLE
if (btnGoogleLogin) {
  btnGoogleLogin.addEventListener("click", () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
      .then((result) => {
        if (result.user) {
          database.ref(`users/${result.user.uid}`).update({
            email: result.user.email.toLowerCase()
          });
        }
      })
      .catch((error) => {
        console.error("Erro Google Login:", error);
        if (error.code !== "auth/popup-closed-by-user" && error.code !== "auth/cancelled-popup-request") {
          alert("Erro no Login com Google: " + error.message);
        }
      });
  });
}

// RECUPERAR SENHA
if (btnForgotPassword) {
  btnForgotPassword.addEventListener("click", () => {
    const email = emailInput.value.trim();
    if (!email) {
      alert("Digite seu e-mail no campo acima para receber o link de redefinição.");
      return;
    }
    auth.sendPasswordResetEmail(email)
      .then(() => alert("E-mail de redefinição enviado com sucesso! Verifique sua caixa de entrada."))
      .catch((error) => alert("Erro ao enviar e-mail: " + error.message));
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

  if (btnRecenter) {
    L.DomEvent.disableClickPropagation(btnRecenter);

    btnRecenter.addEventListener("click", (e) => {
      e.stopPropagation();
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