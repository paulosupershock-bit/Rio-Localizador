msg += `📅 ${val.timestamp}\n\n`;
    });
    alert(msg);
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

window.toggleRealtimeTracking = function(friendUid, friendName, btnElement) {
  if (!otherMarkers[friendUid]) {
    alert("Ainda não há localização GPS disponível para este contato.");
    return;
  }
  const latLng = otherMarkers[friendUid].getLatLng();
  map.setView(latLng, 16);
  alert(`🎯 Focado em ${friendName} em tempo real.`);
};

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
      alert(`🗺️ Trajeto de 30 dias exibido no mapa para ${name}!`);
    } else {
      alert("Nenhum ponto válido encontrado.");
    }
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

function renderWhatsappCheckbox(friendUid, friendData) {
  // Mantido para compatibilidade com a listagem interna se necessário, mas o modal agora usa input livre.
}

// ==========================================================================
// 7. MODAL DE WHATSAPP (INPUT MANUAL CORRIGIDO)
// ==========================================================================
if (btnOpenWhatsappModal) {
  btnOpenWhatsappModal.addEventListener("click", () => {
    if (whatsappModal) whatsappModal.classList.remove("hidden");
    const manualInput = document.getElementById("whatsapp-manual-input");
    if (manualInput) manualInput.value = "";
  });
}

window.closeWhatsappModal = function() {
  if (whatsappModal) whatsappModal.classList.add("hidden");
};

if (btnSendWhatsappSelected) {
  btnSendWhatsappSelected.addEventListener("click", () => {
    const manualInput = document.getElementById("whatsapp-manual-input");
    if (!manualInput) return;
    
    let destination = manualInput.value.trim();
    if (!destination) {
      alert("Por favor, digite um número de contato ou um e-mail.");
      return;
    }

    const currentAppUrl = window.location.href.split('?')[0];
    const currentUserPhone = auth.currentUser ? (localStorage.getItem("rio_shared_phone") || "") : "";
    const shareLink = `${currentAppUrl}?phone=${encodeURIComponent(currentUserPhone)}`;
    const message = encodeURIComponent(`Olá! Acompanhe minha localização e rotas no Rio Localizador através deste link: ${shareLink}`);

    // Verifica se digitou um e-mail
    if (destination.includes("@")) {
      window.location.href = `mailto:${destination}?subject=${encodeURIComponent("Convite - Rio Localizador")}&body=${message}`;
    } else {
      // É número de telefone, limpa e formata para o WhatsApp
      let formattedPhone = destination.replace(/\D/g, "");
      if (formattedPhone.length === 10 || formattedPhone.length === 11) {
        formattedPhone = "55" + formattedPhone;
      }
      const whatsappUrl = `https://wa.me/${formattedPhone}?text=${message}`;
      window.open(whatsappUrl, '_blank');
    }

    closeWhatsappModal();
  });
}