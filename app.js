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

// Seleção dos elementos do Drawer
const drawer = document.getElementById("drawer");
const drawerOverlay = document.getElementById("drawer-overlay");
const btnOpenDrawer = document.getElementById("btn-open-drawer");
const btnCloseDrawer = document.getElementById("btn-close-drawer");
const addFriendForm = document.getElementById("add-friend-form");
const friendEmailInput = document.getElementById("friend-email-input");

// Abrir Drawer
btnOpenDrawer.addEventListener("click", () => {
  drawer.classList.add("open");
  drawerOverlay.classList.remove("hidden");
});

// Fechar Drawer
function closeDrawer() {
  drawer.classList.remove("open");
  drawerOverlay.classList.add("hidden");
}

btnCloseDrawer.addEventListener("click", closeDrawer);
drawerOverlay.addEventListener("click", closeDrawer);

// Evento do Formulário de Adicionar Amigo
if (addFriendForm) {
  addFriendForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = friendEmailInput.value.trim();
    if (email) {
      sendFriendRequest(email);
      friendEmailInput.value = "";
    }
  });
}